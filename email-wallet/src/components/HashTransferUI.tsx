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

  // 衍生狀態：是否已偵測到 Privy 內建錢包（gasless 必要條件）
  const embeddedReady = useMemo(
    () =>
      walletsReady &&
      Boolean(
        wallets?.find((w: any) => w?.walletClientType === 'privy' || w?.connectorType === 'embedded')
      ),
    [walletsReady, wallets]
  )

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

    // 嚴格選 Privy embedded wallet。
    // ⚠️ 禁止 fallback 到 wallets[0]：那會把 MetaMask 地址傳給 useSendTransaction，
    //    Privy 的 sponsor relay 只認自己的內建錢包池 → 必拋
    //    "No embedded or connected wallet found for address"。
    const embedded = wallets.find(
      (w: any) => w?.walletClientType === 'privy' || w?.connectorType === 'embedded'
    )

    // 印出目前所有錢包，方便診斷（生產可移除）
    // eslint-disable-next-line no-console
    console.log(
      '[HashTransferUI] wallets:',
      wallets.map((w: any) => ({
        address: w?.address,
        walletClientType: w?.walletClientType,
        connectorType: w?.connectorType,
      })),
      'pickedEmbedded:',
      embedded?.address || null
    )

    if (!embedded) {
      setStatus(
        '找不到內建錢包。請完全登出後重新用 Google 登入一次（Privy 會自動建立 gasless 內建錢包）。'
      )
      return
    }

    try {
      const data = encodeFunctionData({
        abi: EMAIL_VAULT_ABI,
        functionName: 'transfer',
        args: [fromHash as `0x${string}`, toHash as `0x${string}`, BigInt(amt)],
      })

      setStatus('送出 EmailHash → EmailHash（Gasless）交易中...')
      const result = await sendTransaction(
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
      const hash = (result as any)?.hash || (result as any)?.transactionHash || String(result)

      setTxHash(hash)
      setStatus('交易已送出，等待鏈上確認。')
    } catch (e: any) {
      console.error('[HashTransferUI] sendTransaction error:', e)
      const raw = e?.shortMessage || e?.message || 'unknown error'

      // 把已知的 Privy 錯誤映射成中文操作指引
      if (/No embedded or connected wallet found/i.test(raw)) {
        setStatus(
          '送出失敗：Privy 找不到對應的內建錢包。請完全登出後重新用 Google 登入；若仍失敗，去 Privy Dashboard 確認 Embedded Wallets 已啟用、Base Sepolia (84532) 在允許清單。'
        )
        return
      }
      if (/sponsor/i.test(raw) && /not.*allow|disabled|policy/i.test(raw)) {
        setStatus(
          '送出失敗：Privy Gas Sponsorship 未啟用或政策限制。請去 Privy Dashboard → Gas sponsorship 啟用，並把 Base Sepolia 加進 Networks。'
        )
        return
      }
      if (/insufficient/i.test(raw) && /balance/i.test(raw)) {
        setStatus(
          '送出失敗：合約裡這個 emailHash 的 vault 餘額不足。請先用 SendUI 從錢包 deposit 進 vault，或減少 amount。'
        )
        return
      }
      setStatus(`交易失敗：${raw}`)
    }
  }

  return (
    <div className="ui-card">
      <div className="text-sm text-white/60">EmailHash 轉帳</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">從一個 EmailHash 轉到另一個 EmailHash</div>
      <div className="mt-1 text-sm text-white/60">
        ⚠️ 非安全版：合約沒有驗證 fromHash 擁有權，任何人知道 fromHash 都能轉走。
      </div>
      {authenticated && walletsReady && !embeddedReady && (
        <div className="mt-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          尚未偵測到 Privy 內建錢包。請完全登出後重新用 Google 登入一次；若已在 Privy Dashboard 啟用 Embedded Wallets，就會自動建立。
        </div>
      )}

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

