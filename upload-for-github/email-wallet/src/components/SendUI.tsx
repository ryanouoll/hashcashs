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

  // 需求：沒連結外部錢包就不要出現「錢包送錢到 hash」的 UI
  // 注意：wallets 初始化時可能出現短暫的中間狀態，必須等 walletsReady 才做最終判斷
  const externalWallet = walletsReady
    ? wallets?.find((w: any) => {
        // injected/metamask/coinbase/rainbow 等外部錢包通常有 connectorType
        if (w?.connectorType) return true
        // 有些版本用 walletClientType 表示外部錢包種類
        if (w?.walletClientType && w.walletClientType !== 'privy') return true
        // 再保底：若標記為外部錢包
        if (w?.type === 'wallet' && w?.walletClientType !== 'privy') return true
        return false
      })
    : undefined

  async function onSend() {
    setStatus('')
    setTxHash('')

    if (!walletsReady) {
      setStatus('錢包初始化中，請稍等 1–2 秒後再試。')
      return
    }
    if (!toEmail.trim() || !ethAmount.trim()) {
      setStatus('請填寫對方 Email 與 ETH 數量。')
      return
    }
    if (!wallets?.[0]) {
      setStatus('請先「連結錢包（MetaMask）」。')
      return
    }

    let value: bigint
    try {
      value = parseEther(ethAmount as `${number}`)
    } catch {
      setStatus('ETH 數量格式不正確。')
      return
    }

    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)

      // 取得目前可用的付款帳號（外部錢包常需要明確指定 account 才能送交易）
      let account: `0x${string}` | undefined
      try {
        const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
        if (accounts?.[0]) account = accounts[0] as `0x${string}`
        if (!account) {
          const requested = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
          if (requested?.[0]) account = requested[0] as `0x${string}`
        }
      } catch {
        // ignore
      }

      // 確保在 Base Sepolia（避免「我明明有錢但送不出去」其實是鏈不對）
      try {
        const chainId = await walletClient.getChainId()
        if (chainId !== baseSepolia.id) {
          setStatus('正在切換到 Base Sepolia...')
          try {
            await walletClient.switchChain({ id: baseSepolia.id })
          } catch {
            // 有些 provider 不支援 switchChain，改用 EIP-3085 加鏈
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: `0x${baseSepolia.id.toString(16)}`,
                  chainName: baseSepolia.name,
                  nativeCurrency: baseSepolia.nativeCurrency,
                  rpcUrls: [baseSepolia.rpcUrls.default.http[0]],
                  blockExplorerUrls: [baseSepolia.blockExplorers?.default.url],
                },
              ],
            })
          }
        }
      } catch {
        // chainId 讀不到就略過，不阻擋 demo
      }

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

      // 通知信：失敗也不阻擋主流程
      void sendDepositEmailNotification({
        toEmail: toEmail.trim(),
        amountEth: ethAmount.trim(),
        txHash: hash,
      }).then((ok) => {
        setStatus(ok ? '交易已送出，通知信已寄出。' : '交易已送出（通知信寄送失敗或未設定寄信服務）。')
      })

      setToEmail('')
      setEthAmount('')
    } catch (e: any) {
      console.error(e)
      setStatus(
        `交易失敗：${e?.shortMessage || e?.message || 'unknown error'}\n` +
          `提示：請確認你的錢包地址真的有 Base Sepolia ETH（不是別的測試網），並且合約地址在 Base Sepolia。`
      )
    }
  }

  // 用「渲染階段」控制顯示，避免 hooks 數量在不同 render 改變
  if (!walletsReady) return null
  if (!externalWallet) {
    // 若使用者已按過連結錢包但仍沒抓到，提供 debug 模式輔助定位（正常情況下不顯示任何 UI）
    if (!showDebug) return null
    return (
      <div className="ui-card">
        <div className="text-sm text-white/60">發送</div>
        <div className="mt-1 text-xl font-semibold tracking-tight">存入對方的 Email 金庫（隱藏中）</div>
        <div className="mt-2 text-sm text-white/70">
          目前沒有偵測到外部錢包，所以依你的規則這塊 UI 會隱藏。若你已連結 MetaMask 但仍看不到，請把下面 debug 貼我。
        </div>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-black/30 p-3 text-xs text-white/70">
          {JSON.stringify(
            wallets?.map((w: any) => ({
              address: w?.address,
              walletClientType: w?.walletClientType,
              connectorType: w?.connectorType,
              chainId: w?.chainId,
              type: w?.type,
            })) || [],
            null,
            2
          )}
        </pre>
      </div>
    )
  }

  return (
    <div className="ui-card">
      <div className="text-sm text-white/60">發送</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">存入對方的 Email 金庫</div>

      <div className="mt-4 grid gap-3">
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
          <div className="mt-1 break-all font-mono text-sm text-white">{toHash || '-'}</div>
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

        <button
          onClick={onSend}
          className="ui-button-primary"
          disabled={!walletsReady}
        >
          發送（deposit）
        </button>

        {status && (
          <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{status}</div>
        )}

        {txHash && (
          <div className="ui-card-subtle">
            <div className="ui-label">交易 Hash</div>
            <div className="mt-1 break-all font-mono text-sm text-white">{txHash}</div>
          </div>
        )}

        {!import.meta.env.VITE_EMAIL_VAULT_ADDRESS && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            尚未設定 <span className="font-mono">VITE_EMAIL_VAULT_ADDRESS</span>（部署合約後填入）。
          </div>
        )}

        {!authenticated && !wallets?.[0] && (
          <button
            onClick={() => connectWallet()}
            className="ui-button-secondary"
          >
            先連結錢包（MetaMask）
          </button>
        )}

        {showDebug && (
          <details className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
            <summary className="cursor-pointer text-white/70">Debug：目前連到的 wallets</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-xs text-white/70">
              {JSON.stringify(
                wallets?.map((w: any) => ({
                  address: w?.address,
                  walletClientType: w?.walletClientType,
                  connectorType: w?.connectorType,
                  chainId: w?.chainId,
                })) || [],
                null,
                2
              )}
            </pre>
          </details>
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

