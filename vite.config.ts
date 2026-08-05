import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
  define: mode === 'simulator'
    ? { 'import.meta.env.VITE_API_URL': JSON.stringify(''), 'import.meta.env.VITE_FAKE_DISCORD': JSON.stringify('true') }
    : { 'import.meta.env.VITE_API_URL': JSON.stringify('https://api.nobutv.org'), 'import.meta.env.VITE_FAKE_DISCORD': JSON.stringify('false') },
}))
