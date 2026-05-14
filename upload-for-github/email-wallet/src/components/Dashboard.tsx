import { useState, useEffect, useMemo, useCallback } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { formatEther, parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'
import { hashEmail } from '../lib/email'
import { EMAIL_VAULT_ABI, getEmailVaultAddress } from '../lib/emailVault'
import { publicClient, makeWalletClient } from '../lib/viemClients'
import { getPrivyUserEmail } from '../lib/privyUser'
import { sendDepositEmailNotification } from '../lib/notify'

// ─── helpers ──────────────────────────────────────────────────────────────
function fmt(wei: bigint) {
  const n = parseFloat(formatEther(wei))
  return n === 0 ? '0.0000' : n.toFixed(4)
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

    let value: bigint
    try { value = parseEther(amount as `${number}`) }
    catch { setStatus('Invalid ETH amount.'); setIsError(true); return }

    setLoading(true)
    try {
      const provider = await externalWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)
      const account = await getExternalAccount(provider)
      await ensureBaseSepolia(provider, walletClient)

      setStatus('Confirm in your wallet…')
      const hash = await (walletClient as any).writeContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'deposit',
        args: [emailHash as `0x${string}`],
        value,
        account,
      })
      setTxHash(hash)
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
                <h3>Deposit to your vault</h3>
                <p>Send ETH from your wallet into your hashcash vault.</p>
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
                    placeholder="0.001" value={amount} onChange={e => setAmount(e.target.value)} />
                  <span className="input-suffix">ETH</span>
                </div>
              </div>
            </div>
            {status && <div className={`modal-status${isError ? ' error' : ''}`}>{status}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={onDeposit} disabled={loading || !walletsReady}>
                {loading
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Confirming…</>
                  : 'Deposit ETH'}
              </button>
              <div className="modal-fineprint">ETH will be locked in the vault under your email hash.</div>
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
                <div className="row"><span className="k">Amount</span><span className="v"><b>{amount}</b> ETH</span></div>
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
// Uses Privy embedded wallet — gas sponsored by Privy, no popup
function SendModal({ open, fromEmailHash, balanceWei, privyWallet, onClose, onSuccess }: {
  open: boolean
  fromEmailHash: string
  balanceWei: bigint | null
  privyWallet: any
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
    if (balanceWei !== null) setAmount(formatEther(balanceWei))
  }

  async function onSend() {
    setStatus(''); setIsError(false)
    if (!toEmail.trim() || !amount.trim()) { setStatus('Please fill in all fields.'); setIsError(true); return }
    if (!privyWallet) { setStatus('Wallet not ready. Try signing out and back in.'); setIsError(true); return }

    let amountWei: bigint
    try { amountWei = parseEther(amount as `${number}`) }
    catch { setStatus('Invalid ETH amount.'); setIsError(true); return }

    if (balanceWei !== null && amountWei > balanceWei) {
      setStatus('Amount exceeds your vault balance.'); setIsError(true); return
    }

    setLoading(true)
    try {
      setStatus('Sending…')
      const provider = await privyWallet.getEthereumProvider()
      const walletClient = makeWalletClient(provider)
      const account = await getExternalAccount(provider)
      await ensureBaseSepolia(provider, walletClient)
      const hash = await (walletClient as any).writeContract({
        chain: baseSepolia,
        address: getEmailVaultAddress(),
        abi: EMAIL_VAULT_ABI,
        functionName: 'transfer',
        args: [fromEmailHash as `0x${string}`, toHash as `0x${string}`, amountWei],
        account,
      })
      setTxHash(hash)
      void sendDepositEmailNotification({ toEmail: toEmail.trim(), amountEth: amount.trim(), txHash: hash })
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
                <h3>Send ETH</h3>
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
                    placeholder="0.001" value={amount} onChange={e => setAmount(e.target.value)} />
                  <button className="input-max" onClick={fillMax}>Max</button>
                </div>
                {balanceWei !== null && (
                  <div className="field-hint">Available: <b style={{ color: 'var(--ink)' }}>{fmt(balanceWei)} ETH</b></div>
                )}
              </div>
            </div>
            {status && <div className={`modal-status${isError ? ' error' : ''}`}>{status}</div>}
            <div className="modal-foot">
              <button className="btn btn-primary btn-block" onClick={onSend} disabled={loading}>
                {loading
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Sending…</>
                  : 'Send ETH'}
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
                  <span className="v"><b>{amount}</b> ETH</span>
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
    if (balanceWei !== null) setAmount(formatEther(balanceWei))
  }

  async function onClaim() {
    setStatus(''); setIsError(false)
    if (!amount.trim()) { setStatus('Enter an amount.'); setIsError(true); return }
    if (!externalWallet) { setStatus('Connect MetaMask first.'); setIsError(true); return }

    let amountWei: bigint
    try { amountWei = parseEther(amount as `${number}`) }
    catch { setStatus('Invalid ETH amount.'); setIsError(true); return }

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

  const available = balanceWei !== null ? `${fmt(balanceWei)} ETH` : '—'

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
              : 'Claim ETH'}
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

  const privyWallet = walletsReady
    ? wallets?.find((w: any) => w?.walletClientType === 'privy' || w?.connectorType === 'embedded')
    : undefined

  const walletAddress: string = externalWallet?.address || ''

  const [balanceWei, setBalanceWei] = useState<bigint | null>(null)
  const [depositOpen, setDepositOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [claimOpen, setClaimOpen] = useState(false)
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)

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

  useEffect(() => { fetchBalance() }, [fetchBalance])

  const displayBalance = balanceWei !== null ? fmt(balanceWei) : '—'
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
            <div className="balance-label label-eyebrow">Your Vault Balance</div>
            <div className="balance-amount">
              <span className="num h-balance">{displayBalance}</span>
              {balanceWei !== null && <span className="unit">ETH</span>}
            </div>
            <div className="balance-usd">
              {balanceWei !== null ? `≈ $${(parseFloat(formatEther(balanceWei)) * 3500).toFixed(2)} USD` : ' '}
            </div>

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

          {/* Recent activity placeholder */}
          <div className="recent">
            <div className="recent-head">
              <span className="label-eyebrow">Recent activity</span>
              <button className="btn btn-ghost" style={{ height: 28, padding: '0 10px', fontSize: 12 }} onClick={fetchBalance}>
                Refresh ↻
              </button>
            </div>
            <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--mute)', fontSize: 13 }}>
              No transaction history — connect a subgraph to see past activity.
            </div>
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
        onSuccess={() => { setDepositOpen(false); fetchBalance() }}
      />
      <SendModal
        open={sendOpen}
        fromEmailHash={emailHash}
        balanceWei={balanceWei}
        privyWallet={privyWallet}
        onClose={() => setSendOpen(false)}
        onSuccess={() => { setSendOpen(false); fetchBalance() }}
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
        onSuccess={() => { setClaimOpen(false); fetchBalance() }}
      />
    </>
  )
}
