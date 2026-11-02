/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: string
  readonly VITE_ENABLE_DEMO_FLIGHTS?: string
  readonly VITE_ENABLE_PROVIDER_LOOKUP?: string
  readonly VITE_FLIGHT_PROXY_URL?: string
  readonly VITE_FLIGHT_PROVIDER_TIMEOUT_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
