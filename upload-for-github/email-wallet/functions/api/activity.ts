/**
 * Cloudflare Pages Function: GET /api/activity?hash=0x<emailHash>
 *
 * 走 Basescan API v2（server-side，用 BASESCAN_API_KEY）讀合約 event log，
 * 解析成這個 emailHash 的交易紀錄。比前端直接打公開 RPC 可靠很多：
 *   - 有 API key，不會被 rate limit
 *   - Basescan 不限 block range
 *   - 一個請求搞定（前端不用 chunk）
 *
 * env: BASESCAN_API_KEY（可選，沒有也能跑但 rate limit 較嚴）
 */

type Env = { BASESCAN_API_KEY?: string }

const VAULT = '0xE856d828bD4DB6123b5d6C6C7405432eC722dA17'
const DEPLOY_BLOCK = 41726470
const CHAIN_ID = 84532

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

// bytes32 topic 正規化：補滿 66 字元、轉小寫
function norm32(h: string): string {
  let s = (h || '').toLowerCase()
  if (!s.startsWith('0x')) s = '0x' + s
  return s
}

// 解 hex → bigint
function hexToBig(h: string): bigint {
  return BigInt(h && h !== '0x' ? h : '0x0')
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url)
  const hash = norm32(url.searchParams.get('hash') || '')
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    return json(400, { ok: false, error: 'invalid hash' })
  }

  const key = ctx.env.BASESCAN_API_KEY || ''
  // 診斷：如果 runtime 拿不到 key，明確回報（而不是讓 Etherscan 回模糊錯誤）
  if (!key) {
    return json(500, {
      ok: false,
      error: 'BASESCAN_API_KEY not available to function at runtime',
      hint: 'Set it in Cloudflare Pages → Settings → Environment variables (Production), then trigger a NEW deployment (push a commit, not just Retry).',
    })
  }
  const base = `https://api.etherscan.io/v2/api?chainid=${CHAIN_ID}&module=logs&action=getLogs&address=${VAULT}&fromBlock=${DEPLOY_BLOCK}&toBlock=latest`

  // 一次抓合約全部 log（demo 量小，1000 筆內），server 端 filter
  const apiUrl = `${base}${key ? `&apikey=${key}` : ''}`

  let logs: any[]
  try {
    const r = await fetch(apiUrl)
    const j: any = await r.json()
    if (j.status !== '1' && j.message !== 'No records found') {
      return json(502, { ok: false, error: 'basescan_error', details: j.result || j.message })
    }
    logs = Array.isArray(j.result) ? j.result : []
  } catch (e: any) {
    return json(502, { ok: false, error: 'fetch_failed', details: String(e?.message || e) })
  }

  type Item = {
    kind: 'deposit' | 'claim' | 'send' | 'receive'
    amount: string // micro-USDC 字串
    blockNumber: number
    txHash: string
    timeStamp: number // unix 秒（Basescan 直接給，不用估算）
    counterpartyHash?: string
  }

  const out: Item[] = []
  for (const log of logs) {
    const topic0 = (log.topics?.[0] || '').toLowerCase()
    const blockNumber = parseInt(log.blockNumber, 16)
    const timeStamp = parseInt(log.timeStamp, 16)
    const txHash = log.transactionHash

    if (topic0 === TOPIC.Deposited) {
      const emailHash = norm32(log.topics[1])
      if (emailHash === hash) {
        out.push({ kind: 'deposit', amount: hexToBig(log.data).toString(), blockNumber, txHash, timeStamp })
      }
    } else if (topic0 === TOPIC.Claimed) {
      const emailHash = norm32(log.topics[1])
      if (emailHash === hash) {
        out.push({ kind: 'claim', amount: hexToBig(log.data).toString(), blockNumber, txHash, timeStamp })
      }
    } else if (topic0 === TOPIC.Transferred) {
      const fromHash = norm32(log.topics[1])
      const toHash = norm32(log.topics[2])
      if (fromHash === hash) {
        out.push({ kind: 'send', amount: hexToBig(log.data).toString(), blockNumber, txHash, timeStamp, counterpartyHash: toHash })
      } else if (toHash === hash) {
        out.push({ kind: 'receive', amount: hexToBig(log.data).toString(), blockNumber, txHash, timeStamp, counterpartyHash: fromHash })
      }
    }
  }

  out.sort((a, b) => b.blockNumber - a.blockNumber)

  return json(200, { ok: true, activity: out.slice(0, 20) }, {
    // 短快取，避免使用者連點 refresh 一直打 Basescan
    'cache-control': 'public, max-age=5',
  })
}
