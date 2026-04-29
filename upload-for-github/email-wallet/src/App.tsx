import { LoginComponent } from './components/LoginComponent'
import { ReceiveUI } from './components/ReceiveUI'
import { SendUI } from './components/SendUI'
import { HashTransferUI } from './components/HashTransferUI'

function App() {
  return (
    <div className="min-h-dvh px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <div>
            <div className="text-sm text-white/60">Base Network</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">Email 錢包</div>
            <div className="mt-1 text-sm text-white/60">MVP：Google 登入 → Email Hash → 合約 deposit / 查餘額</div>
          </div>
        </header>

        <div className="grid gap-4">
          <LoginComponent />
          <SendUI />
          <HashTransferUI />
          <ReceiveUI />
        </div>

        <footer className="mt-6 text-center text-xs text-white/40">
          RPC：<span className="font-mono">{import.meta.env.VITE_BASE_RPC_URL || 'https://sepolia.base.org'}</span>
        </footer>
      </div>
    </div>
  )
}

export default App