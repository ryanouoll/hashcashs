/**
 * Cloudflare Pages Function: POST /api/notify
 *
 * 收到 SendModal 發來的「我剛剛轉了一筆」通知，呼叫 Resend API
 * 寄一封 HTML 通知信給收款人，引導他到 hashcash 領錢。
 *
 * 必要 env：
 *   RESEND_API_KEY  — Resend API key（re_xxx）
 *   RESEND_FROM     — 寄件人，e.g. "hashcash <onboarding@resend.dev>" 或 "hello@cfoing.io"
 *
 * Body (JSON):
 *   {
 *     toEmail:   收款人 email
 *     amountEth: 數量字串（保留舊欄位名，內容當作 USD）
 *     txHash:    0x... 交易 hash
 *     fromEmail: (可選) 寄件人 email — 收信人看了會更安心
 *     locale:    (可選) "zh" 或 "en"，預設 en
 *   }
 */

type Env = {
  RESEND_API_KEY?: string
  RESEND_FROM?: string
}

const APP_URL = 'https://cfoing.io'

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
  // 同源為主；本機 dev (localhost) 也允許
  const isLocal =
    origin && /^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?)/.test(origin)
  const allowOrigin = isLocal ? origin : origin || '*'
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  }
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export const onRequestOptions: PagesFunction<Env> = async (ctx) => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(ctx.request.headers.get('origin')),
  })
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = ctx.request.headers.get('origin')
  const cors = corsHeaders(origin)

  const apiKey = ctx.env.RESEND_API_KEY
  const from = ctx.env.RESEND_FROM
  if (!apiKey || !from) {
    return json(
      500,
      { ok: false, error: 'missing RESEND_API_KEY / RESEND_FROM' },
      cors,
    )
  }

  let body: any
  try {
    body = await ctx.request.json()
  } catch {
    return json(400, { ok: false, error: 'invalid json' }, cors)
  }

  const toEmail = String(body?.toEmail || '').trim()
  const amount = String(body?.amountEth || body?.amount || '').trim()
  const txHash = String(body?.txHash || '').trim()
  const fromEmail = String(body?.fromEmail || '').trim()
  const locale: 'en' | 'zh' = body?.locale === 'zh' ? 'zh' : 'en'

  if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return json(400, { ok: false, error: 'invalid toEmail' }, cors)
  }
  if (!amount) return json(400, { ok: false, error: 'missing amount' }, cors)
  if (!txHash || !/^0x[A-Fa-f0-9]{64}$/.test(txHash)) {
    return json(400, { ok: false, error: 'invalid txHash' }, cors)
  }

  const claimLink = `${APP_URL}/?claim=1`
  const explorerLink = `https://sepolia.basescan.org/tx/${txHash}`

  const subject =
    locale === 'zh'
      ? `你收到 $${amount} USD（來自 hashcash）`
      : `You received $${amount} USD on hashcash`

  const html = buildEmailHtml({
    locale,
    amount,
    fromEmail,
    toEmail,
    claimLink,
    explorerLink,
    txHash,
  })

  const text =
    locale === 'zh'
      ? `你收到一筆 $${amount} USD 轉帳${
          fromEmail ? `（來自 ${fromEmail}）` : ''
        }\n\n` +
        `登入 ${claimLink} 用 Google 領取\n` +
        `（用 ${toEmail} 這個信箱登入，錢就在你的帳戶裡）\n\n` +
        `鏈上紀錄：${explorerLink}`
      : `You received $${amount} USD${
          fromEmail ? ` from ${fromEmail}` : ''
        } on hashcash.\n\n` +
        `Sign in at ${claimLink} with Google (using ${toEmail}) to access your funds.\n\n` +
        `On-chain proof: ${explorerLink}`

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
      text,
    }),
  })

  const respText = await resp.text()
  if (!resp.ok) {
    return json(
      502,
      { ok: false, error: 'resend_failed', details: respText.slice(0, 2000) },
      cors,
    )
  }

  return json(200, { ok: true }, cors)
}

/**
 * HTML email template — hashcash 品牌色 (#FF6B2B 橘色)
 * 重點：
 *  - mobile-first 寬度 600px max
 *  - 巨大 CTA 按鈕（不能是純連結，要按鈕感）
 *  - 訊息清楚：誰寄、寄了多少、怎麼領
 *  - 鏈上連結放下方（信任要素）
 */
function buildEmailHtml(p: {
  locale: 'en' | 'zh'
  amount: string
  fromEmail: string
  toEmail: string
  claimLink: string
  explorerLink: string
  txHash: string
}) {
  const t = p.locale === 'zh' ? L_ZH : L_EN
  const a = escapeHtml(p.amount)
  const fromLine = p.fromEmail
    ? `<div style="color:#6b7280;font-size:14px;margin-top:4px;">${t.from} <b style="color:#1f2937;">${escapeHtml(p.fromEmail)}</b></div>`
    : ''
  return `<!DOCTYPE html>
<html lang="${p.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${t.subject(a)}</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FAFAF7;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #E8E6E1;border-radius:20px;overflow:hidden;">
        <!-- Brand bar -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid #F0EEE9;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td>
                <div style="display:inline-block;width:28px;height:28px;border-radius:50%;background:linear-gradient(160deg,#FF6B2B,#FF8E5A 55%,#E75A1E);vertical-align:middle;"></div>
                <span style="font-weight:700;font-size:18px;color:#1f2937;margin-left:10px;vertical-align:middle;">hashcash</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:40px 32px 8px;">
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">${t.received}</div>
          <div style="margin-top:12px;font-size:42px;font-weight:700;color:#1f2937;letter-spacing:-1px;">
            <span style="color:#FF6B2B;">$</span>${a}
            <span style="font-size:18px;color:#6b7280;font-weight:600;margin-left:6px;">USD</span>
          </div>
          ${fromLine}
        </td></tr>

        <!-- Body copy -->
        <tr><td style="padding:24px 32px 8px;">
          <p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">
            ${t.bodyIntro(escapeHtml(p.toEmail))}
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td align="center" style="padding:24px 32px 32px;">
          <a href="${p.claimLink}" target="_blank" style="display:inline-block;background:#FF6B2B;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:16px 40px;border-radius:9999px;box-shadow:0 8px 20px -8px rgba(255,107,43,0.45);">
            ${t.cta}
          </a>
          <div style="margin-top:14px;font-size:12.5px;color:#9ca3af;">${t.ctaHint}</div>
        </td></tr>

        <!-- Trust strip: on-chain proof -->
        <tr><td style="padding:0 32px;">
          <div style="background:#FAFAF7;border:1px solid #F0EEE9;border-radius:12px;padding:14px 16px;">
            <div style="font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">${t.proof}</div>
            <div style="margin-top:6px;font-size:12.5px;color:#6b7280;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
              <a href="${p.explorerLink}" target="_blank" style="color:#FF6B2B;text-decoration:none;">${escapeHtml(p.txHash)} ↗</a>
            </div>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 32px 28px;">
          <div style="border-top:1px solid #F0EEE9;padding-top:18px;">
            <div style="font-size:12px;color:#9ca3af;line-height:1.6;">
              ${t.footer}
            </div>
          </div>
        </td></tr>
      </table>

      <div style="font-size:11px;color:#9ca3af;margin-top:16px;">
        ${t.disclaimer}
      </div>
    </td></tr>
  </table>
</body>
</html>`
}

const L_EN = {
  subject: (a: string) => `You received $${a} USD on hashcash`,
  received: 'You received',
  from: 'from',
  bodyIntro: (toEmail: string) =>
    `Someone sent you funds to <b style="color:#1f2937;">${toEmail}</b>. Sign in with Google to access your USD account on hashcash — no crypto wallet needed.`,
  cta: 'Open hashcash →',
  ctaHint: 'Sign in with the email above. Setup takes 10 seconds.',
  proof: 'On-chain proof',
  footer:
    'hashcash is a non-custodial USD account indexed by email. Funds are held in a smart contract on Base, not by us — you can withdraw to any wallet anytime.',
  disclaimer:
    'This is a Base Sepolia testnet transaction. Funds shown are testnet USDC, not real currency.',
}

const L_ZH = {
  subject: (a: string) => `你收到 $${a} USD（hashcash）`,
  received: '你收到了',
  from: '寄件人：',
  bodyIntro: (toEmail: string) =>
    `有人轉錢到 <b style="color:#1f2937;">${toEmail}</b>。用 Google 登入就能進你的 USD 帳戶 — 完全不需要 crypto 錢包。`,
  cta: '進入 hashcash →',
  ctaHint: '用上面這個信箱登入即可，整個流程不到 10 秒。',
  proof: '鏈上紀錄',
  footer:
    'hashcash 是用 email 識別身分的 USD 帳戶。資金存在 Base 上的智能合約裡（不是我們管），你可以隨時提到任何錢包。',
  disclaimer:
    '此筆交易在 Base Sepolia 測試網。畫面顯示的是測試 USDC，非真實貨幣。',
}
