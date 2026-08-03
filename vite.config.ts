import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
  define: mode === 'ehpk'
    ? { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.nobutv.org') }
    : undefined,
}))
