type Env = {
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

function json(status: number, data: unknown, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  })
}

function corsHeaders(origin: string | null): HeadersInit {
  // 同源為主；本機 dev 方便測試
  const allowOrigin = origin && /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)/.test(origin) ? origin : origin || '*'
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) => {
  return new Response(null, { status: 204, headers: corsHeaders(ctx.request.headers.get('origin')) })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('origin')
  const cors = corsHeaders(origin)

  const apiKey = ctx.env.RESEND_API_KEY
  const from = ctx.env.RESEND_FROM
  if (!apiKey || !from) {
    return json(500, { ok: false, error: 'missing RESEND_API_KEY / RESEND_FROM' }, cors)
  }

  let body: any
  try {
    body = await ctx.request.json()
  } catch {
    return json(400, { ok: false, error: 'invalid json' }, cors)
  }

  const toEmail = String(body?.toEmail || '').trim()
  const amountEth = String(body?.amountEth || '').trim()
  const txHash = String(body?.txHash || '').trim()

  if (!toEmail || !toEmail.includes('@')) return json(400, { ok: false, error: 'invalid toEmail' }, cors)
  if (!amountEth) return json(400, { ok: false, error: 'missing amountEth' }, cors)
  if (!txHash || !/^0x([A-Fa-f0-9]{64})$/.test(txHash)) return json(400, { ok: false, error: 'invalid txHash' }, cors)

  const subject = `你收到一筆轉帳：${amountEth} ETH`
  const html = `
  <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial;">
    <h2 style="margin:0 0 12px;">你收到一筆轉帳</h2>
    <p style="margin:0 0 10px;">金額：<b>${escapeHtml(amountEth)} ETH</b></p>
    <p style="margin:0 0 10px;">交易 Hash：</p>
    <p style="margin:0 0 14px;font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-all;">
      ${escapeHtml(txHash)}
    </p>
    <p style="margin:0;color:#667085;font-size:12px;">此信由 Email Wallet 自動通知寄出。</p>
  </div>`

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [toEmail],
      subject,
      html,
    }),
  })

  const text = await resp.text()
  if (!resp.ok) {
    return json(502, { ok: false, error: 'resend_failed', details: text.slice(0, 2000) }, cors)
  }

  return json(200, { ok: true }, cors)
}

function escapeHtml(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

