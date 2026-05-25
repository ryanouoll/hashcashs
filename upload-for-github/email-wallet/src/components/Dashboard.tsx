import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePrivy, useWallets, useSendTransaction } from '@privy-io/react-auth'
import { formatUnits, parseUnits, encodeFunctionData, parseAbiItem, parseEventLogs } from 'viem'
import { baseSepolia } from 'viem/chains'
import { hashEmail } from '../lib/email'
import {
  EMAIL_VAULT_ABI,
  USDC_ABI,
  USDC_DECIMALS,
  getEmailVaultAddress,
  getUsdcAddress,
} from '../lib/emailVault'
import { publicClient, makeWalletClient } from '../lib/viemClients'
import { getPrivyUserEmail } from '../lib/privyUser'
import { sendDepositEmailNotification } from '../lib/notify'

// ─── helpers ──────────────────────────────────────────────────────────────
/**
 * 把 micro-USDC (uint256, 6 decimals) 顯示為 $X.XX
 */
function fmtUsd(microUsdc: bigint): string {
  const n = parseFloat(formatUnits(microUsdc, USDC_DECIMALS))
  return n === 0 ? '0.00' : n.toFixed(2)
}

// ─── 交易紀錄（直接讀鏈上 event，無 subgraph）─────────────────────────────
const VAULT_DEPLOY_BLOCK = 41726470n // EmailVaultUSDC 部署的 block，限縮 getLogs 起點
const LOG_CHUNK = 49000n // publicnode getLogs 上限 50000，留安全邊際

const VAULT_EVENTS = [
  parseAbiItem('event Deposited(bytes32 indexed emailHash, address indexed sender, uint256 amount)'),
  parseAbiItem('event Claimed(bytes32 indexed emailHash, address indexed receiver, uint256 amount)'),
  parseAbiItem('event Transferred(bytes32 indexed fromHash, bytes32 indexed toHash, address indexed caller, uint256 amount)'),
] as const

type Activity = {
  kind: 'deposit' | 'claim' | 'send' | 'receive'
  amount: bigint
  blockNumber: bigint
  txHash: string
  counterpartyHash?: string
  tsApprox: number // 估算的 unix 秒（用 block 號推算，Base ~2s/block）
}

const ACTIVITY_LABEL: Record<Activity['kind'], string> = {
  deposit: 'Deposited from wallet',
  claim: 'Withdrawn to wallet',
  send: 'Sent',
  receive: 'Received',
}

function relTime(secAgo: number): string {
  if (secAgo < 60) return 'just now'
  if (secAgo < 3600) return `${Math.floor(secAgo / 60)}m ago`
  if (secAgo < 86400) return `${Math.floor(secAgo / 3600)}h ago`
  return `${Math.floor(secAgo / 86400)}d ago`
}

/**
 * 讀取某 emailHash 相關的所有 vault 活動。
 * 因為公開 RPC 限制 getLogs 每次最多 50000 blocks，分 chunk 查，
 * 然後在前端解碼 + 過濾出跟這個 hash 有關的事件。
 */
async function fetchVaultActivity(emailHash: `0x${string}`): Promise<Activity[]> {
  const vault = getEmailVaultAddress()
  const latest = (await (publicClient as any).getBlockNumber()) as bigint

  // 收集所有 chunk 的 raw logs
  const rawLogs: any[] = []
  for (let from = VAULT_DEPLOY_BLOCK; from <= latest; from += LOG_CHUNK + 1n) {
    const to = from + LOG_CHUNK > latest ? latest : from + LOG_CHUNK
    try {
      const chunk = await (publicClient as any).getLogs({ address: vault, fromBlock: from, toBlock: to })
      rawLogs.push(...chunk)
    } catch (e) {
      console.warn('[activity] getLogs chunk failed', from, to, e)
    }
  }

  // 解碼
  const decoded = parseEventLogs({ abi: VAULT_EVENTS as any, logs: rawLogs })

  const nowSec = Math.floor(Date.now() / 1000)
  const tsOf = (bn: bigint) => nowSec - Number(latest - bn) * 2 // Base ~2s/block

  const out: Activity[] = []
  for (const log of decoded as any[]) {
    const a = log.args
    const base = { amount: a.amount, blockNumber: log.blockNumber, txHash: log.transactionHash, tsApprox: tsOf(log.blockNumber) }
    if (log.eventName === 'Deposited' && a.emailHash === emailHash) {
      out.push({ kind: 'deposit', ...base })
    } else if (log.eventName === 'Claimed' && a.emailHash === emailHash) {
      out.push({ kind: 'claim', ...base })
    } else if (log.eventName === 'Transferred' && a.fromHash === emailHash) {
      out.push({ kind: 'send', ...base, counterpartyHash: a.toHash })
    } else if (log.eventName === 'Transferred' && a.toHash === emailHash) {
      out.push({ kind: 'receive', ...base, counterpartyHash: a.fromHash })
    }
  }

  out.sort((x, y) => (y.blockNumber > x.blockNumber ? 1 : y.blockNumber < x.blockNumber ? -1 : 0))
  return out.slice(0, 15) // 只顯示最近 15 筆
}

async function getExternalAccount(provider: any): Promise<`0x${string}` | undefined> {
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    if (accounts?.[0]) return accounts[0] as `0x${string}`
    const requested = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
    if (requested?.[0]) return requested[0] as `0x${string}`
  } catch { /* ignore */ }
}

async function ensureBaseSepolia(provider: any, walletClient: any) {
  try {
    const chainId = await walletClient.getChainId()
    if (chainId === baseSepolia.id) return
    try { await walletClient.switchChain({ id: baseSepolia.id }) } catch {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: `0x${baseSepolia.id.toString(16)}`, chainName: baseSepolia.name, nativeCurrency: baseSepolia.nativeCurrency, rpcUrls: [baseSepolia.rpcUrls.default.http[0]], blockExplorerUrls: [baseSepolia.blockExplorers?.default.url] }],
      })
    }
  } catch { /* ignore */ }
}

// ─── DepositModal ──────────────────────────────────────────────────────────
function DepositModal({ open, email, emailHash, externalWallet, walletsReady, onClose, onSuccess }: {
  open: boolean
  email: string
  emailHash: string
  externalWallet: any
  walletsReady: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState('')
  const [success, setSuccess] = useState(false)

  function reset() { setAmount(''); setStatus(''); setIsError(false); setLoading(false); setTxHash(''); setSuccess(false) }
  function handleClose() { onClose(); setTimeout(reset, 250) }

  async function onDeposit() {
    setStatus(''); setIsError(false)
    if (!amount.trim()) { setStatus('Enter an amount.'); setIsError(true); return }
    if (!externalWallet) { setStatus('Connect a wallet first.'); setIsError(true); return }

    // USD 數字 → micro-USDC (6 decimals)
    let amountWei: bigint
    try { amountWei = parseUnits(amount as `${number}`, USDC_DECIMALS) }
    catch { setStatus('Invalid USD amount.'); setIsError(true); return }
    if (amountWei <= 0n) { setStatus('Amount must be greater than 0.'); setIsError(true); return }

    setLoading(true)
    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)
      const account = await getExternalAccount(provider)
      await ensureBaseSepolia(provider, walletClient)

      // 嚴格 chain 驗證：上面 ensureBaseSepolia 可能因為使用者拒絕切換而靜默失敗
      const currentChain = await walletClient.getChainId()
      if (currentChain !== baseSepolia.id) {
        setStatus(
          `錢包目前在 chainId ${currentChain}，必須切到 Base Sepolia (84532) 才能存款。請在 MetaMask 右上角切換網路。`
        )
        setIsError(true); setLoading(false); return
      }

      const vault = getEmailVaultAddress()
      const usdc = getUsdcAddress()

      // 0. 先檢查使用者錢包有沒有足夠 USDC（不然 deposit 一定 revert）
      const usdcBal = (await (publicClient as any).readContract({
        address: usdc, abi: USDC_ABI, functionName: 'balanceOf', args: [account],
      })) as bigint
      if (usdcBal < amountWei) {
        setStatus(
          `Wallet has only $${formatUnits(usdcBal, USDC_DECIMALS)} USDC. Get testnet USDC from faucet.circle.com (Base Sepolia → USDC).`
        )
        setIsError(true); setLoading(false); return
      }

      // 1. 檢查 USDC allowance；不足就 approve 一個超大數（infinite approve）
      //    → 之後同一個 vault 不用再 approve，只需要 1 tx 就能 deposit
      const allowance = (await (publicClient as any).readContract({
        address: usdc, abi: USDC_ABI, functionName: 'allowance', args: [account, vault],
      })) as bigint
      const MAX_UINT256 = (1n << 256n) - 1n
      if (allowance < amountWei) {
        setStatus('Approving USD spending… (one-time setup, 1/2)')
        const approveHash = await (walletClient as any).writeContract({
          chain: baseSepolia, address: usdc, abi: USDC_ABI, functionName: 'approve',
          args: [vault, MAX_UINT256], account,  // ← 改 infinite approve
        })
        setStatus('Waiting for approve to confirm…')
        await (publicClient as any).waitForTransactionReceipt({ hash: approveHash, timeout: 60_000 })
      }

      // 2. Deposit
      setStatus(allowance < amountWei ? 'Depositing… (2/2)' : 'Depositing…')
      const hash = await (walletClient as any).writeContract({
        chain: baseSepolia, address: vault, abi: EMAIL_VAULT_ABI, functionName: 'deposit',
        args: [emailHash as `0x${string}`, amountWei], account,
      })
      setTxHash(hash)
      setSuccess(true)
      onSuccess()
    } catch (e: any) {
      const raw = e?.shortMessage || e?.message || 'Transaction failed.'
      // 映射常見錯誤到可讀訊息
      if (/rate limit/i.test(raw)) {
        setStatus(
          'RPC 節點限流（你 MetaMask 的 Base Sepolia RPC 太忙）。請等 30 秒再試，或去 MetaMask → 設定 → 網路 → Base Sepolia → RPC URL 改成 https://base-sepolia-rpc.publicnode.com'
        )
      } else if (/insufficient.*balance|exceeds balance/i.test(raw)) {
        setStatus('Wallet USDC 不足。請去 https://faucet.circle.com 領 Base Sepolia USDC。')
      } else if (/user rejected|user denied/i.test(raw)) {
        setStatus('你在錢包按了拒絕。')
      } else if (/exceeds max transaction gas/i.test(raw)) {
        setStatus(
          '交易模擬失敗（通常是合約地址錯或錢包沒 USDC）。請確認 MetaMask 在 Base Sepolia 鏈，且該錢包有 USDC。'
        )
      } else {
        setStatus(raw)
      }
      setIsError(true)
    } finally { setLoading(false) }
  }

  return (
    <div className={`modal-backdrop${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="modal">
        {!success ? (
          <>
            <div className="modal-head">
              <div>
                <h3>Deposit to your vault</h3>
                <p>Move USD from your wallet into your hashcash vault.</p>
              </div>
              <button className="modal-close" onClick={handleClose}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="readrow">
                <span className="key">Destination</span>
                <span className="val">{email || '—'} <span className="mono" style={{ fontSize: 11, color: 'var(--mute)' }}>({emailHash ? emailHash.slice(0, 8) + '…' : ''})</span></span>
              </div>
              <div className="field" style={{ marginTop: 18 }}>
                <label className="field-label" htmlFor="deposit-amount">Amount</label>
                <div className="input-wrap">
                  <input className="input with-suffix" id="deposit-amount" type="text" inputMode="decimal"
                    placeholder="10.00" value={amount} onChange={e => setAmount(e.target.value)} />
                  <span className="input-suffix">USD</span>
                </div>
              </div>
            </div>
            {status && <div className={`modal-status${isError ? ' error' : ''}`}>{status}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={onDeposit} disabled={loading || !walletsReady}>
                {loading
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> {status || 'Working…'}</>
                  : 'Deposit'}
              </button>
              <div className="modal-fineprint">Funds will be locked in the vault under your email.</div>
            </div>
          </>
        ) : (
          <>
            <div className="success-wrap">
              <div className="success-ring">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5 10 17 19 7.5" />
                </svg>
              </div>
              <h3 className="success-title">Deposited!</h3>
              <p className="success-sub">Your vault balance will update shortly.</p>
              <div className="tx-summary">
                <div className="row"><span className="k">Amount</span><span className="v"><b>${amount}</b> USD</span></div>
                {txHash && (
                  <div className="row">
                    <span className="k">Transaction</span>
                    <a className="v mono" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                      {txHash.slice(0, 8)}…{txHash.slice(-6)} ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={handleClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── SendModal ─────────────────────────────────────────────────────────────
// Uses Privy useSendTransaction with sponsor:true + showWalletUIs:false → zero popup, gas sponsored
function SendModal({ open, fromEmailHash, fromEmail, balanceWei, onClose, onSuccess }: {
  open: boolean
  fromEmailHash: string
  fromEmail: string
  balanceWei: bigint | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [toEmail, setToEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [txHash, setTxHash] = useState('')

  const toHash = useMemo(() => (toEmail ? hashEmail(toEmail) : ''), [toEmail])

  function reset() {
    setToEmail(''); setAmount(''); setStatus(''); setIsError(false)
    setLoading(false); setSuccess(false); setTxHash('')
  }

  function handleClose() { onClose(); setTimeout(reset, 250) }

  function fillMax() {
    if (balanceWei !== null) setAmount(formatUnits(balanceWei, USDC_DECIMALS))
  }

  const { sendTransaction } = useSendTransaction()

  async function onSend() {
    setStatus(''); setIsError(false)
    if (!toEmail.trim() || !amount.trim()) { setStatus('Please fill in all fields.'); setIsError(true); return }
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(toEmail.trim())) { setStatus('Recipient email looks invalid.'); setIsError(true); return }

    let amountWei: bigint
    try { amountWei = parseUnits(amount as `${number}`, USDC_DECIMALS) }
    catch { setStatus('Invalid USD amount.'); setIsError(true); return }
    if (amountWei <= 0n) { setStatus('Amount must be greater than 0.'); setIsError(true); return }

    if (balanceWei !== null && amountWei > balanceWei) {
      setStatus('Amount exceeds your vault balance.'); setIsError(true); return
    }

    setLoading(true)
    try {
      setStatus('Sending…')
      const data = encodeFunctionData({
        abi: EMAIL_VAULT_ABI,
        functionName: 'transfer',
        args: [fromEmailHash as `0x${string}`, toHash as `0x${string}`, amountWei],
      })

      // Privy's useSendTransaction → routes through gas-sponsorship relay,
      // sponsor:true asks Privy to cover gas, showWalletUIs:false hides the approval modal
      const result = await sendTransaction(
        {
          to: getEmailVaultAddress(),
          data,
          chainId: baseSepolia.id,
        },
        {
          sponsor: true,
          uiOptions: { showWalletUIs: false },
        },
      )
      const hash = (result as any)?.hash || (result as any)?.transactionHash || String(result)

      setTxHash(hash)
      void sendDepositEmailNotification({
        toEmail: toEmail.trim(),
        amountEth: amount.trim(),  // 內容當 USD 處理（後端會解讀為金額）
        txHash: hash,
        fromEmail: fromEmail || undefined,
      })
      setSuccess(true)
      onSuccess()
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.message || 'Transaction failed.')
      setIsError(true)
    } finally { setLoading(false) }
  }

  return (
    <div className={`modal-backdrop${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="modal">
        {!success ? (
          <>
            <div className="modal-head">
              <div>
                <h3>Send</h3>
                <p>Vault-to-vault transfer. No wallet pop-up — gas is sponsored.</p>
              </div>
              <button className="modal-close" onClick={handleClose}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="field-label" htmlFor="send-email">Recipient email</label>
                <div className="input-wrap">
                  <input className="input" id="send-email" type="email" placeholder="friend@gmail.com"
                    value={toEmail} onChange={e => setToEmail(e.target.value)} />
                </div>
                {toHash && (
                  <div className="field-hint">
                    Hash: <span className="mono" style={{ fontSize: 11.5 }}>{toHash.slice(0, 10)}…{toHash.slice(-6)}</span>
                  </div>
                )}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="send-amount">Amount</label>
                <div className="input-wrap">
                  <input className="input with-max" id="send-amount" type="text" inputMode="decimal"
                    placeholder="10.00" value={amount} onChange={e => setAmount(e.target.value)} />
                  <button className="input-max" onClick={fillMax}>Max</button>
                </div>
                {balanceWei !== null && (
                  <div className="field-hint">Available: <b style={{ color: 'var(--ink)' }}>${fmtUsd(balanceWei)} USD</b></div>
                )}
              </div>
            </div>
            {status && <div className={`modal-status${isError ? ' error' : ''}`}>{status}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={onSend} disabled={loading}>
                {loading
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Sending…</>
                  : 'Send'}
              </button>
              <div className="modal-fineprint">Funds move instantly between vaults. Recipient can claim anytime.</div>
            </div>
          </>
        ) : (
          <>
            <div className="success-wrap">
              <div className="success-ring">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5 10 17 19 7.5" />
                </svg>
              </div>
              <h3 className="success-title">Sent!</h3>
              <p className="success-sub">
                A notification email was sent to <b>{toEmail}</b>. They can claim anytime.
              </p>
              <div className="tx-summary">
                <div className="row">
                  <span className="k">Amount</span>
                  <span className="v"><b>${amount}</b> USD</span>
                </div>
                <div className="row">
                  <span className="k">Recipient</span>
                  <span className="v mono">{toHash.slice(0, 10)}…{toHash.slice(-6)}</span>
                </div>
                {txHash && (
                  <div className="row">
                    <span className="k">Transaction</span>
                    <a className="v mono" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
                      {txHash.slice(0, 8)}…{txHash.slice(-6)} ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={handleClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── ClaimModal ────────────────────────────────────────────────────────────
function ClaimModal({ open, email, emailHash, walletAddress, balanceWei, externalWallet, walletsReady, onClose, onSuccess }: {
  open: boolean
  email: string
  emailHash: string
  walletAddress: string
  balanceWei: bigint | null
  externalWallet: any
  walletsReady: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState('')
  const [isError, setIsError] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleClose() { onClose(); setTimeout(() => { setAmount(''); setStatus(''); setIsError(false); setLoading(false) }, 250) }

  function fillMax() {
    if (balanceWei !== null) setAmount(formatUnits(balanceWei, USDC_DECIMALS))
  }

  async function onClaim() {
    setStatus(''); setIsError(false)
    if (!amount.trim()) { setStatus('Enter an amount.'); setIsError(true); return }
    if (!externalWallet) { setStatus('Connect MetaMask first.'); setIsError(true); return }

    let amountWei: bigint
    try { amountWei = parseUnits(amount as `${number}`, USDC_DECIMALS) }
    catch { setStatus('Invalid USD amount.'); setIsError(true); return }
    if (amountWei <= 0n) { setStatus('Amount must be greater than 0.'); setIsError(true); return }

    setLoading(true)
    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)
      const account = await getExternalAccount(provider)
      await ensureBaseSepolia(provider, walletClient)

      setStatus('Confirm in your wallet…')
      await (walletClient as any).writeContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'claim',
        args: [emailHash as `0x${string}`, amountWei],
        account,
      })

      onSuccess()
      handleClose()
    } catch (e: any) {
      setStatus(e?.shortMessage || e?.message || 'Transaction failed.')
      setIsError(true)
    } finally { setLoading(false) }
  }

  const available = balanceWei !== null ? `$${fmtUsd(balanceWei)} USD` : '—'

  return (
    <div className={`modal-backdrop${open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
      <div className="modal">
        <div className="modal-head">
          <div>
            <h3>Claim to your wallet</h3>
            <p>Withdraw your vault balance to your connected MetaMask wallet.</p>
          </div>
          <button className="modal-close" onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div className="modal-body">
          <div className="readrow">
            <span className="key">Your email</span>
            <span className="val">{email || '—'}</span>
          </div>
          <div className="readrow">
            <span className="key">Your wallet</span>
            <span className="val mono">{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : 'Not connected'}</span>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label className="field-label" htmlFor="claim-amount">Amount to claim</label>
            <div className="input-wrap">
              <input className="input with-max" id="claim-amount" type="text" inputMode="decimal"
                placeholder="0.000" value={amount} onChange={e => setAmount(e.target.value)} />
              <button className="input-max" onClick={fillMax}>Max</button>
            </div>
            <div className="field-hint">
              Available: <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{available}</b>
            </div>
          </div>
        </div>
        {status && <div className={`modal-status${isError ? ' error' : ''}`}>{status}</div>}
        <div className="modal-foot">
          <button className="btn btn-primary btn-block" onClick={onClaim} disabled={loading || !walletsReady}>
            {loading
              ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Confirming…</>
              : 'Claim'}
          </button>
          <div className="modal-fineprint">Gas is paid from your connected wallet on Base Sepolia.</div>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
export function Dashboard() {
  const { logout, user, connectWallet, unlinkWallet } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()

  const email = getPrivyUserEmail(user)
  const emailHash = useMemo(() => (email ? hashEmail(email) : ''), [email])

  const externalWallet = walletsReady
    ? wallets?.find((w: any) =>
        w?.walletClientType && w.walletClientType !== 'privy' && w.connectorType !== 'embedded'
      )
    : undefined

  const walletAddress: string = externalWallet?.address || ''

  const [balanceWei, setBalanceWei] = useState<bigint | null>(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const [activity, setActivity] = useState<Activity[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  const fetchBalance = useCallback(async () => {
    if (!emailHash) return
    try {
      const bal = await (publicClient as any).readContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'balances',
        args: [emailHash as `0x${string}`],
      }) as bigint
      setBalanceWei(bal)
    } catch (e) { console.error(e) }
  }, [emailHash])

  const fetchActivity = useCallback(async () => {
    if (!emailHash) return
    setActivityLoading(true)
    try {
      const list = await fetchVaultActivity(emailHash as `0x${string}`)
      setActivity(list)
      setNowSec(Math.floor(Date.now() / 1000))
    } catch (e) {
      console.error('[activity]', e)
      setActivity([])
    } finally { setActivityLoading(false) }
  }, [emailHash])

  useEffect(() => { fetchBalance() }, [fetchBalance])
  useEffect(() => { fetchActivity() }, [fetchActivity])

  // 交易廣播後鏈上還沒確認 → 立刻讀會是舊值。
  // 輪詢幾次（0s / 3s / 7s / 12s）讓 UI 在交易上鏈後自動補上，不用手動刷新。
  const refreshAll = useCallback(() => {
    const tick = () => { fetchBalance(); fetchActivity() }
    tick()
    const timers = [3000, 7000, 12000].map((ms) => setTimeout(tick, ms))
    return () => timers.forEach(clearTimeout)
  }, [fetchBalance, fetchActivity])

  const displayBalance = balanceWei !== null ? fmtUsd(balanceWei) : '—'
  const firstName = email ? email.split('@')[0] : ''
  const vaultAddr = getEmailVaultAddress()

  return (
    <>
      {/* ── Nav ── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark" />
            <span>hashcash</span>
          </div>
          <div className="nav-right">
            {walletAddress ? (
              <div className="wallet-menu-wrap">
                <button className="wallet-chip" onClick={() => setWalletMenuOpen(o => !o)}>
                  <span className="wallet-chip-dot" />
                  <span className="mono">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {walletMenuOpen && (
                  <>
                    <div className="wallet-menu-backdrop" onClick={() => setWalletMenuOpen(false)} />
                    <div className="wallet-menu">
                      <button className="wallet-menu-item" onClick={() => { setWalletMenuOpen(false); connectWallet() }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>
                        Switch wallet
                      </button>
                      <button className="wallet-menu-item danger" onClick={() => { setWalletMenuOpen(false); unlinkWallet(walletAddress) }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => connectWallet()}>
                Connect Wallet
              </button>
            )}
            {externalWallet && (
              <button className="btn btn-primary btn-sm" onClick={() => setDepositOpen(true)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="m17 7-5-5-5 5"/><path d="M3 20h18"/></svg>
                Deposit
              </button>
            )}
            <button className="btn btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </nav>

      {/* ── Dashboard ── */}
      <div className="dashboard-wrap">
        <div className="dash-card">
          {firstName && (
            <div className="dash-eyebrow">
              <div className="label-eyebrow">Welcome back, {firstName}</div>
            </div>
          )}

          <div className="balance-card">
            <div className="balance-label label-eyebrow">Your USD Balance</div>
            <div className="balance-amount">
              {balanceWei !== null && <span className="unit" style={{ marginRight: 4 }}>$</span>}
              <span className="num h-balance">{displayBalance}</span>
              {balanceWei !== null && <span className="unit">USD</span>}
            </div>
            <div className="balance-usd">{balanceWei !== null ? "on hashcash" : " "}</div>

            <div className="badge-row">
              <span className="badge network">
                <span className="dot" />
                Base Sepolia
              </span>
              {email && (
                <span className="badge">
                  <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
                  {email}
                </span>
              )}
            </div>

            {!externalWallet && (
              <div className="wallet-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><circle cx="12" cy="14" r="1" fill="currentColor"/></svg>
                <span>Connect a wallet to deposit or claim</span>
                <button className="btn btn-primary btn-sm" onClick={() => connectWallet()}>Connect</button>
              </div>
            )}
            <div className="action-row">
              <button className="btn btn-primary btn-block" onClick={() => setSendOpen(true)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
                Send
              </button>
              <button className="btn btn-outline btn-block" onClick={() => externalWallet ? setClaimOpen(true) : connectWallet()}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Claim to Wallet
              </button>
            </div>
          </div>

          {/* Recent activity — read straight from on-chain events */}
          <div className="recent">
            <div className="recent-head">
              <span className="label-eyebrow">Recent activity</span>
              <button className="btn btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                onClick={() => { refreshAll() }} disabled={activityLoading}>
                {activityLoading ? 'Loading…' : 'Refresh ↻'}
              </button>
            </div>
            {activity === null || activityLoading ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
                Loading activity…
              </div>
            ) : activity.length === 0 ? (
              <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
                No activity yet. Deposit or receive a payment to get started.
              </div>
            ) : (
              <div className="activity-list">
                {activity.map((a) => (
                  <a key={a.txHash + a.kind} className="activity-row"
                    href={`https://sepolia.basescan.org/tx/${a.txHash}`} target="_blank" rel="noreferrer">
                    <span className={`activity-icon ${a.kind === 'deposit' || a.kind === 'receive' ? 'in' : 'out'}`}>
                      {a.kind === 'deposit' || a.kind === 'receive' ? '↓' : '↑'}
                    </span>
                    <span className="activity-main">
                      <span className="activity-title">{ACTIVITY_LABEL[a.kind]}</span>
                      <span className="activity-sub">
                        {a.counterpartyHash
                          ? `${a.counterpartyHash.slice(0, 8)}…${a.counterpartyHash.slice(-4)} · ${relTime(nowSec - a.tsApprox)}`
                          : relTime(nowSec - a.tsApprox)}
                      </span>
                    </span>
                    <span className={`activity-amount ${a.kind === 'deposit' || a.kind === 'receive' ? 'in' : 'out'}`}>
                      {a.kind === 'deposit' || a.kind === 'receive' ? '+' : '−'}${fmtUsd(a.amount)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="dash-foot">
            Vault{' '}
            <a className="mono" href={`https://sepolia.basescan.org/address/${vaultAddr}`} target="_blank" rel="noreferrer">
              {vaultAddr ? `${vaultAddr.slice(0, 6)}…${vaultAddr.slice(-4)}` : '—'} ↗
            </a>{' '}
            · Network <span>Base Sepolia</span>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <DepositModal
        open={depositOpen}
        email={email || ''}
        emailHash={emailHash}
        externalWallet={externalWallet}
        walletsReady={walletsReady}
        onClose={() => setDepositOpen(false)}
        onSuccess={() => { setDepositOpen(false); refreshAll() }}
      />
      <SendModal
        open={sendOpen}
        fromEmailHash={emailHash}
        fromEmail={email || ''}
        balanceWei={balanceWei}
        onClose={() => setSendOpen(false)}
        onSuccess={() => { setSendOpen(false); refreshAll() }}
      />
      <ClaimModal
        open={claimOpen}
        email={email || ''}
        emailHash={emailHash}
        walletAddress={walletAddress}
        balanceWei={balanceWei}
        externalWallet={externalWallet}
        walletsReady={walletsReady}
        onClose={() => setClaimOpen(false)}
        onSuccess={() => { setClaimOpen(false); refreshAll() }}
      />
    </>
  )
}
