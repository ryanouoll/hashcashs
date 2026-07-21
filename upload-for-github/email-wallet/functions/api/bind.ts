/**
 * Cloudflare Pages Function: POST /api/bind
 *
 * 後端簽名服務(bindSigner)。唯一職責:
 *   驗證「這個 Privy 使用者真的擁有這個 email + 這個 embedded wallet」
 *   → 簽發一次性的 EIP-712 Bind 票證 { emailHash, owner }。
 *
 * 它「只能」授權綁定。Bind 簽名在密碼學上無法被當成提領簽名使用
 * (合約用不同的 EIP-712 typehash),所以就算這支服務被打穿,
 * 已綁定金庫的錢也動不了(見合約 SECURITY NOTES (A))。
 *
 * 需要的 Cloudflare secrets(Settings → Environment variables,加密):
 *   PRIVY_APP_ID              Privy app id(跟前端 VITE_PRIVY_APP_ID 同值)
 *   PRIVY_APP_SECRET          Privy dashboard → Settings → API keys
 *   PRIVY_VERIFICATION_KEY    Privy dashboard → Settings → Verification key(SPKI PEM)
 *   BIND_SIGNER_PRIVATE_KEY   bindSigner 錢包私鑰(專用!不要用部署錢包)
 *   VAULT_ADDRESS             (可選)覆蓋合約地址
 */

import { keccak256, encodePacked, toBytes } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

interface Env {
  PRIVY_APP_ID: string
  PRIVY_APP_SECRET: string
  PRIVY_VERIFICATION_KEY: string
  BIND_SIGNER_PRIVATE_KEY: string
  VAULT_ADDRESS?: string
}

// 部署後回填(deploy 之後這裡會被更新成新合約地址)
const DEFAULT_VAULT_ADDRESS = '0xE16258Ad4D5B629170e1ABE0D58CBB4ddBa67Cf8' // v2.1 (USDC fee), deployed 2026-07-21
const CHAIN_ID = 84532 // Base Sepolia

// email → salted commitment。前端 src/lib/emailVault.ts 的 emailToHash 必須完全一致。
const DOMAIN_SALT = keccak256(toBytes('hashcash:v1'))
function emailToHash(email: string): `0x${string}` {
  const normalized = email.trim().toLowerCase()
  return keccak256(encodePacked(['bytes32', 'string'], [DOMAIN_SALT, normalized]))
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// ── Privy access token 驗證(ES256 JWT,本地驗簽,不打外部 API)──────────────
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function verifyPrivyToken(token: string, verificationKeyPem: string, appId: string): Promise<string> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const [headerB64, payloadB64, sigB64] = parts

  const pemBody = verificationKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s+/g, '')
  const key = await crypto.subtle.importKey(
    'spki',
    b64urlToBytes(pemBody.replace(/\+/g, '-').replace(/\//g, '_')).buffer as ArrayBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64urlToBytes(sigB64).buffer as ArrayBuffer,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  )
  if (!ok) throw new Error('bad signature')

  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)))
  if (payload.iss !== 'privy.io') throw new Error('bad issuer')
  if (payload.aud !== appId) throw new Error('bad audience')
  if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) throw new Error('token expired')
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('no subject')
  return payload.sub // Privy DID, e.g. "did:privy:..."
}

// ── 從 Privy API 撈這個使用者的 email + embedded wallet ─────────────────────
async function fetchPrivyUser(did: string, env: Env): Promise<{ email: string; wallet: string }> {
  const r = await fetch(`https://auth.privy.io/api/v1/users/${encodeURIComponent(did)}`, {
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`),
      'privy-app-id': env.PRIVY_APP_ID,
    },
  })
  if (!r.ok) throw new Error(`privy api ${r.status}`)
  const user: any = await r.json()

  const accounts: any[] = user.linked_accounts || []
  const google = accounts.find((a) => a.type === 'google_oauth' && a.email)
  const emailAcct = accounts.find((a) => a.type === 'email' && a.address)
  const email: string | undefined = google?.email || emailAcct?.address
  const wallet = accounts.find(
    (a) => a.type === 'wallet' && a.wallet_client_type === 'privy' && a.chain_type === 'ethereum',
  )?.address

  if (!email) throw new Error('no verified email on this account')
  if (!wallet) throw new Error('no embedded wallet on this account')
  return { email, wallet }
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const env = ctx.env
  const missing = ['PRIVY_APP_ID', 'PRIVY_APP_SECRET', 'PRIVY_VERIFICATION_KEY', 'BIND_SIGNER_PRIVATE_KEY']
    .filter((k) => !(env as any)[k])
  if (missing.length) {
    return json(500, { ok: false, error: 'server_not_configured', missing })
  }

  const auth = ctx.request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json(401, { ok: false, error: 'missing bearer token' })

  // 1. 驗 token → 拿到 Privy DID
  let did: string
  try {
    did = await verifyPrivyToken(token, env.PRIVY_VERIFICATION_KEY, env.PRIVY_APP_ID)
  } catch (e: any) {
    return json(401, { ok: false, error: 'invalid_token', details: String(e?.message || e) })
  }

  // 2. 撈 email + embedded wallet(以 Privy 伺服器的紀錄為準,不信任 client 傳來的值)
  let email: string, wallet: string
  try {
    ;({ email, wallet } = await fetchPrivyUser(did, env))
  } catch (e: any) {
    return json(502, { ok: false, error: 'privy_lookup_failed', details: String(e?.message || e) })
  }

  // 3. 簽 EIP-712 Bind{emailHash, owner}
  const vaultAddress = (env.VAULT_ADDRESS || DEFAULT_VAULT_ADDRESS) as `0x${string}`
  const emailHash = emailToHash(email)
  const pk = env.BIND_SIGNER_PRIVATE_KEY.trim()
  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as `0x${string}`)

  const signature = await account.signTypedData({
    domain: {
      name: 'EmailVaultUSDC',
      version: '1',
      chainId: CHAIN_ID,
      verifyingContract: vaultAddress,
    },
    types: {
      Bind: [
        { name: 'emailHash', type: 'bytes32' },
        { name: 'owner', type: 'address' },
      ],
    },
    primaryType: 'Bind',
    message: { emailHash, owner: wallet as `0x${string}` },
  })

  return json(200, { ok: true, emailHash, owner: wallet, signature, vault: vaultAddress })
}
