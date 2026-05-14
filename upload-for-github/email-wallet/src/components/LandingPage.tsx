import { usePrivy } from '@privy-io/react-auth'

const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" width="13" height="13" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
  </svg>
)

export function LandingPage() {
  const { login } = usePrivy()

  return (
    <>
      {/* ── Nav ── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark" />
            <span>hashcash</span>
          </div>
          <div className="nav-links">
            <a className="nav-link" href="#features">Features</a>
            <a className="nav-link" href="#how">How it works</a>
          </div>
          <div className="nav-right">
            <button className="btn btn-ghost" onClick={login}>Sign in</button>
            <button className="btn btn-primary btn-sm" onClick={login}>
              <span className="g-mark" style={{ width: 18, height: 18, marginLeft: -4 }}>
                <GoogleIcon />
              </span>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="hero-orb" />
        <div className="hero-orb-2" />
        <div className="hero-inner">
          <div>
            <div className="hero-eyebrow">
              <span className="hero-eyebrow-dot" />
              Live on
              <span className="mono" style={{ fontSize: 12, color: 'var(--mute)' }}>Base Sepolia</span>
            </div>
            <h1 className="hero-headline h-display">
              Send crypto to anyone.<br />Just their <span className="accent">email.</span>
            </h1>
            <p className="hero-sub">
              hashcash is a non-custodial vault on Base. Deposit ETH to any email address — recipients claim instantly with Google, no seed phrase or wallet required.
            </p>
            <div className="hero-cta-row">
              <button className="btn btn-google" onClick={login}>
                <span className="g-mark"><GoogleIcon /></span>
                Get Started with Google
              </button>
              <button className="btn btn-ghost" style={{ height: 52, padding: '0 22px', fontSize: 15 }}>
                Read the docs
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
              </button>
            </div>
            <div className="hero-meta">
              <div className="hero-meta-item"><span className="check-ic">✓</span> Non-custodial</div>
              <div className="hero-meta-item"><span className="check-ic">✓</span> Audited contract</div>
              <div className="hero-meta-item"><span className="check-ic">✓</span> No gas to claim</div>
            </div>
          </div>

          {/* Hero art */}
          <div className="hero-art" aria-hidden="true">
            <svg className="route-line" viewBox="0 0 520 520" preserveAspectRatio="none">
              <defs>
                <pattern id="dot-grid" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#E8E6E1" />
                </pattern>
              </defs>
              <rect width="520" height="520" fill="url(#dot-grid)" opacity="0.6" />
              <path d="M 130 110 C 200 240, 320 280, 400 410" stroke="#FF6B2B" strokeWidth="1.5" strokeDasharray="4 6" fill="none" opacity="0.55" />
            </svg>

            <div className="env-card env-card-1">
              <div className="env-header">
                <span>Outgoing</span>
                <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 9999, fontSize: 10 }}>DRAFT</span>
              </div>
              <div className="env-body">
                <div className="env-to">To</div>
                <div className="env-email">alex@gmail.com</div>
                <div className="env-amount">
                  <span className="num">0.025</span>
                  <span className="unit">ETH</span>
                </div>
                <div className="env-usd">≈ $87.50 USD</div>
              </div>
            </div>

            <div className="env-card env-card-3">
              <div className="env-header" style={{ border: 0 }}>
                <span>In transit</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>0x3a4e…f91c</span>
              </div>
            </div>

            <div className="env-card env-card-2">
              <div className="env-header">
                <span>Inbox</span>
                <span style={{ background: 'var(--success-soft)', color: 'var(--success)', padding: '2px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 600 }}>CLAIMED</span>
              </div>
              <div className="env-body">
                <div className="env-to">From</div>
                <div className="env-email">ryan@gmail.com</div>
                <div className="env-amount">
                  <span className="num">0.025</span>
                  <span className="unit">ETH</span>
                </div>
                <div className="env-status"><span className="dot" />Confirmed · 12s</div>
              </div>
            </div>

            <div className="eth-coin">
              <svg viewBox="0 0 256 417" xmlns="http://www.w3.org/2000/svg">
                <path fill="#fff" d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z"/>
                <path fill="#fff" fillOpacity="0.7" d="M127.962 0L0 212.32l127.962 75.639V154.158z"/>
                <path fill="#fff" d="M127.961 312.187l-1.575 1.92v98.199l1.575 4.6L256 236.587z"/>
                <path fill="#fff" fillOpacity="0.7" d="M127.962 416.905v-104.72L0 236.585z"/>
                <path fill="#fff" fillOpacity="0.5" d="M127.961 287.958l127.96-75.637L127.961 154.16z"/>
                <path fill="#fff" fillOpacity="0.9" d="M0 212.32l127.96 75.638v-133.8z"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="features" id="features">
        <div className="features-inner">
          <div className="features-head">
            <h2 className="h-section">Crypto, sent like email.</h2>
            <p>Three primitives. Zero seed phrases. Designed for the 99% of people who have never opened MetaMask.</p>
          </div>
          <div className="feature-grid">
            <div className="feature-card">
              <div className="feature-num">01</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
              </div>
              <h3 className="feature-title">Send via email</h3>
              <p className="feature-desc">Type any email address and an amount of ETH. Funds are locked in a vault contract, indexed by a hash of the recipient's email.</p>
              <div className="spacer" />
            </div>
            <div className="feature-card">
              <div className="feature-num">02</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
              </div>
              <h3 className="feature-title">No wallet to receive</h3>
              <p className="feature-desc">Recipients click the email link and sign in with Google. We derive a smart account on Base in the background — they never touch a seed phrase.</p>
              <div className="spacer" />
            </div>
            <div className="feature-card">
              <div className="feature-num">03</div>
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 4.5 12.5h6L11 22l8.5-10.5h-6z"/></svg>
              </div>
              <h3 className="feature-title">Built on Base</h3>
              <p className="feature-desc">Coinbase's Layer 2 means sub-cent gas and one-second finality. Transfers feel instant, and stay verifiable on-chain.</p>
              <div className="spacer" />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="how" id="how">
        <div className="how-inner">
          <div className="features-head" style={{ marginBottom: 0 }}>
            <h2 className="h-section">Four steps. About ten seconds.</h2>
            <p>From login to received funds — the whole flow runs on a single smart contract.</p>
          </div>
          <div className="how-grid">
            {[
              { n: '01', title: 'Sign in with Google', desc: 'Your account is bound to an email identity on Base. No extension, no seed phrase.' },
              { n: '02', title: 'Deposit to an email', desc: 'Pick a recipient and an amount. We compute a keccak hash of their email and lock funds against it.' },
              { n: '03', title: 'They get an email', desc: 'A claim link drops in their inbox. Anyone with that email can authorize the withdrawal.' },
              { n: '04', title: 'Claim to any wallet', desc: 'The recipient sweeps funds to MetaMask, Coinbase Wallet, or keeps them in hashcash.' },
            ].map(({ n, title, desc }) => (
              <div className="how-step" key={n}>
                <div className="step-no">STEP {n}</div>
                <h4>{title}</h4>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA strip ── */}
      <section>
        <div className="cta-strip">
          <div>
            <h3>Stop asking for wallet addresses.</h3>
            <p>Open hashcash, send to an email, and get back to your day.</p>
          </div>
          <div className="cta-strip-right">
            <button className="btn btn-google" onClick={login}>
              <span className="g-mark"><GoogleIcon /></span>
              Get Started with Google
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" />
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>hashcash</span>
            <span style={{ color: 'var(--mute)', marginLeft: 8 }}>© 2026</span>
          </div>
          <div className="footer-links">
            <a href="#">Docs</a>
            <a href="#">Contract</a>
            <a href="#">Security</a>
            <a href="#">Privacy</a>
          </div>
        </div>
      </footer>
    </>
  )
}
