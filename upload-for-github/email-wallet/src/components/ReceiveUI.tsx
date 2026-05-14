import { useMemo, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { formatEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { hashEmail } from '../lib/email'
import { EMAIL_VAULT_ABI, getEmailVaultAddress } from '../lib/emailVault'
import { publicClient } from '../lib/viemClients'
import { getPrivyUserEmail } from '../lib/privyUser'

export function ReceiveUI() {
  const { authenticated, login, user } = usePrivy()
  const email = getPrivyUserEmail(user)
  const myHash = useMemo(() => (email ? hashEmail(email) : ''), [email])

  const [balanceWei, setBalanceWei] = useState<bigint | null>(null)
  const [status, setStatus] = useState<string>('')

  async function refresh() {
    setStatus('')
    setBalanceWei(null)

    if (!authenticated || !email || !myHash) {
      setStatus('此功能只能查詢「你 Google OAuth 登入的 Email」的餘額。請先登入。')
      return
    }

    try {
      setStatus('查詢中...')
      const bal = (await (publicClient as any).readContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'balances',
        args: [myHash as `0x${string}`],
      })) as bigint

      setBalanceWei(bal)
      setStatus('已更新')
    } catch (e: any) {
      console.error(e)
      setStatus(`查詢失敗：${e?.shortMessage || e?.message || 'unknown error'}`)
    }
  }

  return (
    <div className="ui-card">
      <div className="brex-section-label">接收</div>
      <div className="brex-section-title">我的 Email 金庫</div>
      <div className="brex-section-desc">查詢你的 Email Hash 對應的鏈上餘額。</div>

      <div className="mt-5 grid gap-3">

        {/* 餘額大字顯示 */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-5 text-center">
          <div className="text-xs font-medium uppercase tracking-widest text-white/40 mb-2">可提領餘額</div>
          <div className="text-4xl font-bold tracking-tight text-white">
            {balanceWei === null ? '—' : formatEther(balanceWei)}
          </div>
          {balanceWei !== null && (
            <div className="mt-1 text-sm text-white/40">ETH</div>
          )}
          {balanceWei !== null && (
            <div className="mt-2 font-mono text-xs text-white/30">{balanceWei.toString()} wei</div>
          )}
        </div>

        <div className="ui-card-subtle">
          <div className="ui-label">我的 Email</div>
          <div className="ui-value">{email || '-'}</div>
        </div>

        <div className="ui-card-subtle">
          <div className="ui-label">我的 Email Hash (keccak256)</div>
          <div className="ui-value break-all font-mono text-xs">{myHash || '-'}</div>
        </div>

        {!authenticated && (
          <div className="ui-status-warn">
            此功能只能查詢你 Google OAuth 登入信箱的餘額。
            <div className="mt-3">
              <button onClick={login} className="rounded-lg bg-[#FF6B2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF8447]">
                使用 Google 登入
              </button>
            </div>
          </div>
        )}

        <button onClick={refresh} className="ui-button-secondary">
          重新整理餘額
        </button>

        {status && <div className="ui-status">{status}</div>}
      </div>
    </div>
  )
}
