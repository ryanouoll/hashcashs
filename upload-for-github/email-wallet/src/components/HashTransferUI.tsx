import { useMemo, useState } from 'react'
import { usePrivy, useSendTransaction, useWallets } from '@privy-io/react-auth'
import { encodeFunctionData } from 'viem'
import { hashEmail } from '../lib/email'
import { EMAIL_VAULT_ABI, getEmailVaultAddress } from '../lib/emailVault'
import { getPrivyUserEmail } from '../lib/privyUser'

export function HashTransferUI() {
  const { authenticated, login, user } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { sendTransaction } = useSendTransaction()

  const authedEmail = getPrivyUserEmail(user)
  const [toEmail, setToEmail] = useState('')
  const [amountWei, setAmountWei] = useState('')
  const [status, setStatus] = useState('')
  const [txHash, setTxHash] = useState('')

  const fromHash = useMemo(() => (authedEmail ? hashEmail(authedEmail) : ''), [authedEmail])
  const toHash = useMemo(() => (toEmail ? hashEmail(toEmail) : ''), [toEmail])

  async function onTransfer() {
    setStatus('')
    setTxHash('')

    // 需求：必須 OAuth（Gmail/Google）登入才能用
    if (!authenticated) {
      setStatus('此功能需要先使用 Gmail 登入（OAuth）。')
      return
    }
    if (!walletsReady) {
      setStatus('錢包初始化中，請稍等 1–2 秒後再試。')
      return
    }
    if (!wallets?.[0]) {
      setStatus('找不到可用錢包（請重新登入一次）。')
      return
    }
    if (!authedEmail || !toEmail.trim()) {
      setStatus('請填寫 To Email。')
      return
    }
    const amt = amountWei.trim()
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) {
      setStatus('請填寫要轉的 amount（wei），例如 1000000000000000 代表 0.001 ETH。')
      return
    }

    try {
      // 優先使用 embedded wallet（不靠外部錢包、不跳錢包 UI）
      const embedded = wallets.find((w: any) => w?.walletClientType === 'privy') || wallets[0]

      const data = encodeFunctionData({
        abi: EMAIL_VAULT_ABI,
        functionName: 'transfer',
        args: [fromHash as `0x${string}`, toHash as `0x${string}`, BigInt(amt)],
      })

      setStatus('送出 EmailHash → EmailHash（Gasless）交易中...')
      const { hash } = await sendTransaction(
        {
          chainId: 84532,
          to: getEmailVaultAddress(),
          data,
          // transfer 不帶 value，純 mapping 轉帳
        },
        {
          sponsor: true,
          address: embedded.address,
          uiOptions: { showWalletUIs: false },
        }
      )

      setTxHash(hash)
      setStatus('交易已送出，等待鏈上確認。')
    } catch (e: any) {
      console.error(e)
      setStatus(`交易失敗：${e?.shortMessage || e?.message || 'unknown error'}`)
    }
  }

  return (
    <div className="ui-card">
      <div className="text-sm text-white/60">EmailHash 轉帳</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">從一個 EmailHash 轉到另一個 EmailHash</div>
      <div className="mt-1 text-sm text-white/60">
        ⚠️ 非安全版：合約沒有驗證 fromHash 擁有權，任何人知道 fromHash 都能轉走。
      </div>

      <div className="mt-4 grid gap-3">
        {!authenticated ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            此功能需要 Gmail(OAuth) 登入才可用。
            <div className="mt-2">
              <button
                onClick={login}
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-400 active:bg-blue-600"
              >
                先使用 Google 登入
              </button>
            </div>
          </div>
        ) : (
          <div className="ui-card-subtle">
            <div className="ui-label">From Email（使用登入 Email）</div>
            <div className="mt-1 break-all text-sm text-white">{authedEmail || '-'}</div>
          </div>
        )}

        <div className="ui-card-subtle">
          <div className="ui-label">From Hash</div>
          <div className="mt-1 break-all font-mono text-sm text-white">{fromHash || '-'}</div>
        </div>

        <Field label="To Email">
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="to@gmail.com"
            className="ui-input"
          />
        </Field>

        <div className="ui-card-subtle">
          <div className="ui-label">To Hash</div>
          <div className="mt-1 break-all font-mono text-sm text-white">{toHash || '-'}</div>
        </div>

        <Field label="Amount（wei）">
          <input
            value={amountWei}
            onChange={(e) => setAmountWei(e.target.value)}
            placeholder="1000000000000000  (0.001 ETH)"
            inputMode="numeric"
            className="ui-input"
          />
        </Field>

        <button
          onClick={onTransfer}
          disabled={!walletsReady || !authenticated}
          className="ui-button-secondary"
        >
          EmailHash 轉帳（Gasless transfer）
        </button>

        {status && <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{status}</div>}
        {txHash && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs text-white/60">交易 Hash</div>
            <div className="mt-1 break-all font-mono text-sm text-white">{txHash}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2">
      <div className="text-xs text-white/60">{props.label}</div>
      {props.children}
    </label>
  )
}

