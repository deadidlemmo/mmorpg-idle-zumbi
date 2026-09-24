import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type HttpProxy, type ProxyOptions } from 'vite'

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

function createLocalBackendProxy(): ProxyOptions {
  return {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
    secure: false,
    ws: true,
    configure(proxy: HttpProxy.ProxyServer) {
      const removeOrigin = (request: { removeHeader: (name: string) => void }) => {
        request.removeHeader('origin')
      }

      proxy.on('proxyReq', removeOrigin)
      proxy.on('proxyReqWs', removeOrigin)
    },
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
      proxy:
        command === 'serve'
          ? {
              '/api': {
                ...createLocalBackendProxy(),
                rewrite: (path) => path.replace(/^\/api/, ''),
              },
              '/socket.io': createLocalBackendProxy(),
            }
          : undefined,
    },
  }
})
