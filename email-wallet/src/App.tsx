import { useEffect, useState } from 'react'
import { LoginComponent } from './components/LoginComponent'
import { ReceiveUI } from './components/ReceiveUI'
import { SendUI } from './components/SendUI'
import { HashTransferUI } from './components/HashTransferUI'
import { publicClient } from './lib/viemClients'
import { getEmailVaultAddress } from './lib/emailVault'

/**
 * 啟動時驗證 EmailVault 合約真的部署在 VITE_EMAIL_VAULT_ADDRESS。
 * 防呆 .env 設錯地址、合約被換鏈、或 deploy 失敗的情境。
 * 失敗 → 頂部紅 banner 警告，但不阻擋頁面渲染（DEMO 仍可看其他功能）。
 */
function useVaultHealth() {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const vault = getEmailVaultAddress()
    if (!vault || !/^0x[a-fA-F0-9]{40}$/.test(vault)) {
      setError('VITE_EMAIL_VAULT_ADDRESS 沒設或格式錯誤')
      return
    }
    ;(async () => {
      try {
        const code = await (publicClient as any).getBytecode({ address: vault })
        if (!code || code === '0x') {
          setError(`合約地址 ${vault} 在目前 RPC 上沒有部署的 bytecode — 可能 .env 寫錯、合約被換鏈、或 RPC 連錯網`)
        }
      } catch (e: any) {
        setError(`合約健康檢查失敗：${e?.shortMessage || e?.message || 'RPC error'}`)
      }
    })()
  }, [])
  return error
}

function App() {
  const vaultError = useVaultHealth()

  return (
    <div className="min-h-dvh px-4 pb-16 pt-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <div>
            <div className="text-sm text-white/60">Base Network</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight">Email 錢包</div>
            <div className="mt-1 text-sm text-white/60">MVP：Google 登入 → Email Hash → 合約 deposit / 查餘額</div>
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-100">
              ⚠️ Testnet (Base Sepolia) demo — 合約沒做 ownership 驗證，請勿存入真錢。
            </div>
          </div>
        </header>

        {vaultError && (
          <div className="mb-4 rounded-2xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
            <div className="font-semibold">合約健康檢查失敗</div>
            <div className="mt-1 break-all text-xs text-red-100/80">{vaultError}</div>
          </div>
        )}

        <div className="grid gap-4">
          <LoginComponent />
          <SendUI />
          <HashTransferUI />
          <ReceiveUI />
        </div>

        <footer className="mt-6 text-center text-xs text-white/40">
          RPC：<span className="font-mono">{import.meta.env.VITE_BASE_RPC_URL || 'https://sepolia.base.org'}</span>
          {' · '}
          <a
            className="underline"
            href={`https://sepolia.basescan.org/address/${getEmailVaultAddress()}`}
            target="_blank"
            rel="noreferrer"
          >
            Verify on Basescan ↗
          </a>
        </footer>
      </div>
    </div>
  )
}

export default App
