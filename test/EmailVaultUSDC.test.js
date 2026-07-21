const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// micro-USDC helper (6 decimals)
const usd = (n) => BigInt(Math.round(n * 1e6));
const ONE = usd(1);
const HUNDRED = usd(100);
const MAX_UINT = (1n << 256n) - 1n;
const FAR_FUTURE = 9999999999n; // year 2286

// keccak256 of a plaintext email + a domain salt (frontend would do this)
const SALT = ethers.id("hashcash:v1");
const emailHashOf = (email) =>
  ethers.keccak256(ethers.solidityPacked(["bytes32", "string"], [SALT, email.toLowerCase()]));

describe("EmailVaultUSDC (non-custodial, signature-based)", () => {
  async function deployFixture() {
    const [deployer, bindSigner, alice, bob, relayer, mallory] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockUSDC");
    const usdc = await Mock.deploy();

    const FEE_VAULT = emailHashOf("operator@hashcash.example");
    const Vault = await ethers.getContractFactory("EmailVaultUSDC");
    const vault = await Vault.deploy(await usdc.getAddress(), bindSigner.address, FEE_VAULT);

    // fund alice & bob with USDC, infinite-approve the vault
    for (const who of [alice, bob, mallory]) {
      await usdc.mint(who.address, usd(10000));
      await usdc.connect(who).approve(await vault.getAddress(), MAX_UINT);
    }

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "EmailVaultUSDC",
      version: "1",
      chainId,
      verifyingContract: await vault.getAddress(),
    };
    const BIND_TYPES = {
      Bind: [
        { name: "emailHash", type: "bytes32" },
        { name: "owner", type: "address" },
      ],
    };
    const WITHDRAW_TYPES = {
      Withdraw: [
        { name: "emailHash", type: "bytes32" },
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const TRANSFER_TYPES = {
      Transfer: [
        { name: "fromHash", type: "bytes32" },
        { name: "toHash", type: "bytes32" },
        { name: "amount", type: "uint256" },
        { name: "fee", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const signBind = (signer, emailHash, owner) =>
      signer.signTypedData(domain, BIND_TYPES, { emailHash, owner });
    // fee 放最後、預設 0 — 既有測試不用改,fee 測試再明確傳
    const signWithdraw = (signer, emailHash, to, amount, nonce, deadline, fee = 0n) =>
      signer.signTypedData(domain, WITHDRAW_TYPES, { emailHash, to, amount, fee, nonce, deadline });
    const signTransfer = (signer, fromHash, toHash, amount, nonce, deadline, fee = 0n) =>
      signer.signTypedData(domain, TRANSFER_TYPES, { fromHash, toHash, amount, fee, nonce, deadline });

    return {
      usdc, vault, deployer, bindSigner, alice, bob, relayer, mallory,
      domain, signBind, signWithdraw, signTransfer, FEE_VAULT,
    };
  }

  // ───────────────────────────── construction ─────────────────────────────
  describe("construction", () => {
    it("stores usdc + bindSigner immutably", async () => {
      const { vault, usdc, bindSigner } = await loadFixture(deployFixture);
      expect(await vault.usdc()).to.equal(await usdc.getAddress());
      expect(await vault.bindSigner()).to.equal(bindSigner.address);
    });
    it("reverts on zero usdc / zero bindSigner / zero feeVaultHash", async () => {
      const [, bindSigner] = await ethers.getSigners();
      const fv = emailHashOf("operator@hashcash.example");
      const Vault = await ethers.getContractFactory("EmailVaultUSDC");
      await expect(Vault.deploy(ethers.ZeroAddress, bindSigner.address, fv)).to.be.revertedWithCustomError(Vault, "ZeroAddress");
      const Mock = await ethers.getContractFactory("MockUSDC");
      const usdc = await Mock.deploy();
      await expect(Vault.deploy(await usdc.getAddress(), ethers.ZeroAddress, fv)).to.be.revertedWithCustomError(Vault, "ZeroAddress");
      await expect(Vault.deploy(await usdc.getAddress(), bindSigner.address, ethers.ZeroHash)).to.be.revertedWithCustomError(Vault, "ZeroEmailHash");
    });
  });

  // ───────────────────────────── deposit ─────────────────────────────
  describe("deposit", () => {
    it("anyone can deposit; balance + event update", async () => {
      const { vault, usdc, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("recipient@gmail.com");
      await expect(vault.connect(alice).deposit(h, HUNDRED))
        .to.emit(vault, "Deposited").withArgs(h, alice.address, HUNDRED);
      expect(await vault.balances(h)).to.equal(HUNDRED);
      expect(await vault.totalUsdcHeld()).to.equal(HUNDRED);
    });
    it("accumulates across multiple senders", async () => {
      const { vault, alice, bob } = await loadFixture(deployFixture);
      const h = emailHashOf("recipient@gmail.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await vault.connect(bob).deposit(h, ONE);
      expect(await vault.balances(h)).to.equal(HUNDRED + ONE);
    });
    it("reverts on zero amount / zero emailHash", async () => {
      const { vault, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("x@y.com");
      await expect(vault.connect(alice).deposit(h, 0)).to.be.revertedWithCustomError(vault, "ZeroAmount");
      await expect(vault.connect(alice).deposit(ethers.ZeroHash, ONE)).to.be.revertedWithCustomError(vault, "ZeroEmailHash");
    });
    it("reverts if not approved / insufficient balance", async () => {
      const { vault, usdc, mallory } = await loadFixture(deployFixture);
      const h = emailHashOf("x@y.com");
      // mallory approved but has only 10000; ask for more
      await expect(vault.connect(mallory).deposit(h, usd(99999))).to.be.reverted;
    });
  });

  // ───────────────────────────── bind ─────────────────────────────
  describe("bind", () => {
    it("binds with a valid backend attestation", async () => {
      const { vault, alice, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      const sig = await signBind(bindSigner, h, alice.address);
      await expect(vault.bind(h, alice.address, sig)).to.emit(vault, "Bound").withArgs(h, alice.address);
      expect(await vault.ownerOf(h)).to.equal(alice.address);
    });
    it("rejects an attestation NOT signed by bindSigner", async () => {
      const { vault, alice, mallory, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      const sig = await signBind(mallory, h, mallory.address); // mallory tries to bind to herself
      await expect(vault.bind(h, mallory.address, sig)).to.be.revertedWithCustomError(vault, "InvalidBindSignature");
    });
    it("is idempotent: re-binding SAME owner is a no-op (front-run safe)", async () => {
      const { vault, alice, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      const sig = await signBind(bindSigner, h, alice.address);
      await vault.bind(h, alice.address, sig);
      // a relayer / front-runner submits the very same attestation again
      await expect(vault.bind(h, alice.address, sig)).to.not.be.reverted;
      expect(await vault.ownerOf(h)).to.equal(alice.address);
    });
    it("reverts when already bound to a DIFFERENT owner", async () => {
      const { vault, alice, bob, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await vault.bind(h, alice.address, await signBind(bindSigner, h, alice.address));
      const sigBob = await signBind(bindSigner, h, bob.address); // even a *valid* attestation for bob
      await expect(vault.bind(h, bob.address, sigBob)).to.be.revertedWithCustomError(vault, "AlreadyBoundToDifferentOwner");
    });
    it("a bind attestation cannot be replayed to a different emailHash", async () => {
      const { vault, alice, bindSigner, signBind } = await loadFixture(deployFixture);
      const h1 = emailHashOf("alice@gmail.com");
      const h2 = emailHashOf("other@gmail.com");
      const sig = await signBind(bindSigner, h1, alice.address);
      await expect(vault.bind(h2, alice.address, sig)).to.be.revertedWithCustomError(vault, "InvalidBindSignature");
    });
    it("reverts on zero owner / zero emailHash", async () => {
      const { vault, alice, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("a@b.com");
      await expect(vault.bind(h, ethers.ZeroAddress, await signBind(bindSigner, h, ethers.ZeroAddress)))
        .to.be.revertedWithCustomError(vault, "ZeroAddress");
      await expect(vault.bind(ethers.ZeroHash, alice.address, await signBind(bindSigner, ethers.ZeroHash, alice.address)))
        .to.be.revertedWithCustomError(vault, "ZeroEmailHash");
    });
  });

  // ───────────────────────────── withdraw ─────────────────────────────
  describe("withdraw", () => {
    async function bound() {
      const f = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await f.vault.connect(f.bob).deposit(h, HUNDRED);
      await f.vault.bind(h, f.alice.address, await f.signBind(f.bindSigner, h, f.alice.address));
      return { ...f, h };
    }

    it("owner-signed withdraw moves USDC to `to`; relayer pays gas", async () => {
      const { vault, usdc, alice, relayer, signWithdraw, h } = await bound();
      const sig = await signWithdraw(alice, h, alice.address, HUNDRED, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).withdraw(h, alice.address, HUNDRED, 0n, FAR_FUTURE, sig))
        .to.emit(vault, "Withdrawn").withArgs(h, alice.address, alice.address, HUNDRED);
      expect(await vault.balances(h)).to.equal(0n);
      expect(await usdc.balanceOf(alice.address)).to.equal(usd(10000) + HUNDRED);
      expect(await vault.nonces(alice.address)).to.equal(1n);
    });

    it("owner can withdraw to a third party (signed `to`)", async () => {
      const { vault, usdc, alice, bob, relayer, signWithdraw, h } = await bound();
      const before = await usdc.balanceOf(bob.address);
      const sig = await signWithdraw(alice, h, bob.address, usd(40), 0n, FAR_FUTURE);
      await vault.connect(relayer).withdraw(h, bob.address, usd(40), 0n, FAR_FUTURE, sig);
      expect(await usdc.balanceOf(bob.address)).to.equal(before + usd(40));
      expect(await vault.balances(h)).to.equal(HUNDRED - usd(40));
    });

    it("INVARIANT 1: a signature from a NON-owner cannot withdraw", async () => {
      const { vault, mallory, relayer, signWithdraw, h } = await bound();
      const sig = await signWithdraw(mallory, h, mallory.address, ONE, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).withdraw(h, mallory.address, ONE, 0n, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("INVARIANT 3: the bindSigner cannot move bound funds (wrong type / wrong signer)", async () => {
      const { vault, bindSigner, relayer, signWithdraw, signBind, h } = await bound();
      // (a) bindSigner produces a Withdraw sig — but it isn't the owner
      const wsig = await signWithdraw(bindSigner, h, bindSigner.address, ONE, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).withdraw(h, bindSigner.address, ONE, 0n, FAR_FUTURE, wsig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
      // (b) a Bind-typed signature is not accepted by withdraw (different typehash/digest)
      const bsig = await signBind(bindSigner, h, bindSigner.address);
      await expect(vault.connect(relayer).withdraw(h, bindSigner.address, ONE, 0n, FAR_FUTURE, bsig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("REPLAY: the same withdraw signature cannot be used twice (nonce consumed)", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await bound();
      const sig = await signWithdraw(alice, h, alice.address, usd(40), 0n, FAR_FUTURE);
      await vault.connect(relayer).withdraw(h, alice.address, usd(40), 0n, FAR_FUTURE, sig);
      await expect(vault.connect(relayer).withdraw(h, alice.address, usd(40), 0n, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("MALLEABILITY: a high-s (malleable) signature is rejected", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await bound();
      const sig = await signWithdraw(alice, h, alice.address, ONE, 0n, FAR_FUTURE);
      const s = ethers.Signature.from(sig);
      // flip to the malleable counterpart: s' = n - s, v toggled.
      // ethers v6 refuses to *construct* a high-s Signature, so build the raw 65 bytes by hand.
      const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
      const sPrime = N - BigInt(s.s);
      const vPrime = s.v === 27 ? 28 : 27;
      const malleable =
        s.r +
        ethers.toBeHex(sPrime, 32).slice(2) +
        vPrime.toString(16).padStart(2, "0");
      await expect(vault.connect(relayer).withdraw(h, alice.address, ONE, 0n, FAR_FUTURE, malleable))
        .to.be.reverted; // OZ ECDSA rejects high-s
    });

    it("EXPIRY: a past deadline reverts", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await bound();
      const sig = await signWithdraw(alice, h, alice.address, ONE, 0n, 1n);
      await expect(vault.connect(relayer).withdraw(h, alice.address, ONE, 0n, 1n, sig))
        .to.be.revertedWithCustomError(vault, "Expired");
    });

    it("reverts: not bound, insufficient balance, zero to/amount", async () => {
      const { vault, alice, relayer, signWithdraw } = await loadFixture(deployFixture);
      const unbound = emailHashOf("nobody@x.com");
      const sig = await signWithdraw(alice, unbound, alice.address, ONE, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).withdraw(unbound, alice.address, ONE, 0n, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "NotBound");

      const b = await bound();
      await expect(b.vault.connect(b.relayer).withdraw(b.h, ethers.ZeroAddress, ONE, 0n, FAR_FUTURE,
        await b.signWithdraw(b.alice, b.h, ethers.ZeroAddress, ONE, 0n, FAR_FUTURE)))
        .to.be.revertedWithCustomError(b.vault, "ZeroAddress");
      await expect(b.vault.connect(b.relayer).withdraw(b.h, b.alice.address, 0, 0n, FAR_FUTURE,
        await b.signWithdraw(b.alice, b.h, b.alice.address, 0n, 0n, FAR_FUTURE)))
        .to.be.revertedWithCustomError(b.vault, "ZeroAmount");
      await expect(b.vault.connect(b.relayer).withdraw(b.h, b.alice.address, usd(99999), 0n, FAR_FUTURE,
        await b.signWithdraw(b.alice, b.h, b.alice.address, usd(99999), 0n, FAR_FUTURE)))
        .to.be.revertedWithCustomError(b.vault, "InsufficientBalance");
    });

    it("sequential withdrawals work as nonce increments", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await bound();
      await vault.connect(relayer).withdraw(h, alice.address, usd(30), 0n, FAR_FUTURE,
        await signWithdraw(alice, h, alice.address, usd(30), 0n, FAR_FUTURE));
      await vault.connect(relayer).withdraw(h, alice.address, usd(30), 0n, FAR_FUTURE,
        await signWithdraw(alice, h, alice.address, usd(30), 1n, FAR_FUTURE));
      expect(await vault.balances(h)).to.equal(HUNDRED - usd(60));
      expect(await vault.nonces(alice.address)).to.equal(2n);
    });
  });

  // ───────────────────────────── bindAndWithdraw ─────────────────────────────
  describe("bindAndWithdraw (first claim)", () => {
    it("binds and withdraws atomically", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signWithdraw } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await vault.connect(bob).deposit(h, HUNDRED);
      const bsig = await signBind(bindSigner, h, alice.address);
      const wsig = await signWithdraw(alice, h, alice.address, HUNDRED, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).bindAndWithdraw(h, alice.address, bsig, alice.address, HUNDRED, 0n, FAR_FUTURE, wsig))
        .to.emit(vault, "Bound").withArgs(h, alice.address)
        .to.emit(vault, "Withdrawn").withArgs(h, alice.address, alice.address, HUNDRED);
      expect(await vault.balances(h)).to.equal(0n);
      expect(await usdc.balanceOf(alice.address)).to.equal(usd(10000) + HUNDRED);
    });
    it("works when vault already bound to same owner (bind no-ops)", async () => {
      const { vault, alice, bob, relayer, bindSigner, signBind, signWithdraw } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await vault.connect(bob).deposit(h, HUNDRED);
      const bsig = await signBind(bindSigner, h, alice.address);
      await vault.bind(h, alice.address, bsig);
      const wsig = await signWithdraw(alice, h, alice.address, ONE, 0n, FAR_FUTURE);
      await expect(vault.connect(relayer).bindAndWithdraw(h, alice.address, bsig, alice.address, ONE, 0n, FAR_FUTURE, wsig))
        .to.not.be.reverted;
    });
  });

  // ───────────────────────────── withdrawal fee ─────────────────────────────
  describe("withdrawal fee (USDC gas recovery)", () => {
    const FEE = 50_000n; // $0.05

    async function boundWithFee() {
      const f = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await f.vault.connect(f.bob).deposit(h, HUNDRED);
      await f.vault.bind(h, f.alice.address, await f.signBind(f.bindSigner, h, f.alice.address));
      return { ...f, h };
    }

    it("signed fee is deducted and credited to feeVaultHash", async () => {
      const { vault, usdc, alice, relayer, signWithdraw, h, FEE_VAULT } = await boundWithFee();
      const sig = await signWithdraw(alice, h, alice.address, usd(10), 0n, FAR_FUTURE, FEE);
      await expect(vault.connect(relayer).withdraw(h, alice.address, usd(10), FEE, FAR_FUTURE, sig))
        .to.emit(vault, "FeeCharged").withArgs(h, FEE)
        .to.emit(vault, "Withdrawn").withArgs(h, alice.address, alice.address, usd(10));
      expect(await vault.balances(h)).to.equal(HUNDRED - usd(10) - FEE);
      expect(await vault.balances(FEE_VAULT)).to.equal(FEE);
      // USDC 只離開 amount;fee 留在合約裡 → invariant 不變
      expect(await vault.totalBalance()).to.equal(HUNDRED - usd(10));
      expect(await vault.totalUsdcHeld()).to.equal(HUNDRED - usd(10));
      expect(await usdc.balanceOf(alice.address)).to.equal(usd(10000) + usd(10));
    });

    it("relayer cannot charge MORE than the signed fee", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await boundWithFee();
      const sig = await signWithdraw(alice, h, alice.address, usd(10), 0n, FAR_FUTURE, FEE);
      // relayer 想收兩倍 → 簽名對不上
      await expect(vault.connect(relayer).withdraw(h, alice.address, usd(10), FEE * 2n, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("fee above MAX_FEE reverts even if signed", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await boundWithFee();
      const tooHigh = (await vault.MAX_FEE()) + 1n;
      const sig = await signWithdraw(alice, h, alice.address, usd(10), 0n, FAR_FUTURE, tooHigh);
      await expect(vault.connect(relayer).withdraw(h, alice.address, usd(10), tooHigh, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "FeeTooHigh");
    });

    it("amount + fee cannot exceed the vault balance", async () => {
      const { vault, alice, relayer, signWithdraw, h } = await boundWithFee();
      const sig = await signWithdraw(alice, h, alice.address, HUNDRED, 0n, FAR_FUTURE, FEE);
      await expect(vault.connect(relayer).withdraw(h, alice.address, HUNDRED, FEE, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("operator redeems accrued fees via normal bind+withdraw (no privileged path)", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signWithdraw, h, FEE_VAULT } = await boundWithFee();
      const sig = await signWithdraw(alice, h, alice.address, usd(10), 0n, FAR_FUTURE, FEE);
      await vault.connect(relayer).withdraw(h, alice.address, usd(10), FEE, FAR_FUTURE, sig);
      // operator(這裡用 bob 當 operator 的 EOA)綁定 fee vault 後照常提領
      await vault.bind(FEE_VAULT, bob.address, await signBind(bindSigner, FEE_VAULT, bob.address));
      const before = await usdc.balanceOf(bob.address);
      const wsig = await signWithdraw(bob, FEE_VAULT, bob.address, FEE, await vault.nonces(bob.address), FAR_FUTURE);
      await vault.connect(relayer).withdraw(FEE_VAULT, bob.address, FEE, 0n, FAR_FUTURE, wsig);
      expect(await usdc.balanceOf(bob.address)).to.equal(before + FEE);
      expect(await vault.balances(FEE_VAULT)).to.equal(0n);
    });

    it("fee credit ignores UNBOUND_VAULT_CAP (cannot brick withdrawals)", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signWithdraw, FEE_VAULT } = await loadFixture(deployFixture);
      // 把 fee vault 的餘額直接墊到 cap(用 deposit 到綁定後的大金庫模擬不行——直接存到 cap)
      await vault.connect(bob).deposit(FEE_VAULT, usd(500)); // unbound fee vault at cap
      const h = emailHashOf("alice@gmail.com");
      await vault.connect(bob).deposit(h, HUNDRED);
      await vault.bind(h, alice.address, await signBind(bindSigner, h, alice.address));
      const sig = await signWithdraw(alice, h, alice.address, usd(10), 0n, FAR_FUTURE, FEE);
      // fee vault 已達 $500 cap,但 fee 入帳不受 cap 限制 → withdraw 照常成功
      await expect(vault.connect(relayer).withdraw(h, alice.address, usd(10), FEE, FAR_FUTURE, sig))
        .to.not.be.reverted;
      expect(await vault.balances(FEE_VAULT)).to.equal(usd(500) + FEE);
    });
  });

  // ───────────────────────────── internal transfer ─────────────────────────────
  describe("internalTransfer (vault → vault)", () => {
    const FEE = 50_000n;

    async function boundSender() {
      const f = await loadFixture(deployFixture);
      const from = emailHashOf("alice@gmail.com");
      const to = emailHashOf("bob@gmail.com");
      await f.vault.connect(f.bob).deposit(from, HUNDRED);
      await f.vault.bind(from, f.alice.address, await f.signBind(f.bindSigner, from, f.alice.address));
      return { ...f, from, to };
    }

    it("moves funds vault→vault; no USDC leaves; invariant holds", async () => {
      const { vault, usdc, alice, relayer, signTransfer, from, to, FEE_VAULT } = await boundSender();
      const heldBefore = await vault.totalUsdcHeld();
      const sig = await signTransfer(alice, from, to, usd(30), 0n, FAR_FUTURE, FEE);
      await expect(vault.connect(relayer).internalTransfer(from, to, usd(30), FEE, FAR_FUTURE, sig))
        .to.emit(vault, "Transferred").withArgs(from, to, usd(30))
        .to.emit(vault, "FeeCharged").withArgs(from, FEE);
      expect(await vault.balances(from)).to.equal(HUNDRED - usd(30) - FEE);
      expect(await vault.balances(to)).to.equal(usd(30));
      expect(await vault.balances(FEE_VAULT)).to.equal(FEE);
      // USDC 完全沒動 → totalUsdcHeld 不變、invariant 成立
      expect(await vault.totalUsdcHeld()).to.equal(heldBefore);
      expect(await usdc.balanceOf(await vault.getAddress())).to.equal(heldBefore);
    });

    it("only the fromHash owner can move funds (INVARIANT 1)", async () => {
      const { vault, mallory, relayer, signTransfer, from, to } = await boundSender();
      const sig = await signTransfer(mallory, from, to, usd(1), 0n, FAR_FUTURE, FEE);
      await expect(vault.connect(relayer).internalTransfer(from, to, usd(1), FEE, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("replay protected (nonce consumed)", async () => {
      const { vault, alice, relayer, signTransfer, from, to } = await boundSender();
      const sig = await signTransfer(alice, from, to, usd(10), 0n, FAR_FUTURE, FEE);
      await vault.connect(relayer).internalTransfer(from, to, usd(10), FEE, FAR_FUTURE, sig);
      await expect(vault.connect(relayer).internalTransfer(from, to, usd(10), FEE, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "InvalidWithdrawSignature");
    });

    it("reverts: unbound sender, same vault, zero amount, fee too high, over balance", async () => {
      const { vault, alice, relayer, signTransfer, from, to } = await boundSender();
      const unbound = emailHashOf("nobody@x.com");
      await expect(vault.connect(relayer).internalTransfer(unbound, to, usd(1), 0n, FAR_FUTURE,
        await signTransfer(alice, unbound, to, usd(1), 0n, FAR_FUTURE))).to.be.revertedWithCustomError(vault, "NotBound");
      await expect(vault.connect(relayer).internalTransfer(from, from, usd(1), 0n, FAR_FUTURE,
        await signTransfer(alice, from, from, usd(1), 0n, FAR_FUTURE))).to.be.revertedWithCustomError(vault, "SameVault");
      await expect(vault.connect(relayer).internalTransfer(from, to, 0n, 0n, FAR_FUTURE,
        await signTransfer(alice, from, to, 0n, 0n, FAR_FUTURE))).to.be.revertedWithCustomError(vault, "ZeroAmount");
      const tooHigh = (await vault.MAX_FEE()) + 1n;
      await expect(vault.connect(relayer).internalTransfer(from, to, usd(1), tooHigh, FAR_FUTURE,
        await signTransfer(alice, from, to, usd(1), 0n, FAR_FUTURE, tooHigh))).to.be.revertedWithCustomError(vault, "FeeTooHigh");
      await expect(vault.connect(relayer).internalTransfer(from, to, HUNDRED, FEE, FAR_FUTURE,
        await signTransfer(alice, from, to, HUNDRED, 0n, FAR_FUTURE, FEE))).to.be.revertedWithCustomError(vault, "InsufficientBalance");
    });

    it("enforces UNBOUND_VAULT_CAP on the destination", async () => {
      const { vault, bob, alice, relayer, bindSigner, signBind, signTransfer } = await loadFixture(deployFixture);
      const from = emailHashOf("rich@x.com");
      const to = emailHashOf("target@x.com");
      // 讓 from 有大額(綁定後無上限)
      await vault.bind(from, alice.address, await signBind(bindSigner, from, alice.address));
      await vault.connect(bob).deposit(from, usd(600));
      await vault.connect(bob).deposit(to, usd(450)); // to 未綁定,已接近 $500 cap
      const sig = await signTransfer(alice, from, to, usd(60), 0n, FAR_FUTURE, 0n);
      await expect(vault.connect(relayer).internalTransfer(from, to, usd(60), 0n, FAR_FUTURE, sig))
        .to.be.revertedWithCustomError(vault, "VaultCapExceeded");
    });

    it("bindAndTransfer binds sender then transfers atomically", async () => {
      const { vault, alice, bob, relayer, bindSigner, signBind, signTransfer } = await loadFixture(deployFixture);
      const from = emailHashOf("alice@gmail.com");
      const to = emailHashOf("bob@gmail.com");
      await vault.connect(bob).deposit(from, HUNDRED);
      const bsig = await signBind(bindSigner, from, alice.address);
      const tsig = await signTransfer(alice, from, to, usd(25), 0n, FAR_FUTURE, FEE);
      await expect(vault.connect(relayer).bindAndTransfer(from, alice.address, bsig, to, usd(25), FEE, FAR_FUTURE, tsig))
        .to.emit(vault, "Bound").withArgs(from, alice.address)
        .to.emit(vault, "Transferred").withArgs(from, to, usd(25));
      expect(await vault.balances(to)).to.equal(usd(25));
    });

    it("recipient can then claim the received funds to their wallet", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signTransfer, signWithdraw, from, to } = await boundSender();
      await vault.connect(relayer).internalTransfer(from, to, usd(30), FEE, FAR_FUTURE,
        await signTransfer(alice, from, to, usd(30), 0n, FAR_FUTURE, FEE));
      // bob 綁定 to、提領
      await vault.bind(to, bob.address, await signBind(bindSigner, to, bob.address));
      const before = await usdc.balanceOf(bob.address);
      await vault.connect(relayer).withdraw(to, bob.address, usd(30), 0n, FAR_FUTURE,
        await signWithdraw(bob, to, bob.address, usd(30), await vault.nonces(bob.address), FAR_FUTURE));
      expect(await usdc.balanceOf(bob.address)).to.equal(before + usd(30));
    });
  });

  // ───────────────────────────── caps ─────────────────────────────
  describe("risk caps", () => {
    it("UNBOUND vault cannot exceed UNBOUND_VAULT_CAP (500 USDC)", async () => {
      const { vault, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("capped@x.com");
      await vault.connect(alice).deposit(h, usd(500)); // exactly at cap: ok
      await expect(vault.connect(alice).deposit(h, 1n))
        .to.be.revertedWithCustomError(vault, "VaultCapExceeded");
    });

    it("BOUND vault has no per-vault cap (but still counts toward TVL)", async () => {
      const { vault, alice, bob, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await vault.bind(h, alice.address, await signBind(bindSigner, h, alice.address));
      await vault.connect(bob).deposit(h, usd(600)); // over 500, but bound → ok
      expect(await vault.balances(h)).to.equal(usd(600));
    });

    it("total tracked balance cannot exceed MAX_TOTAL_HELD (10k USDC)", async () => {
      const { vault, usdc, alice, bob, bindSigner, signBind } = await loadFixture(deployFixture);
      // fill TVL with bound vaults (no per-vault cap)
      await usdc.mint(alice.address, usd(20000));
      const h1 = emailHashOf("big1@x.com");
      const h2 = emailHashOf("big2@x.com");
      await vault.bind(h1, bob.address, await signBind(bindSigner, h1, bob.address));
      await vault.bind(h2, bob.address, await signBind(bindSigner, h2, bob.address));
      await vault.connect(alice).deposit(h1, usd(9800));
      await expect(vault.connect(alice).deposit(h2, usd(300)))
        .to.be.revertedWithCustomError(vault, "TvlCapExceeded");
      await vault.connect(alice).deposit(h2, usd(200)); // exactly to the cap: ok
      expect(await vault.totalBalance()).to.equal(usd(10000));
    });

    it("withdraw frees TVL room again", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signWithdraw } = await loadFixture(deployFixture);
      await usdc.mint(alice.address, usd(20000));
      const h = emailHashOf("big@x.com");
      await vault.bind(h, bob.address, await signBind(bindSigner, h, bob.address));
      await vault.connect(alice).deposit(h, usd(10000)); // at TVL cap
      await vault.connect(relayer).withdraw(h, bob.address, usd(5000), 0n, FAR_FUTURE,
        await signWithdraw(bob, h, bob.address, usd(5000), 0n, FAR_FUTURE));
      await vault.connect(alice).deposit(h, usd(5000)); // room freed
      expect(await vault.totalBalance()).to.equal(usd(10000));
    });
  });

  // ───────────────────────────── refund ─────────────────────────────
  describe("refund (unclaimed deposits)", () => {
    it("depositor reclaims after REFUND_DELAY if vault never bound", async () => {
      const { vault, usdc, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("typo@gnail.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await time.increase(14 * 24 * 3600 + 1);
      const before = await usdc.balanceOf(alice.address);
      await expect(vault.connect(alice).refund(h, HUNDRED))
        .to.emit(vault, "Refunded").withArgs(h, alice.address, HUNDRED);
      expect(await usdc.balanceOf(alice.address)).to.equal(before + HUNDRED);
      expect(await vault.balances(h)).to.equal(0n);
      expect(await vault.totalBalance()).to.equal(0n);
    });

    it("reverts before the delay has passed", async () => {
      const { vault, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("typo@gnail.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await time.increase(13 * 24 * 3600);
      await expect(vault.connect(alice).refund(h, HUNDRED))
        .to.be.revertedWithCustomError(vault, "RefundTooEarly");
    });

    it("a NEW deposit resets the refund timer", async () => {
      const { vault, alice } = await loadFixture(deployFixture);
      const h = emailHashOf("typo@gnail.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await time.increase(13 * 24 * 3600);
      await vault.connect(alice).deposit(h, ONE); // timer restarts
      await time.increase(2 * 24 * 3600); // 15d after first, only 2d after second
      await expect(vault.connect(alice).refund(h, HUNDRED))
        .to.be.revertedWithCustomError(vault, "RefundTooEarly");
    });

    it("refund permanently disabled once bound — owner controls funds", async () => {
      const { vault, alice, bindSigner, signBind } = await loadFixture(deployFixture);
      const h = emailHashOf("alice@gmail.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await time.increase(14 * 24 * 3600 + 1);
      await vault.bind(h, alice.address, await signBind(bindSigner, h, alice.address));
      await expect(vault.connect(alice).refund(h, HUNDRED))
        .to.be.revertedWithCustomError(vault, "AlreadyBound");
    });

    it("cannot reclaim more than OWN contribution (others' deposits safe)", async () => {
      const { vault, alice, bob } = await loadFixture(deployFixture);
      const h = emailHashOf("shared@x.com");
      await vault.connect(alice).deposit(h, usd(30));
      await vault.connect(bob).deposit(h, usd(70));
      await time.increase(14 * 24 * 3600 + 1);
      await expect(vault.connect(alice).refund(h, usd(31)))
        .to.be.revertedWithCustomError(vault, "InsufficientDeposit");
      await vault.connect(alice).refund(h, usd(30)); // own share ok
      expect(await vault.balances(h)).to.equal(usd(70));
    });

    it("a stranger with no deposit cannot refund", async () => {
      const { vault, alice, mallory } = await loadFixture(deployFixture);
      const h = emailHashOf("victim@x.com");
      await vault.connect(alice).deposit(h, HUNDRED);
      await time.increase(14 * 24 * 3600 + 1);
      await expect(vault.connect(mallory).refund(h, ONE))
        .to.be.revertedWithCustomError(vault, "InsufficientDeposit");
    });
  });

  // ───────────────────────────── invariant (scenario) ─────────────────────────────
  describe("INVARIANT: sum(balances) == totalUsdcHeld", () => {
    it("holds across a randomized deposit/withdraw scenario", async () => {
      const { vault, usdc, alice, bob, relayer, bindSigner, signBind, signWithdraw } = await loadFixture(deployFixture);
      const emails = ["a@x.com", "b@x.com", "c@x.com"];
      const hashes = emails.map(emailHashOf);
      const owners = [alice, bob, alice];
      const tracked = { [hashes[0]]: 0n, [hashes[1]]: 0n, [hashes[2]]: 0n };

      // deposits
      for (let i = 0; i < hashes.length; i++) {
        const amt = usd(100 * (i + 1));
        await vault.connect(bob).deposit(hashes[i], amt);
        tracked[hashes[i]] += amt;
      }
      // bind
      for (let i = 0; i < hashes.length; i++) {
        await vault.bind(hashes[i], owners[i].address, await signBind(bindSigner, hashes[i], owners[i].address));
      }
      // withdraws
      const nonceByOwner = {};
      for (let i = 0; i < hashes.length; i++) {
        const o = owners[i];
        const n = nonceByOwner[o.address] ?? (await vault.nonces(o.address));
        const amt = usd(25 * (i + 1));
        await vault.connect(relayer).withdraw(hashes[i], o.address, amt, 0n, FAR_FUTURE,
          await signWithdraw(o, hashes[i], o.address, amt, n, FAR_FUTURE));
        tracked[hashes[i]] -= amt;
        nonceByOwner[o.address] = n + 1n;
      }

      let sum = 0n;
      for (const h of hashes) {
        expect(await vault.balances(h)).to.equal(tracked[h]);
        sum += tracked[h];
      }
      expect(await vault.totalUsdcHeld()).to.equal(sum);
    });
  });
});
