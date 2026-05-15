import { useMemo, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { hashEmail } from '../lib/email'
import { EMAIL_VAULT_ABI, getEmailVaultAddress } from '../lib/emailVault'
import { getPrivyUserEmail } from '../lib/privyUser'
import { makeWalletClient } from '../lib/viemClients'

export function LoginComponent() {
  const { ready, authenticated, logout, connectWallet, user } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()

  const hasAppId = Boolean(import.meta.env.VITE_PRIVY_APP_ID)
  // 只要不是 privy（embedded）就當作外部錢包。
  // 不同版本/連接器回傳欄位可能不同，這樣最穩。
  const externalWallet =
    wallets?.find((w: any) => w?.walletClientType && w.walletClientType !== 'privy') ||
    wallets?.find((w: any) => w?.connectorType) ||
    wallets?.find((w: any) => w?.type === 'wallet' && w?.walletClientType !== 'privy') ||
    undefined

  const isConnected = Boolean(externalWallet?.address)
  const walletAddress = externalWallet?.address || ''
  const showDebug = new URLSearchParams(window.location.search).has('debug')

  const authedEmail = getPrivyUserEmail(user)
  const [claimAmountEth, setClaimAmountEth] = useState('')
  const [claimStatus, setClaimStatus] = useState('')
  const [claimTxHash, setClaimTxHash] = useState('')

  const claimHash = useMemo(() => (authedEmail ? hashEmail(authedEmail) : ''), [authedEmail])

  async function onClaimToWallet() {
    setClaimStatus('')
    setClaimTxHash('')

    if (!walletsReady) {
      setClaimStatus('錢包初始化中，請稍等 1–2 秒後再試。')
      return
    }
    if (!externalWallet) {
      setClaimStatus('請先連結外部錢包（MetaMask）。')
      return
    }
    if (!authenticated || !authedEmail) {
      setClaimStatus('此功能只能提領「你 Google OAuth 登入的 Email」的餘額。請先用 Google 登入。')
      return
    }
    if (!claimAmountEth.trim()) {
      setClaimStatus('請填寫要領出的 ETH 數量。')
      return
    }

    let amountWei: bigint
    try {
      amountWei = parseEther(claimAmountEth as `${number}`)
    } catch {
      setClaimStatus('ETH 數量格式不正確。')
      return
    }

    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)

      // 取得付款帳號
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

      // 確保鏈是 Base Sepolia
      try {
        const chainId = await walletClient.getChainId()
        if (chainId !== baseSepolia.id) {
          setClaimStatus('正在切換到 Base Sepolia...')
          try {
            await walletClient.switchChain({ id: baseSepolia.id })
          } catch {
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
        // ignore
      }

      setClaimStatus('送出交易中（請在錢包確認）...')
      const hash = await (walletClient as any).writeContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'claim',
        args: [claimHash as `0x${string}`, amountWei],
        account,
      })

      setClaimTxHash(hash)
      setClaimStatus('交易已送出，等待鏈上確認。')
      setClaimAmountEth('')
    } catch (e: any) {
      console.error(e)
      setClaimStatus(`交易失敗：${e?.shortMessage || e?.message || 'unknown error'}`)
    }
  }

  return (
    <div className="ui-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white/60">登入</div>
          <div className="mt-1 text-xl font-semibold tracking-tight">登入 / 連結錢包</div>
          <div className="mt-1 text-sm text-white/60">
            Google 登入會自動建立 Privy 內建錢包（用於 gasless vault-to-vault transfer）。
            連結 MetaMask 用於 deposit（從錢包入金）與 claim（把 vault 餘額提到錢包）。
          </div>
          <div className="mt-2 text-xs text-white/50">錢包狀態：{walletsReady ? (isConnected ? '已連結' : '未連結') : '初始化中...'}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {authenticated ? (
            <button
              onClick={logout}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 active:bg-white/20"
            >
              登出
            </button>
          ) : null}
          <button
            onClick={() => connectWallet()}
            disabled={!ready || !hasAppId || !walletsReady}
            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${
              isConnected ? 'bg-white/10 hover:bg-white/15 active:bg-white/20' : 'bg-blue-500 hover:bg-blue-400 active:bg-blue-600'
            }`}
          >
            {isConnected ? '連結錢包成功' : '連結錢包（MetaMask）'}
          </button>
        </div>
      </div>

      {!hasAppId && (
        <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
          沒讀到 <span className="font-mono">VITE_PRIVY_APP_ID</span>，所以登入按鈕會被鎖住。請確認{' '}
          <span className="font-mono">email-wallet/.env</span> 有設定後，重開 dev server。
        </div>
      )}

      {hasAppId && !ready && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">
          Privy 初始化中（ready=false），通常刷新或等 1–2 秒就會好。
        </div>
      )}

      {walletAddress && (
        <div className="mt-4 grid gap-3">
          <InfoRow label="錢包地址" value={walletAddress} mono />
        </div>
      )}

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="text-sm font-semibold tracking-tight text-white">轉入該錢包（Claim）</div>
        <div className="text-sm text-white/60">
          把某個 EmailHash 的金庫餘額領到你目前連結的錢包地址。
          {!walletsReady && <span className="ml-2 text-amber-200">（錢包初始化中…請等 1–2 秒或先按「連結錢包」）</span>}
          {walletsReady && !isConnected && <span className="ml-2 text-amber-200">（尚未偵測到外部錢包，請先按「連結錢包」）</span>}
        </div>

        <div className="ui-card-subtle">
          <div className="ui-label">提領用 Email（Google OAuth）</div>
          <div className="mt-1 break-all text-sm text-white">{authenticated ? authedEmail || '-' : '-'}</div>
        </div>

        <div className="ui-card-subtle">
          <div className="ui-label">Email Hash (keccak256)</div>
          <div className="mt-1 break-all font-mono text-sm text-white">{claimHash || '-'}</div>
        </div>

        <label className="grid gap-2">
          <div className="text-xs text-white/60">領出金額（ETH）</div>
          <input
            value={claimAmountEth}
            onChange={(e) => setClaimAmountEth(e.target.value)}
            placeholder="0.001"
            inputMode="decimal"
            className="ui-input"
          />
        </label>

        <button onClick={onClaimToWallet} className="ui-button-primary" disabled={!walletsReady}>
          轉入該錢包（claim）
        </button>

        {claimStatus && <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{claimStatus}</div>}
        {claimTxHash && (
          <div className="ui-card-subtle">
            <div className="ui-label">交易 Hash</div>
            <div className="mt-1 break-all font-mono text-sm text-white">{claimTxHash}</div>
          </div>
        )}

        <div className="ui-card-subtle">
          <div className="ui-label">偵測到的錢包（wallets）</div>
          <div className="mt-1 grid gap-1 text-xs text-white/70">
            {(wallets || []).length === 0 ? (
              <div>-</div>
            ) : (
              (wallets || []).map((w: any, idx: number) => (
                <div key={idx} className="break-all font-mono">
                  {idx}. {w?.address || '(no address)'}{' '}
                  <span className="text-white/50">
                    ({w?.walletClientType || 'unknown'}{w?.connectorType ? `, ${w.connectorType}` : ''})
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showDebug && (
        <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/80">
          <summary className="cursor-pointer text-white/70">Debug：目前連到的 wallets</summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/30 p-3 text-xs text-white/70">
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
        </details>
      )}

    </div>
  )
}

function InfoRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ui-card-subtle">
      <div className="ui-label">{props.label}</div>
      <div className={`mt-1 break-all text-sm text-white ${props.mono ? 'font-mono' : ''}`}>{props.value || '-'}</div>
    </div>
  )
}

