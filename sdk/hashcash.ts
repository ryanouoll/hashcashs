/**
 * hashcash agent SDK — pay any email in USDC from a funded wallet.
 *
 * Designed for AI agents / backends that already hold a wallet (private key)
 * with USDC + a little ETH on Base. No hashcash account or API key needed:
 * the agent deposits directly into the recipient's on-chain vault, and the
 * human later claims with Google — no wallet required on their side.
 *
 *   import { HashcashClient } from './hashcash'
 *   const hc = new HashcashClient({ privateKey: process.env.AGENT_KEY! })
 *   await hc.payEmail('labeler@gmail.com', 12.5)   // pays $12.50 USDC
 *
 * Only dependency: `viem`.  ->  npm i viem
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  stringToBytes,
  parseUnits,
  formatUnits,
  maxUint256,
  type Hex,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

// ─── deployment constants (Base Sepolia) ─────────────────────────────────────
const DEFAULT_VAULT: Address = '0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b'
const DEFAULT_USDC: Address = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
const USDC_DECIMALS = 6

// Salt MUST match the frontend (src/lib/email.ts) and backend (functions/api/bind.ts).
const DOMAIN_SALT = keccak256(stringToBytes('hashcash:v1'))

/**
 * Normalize an email so equivalent addresses map to the same vault.
 * Gmail/Googlemail: strip dots + "+suffix" from the local part (they route to the
 * same inbox). Must stay identical to src/lib/email.ts and functions/api/bind.ts.
 */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 0) return e
  let local = e.slice(0, at)
  let domain = e.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.split('+')[0].replace(/\./g, '')
  return `${local}@${domain}`
}

/** email → salted commitment (bytes32). Same formula everywhere in the system. */
export function emailToHash(email: string): Hex {
  return keccak256(encodePacked(['bytes32', 'string'], [DOMAIN_SALT, normalizeEmail(email)]))
}

const VAULT_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable',
    inputs: [{ name: 'emailHash', type: 'bytes32' }, { name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'balances', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'ownerOf', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

export interface HashcashClientOptions {
  /** Agent wallet private key (0x-prefixed). Must hold USDC + a little ETH on Base. */
  privateKey: Hex
  /** Override RPC URL (default: a public Base Sepolia endpoint). */
  rpcUrl?: string
  /** Override the EmailVaultUSDC address. */
  vaultAddress?: Address
  /** Override the USDC token address. */
  usdcAddress?: Address
}

export class HashcashClient {
  readonly account
  readonly vault: Address
  readonly usdc: Address
  private readonly pub
  private readonly wallet

  constructor(opts: HashcashClientOptions) {
    this.account = privateKeyToAccount(opts.privateKey)
    this.vault = opts.vaultAddress ?? DEFAULT_VAULT
    this.usdc = opts.usdcAddress ?? DEFAULT_USDC
    const transport = http(opts.rpcUrl ?? 'https://base-sepolia-rpc.publicnode.com')
    this.pub = createPublicClient({ chain: baseSepolia, transport })
    this.wallet = createWalletClient({ account: this.account, chain: baseSepolia, transport })
  }

  /** bytes32 commitment for an email (useful for logging / lookups). */
  hashFor(email: string): Hex {
    return emailToHash(email)
  }

  /** Vault balance for an email, as a USD number (e.g. 12.5). */
  async balanceOf(email: string): Promise<number> {
    const bal = (await this.pub.readContract({
      address: this.vault, abi: VAULT_ABI, functionName: 'balances', args: [emailToHash(email)],
    })) as bigint
    return Number(formatUnits(bal, USDC_DECIMALS))
  }

  /** Whether this email has already been claimed (bound to a wallet). */
  async isClaimed(email: string): Promise<boolean> {
    const owner = (await this.pub.readContract({
      address: this.vault, abi: VAULT_ABI, functionName: 'ownerOf', args: [emailToHash(email)],
    })) as Address
    return owner !== '0x0000000000000000000000000000000000000000'
  }

  /** The agent wallet's own USDC balance, as a USD number. */
  async myUsdcBalance(): Promise<number> {
    const bal = (await this.pub.readContract({
      address: this.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [this.account.address],
    })) as bigint
    return Number(formatUnits(bal, USDC_DECIMALS))
  }

  /**
   * Pay `usdAmount` USDC into the vault of `email`.
   * Approves the vault once (infinite) if needed, then deposits.
   * @returns the deposit transaction hash and the recipient's emailHash.
   */
  async payEmail(email: string, usdAmount: number): Promise<{ txHash: Hex; emailHash: Hex }> {
    if (!(usdAmount > 0)) throw new Error('amount must be > 0')
    const amount = parseUnits(usdAmount.toString(), USDC_DECIMALS)
    const emailHash = emailToHash(email)

    const have = (await this.pub.readContract({
      address: this.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [this.account.address],
    })) as bigint
    if (have < amount) {
      throw new Error(`insufficient USDC: have ${formatUnits(have, USDC_DECIMALS)}, need ${usdAmount}`)
    }

    const allowance = (await this.pub.readContract({
      address: this.usdc, abi: ERC20_ABI, functionName: 'allowance', args: [this.account.address, this.vault],
    })) as bigint
    if (allowance < amount) {
      const approveHash = await this.wallet.writeContract({
        address: this.usdc, abi: ERC20_ABI, functionName: 'approve', args: [this.vault, maxUint256],
      })
      await this.pub.waitForTransactionReceipt({ hash: approveHash })
    }

    const txHash = await this.wallet.writeContract({
      address: this.vault, abi: VAULT_ABI, functionName: 'deposit', args: [emailHash, amount],
    })
    await this.pub.waitForTransactionReceipt({ hash: txHash })
    return { txHash, emailHash }
  }
}
