/**
 * Cloudflare Pages Function: GET /api/activity?hash=0x<emailHash>
 *
 * 伺服器端分段查 Base Sepolia RPC 的 event log，解析成這個 emailHash 的交易紀錄。
 * 完全不依賴任何 API key（避開 Cloudflare build-vs-runtime env 的坑）：
 *   - 伺服器端發 eth_getLogs，沒有瀏覽器 CORS / 限流問題
 *   - 公開 RPC 限制每次 50000 blocks，所以分 chunk 查
 *   - 一個 endpoint，前端只要一個 fetch
 */

type Env = Record<string, never>

// EmailVaultUSDC v2(非託管、簽名授權版)。deploy 後回填地址與起始 block。
const VAULT = '0xb1e110d0e06C4F50Dc2fBcB3602064202d20615b' // v2.2 (internal transfer + % fee), 2026-07-21
const DEPLOY_BLOCK = 44439986
const CHUNK = 49000

// 多個 RPC fallback（依序試，第一個成功就用）
const RPCS = [
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://sepolia.base.org',
]

// event topic0（keccak256 of signature）— v2 合約
const TOPIC = {
  // Deposited(bytes32 indexed emailHash, address indexed sender, uint256 amount)
  Deposited: '0x87d4c0b5e30d6808bc8a94ba1c4d839b29d664151551a31753387ee9ef48429b',
  // Withdrawn(bytes32 indexed emailHash, address indexed owner, address indexed to, uint256 amount)
  Withdrawn: '0xa6786aab7dbbc48b4b0387488b407bd81448030ab207b50bea7dbb5fbc1cd9eb',
  // Refunded(bytes32 indexed emailHash, address indexed depositor, uint256 amount)
  Refunded: '0xf552ca82e113ac3c539c3d617f29fcd19c172a0c75dad017555c9e109f7fe183',
  // FeeCharged(bytes32 indexed emailHash, uint256 fee)
  FeeCharged: '0x2194b05805488d1ae5dec3e2e79f37a4606b7f3aa1e808a97259abc18dc5148a',
  // Transferred(bytes32 indexed fromHash, bytes32 indexed toHash, uint256 amount)
  Transferred: '0xd707ee9058b2233aba4040480361accb9c2a20eede082f63860af8586fb54a14',
}

function json(status: number, data: unknown, extra?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  })
}

function norm32(h: string): string {
  let s = (h || '').toLowerCase()
  if (!s.startsWith('0x')) s = '0x' + s
  return s
}

function hexToBig(h: string): bigint {
  return BigInt(h && h !== '0x' ? h : '0x0')
}

// 對某個 RPC 發 JSON-RPC
async function rpc(url: string, method: string, params: any[]): Promise<any> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const j: any = await r.json()
  if (j.error) throw new Error(j.error.message || 'rpc error')
  return j.result
}

// 在 fallback RPC 清單上試，第一個成功就回
async function rpcWithFallback(method: string, params: any[]): Promise<any> {
  let lastErr: any
  for (const url of RPCS) {
    try {
      return await rpc(url, method, params)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const hash = norm32(url.searchParams.get('hash') || '')
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    return json(400, { ok: false, error: 'invalid hash' })
  }

  // 1. 取得最新 block
  let latest: number
  try {
    latest = Number(hexToBig(await rpcWithFallback('eth_blockNumber', [])))
  } catch (e: any) {
    return json(502, { ok: false, error: 'block_number_failed', details: String(e?.message || e) })
  }

  // 2. 分段抓所有合約 log
  const rawLogs: any[] = []
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK + 1) {
    const to = Math.min(from + CHUNK, latest)
    try {
      const chunk = await rpcWithFallback('eth_getLogs', [
        { address: VAULT, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) },
      ])
      if (Array.isArray(chunk)) rawLogs.push(...chunk)
    } catch {
      // 單一 chunk 失敗就略過，不讓整個 endpoint 掛掉
    }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const tsOf = (bnHex: string) => nowSec - (latest - Number(hexToBig(bnHex))) * 2 // Base ~2s/block

  type Item = {
    kind: 'deposit' | 'claim' | 'refund' | 'fee' | 'send' | 'receive'
    amount: string
    txHash: string
    timeStamp: number
    counterpartyHash?: string
  }

  const out: Item[] = []
  for (const log of rawLogs) {
    const topic0 = (log.topics?.[0] || '').toLowerCase()
    const t1 = norm32(log.topics?.[1] || '')
    const t2 = norm32(log.topics?.[2] || '')
    const txHash = log.transactionHash
    const timeStamp = tsOf(log.blockNumber)
    const amount = hexToBig(log.data).toString()

    if (topic0 === TOPIC.Transferred) {
      // topic1 = fromHash, topic2 = toHash
      if (t1 === hash) out.push({ kind: 'send', amount, txHash, timeStamp, counterpartyHash: t2 })
      else if (t2 === hash) out.push({ kind: 'receive', amount, txHash, timeStamp, counterpartyHash: t1 })
      continue
    }

    // 其餘 event 的 topic1 都是這個 emailHash
    if (t1 !== hash) continue
    if (topic0 === TOPIC.Deposited) {
      out.push({ kind: 'deposit', amount, txHash, timeStamp })
    } else if (topic0 === TOPIC.Withdrawn) {
      out.push({ kind: 'claim', amount, txHash, timeStamp })
    } else if (topic0 === TOPIC.Refunded) {
      out.push({ kind: 'refund', amount, txHash, timeStamp })
    } else if (topic0 === TOPIC.FeeCharged) {
      out.push({ kind: 'fee', amount, txHash, timeStamp })
    }
  }

  // 依 timeStamp 倒序（新到舊）
  out.sort((a, b) => b.timeStamp - a.timeStamp)

  return json(200, { ok: true, activity: out.slice(0, 20) }, {
    'cache-control': 'public, max-age=5',
  })
}
