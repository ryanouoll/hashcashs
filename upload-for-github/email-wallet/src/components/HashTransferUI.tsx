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

    if (!authenticated) { setStatus('此功能需要先使用 Gmail 登入（OAuth）。'); return }
    if (!walletsReady) { setStatus('錢包初始化中，請稍等 1–2 秒後再試。'); return }
    if (!wallets?.[0]) { setStatus('找不到可用錢包（請重新登入一次）。'); return }
    if (!authedEmail || !toEmail.trim()) { setStatus('請填寫 To Email。'); return }

    const amt = amountWei.trim()
    if (!amt || isNaN(Number(amt)) || Number(amt) <= 0) {
      setStatus('請填寫要轉的 amount（wei），例如 1000000000000000 代表 0.001 ETH。')
      return
    }

    try {
      const embedded = wallets.find((w: any) => w?.walletClientType === 'privy') || wallets[0]

      const data = encodeFunctionData({
        abi: EMAIL_VAULT_ABI,
        functionName: 'transfer',
        args: [fromHash as `0x${string}`, toHash as `0x${string}`, BigInt(amt)],
      })

      setStatus('送出 EmailHash → EmailHash（Gasless）交易中...')
      const { hash } = await sendTransaction(
        { chainId: 84532, to: getEmailVaultAddress(), data },
        { sponsor: true, address: embedded.address, uiOptions: { showWalletUIs: false } }
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
      <div className="brex-section-label">轉帳</div>
      <div className="brex-section-title">EmailHash 轉帳</div>
      <div className="brex-section-desc">
        從一個 EmailHash 轉到另一個 EmailHash（Gasless）。
      </div>

      {/* 安全提示 */}
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] p-3">
        <span className="mt-0.5 text-yellow-400 text-sm">⚠</span>
        <span className="text-xs text-yellow-200/70 leading-relaxed">
          非安全版：合約沒有驗證 fromHash 擁有權，任何人知道 fromHash 都能轉走。
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {!authenticated ? (
          <div className="ui-status-warn">
            此功能需要 Gmail (OAuth) 登入才可用。
            <div className="mt-3">
              <button
                onClick={login}
                className="rounded-lg bg-[#FF6B2B] px-4 py-2 text-sm font-semibold text-white hover:bg-[#FF8447]"
              >
                使用 Google 登入
              </button>
            </div>
          </div>
        ) : (
          <div className="ui-card-subtle">
            <div className="ui-label">From Email（使用登入 Email）</div>
            <div className="ui-value">{authedEmail || '-'}</div>
          </div>
        )}

        <div className="ui-card-subtle">
          <div className="ui-label">From Hash</div>
          <div className="ui-value break-all font-mono text-xs">{fromHash || '-'}</div>
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
          <div className="ui-value break-all font-mono text-xs">{toHash || '-'}</div>
        </div>

        <Field label="Amount（wei）">
          <input
            value={amountWei}
            onChange={(e) => setAmountWei(e.target.value)}
            placeholder="1000000000000000  (= 0.001 ETH)"
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

        {status && <div className="ui-status">{status}</div>}

        {txHash && (
          <div className="ui-card-subtle">
            <div className="ui-label">交易 Hash</div>
            <div className="ui-value break-all font-mono text-xs">{txHash}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <div className="ui-label">{label}</div>
      {children}
    </label>
  )
}
