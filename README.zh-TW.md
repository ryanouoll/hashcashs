# EmailVault（Email Hash 錢包 / Base Sepolia）

[English README](README.md)

個人網站：`cfoing.io`

本專案為**資工系大一課程期末專題**的 MVP 實作，目標是先驗證概念與跑通流程（非正式環境等級）。

用 **Email 的 keccak256 hash（`bytes32`）** 當作收款識別，讓使用者可以「不知道錢包地址」也能先收款（存進合約），之後再由擁有該 Email 的人把資產領出來。

本 repo 包含：
- **Solidity 合約**：`contracts/EmailVault.sol`
- **前端（Vite + React + TS）**：`email-wallet/`（Google 登入 → 產生 email hash → deposit / 查餘額 / claim / hash-to-hash 轉帳）

---

## 重要安全警告（請先看）

`EmailVault.sol` 目前是「期末專案 MVP」版本，**缺乏 Email 擁有權驗證**：
- **任何人只要知道 `emailHash` 就能呼叫 `claim(emailHash, amount)` 把錢領走**
- **任何人只要知道 `fromHash` 就能呼叫 `transfer(fromHash, toHash, amount)` 把該 hash 下面的餘額轉走**

實務上必須加上驗證機制（例如 ZK-Email proof、後端簽章/預言機簽章、或其他可驗證的 ownership 流程）後才可用於正式環境。

---

## 合約設計

### 核心資料結構

- `mapping(bytes32 => uint256) public balances;`  
  用 email 的 hash（`bytes32`）當作 key，記錄對應的 ETH 餘額（Wei）。

### 事件（Events）

- `Deposited(emailHash, sender, amount)`
- `Claimed(emailHash, receiver, amount)`
- `Transferred(fromHash, toHash, caller, amount)`

### 主要函式（Contract API）

- `deposit(bytes32 emailHash) payable`
  - 對指定 `emailHash` 存入 ETH（增加 `balances[emailHash]`）
- `claim(bytes32 emailHash, uint256 amount)`
  - 從 `balances[emailHash]` 提款 `amount`（轉給 `msg.sender`）
  - ⚠️ 目前沒有驗證 `msg.sender` 是否為該 email 的擁有者
- `transfer(bytes32 fromHash, bytes32 toHash, uint256 amount)`
  - 在合約內部把餘額從 `fromHash` 移到 `toHash`
  - ⚠️ 目前沒有驗證呼叫者是否能操作 `fromHash`

---

## 快速開始（本機）

### 需求

- Node.js + npm

### 安裝

```bash
npm install
```

---

## 部署合約（Base Sepolia）

### 1) 設定環境變數

複製 `.env.example` 成 `.env`，填入你的部署者測試私鑰與 RPC：

```bash
cp .env.example .env
```

`.env.example` 內容：
- `BASE_SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`（請用測試錢包，不要用主錢包）
- `BASESCAN_API_KEY`（可選：用於 verify）

### 2) 部署

方式 A：用腳本部署（`scripts/deploy-email-vault.js`）

```bash
npx hardhat run scripts/deploy-email-vault.js --network baseSepolia
```

方式 B：用 Ignition 部署（`ignition/modules/EmailVault.ts`）

```bash
npx hardhat ignition deploy ignition/modules/EmailVault.ts --network baseSepolia
```

部署完成後，你會拿到合約地址（`EmailVault deployed to: 0x...`）。

### 3) （可選）驗證合約到 BaseScan

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>
```

---

## 前端（email-wallet）啟動

前端會用 `viem`：
- 將 Email 正規化（`trim().toLowerCase()`）後做 `keccak256` 得到 `bytes32`  
  參考：`email-wallet/src/lib/email.ts`

### 1) 設定前端環境變數

在 `email-wallet/.env`（或建議用 `email-wallet/.env.local`）設定：

```bash
VITE_PRIVY_APP_ID=YOUR_PRIVY_APP_ID
VITE_EMAIL_VAULT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT
VITE_BASE_RPC_URL=https://sepolia.base.org
```

### 2) 啟動

在 repo 根目錄執行：

```bash
npm run dev
```

或進到前端資料夾：

```bash
cd email-wallet
npm install
npm run dev
```

---

## GitHub 上傳（打包乾淨版本）

專案內有 `package-for-github.ps1` 會輸出一個不含 `node_modules`、不含 `.env` 的乾淨資料夾到 `upload-for-github/`：

```powershell
.\package-for-github.ps1
```

接著把 `upload-for-github/` 整個資料夾上傳到 GitHub 即可。

---

## License

MIT（見各檔案 SPDX / repo 設定）

