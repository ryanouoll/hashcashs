# EmailVault (Email-hash wallet / Base Sepolia)

[中文 README](README.zh-TW.md)

Website: `cfoing.io`

This repository is a **CS freshman (year 1) course final project** MVP. The goal is to validate the idea and end-to-end flow (not production readiness).

EmailVault uses **keccak256(email) → `bytes32`** as a “recipient identifier”, so someone can deposit ETH to an email-hash first, then the email owner can later claim it.

This repo includes:
- **Solidity contract**: `contracts/EmailVault.sol`
- **Frontend (Vite + React + TS)**: `email-wallet/` (Google login → email hash → deposit / balance / claim / hash-to-hash transfer)

---

## Critical security warning (read first)

`EmailVault.sol` is an MVP for a school project and **does not verify email ownership**:
- **Anyone who knows `emailHash` can call `claim(emailHash, amount)` and withdraw funds**
- **Anyone who knows `fromHash` can call `transfer(fromHash, toHash, amount)` and move that balance**

For real-world use, you must add an ownership verification mechanism (e.g., ZK-Email proof, backend/oracle signatures, or any verifiable ownership flow).

---

## Contract overview

### Core data structure

- `mapping(bytes32 => uint256) public balances;`  
  Uses email hash (`bytes32`) as the key to store ETH balances (Wei).

### Events

- `Deposited(emailHash, sender, amount)`
- `Claimed(emailHash, receiver, amount)`
- `Transferred(fromHash, toHash, caller, amount)`

### Contract API

- `deposit(bytes32 emailHash) payable`
  - Deposits ETH into `balances[emailHash]`
- `claim(bytes32 emailHash, uint256 amount)`
  - Withdraws `amount` from `balances[emailHash]` to `msg.sender`
  - ⚠️ No ownership verification
- `transfer(bytes32 fromHash, bytes32 toHash, uint256 amount)`
  - Moves balance inside the contract from `fromHash` to `toHash`
  - ⚠️ No authorization checks

---

## Quick start (local)

### Requirements

- Node.js + npm

### Install

```bash
npm install
```

---

## 部署合約（Base Sepolia）
## Deploy contract (Base Sepolia)

### 1) Configure environment variables

Copy `.env.example` to `.env`, then fill in your RPC and deployer test private key:

```bash
cp .env.example .env
```

`.env.example` contains:
- `BASE_SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY` (use a test wallet, not your main wallet)
- `BASESCAN_API_KEY` (optional, for verification)

### 2) Deploy

Option A: deploy via script (`scripts/deploy-email-vault.js`)

```bash
npx hardhat run scripts/deploy-email-vault.js --network baseSepolia
```

Option B: deploy via Ignition (`ignition/modules/EmailVault.ts`)

```bash
npx hardhat ignition deploy ignition/modules/EmailVault.ts --network baseSepolia
```

After deployment, you will get the contract address (`EmailVault deployed to: 0x...`).

### 3) (Optional) Verify on BaseScan

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>
```

---

## Frontend (email-wallet)

The frontend uses `viem` to compute:
- normalize email (`trim().toLowerCase()`) then `keccak256` → `bytes32`  
  See: `email-wallet/src/lib/email.ts`

### 1) Configure frontend env vars

Set the following in `email-wallet/.env` (or preferably `email-wallet/.env.local`):

```bash
VITE_PRIVY_APP_ID=YOUR_PRIVY_APP_ID
VITE_EMAIL_VAULT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT
VITE_BASE_RPC_URL=https://sepolia.base.org
```

### 2) Run

From the repo root:

```bash
npm run dev
```

Or inside the frontend folder:

```bash
cd email-wallet
npm install
npm run dev
```

---

## Packaging for GitHub upload

`package-for-github.ps1` creates a clean `upload-for-github/` folder without `node_modules` and without `.env`:

```powershell
.\package-for-github.ps1
```

Then upload the entire `upload-for-github/` folder to GitHub.

---

## License

MIT（見各檔案 SPDX / repo 設定）
