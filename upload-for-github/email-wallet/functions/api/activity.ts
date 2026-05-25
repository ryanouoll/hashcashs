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

const VAULT = '0xE856d828bD4DB6123b5d6C6C7405432eC722dA17'
const DEPLOY_BLOCK = 41726470
const CHUNK = 49000

// 多個 RPC fallback（依序試，第一個成功就用）
const RPCS = [
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://sepolia.base.org',
]

// event topic0（keccak256 of signature）
const TOPIC = {
  Deposited: '0x87d4c0b5e30d6808bc8a94ba1c4d839b29d664151551a31753387ee9ef48429b',
  Claimed: '0x0508a8b4117d9a7b3d8f5895f6413e61b4f9a2df35afbfb41e78d0ecfff1843f',
  Transferred: '0xc224fab2b75541733ebf61d71cd74f10394fd2f2795424b70b7d05f7bff7f486',
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
    kind: 'deposit' | 'claim' | 'send' | 'receive'
    amount: string
    txHash: string
    timeStamp: number
    counterpartyHash?: string
  }

  const out: Item[] = []
  for (const log of rawLogs) {
    const topic0 = (log.topics?.[0] || '').toLowerCase()
    const txHash = log.transactionHash
    const timeStamp = tsOf(log.blockNumber)
    const amount = hexToBig(log.data).toString()

    if (topic0 === TOPIC.Deposited && norm32(log.topics[1]) === hash) {
      out.push({ kind: 'deposit', amount, txHash, timeStamp })
    } else if (topic0 === TOPIC.Claimed && norm32(log.topics[1]) === hash) {
      out.push({ kind: 'claim', amount, txHash, timeStamp })
    } else if (topic0 === TOPIC.Transferred) {
      const fromHash = norm32(log.topics[1])
      const toHash = norm32(log.topics[2])
      if (fromHash === hash) {
        out.push({ kind: 'send', amount, txHash, timeStamp, counterpartyHash: toHash })
      } else if (toHash === hash) {
        out.push({ kind: 'receive', amount, txHash, timeStamp, counterpartyHash: fromHash })
      }
    }
  }

  // 依 timeStamp 倒序（新到舊）
  out.sort((a, b) => b.timeStamp - a.timeStamp)

  return json(200, { ok: true, activity: out.slice(0, 20) }, {
    'cache-control': 'public, max-age=5',
  })
}
