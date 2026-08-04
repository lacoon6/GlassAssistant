/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FAKE_DISCORD?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
