import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const hmrProtocol = process.env.VITE_HMR_PROTOCOL
const hmrClientPort = Number(process.env.VITE_HMR_CLIENT_PORT)
const hmr =
  hmrProtocol === 'ws' || hmrProtocol === 'wss'
    ? {
        protocol: hmrProtocol,
        clientPort: Number.isFinite(hmrClientPort)
          ? hmrClientPort
          : undefined,
      }
    : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com',
    ],
    hmr,
  },
})
