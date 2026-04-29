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
      <div className="text-sm text-white/60">接收</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">查詢我的 Email 金庫餘額</div>

      <div className="mt-4 grid gap-3">
        <div className="ui-card-subtle">
          <div className="ui-label">我的 Email</div>
          <div className="mt-1 break-all text-sm text-white">{email || '-'}</div>
        </div>

        <div className="ui-card-subtle">
          <div className="ui-label">我的 Email Hash (keccak256)</div>
          <div className="mt-1 break-all font-mono text-sm text-white">{myHash || '-'}</div>
        </div>

        {!authenticated && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            此功能只能查詢你 Google OAuth 登入信箱的餘額。
            <div className="mt-2">
              <button onClick={login} className="ui-button-primary">
                先使用 Google 登入
              </button>
            </div>
          </div>
        )}

        <div className="ui-card-subtle">
          <div className="ui-label">餘額</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-white">
            {balanceWei === null ? '-' : `${formatEther(balanceWei)} ETH`}
          </div>
          <div className="mt-1 font-mono text-xs text-white/50">{balanceWei === null ? '' : `${balanceWei} wei`}</div>
        </div>

        <button
          onClick={refresh}
          className="ui-button-secondary"
        >
          重新整理餘額
        </button>

        {status && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{status}</div>
        )}
      </div>
    </div>
  )
}

