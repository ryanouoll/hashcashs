import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { baseSepolia } from 'viem/chains'

export function getRpcUrl(): string {
  return import.meta.env.VITE_BASE_RPC_URL || 'https://sepolia.base.org'
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(getRpcUrl()),
})

/**
 * 透過 Privy 取得的 EIP-1193 provider 建立 wallet client，
 * 之後可以用 `writeContract` 發送交易（deposit/claim）。
 */
export function makeWalletClient(eip1193Provider: { request: (args: any) => Promise<any> }) {
  return createWalletClient({
    chain: baseSepolia,
    transport: custom(eip1193Provider),
  })
}

