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
  const externalWallet =
    wallets?.find((w: any) => w?.walletClientType && w.walletClientType !== 'privy') ||
    wallets?.find((w: any) => w?.connectorType) ||
    wallets?.find((w: any) => w?.type === 'wallet' && w?.walletClientType !== 'privy') ||
    undefined

  const isConnected = Boolean(externalWallet?.address)
  const walletAddress = externalWallet?.address || ''

  const authedEmail = getPrivyUserEmail(user)
  const [claimAmountEth, setClaimAmountEth] = useState('')
  const [claimStatus, setClaimStatus] = useState('')
  const [claimTxHash, setClaimTxHash] = useState('')

  const claimHash = useMemo(() => (authedEmail ? hashEmail(authedEmail) : ''), [authedEmail])

  async function onClaimToWallet() {
    setClaimStatus('')
    setClaimTxHash('')

    if (!walletsReady) { setClaimStatus('錢包初始化中，請稍等 1–2 秒後再試。'); return }
    if (!externalWallet) { setClaimStatus('請先連結外部錢包（MetaMask）。'); return }
    if (!authenticated || !authedEmail) { setClaimStatus('此功能只能提領「你 Google OAuth 登入的 Email」的餘額。請先用 Google 登入。'); return }
    if (!claimAmountEth.trim()) { setClaimStatus('請填寫要領出的 ETH 數量。'); return }

    let amountWei: bigint
    try { amountWei = parseEther(claimAmountEth as `${number}`) }
    catch { setClaimStatus('ETH 數量格式不正確。'); return }

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
          setClaimStatus('正在切換到 Base Sepolia...')
          try { await walletClient.switchChain({ id: baseSepolia.id }) }
          catch {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [{ chainId: `0x${baseSepolia.id.toString(16)}`, chainName: baseSepolia.name, nativeCurrency: baseSepolia.nativeCurrency, rpcUrls: [baseSepolia.rpcUrls.default.http[0]], blockExplorerUrls: [baseSepolia.blockExplorers?.default.url] }],
            })
          }
        }
      } catch { /* ignore */ }

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
    <div className="grid gap-5">

      {/* ── 錢包狀態卡 ── */}
      <div className="ui-card">
        <div className="brex-section-label">登入</div>
        <div className="brex-section-title">連結錢包</div>
        <div className="brex-section-desc">此版本不建立內建錢包，只支援連結外部錢包（MetaMask）。</div>

        {/* 錢包狀態 pill */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                !walletsReady ? 'bg-yellow-400' : isConnected ? 'bg-emerald-400' : 'bg-white/30'
              }`}
            />
            <span className="text-sm text-white/60">
              {!walletsReady ? '初始化中...' : isConnected ? '已連結' : '未連結'}
            </span>
          </div>
          <div className="flex gap-2">
            {authenticated && (
              <button onClick={logout} className="rounded-lg bg-white/8 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/12">
                登出
              </button>
            )}
            <button
              onClick={() => connectWallet()}
              disabled={!ready || !hasAppId || !walletsReady}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                isConnected
                  ? 'bg-white/8 text-white/70 hover:bg-white/12'
                  : 'bg-[#FF6B2B] text-white hover:bg-[#FF8447]'
              }`}
            >
              {isConnected ? '已連結 MetaMask' : '連結錢包'}
            </button>
          </div>
        </div>

        {!hasAppId && (
          <div className="ui-status-warn mt-4">
            沒讀到 <span className="font-mono">VITE_PRIVY_APP_ID</span>，登入按鈕會被鎖住。請設定{' '}
            <span className="font-mono">email-wallet/.env</span> 後重開 dev server。
          </div>
        )}

        {hasAppId && !ready && (
          <div className="ui-status mt-4">Privy 初始化中（ready=false），通常刷新或等 1–2 秒。</div>
        )}

        {walletAddress && (
          <div className="mt-4">
            <InfoRow label="錢包地址" value={walletAddress} mono />
          </div>
        )}
      </div>

      {/* ── Claim 卡 ── */}
      <div className="ui-card">
        <div className="brex-section-label">提領</div>
        <div className="brex-section-title">Claim 到錢包</div>
        <div className="brex-section-desc">
          把你的 Email Hash 金庫餘額領到目前連結的錢包地址。
          {!walletsReady && <span className="ml-1 text-yellow-300/80">錢包初始化中…</span>}
          {walletsReady && !isConnected && <span className="ml-1 text-yellow-300/80">請先連結錢包。</span>}
        </div>

        <div className="mt-5 grid gap-3">
          <InfoRow label="提領用 Email（Google OAuth）" value={authenticated ? (authedEmail || '-') : '-'} />
          <InfoRow label="Email Hash (keccak256)" value={claimHash || '-'} mono />

          <label className="grid gap-1.5">
            <div className="ui-label">領出金額（ETH）</div>
            <input
              value={claimAmountEth}
              onChange={(e) => setClaimAmountEth(e.target.value)}
              placeholder="0.001"
              inputMode="decimal"
              className="ui-input"
            />
          </label>

          <button onClick={onClaimToWallet} className="ui-button-primary" disabled={!walletsReady}>
            Claim 到錢包
          </button>

          {claimStatus && <div className="ui-status">{claimStatus}</div>}
          {claimTxHash && <InfoRow label="交易 Hash" value={claimTxHash} mono />}
        </div>
      </div>

    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ui-card-subtle">
      <div className="ui-label">{label}</div>
      <div className={`ui-value break-all ${mono ? 'font-mono text-xs' : ''}`}>{value || '-'}</div>
    </div>
  )
}
