# hashcash agent SDK

Let an AI agent (or any backend) pay a human by **email**, in USDC, from a funded
wallet. The agent deposits directly into the recipient's on-chain vault — no
hashcash account, no API key, no custody. The human later claims with Google.

This is the "machine side" of hashcash: agents are crypto-native (they hold keys),
so they pay straight into the contract; the email + Google layer exists for the
**human recipient** who has no wallet.

## Install

```bash
npm i viem
# TypeScript runner for the example:
npm i -D tsx
```

## Use

```ts
import { HashcashClient } from './hashcash'

const hc = new HashcashClient({ privateKey: process.env.AGENT_KEY! })

// pay $12.50 into labeler@gmail.com's vault
const { txHash } = await hc.payEmail('labeler@gmail.com', 12.5)

// read state
await hc.balanceOf('labeler@gmail.com')   // -> 12.5  (USD in the vault)
await hc.isClaimed('labeler@gmail.com')   // -> false (nobody bound it yet)
await hc.myUsdcBalance()                  // agent's own USDC
```

Run the example end-to-end:

```bash
AGENT_KEY=0x... npx tsx example.ts labeler@gmail.com 5
```

The agent wallet needs testnet USDC ([faucet.circle.com](https://faucet.circle.com),
Base Sepolia) and a little testnet ETH ([Base Sepolia faucet](https://www.alchemy.com/faucets/base-sepolia))
for gas.

## What it does

`payEmail(email, usd)`:
1. computes the salted `emailHash` (same formula as the app + backend),
2. infinite-approves the vault for USDC once (if not already),
3. calls `deposit(emailHash, amount)` on the EmailVaultUSDC contract.

The agent pays its own gas (it has ETH); the platform sponsors nothing here, so
this path has no platform fee. Fees apply only when the human later *withdraws*.

## Notes / limits

- **Per-vault cap:** an unclaimed vault is capped at $500 until the recipient
  signs in once. `payEmail` will revert past the cap.
- **Email normalization:** Gmail dot/plus aliases are not normalized — pass the
  exact address you want the recipient to log in with.
- **Notifications:** this SDK only moves funds on-chain. To also email the
  recipient a claim link, POST to the app's `/api/notify`, or wire your own.
- **Network:** defaults to Base Sepolia (testnet). Override `rpcUrl`,
  `vaultAddress`, `usdcAddress` in the constructor for other deployments.
