import { defineConfig } from 'vite'

export default defineConfig({
  base: '/app/',
  server: { host: true, port: 5173 },
  build: { target: 'esnext' },
})
