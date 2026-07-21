# hashcash

**Pay USD to anyone's email. Recipients don't need a crypto wallet.**

🌐 **Live demo:** **[cfoing.io](https://cfoing.io)** (or [hashcashs.pages.dev](https://hashcashs.pages.dev)) · 🇹🇼 **[中文版說明](./README.zh-TW.md)**

---

## The problem

Web3 companies — and increasingly AI agents — want to pay USD to contractors, translators, designers, creators, and gig workers around the world. But:

- **90% of the world's freelancers don't have a crypto wallet.** Asking them to "download MetaMask and back up 12 seed words" ends most deals before they start.
- Existing solutions (Coinbase, Binance P2P) require recipients to do **KYC + onboarding + offramp** — usually 3+ days, ~5% fees.
- For workers in countries with weak currencies (Argentina, Nigeria, Turkey, Vietnam), **USD itself is what they want** — they'd rather hold USDC than convert to local fiat.

**hashcash bridges this gap.** Senders pay USDC to a recipient's *email*. Recipients receive a notification, sign in with Google, and immediately have a USD account **they alone control** — no wallet, no seed phrase.

---

## How it works

```
┌──────────────────┐                                       ┌───────────────────┐
│  Payer           │                                       │   Recipient       │
│  (has USDC)      │                                       │   (no crypto)     │
│  or an AI agent  │                                       │                   │
└────────┬─────────┘                                       └─────────┬─────────┘
         │                                                           │
         │ 1. Pays $200 to alice@gmail.com via hashcash              │
         │    (USDC locked in the vault under her emailHash)         │
         ▼                                                           │
    ┌─────────────────────────────────────────────────┐              │
    │  EmailVaultUSDC (non-custodial) on Base         │              │
    │  balances[commit("alice@gmail.com")] += $200    │              │
    └────────┬────────────────────────────────────────┘              │
             │  2. Email notification with claim link                │
             └──────────────────────────────────────────────────────►│
                                                                     │
                                            3. Alice signs in with Google.
                                               Sees $200. Holds it, sends to
                                               another email, or withdraws to
                                               her own wallet — each move
                                               authorized by HER signature.
```

**Core operations** — every fund movement is authorized by the owner's EIP-712 signature; gas is sponsored, so there are no wallet pop-ups and recipients never need ETH:

| Operation | Authorization | Fee |
|-----------|---------------|-----|
| **Deposit** (wallet → vault) | Sender's own tx (permissionless) | — |
| **Send** (email → email, one on-chain tx) | Sender's signature | 0.5% (min $0.05, cap $0.25) |
| **Claim / Withdraw** (vault → wallet) | Owner's signature | 1% (min $0.05, cap $0.25) |

The fee is denominated in USDC and **recovers the sponsored gas cost** — so the network can run without the recipient ever holding ETH.

---

## Security model — non-custodial by construction

hashcash holds funds in a smart contract, but **cannot move them**. Three invariants are enforced on-chain (and pinned by the test suite):

1. **Only the bound owner can move a vault's funds.** Every withdrawal / transfer must carry an EIP-712 signature that recovers to the address bound to that email. Not the deployer, not the backend, not a relayer — no one else can move funds.
2. **No admin path.** There is no owner role, no pause-and-drain, no upgradeable proxy. Nothing can touch balances except an owner-signed action.
3. **The backend signer can only *bind*, never spend.** A small backend verifies Google sign-in and signs a one-time `email → wallet` binding attestation. Its signature is typed under a different EIP-712 struct and is **cryptographically incapable** of authorizing a fund movement. If the backend key leaked, an attacker could only mis-bind *unclaimed* deposits — never touch a vault already bound to its real owner.

Replay protection (per-owner nonce + deadline + chain/contract domain), ECDSA malleability rejection (OpenZeppelin `ECDSA`), pre-audit risk caps ($500 per unbound vault, $10k total), and a 14-day refund path for deposits sent to a typo'd email are all enforced in the contract.

> Email hashes are salted commitments, but email is low-entropy — the commitment reveals *which* emails have vaults to anyone who guesses the plaintext. This is documented honestly in the contract; it is a privacy limitation, not a fund-safety one.

---

## Why now

1. **L2 fees collapsed.** Base (Coinbase's L2) brought gas below $0.01 — micropayments and sponsored gas are finally economical.
2. **Embedded wallets matured.** Privy lets users get a self-custodial wallet in one Google login — no seed phrase, no extension.
3. **USDC is everywhere.** Circle's stablecoin (>$40B supply) is native on Base.
4. **The agent economy is arriving.** AI agents increasingly need to pay real humans — data labelers, reviewers, creators — most of whom have no wallet. hashcash is the payout layer for exactly that last mile.

---

## Live system

| | |
|---|---|
| **Frontend** | **[cfoing.io](https://cfoing.io)** · [hashcashs.pages.dev](https://hashcashs.pages.dev) (mirror) |
| **Smart contract** | [`0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b`](https://sepolia.basescan.org/address/0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b#code) on Base Sepolia (verified) |
| **USDC token** | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) (Circle official) |
| **Chain** | Base Sepolia (testnet) — chainId 84532 |

**Try it now:**
1. Get testnet ETH: [Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Get testnet USDC: [Circle faucet](https://faucet.circle.com) — pick Base Sepolia + USDC
3. Open the live demo and sign in with Google
4. Deposit, send, claim — full flow takes ~2 minutes

> ℹ️ **Notification emails may land in spam.** The sender domain is new and still building reputation with Gmail. Ask recipients to check spam and mark "Not spam"; this resolves organically over ~2 weeks.

---

## For AI agents / programmatic payers

An agent with a funded wallet can pay any email in a few lines — see [`sdk/`](./sdk). No hashcash account or API key needed; the agent pays directly into the recipient's on-chain vault, and the human claims with Google.

```ts
import { HashcashClient } from './sdk/hashcash'

const hc = new HashcashClient({ privateKey: process.env.AGENT_KEY })
await hc.payEmail('labeler@gmail.com', 12.50)   // pays $12.50 USDC into her vault
```

---

## Tech stack

| Layer | Tools |
|-------|-------|
| Smart contract | Solidity 0.8.24 · Hardhat · OpenZeppelin (EIP712 · ECDSA · SafeERC20 · ReentrancyGuard) |
| Tests | 47 Hardhat tests — happy paths, every revert, replay/malleability/front-run, fee logic, and a `sum(balances) == USDC held` invariant |
| Frontend | React 19 · Vite · TypeScript · Tailwind v4 |
| Wallet & auth | [Privy](https://privy.io) embedded wallets (Google OAuth → self-custodial wallet) |
| Gas sponsorship | Privy gas relay (`sponsor: true`, no wallet UI) |
| Backend | Cloudflare Pages Functions — `/api/bind` (EIP-712 binding attestation), `/api/activity` (on-chain history), `/api/notify` (Resend) |
| Chain RPC | viem + multi-RPC fallback |
| Hosting | Cloudflare Pages (auto-deploy on `main`) |

---

## Known limitations

This is a **demo / testnet product**.

1. **Email hash is a salted commitment, not encryption.** It hides nothing from someone who guesses the email (see Security model). A privacy limitation only — funds stay safe.
2. **Gmail dot/plus aliases not normalized.** `r.yan@` and `ryan@` produce different hashes. No provider-specific rules yet.
3. **Internal email→email transfer is an on-chain ledger move.** It is signature-authorized and non-custodial, but an internal transfer between two identifiers sits closer to "money movement on a shared ledger" than a self-withdrawal — a deliberate product/regulatory choice, documented in the contract.
4. **Email deliverability is still warming up** (new sender domain).

---

## Roadmap

**Done**
- [x] Non-custodial signature-authorized contract (no fund custody, no admin path)
- [x] Backend binding oracle (EIP-712 tickets, verifies Google, cannot spend)
- [x] Gas-cost recovery via USDC fee (sustainable without recipients holding ETH)
- [x] One-tx internal transfer + agent SDK

**Next**
- [ ] Batch / CSV payouts for payroll
- [ ] Agent payment API (hosted endpoint + billing) for the agent-economy payout use case
- [ ] Multi-language UI (Spanish, Vietnamese, Indonesian, Turkish)

**Later**
- [ ] Mainnet beta + third-party audit
- [ ] ZK-Email proof of ownership (remove the backend bind oracle entirely)

---

## About

Built by an 18-year-old student in Taiwan. Smart contract, frontend, backend, gas sponsorship, deploy, brand — solo. Iteration history is in `git log`.

Tested with my mother, my grandmother, and CS classmates: the grandmothers can use it, the classmates like the UX, nobody got stuck. The next milestone is proving real payers — web3 companies and AI-agent operators — will pay to reach their non-crypto recipients.

**Reach out:** open an issue on this repo.

---

## Local development

```bash
git clone https://github.com/ryanouoll/hashcashs
cd hashcashs

# Smart contract tests
npm install
npx hardhat test          # 47 tests

# Frontend (the deployed app lives in upload-for-github/email-wallet)
cd upload-for-github/email-wallet
npm install
npm run dev
```

`.env` (contract):
```
DEPLOYER_PRIVATE_KEY=...      # for contract deploys
BASE_SEPOLIA_RPC_URL=...      # optional
BASESCAN_API_KEY=...          # for `hardhat verify`
BIND_SIGNER_PRIVATE_KEY=...   # backend binding attestor (also a Cloudflare secret)
```

Frontend / backend env (Cloudflare Pages): `VITE_PRIVY_APP_ID`, and for `/api/bind`: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`, `BIND_SIGNER_PRIVATE_KEY`.

---

## License

MIT.
