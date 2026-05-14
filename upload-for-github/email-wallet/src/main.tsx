import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivyProvider } from '@privy-io/react-auth'
import { ErrorBoundary } from './ErrorBoundary'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {privyAppId ? (
      <ErrorBoundary>
        <PrivyProvider
          appId={privyAppId}
          config={{
            loginMethods: ['google', 'wallet'],
            appearance: {
              theme: 'light',
              accentColor: '#FF6B2B',
              logo: undefined,
              walletChainType: 'ethereum-only',
              walletList: ['metamask', 'coinbase_wallet', 'rainbow', 'wallet_connect', 'detected_ethereum_wallets'],
            },
          }}
        >
          <App />
        </PrivyProvider>
      </ErrorBoundary>
    ) : (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          color: 'white',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Noto Sans, Helvetica Neue, Arial, Apple Color Emoji, Segoe UI Emoji',
        }}
      >
        <div
          style={{
            maxWidth: 520,
            width: '100%',
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(0,0,0,0.25)',
            padding: 20,
          }}
        >
          <div style={{ opacity: 0.7, fontSize: 14 }}>設定錯誤</div>
          <div style={{ marginTop: 6, fontSize: 20, fontWeight: 650 }}>缺少 VITE_PRIVY_APP_ID</div>
          <div style={{ marginTop: 10, opacity: 0.8, fontSize: 14, lineHeight: 1.6 }}>
            請在 <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
              email-wallet/.env
            </span>{' '}
            設定 VITE_PRIVY_APP_ID，然後重開 dev server。
          </div>
        </div>
      </div>
    )}
  </StrictMode>,
)
