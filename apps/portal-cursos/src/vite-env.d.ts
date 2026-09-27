/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARARA_API_URL: string
  readonly VITE_ARARA_APP_SLUG: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
