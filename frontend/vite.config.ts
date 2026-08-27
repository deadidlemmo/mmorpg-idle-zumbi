import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

function validateProductionEndpoint(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`${name} deve estar definido para o build de producao.`)
  }

  const endpoint = new URL(value)
  const isLocalhost =
    endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1'

  if (endpoint.protocol !== 'https:' || isLocalhost) {
    throw new Error(
      `${name} deve usar um endpoint HTTPS publico no build de producao.`,
    )
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, '.', '')
  const hmrProtocol = env.VITE_HMR_PROTOCOL
  const hmrClientPort = Number(env.VITE_HMR_CLIENT_PORT)
  const hmr =
    hmrProtocol === 'ws' || hmrProtocol === 'wss'
      ? {
          protocol: hmrProtocol,
          clientPort: Number.isFinite(hmrClientPort)
            ? hmrClientPort
            : undefined,
        }
      : undefined

  if (command === 'build') {
    validateProductionEndpoint('VITE_API_URL', env.VITE_API_URL)
    validateProductionEndpoint('VITE_SOCKET_URL', env.VITE_SOCKET_URL)
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: ['localhost', '127.0.0.1', '.trycloudflare.com'],
      hmr,
    },
  }
})
