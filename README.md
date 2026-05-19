# hashcash

**Pay USD to anyone's email. Recipients don't need a crypto wallet.**

🌐 **Live demo:** **[cfoing.io](https://cfoing.io)** (or [hashcashs.pages.dev](https://hashcashs.pages.dev)) · 🇹🇼 **[中文版說明](./README.zh-TW.md)**

---

## The problem

Web3 companies want to pay USD to contractors, translators, designers, and creators around the world. But:

- **90% of the world's freelancers don't have a crypto wallet.** Asking them to "download MetaMask and back up 12 seed words" ends most deals before they start.
- Existing solutions (Coinbase, Binance P2P) require recipients to do **KYC + onboarding + offramp** — usually 3+ days, 5% fees.
- For workers in countries with weak currencies (Argentina, Nigeria, Turkey, Vietnam), **USD itself is what they want** — they'd rather hold USDC than convert to local fiat.

**hashcash bridges this gap.** Senders pay USDC to a recipient's *email*. Recipients receive a notification, sign in with Google, and immediately have a USD account they control — no wallet, no seed phrase.

---

## How it works

```
┌──────────────────┐                                       ┌───────────────────┐
│  Web3 Company    │                                       │   Recipient       │
│  (has USDC)      │                                       │   (no crypto)     │
└────────┬─────────┘                                       └─────────┬─────────┘
         │                                                           │
         │ 1. Pays $200 to alice@gmail.com via hashcash              │
         │    (one signature, USDC locked in vault under emailHash)  │
         │                                                           │
         ▼                                                           │
    ┌─────────────────────────────────────────────────┐              │
    │  EmailVaultUSDC smart contract on Base Sepolia  │              │
    │  balances[keccak256("alice@gmail.com")] += $200 │              │
    └────────┬────────────────────────────────────────┘              │
             │                                                       │
             │  2. Email notification with claim link                │
             └──────────────────────────────────────────────────────►│
                                                                     │
                                                  3. Alice opens link, signs in
                                                     with Google. Sees $200 USD.
                                                     Can hold, send to others
                                                     (no popup), or withdraw to
                                                     her own wallet anytime.
```

**Three core operations:**

| Operation | Who pays gas | UI pop-up |
|-----------|--------------|-----------|
| **Deposit** (wallet → vault) | Sender | MetaMask confirm × 1 (after one-time infinite approve) |
| **Send** (vault → vault, hash-to-hash) | Sponsored by hashcash via Privy | **Zero pop-ups** |
| **Claim** (vault → wallet) | Recipient | MetaMask confirm × 1 |

---

## Why now

1. **L2 fees collapsed in 2024.** Base (Coinbase's L2) brought gas below $0.01, making micropayments economically viable for the first time.
2. **Embedded wallets matured.** Privy / Dynamic let users get a wallet in one Google login — no seed phrase, no extension.
3. **USDC is now everywhere.** Circle's stablecoin is on Base, Solana, Polygon — combined supply >$40B, larger than most national M1.
4. **Remote work + crypto-native companies** are scaling: DAOs, NFT studios, and crypto startups need to pay contractors in 50+ countries. Banking infra doesn't reach them.

The friction points that blocked email-as-wallet ten years ago are gone. The market is ready; the product wasn't built yet. We're building it.

---

## Live system

| | |
|---|---|
| **Frontend** | **[cfoing.io](https://cfoing.io)** · [hashcashs.pages.dev](https://hashcashs.pages.dev) (mirror) |
| **Smart contract** | [`0xE856d828bD4DB6123b5d6C6C7405432eC722dA17`](https://sepolia.basescan.org/address/0xE856d828bD4DB6123b5d6C6C7405432eC722dA17#code) on Base Sepolia (verified) |
| **USDC token** | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) (Circle official) |
| **Chain** | Base Sepolia (testnet) — chainId 84532 |

**Try it now:**
1. Get testnet ETH: [Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)
2. Get testnet USDC: [Circle faucet](https://faucet.circle.com) — pick Base Sepolia + USDC
3. Open the live demo and sign in with Google
4. Deposit, send, claim — full flow takes ~2 minutes

---

## Tech stack

| Layer | Tools |
|-------|-------|
| Smart contracts | Solidity 0.8.24 · Hardhat · minimal deps, no inheritance |
| Tests | 37 Hardhat unit tests, including explicit tests pinning known DEMO limitations |
| Frontend | React 19 · Vite · TypeScript · Tailwind v4 |
| Wallet & auth | [Privy](https://privy.io) embedded wallets (Google OAuth → wallet derivation) |
| Gas sponsorship | Privy gas relay (`sendTransaction` with `sponsor: true` and `showWalletUIs: false`) |
| Chain RPC | viem + multi-RPC fallback (publicnode → tenderly → omnia → base.org) |
| Hosting | Cloudflare Pages (auto-deploy on `main`) |
| Email notifications | Resend + Cloudflare Pages Functions (`/api/notify`) |
| Security headers | Strict CSP, HSTS, X-Frame-Options DENY, Permissions-Policy |

---

## Known limitations (and why they exist)

This is a **demo / testnet product**. Three intentional simplifications:

1. **No on-chain ownership verification.** Currently anyone who knows an email's `keccak256` hash can claim its balance. This is solvable with a backend oracle that verifies Google OAuth and signs EIP-712 tickets, or with on-chain ZK-Email proofs. We chose to ship without it first to validate the UX hypothesis.
2. **Gmail dot/plus aliases not normalized.** `r.yan@gmail.com` and `ryan@gmail.com` produce different hashes even though Gmail routes them to the same inbox. Avoiding provider-specific rules until needed.
3. **Per-vault caps not enforced.** A production deployment with real funds would cap each emailHash at a small amount until ownership is proven.

These are tracked in `contracts/EmailVaultUSDC.sol` as comments and in the test suite (`test/EmailVaultUSDC.test.js`) as named tests — so any change that fixes them will trip the tests and force an explicit acknowledgment.

---

## Roadmap

**Now → Q1**
- [ ] Backend oracle for ownership verification (EIP-712 tickets, no fund custody)
- [ ] Magic-link email notifications (Resend templates → one-click claim)
- [ ] User research with 10 web3 companies actively paying non-crypto contractors
- [ ] Bulk send (CSV import) for payroll use case

**Q2**
- [ ] Chrome extension: pay via hashcash directly from Discord / Notion / GitHub / Linear
- [ ] Multi-language UI (Spanish, Vietnamese, Indonesian, Turkish)
- [ ] Recurring payments (monthly salary primitive)

**Q3+**
- [ ] Mainnet beta with per-vault caps + audit
- [ ] ZK-Email proof of ownership (truly trustless)
- [ ] API + SDK for B2B integrations

---

## About

Built by an 18-year-old, currently a student in Taiwan. First version (ETH-only, no ownership) shipped in 6 weeks. This USDC version with gas sponsorship is iteration 13.

The product was tested with my mother (50), grandmother (80), and computer science classmates. The grandmothers can use it; the classmates love the UX. The next milestone is proving 10 web3 companies will pay to use it for their non-crypto contractors.

**Reach out:** open an issue on this repo.

---

## Local development

```bash
git clone https://github.com/ryanouoll/hashcashs
cd hashcashs

# Smart contract tests
npm install
npx hardhat test

# Frontend (live deployed version uses upload-for-github/email-wallet)
cd upload-for-github/email-wallet
npm install
npm run dev
```

Set `.env`:
```
DEPLOYER_PRIVATE_KEY=...   # for contract deploys
BASE_SEPOLIA_RPC_URL=...   # optional, default sepolia.base.org
BASESCAN_API_KEY=...       # for `hardhat verify`
```

Frontend env (Cloudflare Pages or `.env.local`):
```
VITE_PRIVY_APP_ID=...
```

---

## License

MIT.
