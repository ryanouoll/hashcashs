import type { Abi } from 'viem'

/**
 * EmailVaultUSDC v2 ABI(非託管、簽名授權版,Base Sepolia)
 *
 * vs v1 的差異:
 *  - `claim` / `transfer`(無驗證,漏洞來源)已移除
 *  - 新增 `bind`(後端 Bind 票證)、`withdraw` / `bindAndWithdraw`(本人 EIP-712 簽名)
 *  - 新增 `refund`(存款人取回 14 天未綁定的錢)
 *  - 新增風險上限:未綁定金庫 500 USDC、全合約 10,000 USDC
 */
export const EMAIL_VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'bind',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'bindSig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'ownerSig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'bindAndWithdraw',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'owner', type: 'address' },
      { name: 'bindSig', type: 'bytes' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'ownerSig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'MAX_FEE',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'refund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'balances',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'UNBOUND_VAULT_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'totalUsdcHeld',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi

/** 最小 ERC-20 ABI(給 deposit 前 approve 用) */
export const USDC_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const satisfies Abi

/**
 * EmailVaultUSDC v2 合約地址(Base Sepolia)。
 * ⚠️ 不讀 Cloudflare env(build-vs-runtime 的坑)。升級合約直接改這常數。
 * 部署後由 ignition 回填。
 */
const VAULT_BASE_SEPOLIA = '0xE16258Ad4D5B629170e1ABE0D58CBB4ddBa67Cf8' // v2.1 (USDC fee), deployed 2026-07-21

export function getEmailVaultAddress(): `0x${string}` {
  return VAULT_BASE_SEPOLIA as `0x${string}`
}

export function getUsdcAddress(): `0x${string}` {
  // Base Sepolia 預設使用 Circle 官方 USDC
  const addr =
    import.meta.env.VITE_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  return addr as `0x${string}`
}

/** USDC 的 decimals(6)— 整個前端用 USD 顯示但儲存為 micro-USDC */
export const USDC_DECIMALS = 6

// ─── EIP-712(要跟合約 / functions/api/bind.ts 完全一致)────────────────────
export const VAULT_EIP712_DOMAIN = (vault: `0x${string}`) => ({
  name: 'EmailVaultUSDC',
  version: '1',
  chainId: 84532,
  verifyingContract: vault,
})

export const WITHDRAW_TYPES = {
  Withdraw: [
    { name: 'emailHash', type: 'bytes32' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'fee', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

/**
 * 每筆提領收的 USDC 手續費(gas 由平台代墊 ETH,用這個回收成本)。
 * 使用者「簽名裡就含這個數字」— relayer 不能多收;合約另有 MAX_FEE=$0.25 上限。
 * 改這個值不用重新部署合約。
 */
export const WITHDRAW_FEE = 50_000n // $0.05

/** 向後端要 Bind 票證(要帶 Privy access token) */
export async function requestBindTicket(accessToken: string): Promise<{
  emailHash: `0x${string}`
  owner: `0x${string}`
  signature: `0x${string}`
}> {
  const res = await fetch('/api/bind', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data: any = await res.json().catch(() => ({}))
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ? `bind: ${data.error}` : `bind api ${res.status}`)
  }
  return { emailHash: data.emailHash, owner: data.owner, signature: data.signature }
}
