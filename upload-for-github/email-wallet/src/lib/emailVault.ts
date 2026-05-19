import type { Abi } from 'viem'

/**
 * EmailVaultUSDC ABI (Base Sepolia)
 *
 * 主要差異 vs 舊 EmailVault：
 *  - deposit 不再 payable，多吃一個 amount 參數
 *  - 合約綁定 USDC token（6 decimals）
 *  - 多了 usdc() / totalUsdcHeld() 兩個 view
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
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'emailHash', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'fromHash', type: 'bytes32' },
      { name: 'toHash', type: 'bytes32' },
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

/** 最小 ERC-20 ABI（給 deposit 前 approve 用） */
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
 * EmailVaultUSDC 合約地址。
 * Base Sepolia 預設用最新部署的版本；可被 env 覆蓋（mainnet 或日後升級時用）。
 */
const DEFAULT_VAULT_BASE_SEPOLIA = '0xE856d828bD4DB6123b5d6C6C7405432eC722dA17'

export function getEmailVaultAddress(): `0x${string}` {
  const addr = import.meta.env.VITE_EMAIL_VAULT_ADDRESS || DEFAULT_VAULT_BASE_SEPOLIA
  return addr as `0x${string}`
}

export function getUsdcAddress(): `0x${string}` {
  // Base Sepolia 預設使用 Circle 官方 USDC
  const addr =
    import.meta.env.VITE_USDC_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
  return addr as `0x${string}`
}

/** USDC 的 decimals（6）— 整個前端用 USD 顯示但儲存為 micro-USDC */
export const USDC_DECIMALS = 6
