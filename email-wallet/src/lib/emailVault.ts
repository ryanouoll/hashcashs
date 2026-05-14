import type { Abi } from 'viem'

// 只放我們這次會用到的最小 ABI（期末專案求先跑通）
export const EMAIL_VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [{ name: 'emailHash', type: 'bytes32' }],
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
] as const satisfies Abi

export function getEmailVaultAddress(): `0x${string}` {
  const addr = import.meta.env.VITE_EMAIL_VAULT_ADDRESS
  if (!addr) throw new Error('缺少 VITE_EMAIL_VAULT_ADDRESS（先部署合約到 Base 測試網後填入）')
  return addr
}

