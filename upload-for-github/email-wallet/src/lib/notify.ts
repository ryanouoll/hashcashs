export async function sendDepositEmailNotification(args: {
  toEmail: string
  amountEth: string  // 保留欄位名以維持向後相容；內容當 USD 處理
  txHash: string
  fromEmail?: string
  locale?: 'en' | 'zh'
}) {
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    if (!res.ok) return false
    const data = (await res.json()) as any
    return Boolean(data?.ok)
  } catch {
    return false
  }
}

