import { useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { hashEmail } from '../lib/email'
import { EMAIL_VAULT_ABI, getEmailVaultAddress } from '../lib/emailVault'
import { makeWalletClient } from '../lib/viemClients'
import { sendDepositEmailNotification } from '../lib/notify'

export function SendUI() {
  const { authenticated, connectWallet } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const showDebug = new URLSearchParams(window.location.search).has('debug')

  const [toEmail, setToEmail] = useState('')
  const [ethAmount, setEthAmount] = useState('')
  const [status, setStatus] = useState<string>('')
  const [txHash, setTxHash] = useState<string>('')

  const toHash = useMemo(() => (toEmail ? hashEmail(toEmail) : ''), [toEmail])

  const externalWallet = walletsReady
    ? wallets?.find((w: any) => {
        if (w?.connectorType) return true
        if (w?.walletClientType && w.walletClientType !== 'privy') return true
        if (w?.type === 'wallet' && w?.walletClientType !== 'privy') return true
        return false
      })
    : undefined

  async function onSend() {
    setStatus('')
    setTxHash('')

    if (!walletsReady) { setStatus('錢包初始化中，請稍等 1–2 秒後再試。'); return }
    if (!toEmail.trim() || !ethAmount.trim()) { setStatus('請填寫對方 Email 與 ETH 數量。'); return }
    if (!wallets?.[0]) { setStatus('請先「連結錢包（MetaMask）」。'); return }

    let value: bigint
    try { value = parseEther(ethAmount as `${number}`) }
    catch { setStatus('ETH 數量格式不正確。'); return }

    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)

      let account: `0x${string}` | undefined
      try {
        const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
        if (accounts?.[0]) account = accounts[0] as `0x${string}`
        if (!account) {
          const requested = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
          if (requested?.[0]) account = requested[0] as `0x${string}`
        }
      } catch { /* ignore */ }

      try {
        const chainId = await walletClient.getChainId()
        if (chainId !== baseSepolia.id) {
          setStatus('正在切換到 Base Sepolia...')
          try { await walletClient.switchChain({ id: baseSepolia.id }) }
          catch {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: `0x${baseSepolia.id.toString(16)}`, chainName: baseSepolia.name, nativeCurrency: baseSepolia.nativeCurrency, rpcUrls: [baseSepolia.rpcUrls.default.http[0]], blockExplorerUrls: [baseSepolia.blockExplorers?.default.url] }],
            })
          }
        }
      } catch { /* ignore */ }

      setStatus('送出交易中（請在錢包確認）...')
      const hash = await (walletClient as any).writeContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'deposit',
        args: [toHash as `0x${string}`],
        value,
        account,
      })

      setTxHash(hash)
      setStatus('交易已送出，等待鏈上確認。正在通知收款人 Email…')

      void sendDepositEmailNotification({ toEmail: toEmail.trim(), amountEth: ethAmount.trim(), txHash: hash }).then((ok) => {
        setStatus(ok ? '交易已送出，通知信已寄出。' : '交易已送出（通知信寄送失敗或未設定寄信服務）。')
      })

      setToEmail('')
      setEthAmount('')
    } catch (e: any) {
      console.error(e)
      setStatus(`交易失敗：${e?.shortMessage || e?.message || 'unknown error'}\n提示：請確認錢包有 Base Sepolia ETH，且合約地址正確。`)
    }
  }

  if (!walletsReady) return null
  if (!externalWallet) {
    if (!showDebug) return null
    return (
      <div className="ui-card">
        <div className="brex-section-label">發送</div>
        <div className="brex-section-title">存入對方的 Email 金庫</div>
        <div className="ui-status mt-4">
          目前沒有偵測到外部錢包，UI 已隱藏。若你已連結 MetaMask 但仍看不到，請把 debug 資訊貼給我。
        </div>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-xs text-white/60">
          {JSON.stringify(wallets?.map((w: any) => ({ address: w?.address, walletClientType: w?.walletClientType, connectorType: w?.connectorType, chainId: w?.chainId, type: w?.type })) || [], null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="ui-card">
      <div className="brex-section-label">發送</div>
      <div className="brex-section-title">存入對方的 Email 金庫</div>
      <div className="brex-section-desc">輸入對方 Email，ETH 會存進對方的 Hash 金庫，對方登入後即可提領。</div>

      <div className="mt-5 grid gap-3">
        <Field label="對方 Email（會自動 hash）">
          <input
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            placeholder="friend@gmail.com"
            className="ui-input"
          />
        </Field>

        <div className="ui-card-subtle">
          <div className="ui-label">對方 Email Hash (keccak256)</div>
          <div className="ui-value break-all font-mono text-xs">{toHash || '-'}</div>
        </div>

        <Field label="ETH 數量">
          <input
            value={ethAmount}
            onChange={(e) => setEthAmount(e.target.value)}
            placeholder="0.001"
            inputMode="decimal"
            className="ui-input"
          />
        </Field>

        <button onClick={onSend} className="ui-button-primary" disabled={!walletsReady}>
          發送（deposit）
        </button>

        {status && <div className="ui-status">{status}</div>}

        {txHash && (
          <div className="ui-card-subtle">
            <div className="ui-label">交易 Hash</div>
            <div className="ui-value break-all font-mono text-xs">{txHash}</div>
          </div>
        )}

        {!import.meta.env.VITE_EMAIL_VAULT_ADDRESS && (
          <div className="ui-status-warn">
            尚未設定 <span className="font-mono">VITE_EMAIL_VAULT_ADDRESS</span>（部署合約後填入）。
          </div>
        )}

        {!authenticated && !wallets?.[0] && (
          <button onClick={() => connectWallet()} className="ui-button-secondary">
            先連結錢包（MetaMask）
          </button>
        )}

        {showDebug && (
          <details className="ui-status">
            <summary className="cursor-pointer text-white/60">Debug：目前連到的 wallets</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-xs text-white/60">
              {JSON.stringify(wallets?.map((w: any) => ({ address: w?.address, walletClientType: w?.walletClientType, connectorType: w?.connectorType, chainId: w?.chainId })) || [], null, 2)}
            </pre>
          </details>
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
