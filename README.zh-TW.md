# hashcash

**用 Email 收 USD,收款人不用 crypto 錢包。**

🌐 **線上 demo:** **[cfoing.io](https://cfoing.io)**(或 [hashcashs.pages.dev](https://hashcashs.pages.dev))· 🇺🇸 **[English README](./README.md)**

---

## 我們在解決什麼問題

Web3 公司 —— 以及越來越多的 AI agent —— 想付 USD 給全世界的 contractor、譯者、設計師、創作者、接案者,但:

- **全世界 90% 的接案者沒有 crypto 錢包**。叫他們「下載 MetaMask 然後抄 12 個英文單字」直接讓案子破局。
- 現有方案(Coinbase、Binance P2P)需要收款人**做 KYC + 開戶 + 換回法幣** —— 通常 3 天以上、收約 5% 手續費。
- 對本國貨幣不穩的國家(阿根廷、奈及利亞、土耳其、越南)的工作者,**他們要的就是美元本身** —— 寧願持有 USDC 也不想換回貶值的本幣。

**hashcash 解決這個斷層**。付款人用 USDC 付款給收款人的 *email*。收款人收到通知,用 Google 登入,立刻擁有一個**只有他自己能控制**的美元帳戶 —— 不需要錢包、不需要助記詞。

---

## 流程

```
┌──────────────────┐                                       ┌───────────────────┐
│  付款人          │                                       │   收款人          │
│  (持有 USDC)     │                                       │   (不懂 crypto)   │
│  或 AI agent     │                                       │                   │
└────────┬─────────┘                                       └─────────┬─────────┘
         │ 1. 透過 hashcash 付 $200 給 alice@gmail.com               │
         │    (USDC 鎖進她 emailHash 對應的金庫)                     │
         ▼                                                           │
    ┌──────────────────────────────────────────────────┐             │
    │  Base 上的 EmailVaultUSDC(非託管)              │             │
    │  balances[commit("alice@gmail.com")] += $200     │             │
    └────────┬─────────────────────────────────────────┘             │
             │  2. Email 通知信,內含領取連結                        │
             └──────────────────────────────────────────────────────►│
                                              3. Alice 用 Google 登入,看到 $200。
                                                 可持有、轉給另一個 email、或提到
                                                 自己錢包 —— 每一次動錢都要「她本人
                                                 的簽名」授權。
```

**三大操作** —— 每一筆動錢都由持有人的 EIP-712 簽名授權,gas 由平台代付,所以沒有錢包彈窗、收款人也永遠不用持有 ETH:

| 操作 | 授權方式 | 手續費 |
|------|---------|--------|
| **Deposit**(錢包 → 金庫)| 付款人自己發交易(誰都能付)| — |
| **Send**(email → email,單筆鏈上交易)| 付款人簽名 | 0.5%(最低 $0.05、封頂 $0.25)|
| **Claim / 提領**(金庫 → 錢包)| 持有人簽名 | 1%(最低 $0.05、封頂 $0.25)|

手續費以 USDC 計價,用來**回收平台代墊的 gas 成本** —— 讓整個網路不需要收款人持有 ETH 就能運作。

---

## 安全模型 —— 從設計上就是非託管

hashcash 把錢放在智能合約裡,但**合約自己搬不動這些錢**。鏈上強制三大鐵則(並由測試釘住):

1. **只有被綁定的本人能動金庫的錢。** 每筆提領/轉帳都要帶 EIP-712 簽名,且必須還原成綁定到那個 email 的地址。部署者、後端、relayer 都不行。
2. **沒有任何 admin 後門。** 沒有 owner 角色、沒有暫停抽乾、沒有可升級代理。除了「本人簽名的動作」,沒有東西能碰餘額。
3. **後端只能「綁定」,永遠不能花錢。** 一個小後端驗證 Google 登入,簽發一次性的「email → 錢包」綁定票證。它的簽名用不同的 EIP-712 結構,**密碼學上就無法**授權任何動錢。就算後端金鑰外洩,攻擊者也只能誤綁「還沒被領取」的存款,動不了已綁定給真正持有人的金庫。

防重放(per-owner nonce + 期限 + 鏈/合約 domain)、拒絕 ECDSA 簽名變造(OpenZeppelin `ECDSA`)、上線前風險上限(未綁定金庫 $500、全合約 $10k)、以及打錯 email 的 14 天退款機制,全部寫在合約裡。

> Email hash 是加鹽 commitment,但 email 熵太低 —— 知道明文的人仍能推出「哪個 email 有金庫」。合約裡有誠實記載;這是**隱私**限制,不是資金安全限制。

---

## 為什麼是現在

1. **L2 手續費崩了。** Base(Coinbase 的 L2)把 gas 殺到 $0.01 以下 —— 微支付和 gas 代付第一次划算。
2. **Embedded wallet 成熟了。** Privy 讓使用者用一個 Google 登入就拿到自我保管的錢包 —— 不要助記詞、不要外掛。
3. **USDC 全球普及。** Circle 穩定幣(流通量 >$40B)在 Base 原生支援。
4. **agent 經濟正在到來。** AI agent 越來越常需要付錢給真人 —— 資料標註員、審核員、創作者 —— 而這些人多半沒有錢包。hashcash 正是這「最後一哩付款層」。

---

## 線上系統

| | |
|---|---|
| **前端** | **[cfoing.io](https://cfoing.io)** · [hashcashs.pages.dev](https://hashcashs.pages.dev)(鏡像)|
| **智能合約** | [`0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b`](https://sepolia.basescan.org/address/0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b#code) 部署在 Base Sepolia(已 verify)|
| **USDC token** | [`0x036CbD53842c5426634e7929541eC2318f3dCF7e`](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e)(Circle 官方)|
| **鏈** | Base Sepolia(testnet)— chainId 84532 |

**立刻試用:**
1. 領 testnet ETH:[Alchemy Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia)
2. 領 testnet USDC:[Circle faucet](https://faucet.circle.com) — 選 Base Sepolia + USDC
3. 開 demo 網站,用 Google 登入
4. Deposit / Send / Claim,全程約 2 分鐘

> ℹ️ **通知信目前可能進垃圾信匣。** 寄件 domain 是新的,Gmail 還沒建立信譽。請收款人去垃圾信匣標記「不是垃圾郵件」,約 2 週會自然改善。

---

## 給 AI agent / 程式化付款用

一個有餘額的 agent 錢包,可以用幾行程式付款給任何 email —— 見 [`sdk/`](./sdk)。不需要 hashcash 帳號或 API key;agent 直接把錢付進收款人的鏈上金庫,真人再用 Google 領取。

```ts
import { HashcashClient } from './sdk/hashcash'

const hc = new HashcashClient({ privateKey: process.env.AGENT_KEY })
await hc.payEmail('labeler@gmail.com', 12.50)   // 付 $12.50 USDC 進她的金庫
```

---

## 技術選擇

| 層 | 工具 |
|---|------|
| 智能合約 | Solidity 0.8.24 · Hardhat · OpenZeppelin(EIP712 · ECDSA · SafeERC20 · ReentrancyGuard)|
| 測試 | 47 個 Hardhat 測試 —— happy path、每個 revert、重放/變造/搶跑、手續費邏輯、`sum(balances) == 合約持有 USDC` invariant |
| 前端 | React 19 · Vite · TypeScript · Tailwind v4 |
| 錢包 & 認證 | [Privy](https://privy.io) embedded wallet(Google OAuth → 自我保管錢包)|
| Gas 代付 | Privy gas relay(`sponsor: true`,無錢包 UI)|
| 後端 | Cloudflare Pages Functions —— `/api/bind`(EIP-712 綁定票證)、`/api/activity`(鏈上紀錄)、`/api/notify`(Resend)|
| RPC | viem + 多 RPC fallback |
| Hosting | Cloudflare Pages(push `main` 自動部署)|

---

## 已知限制

這是 **demo / testnet 產品**。

1. **Email hash 是加鹽 commitment,不是加密。** 對猜得到 email 的人藏不住(見安全模型)。純隱私限制,資金安全不受影響。
2. **沒處理 Gmail 的點 / +alias。** `r.yan@` 跟 `ryan@` hash 不同。目前不做 provider 專屬規則。
3. **站內 email→email 轉帳是鏈上帳本移轉。** 它是簽名授權、非託管的,但兩個識別碼之間的內部轉帳,比「自己提領」更接近「共享帳本上的資金移動」—— 這是刻意的產品/法規取捨,合約裡有記載。
4. **通知信送達率還在養**(寄件 domain 新)。

---

## Roadmap

**已完成**
- [x] 非託管簽名授權合約(不保管資金、無 admin 後門)
- [x] 後端綁定 oracle(EIP-712 票證,驗 Google、無法花錢)
- [x] 用 USDC 手續費回收 gas 成本(不靠收款人持有 ETH 也能永續)
- [x] 單筆站內轉帳 + agent SDK

**接下來**
- [ ] 批次 / CSV 付款(payroll 用)
- [ ] agent 付款 API(hosted endpoint + 計費),對準 agent 經濟的付款用例
- [ ] 多語系(西班牙語、越南語、印尼語、土耳其語)

**之後**
- [ ] Mainnet beta + 第三方 audit
- [ ] ZK-Email proof of ownership(完全拿掉後端綁定 oracle)

---

## 關於我

18 歲,台灣學生。智能合約、前端、後端、gas 代付、部署、品牌 —— 一個人做。迭代痕跡都在 `git log`。

親手測試對象是媽媽、阿嬤、資工系同學:阿嬤跟媽媽都會用,同學說 UX 很爽,沒人卡住。**下一個里程碑**:證明真的有付款方 —— web3 公司和 AI-agent 營運方 —— 願意付錢用 hashcash 觸及他們的非 crypto 收款人。

**聯絡**:直接在這個 repo 開 issue。

---

## 本機開發

```bash
git clone https://github.com/ryanouoll/hashcashs
cd hashcashs

# 合約測試
npm install
npx hardhat test          # 47 個測試

# 前端(線上版在 upload-for-github/email-wallet)
cd upload-for-github/email-wallet
npm install
npm run dev
```

`.env`(合約):
```
DEPLOYER_PRIVATE_KEY=...      # 部署合約用
BASE_SEPOLIA_RPC_URL=...      # 可省
BASESCAN_API_KEY=...          # 跑 hardhat verify 用
BIND_SIGNER_PRIVATE_KEY=...   # 後端綁定簽名者(也要設成 Cloudflare secret)
```

前端 / 後端 env(Cloudflare Pages):`VITE_PRIVY_APP_ID`,以及 `/api/bind` 需要的 `PRIVY_APP_ID`、`PRIVY_APP_SECRET`、`PRIVY_VERIFICATION_KEY`、`BIND_SIGNER_PRIVATE_KEY`。

---

## License

MIT.
