/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIVY_APP_ID?: string
  readonly VITE_BASE_RPC_URL?: string
  readonly VITE_EMAIL_VAULT_ADDRESS?: `0x${string}`
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

