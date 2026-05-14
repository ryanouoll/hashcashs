import { keccak256, stringToBytes } from 'viem'

/**
 * 把 Email 字串做 keccak256，得到 bytes32（0x... 64 hex）
 * - 合約端使用 `bytes32` 當 key
 * - 前端顯示時直接顯示這個 hex
 */
export function hashEmail(email: string): `0x${string}` {
  const normalized = email.trim().toLowerCase()
  return keccak256(stringToBytes(normalized))
}

