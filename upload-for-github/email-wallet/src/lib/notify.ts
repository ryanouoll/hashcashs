export async function sendDepositEmailNotification(args: { toEmail: string; amountEth: string; txHash: string }) {
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

