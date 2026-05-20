# hashcash

**用 Email 收 USD，收款人不用 crypto 錢包。**

🌐 **線上 demo：** **[cfoing.io](https://cfoing.io)**（或 [hashcashs.pages.dev](https://hashcashs.pages.dev)）· 🇺🇸 **[English README](./README.md)**

---

## 我們在解決什麼問題

Web3 公司想付 USD 給全世界的 contractor、譯者、設計師、創作者，但：

- **全世界 90% 的接案者沒有 crypto 錢包**。叫他們「下載 MetaMask 然後抄 12 個英文單字」直接讓案子破局。
- 現有方案（Coinbase、Binance P2P）需要收款人**做 KYC + 開戶 + 換回法幣** — 通常要 3 天以上、收 5% 手續費。
- 對於本國貨幣很不穩的國家（阿根廷、奈及利亞、土耳其、越南）的工作者，**他們要的就是美元本身** — 寧願持有 USDC 也不想換回貶值中的本幣。

**hashcash 解決這個斷層**。付款人用 USDC 付款給收款人的 *email*。收款人收到通知，用 Google 登入，立刻擁有一個他完全控制的美元帳戶 — 不需要錢包、不需要助記詞。

---

## 流程是這樣

```
┌──────────────────┐                                       ┌───────────────────┐
│  Web3 公司       │                                       │   收款人          │
│  (持有 USDC)     │                                       │   (不懂 crypto)   │
└────────┬─────────┘                                       └─────────┬─────────┘
         │                                                           │
         │ 1. 透過 hashcash 付 $200 給 alice@gmail.com               │
         │    (一次簽名，USDC 鎖進合約裡 emailHash 對應的金庫)       │
         │                                                           │
         ▼                                                           │
    ┌──────────────────────────────────────────────────┐             │
    │  Base Sepolia 上的 EmailVaultUSDC 合約           │             │
    │  balances[keccak256("alice@gmail.com")] += $200  │             │
    └────────┬─────────────────────────────────────────┘             │
             │                                                       │
             │  2. Email 通知信，內有領取連結                        │
             └──────────────────────────────────────────────────────►│
                                                                     │
                                                  3. Alice 點連結，用 Google
                                                     登入。看到 $200 USD。
                                                     可以持有、寄給別人（零彈
                                                     窗）、或隨時提到自己錢包。
```

**三大操作：**

| 操作 | 誰付 gas | 錢包彈窗 |
|------|---------|---------|
| **Deposit**（錢包 → vault）| 付款人自己 | MetaMask 確認 × 1（一次性 infinite approve 之後永遠不再要）|
| **Send**（vault → vault，hash-to-hash）| hashcash 透過 Privy gas relay 贊助 | **零彈窗** |
| **Claim**（vault → 錢包）| 收款人自己 | MetaMask 確認 × 1 |

---

## 為什麼是現在

1. **2024 年 L2 手續費崩到零**。Base（Coinbase 的 L2）把 gas 殺到 $0.01 以下，**微支付**第一次在經濟上可行。
2. **Embedded wallet 成熟了**。Privy / Dynamic 讓使用者用一個 Google 登入就拿到錢包 — 不要助記詞、不要外掛。
3. **USDC 全球普及**。Circle 的穩定幣在 Base / Solana / Polygon 都有，總流通量 >$40B，**比多數國家的 M1 還大**。
4. **遠端工作 + crypto-native 公司**正在擴張：DAO、NFT 工作室、加密創業公司要付薪水給 50+ 國家的 contractor，傳統銀行基建覆蓋不到。

十年前阻止「email-as-wallet」的所有障礙都消失了。市場已就緒，產品還沒人做好。我們在做。

---

## 線上系統

| | |
|---|---|
| **前端** | **[cfoing.io](https://cfoing.io)** · [hashcashs.pages.dev](https://hashcashs.pages.dev)（鏡像）|
| **智能合約** | [`0xE856d828bD4DB6123b5d6C6C7405432eC722dA17`](https://sepolia.basescan.org/address/0xE856d828bD4DB6123b5d6C6C7405432eC722dA17#code) 部署在 Base Sepolia（已 verify） |
| **USDC token** | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)（Circle 官方）|
| **鏈** | Base Sepolia（testnet）— chainId 84532 |

**立刻試用：**
1. 領 testnet ETH：[Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)
2. 領 testnet USDC：[Circle faucet](https://faucet.circle.com) — 選 Base Sepolia + USDC
3. 開 demo 網站，用 Google 登入
4. Deposit / Send / Claim 三步驟，全程約 2 分鐘

> ℹ️ **通知信目前可能會進垃圾信匣**。寄件 domain（`cfoing.io`）是新的，Gmail / Yahoo / Outlook 還沒建立對它的信譽。如果你寄錢給朋友他說沒收到，請他**去垃圾信匣翻一下**，並標記「**不是垃圾郵件**」。這個問題會在接下來 2 週內隨著寄信累積自然改善。

---

## 技術選擇

| 層 | 工具 |
|---|------|
| 智能合約 | Solidity 0.8.24 · Hardhat · 最小依賴、無繼承 |
| 測試 | 37 個 Hardhat unit test，包含**故意保留**已知 DEMO 限制的驗證 test |
| 前端 | React 19 · Vite · TypeScript · Tailwind v4 |
| 錢包 & 認證 | [Privy](https://privy.io) embedded wallet（Google OAuth → 自動建錢包）|
| Gas sponsorship | Privy gas relay (`sendTransaction` 帶 `sponsor: true` 跟 `showWalletUIs: false`) |
| RPC | viem + 多 RPC fallback（publicnode → tenderly → omnia → base.org）|
| Hosting | Cloudflare Pages（push `main` 自動部署）|
| 通知信 | Resend + Cloudflare Pages Functions（`/api/notify`）|
| 安全 headers | 嚴格 CSP、HSTS、X-Frame-Options DENY、Permissions-Policy |

---

## 已知限制（以及為什麼這樣設計）

這是 **demo / testnet 產品**。四個已知限制：

1. **合約沒做擁有權驗證**。目前任何人知道 emailHash 都能 claim 走餘額。解法是後端 oracle 驗 Google OAuth 簽 EIP-712 票，或在合約裡跑 ZK-Email proof。**我們選擇先不做，是為了快速驗證 UX 假設**。
2. **沒處理 Gmail 的點 / +alias**。`r.yan@gmail.com` 跟 `ryan@gmail.com` Gmail 視為同一信箱，但 hash 出來不同。我們不做 provider-specific 規則，避免日後維護負擔。
3. **沒做 per-vault 上限**。Mainnet 版本會限制每個 emailHash 最多多少 USD，直到擁有權被驗證。
4. **通知信還在養 sender reputation**。寄件 domain 是新的，Gmail / Yahoo / Outlook 會把前幾封信丟進垃圾信匣，要 1-2 週累積後才會穩定進收件匣。我們已經把信件文案避開 crypto 觸發詞（wallet / claim / USDC 等），並依 Gmail 2024 規範加上 `List-Unsubscribe` 跟 `Reply-To` headers，盡量減少誤判。

前三項在 `contracts/EmailVaultUSDC.sol` 註解寫清楚，在 `test/EmailVaultUSDC.test.js` 用**具名 test 釘住** — 任何人想修這些漏洞，那些 test 會失敗，逼他明確處理掉這份「故意保留」的承諾。

---

## Roadmap

**現在 → Q1**
- [ ] 後端 oracle 做擁有權驗證（EIP-712 票證，後端不持有任何資產）
- [ ] Magic-link 通知信（Resend template → 一鍵 claim）
- [ ] 訪談 10 家正在付薪水給非 crypto contractor 的 web3 公司
- [ ] 批次付款（CSV 匯入），給 payroll 用例

**Q2**
- [ ] Chrome extension：在 Discord / Notion / GitHub / Linear 直接付款
- [ ] 多語系（西班牙語、越南語、印尼語、土耳其語）
- [ ] 週期性付款（每月薪水自動發）

**Q3 之後**
- [ ] Mainnet beta（含 per-vault 上限 + 第三方 audit）
- [ ] ZK-Email proof of ownership（真正去中心化）
- [ ] API + SDK for B2B 整合

---

## 關於我

18 歲，台灣學生。

整個東西 — 智能合約、前端、gas sponsorship、部署、品牌、這份 README — 花了 **3 週日曆時間**，中間夾了 **1.5 週的期中考週**。換算實際 focused 開發大概 **1.5 週**。期間 13+ 次迭代（看 `git log` 可以追到痕跡）。

親手測試的對象是媽媽、阿嬤、資工系同學。阿嬤跟媽媽都能用，資工同學說 UX 很爽，沒人卡在我不希望他們卡的地方。**接下來的目標**：證明有 10 家 web3 公司願意付錢用 hashcash 處理他們的非 crypto contractor 付款。

**聯絡**：直接在這個 repo 開 issue。

---

## 本機開發

```bash
git clone https://github.com/ryanouoll/hashcashs
cd hashcashs

# 跑合約測試
npm install
npx hardhat test

# 前端（線上版用 upload-for-github/email-wallet 目錄）
cd upload-for-github/email-wallet
npm install
npm run dev
```

設 `.env`：
```
DEPLOYER_PRIVATE_KEY=...   # 部署合約用
BASE_SEPOLIA_RPC_URL=...   # 可省，預設 sepolia.base.org
BASESCAN_API_KEY=...       # 跑 hardhat verify 用
```

前端 env（Cloudflare Pages 或 `.env.local`）：
```
VITE_PRIVY_APP_ID=...
```

---

## License

MIT.
