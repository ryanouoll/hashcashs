import { createPublicClient, createWalletClient, custom, fallback, http } from 'viem'
import { baseSepolia } from 'viem/chains'

/**
 * 多個 Base Sepolia RPC fallback。
 * sepolia.base.org 是官方但 rate-limit 嚴格（容易 429 / "rate limited"），
 * 所以放在最後當 fallback。前面用社群維護的更寬鬆節點。
 */
const BASE_SEPOLIA_RPCS = [
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://endpoints.omniatech.io/v1/base/sepolia/public',
  'https://sepolia.base.org',
]

function buildTransport() {
  const envUrl = (import.meta.env.VITE_BASE_RPC_URL || '').trim()
  // 如果使用者設了自己的 RPC（例如 Alchemy / QuickNode），優先用，其他當備援
  const urls = envUrl ? [envUrl, ...BASE_SEPOLIA_RPCS] : BASE_SEPOLIA_RPCS
  return fallback(urls.map((u) => http(u, { batch: true, timeout: 10_000 })), { rank: false })
}

export function getRpcUrl(): string {
  return (import.meta.env.VITE_BASE_RPC_URL || '').trim() || BASE_SEPOLIA_RPCS[0]
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: buildTransport(),
})

/**
 * 透過 Privy / MetaMask 取得的 EIP-1193 provider 建立 wallet client，
 * 之後可以用 `writeContract` 發送交易（deposit / claim）。
 *
 * 注意：writeContract 的 eth_estimateGas 走 wallet 自己的 RPC（不是這裡的 publicClient），
 * 所以如果使用者 MetaMask 設的 RPC 被 rate-limit，這邊改不掉。要請 user 在 MetaMask
 * 把 Base Sepolia 的 RPC 換成 https://base-sepolia-rpc.publicnode.com。
 */
export function makeWalletClient(eip1193Provider: { request: (args: any) => Promise<any> }) {
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(eip1193Provider),
  })
}
