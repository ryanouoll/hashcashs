export function getPrivyUserEmail(user: any): string {
  if (!user) return ''

  // 目前我們原本用的欄位
  if (user?.email?.address && typeof user.email.address === 'string') return user.email.address

  // 有些情況 email 可能直接是 string
  if (typeof user.email === 'string') return user.email

  // 常見：linkedAccounts 裡會包含 google 的資訊
  const linked = user.linkedAccounts || user.linked_accounts || user.accounts
  if (Array.isArray(linked)) {
    for (const acc of linked) {
      const email = acc?.email || acc?.emailAddress || acc?.address
      if (typeof email === 'string' && email.includes('@')) return email
    }
  }

  // 保底：google 欄位（不同 SDK 版本可能有）
  if (typeof user?.google?.email === 'string') return user.google.email

  return ''
}

