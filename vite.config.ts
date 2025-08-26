import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Backend alvo:
  // - Dev local: http://127.0.0.1:3006  (ou http://localhost:3006)
  // - Remoto:     https://intranet.grupocropfield.com.br (exemplo)
  const target = env.VITE_API_URL || 'http://127.0.0.1:3006'

  const commonProxyOpts = {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 30000,
    onError: (err: any, req: any, res: any) => {
      console.error('[VITE-PROXY] Error:', err?.code || err?.message)
    },
    onProxyReq: (proxyReq: any, req: any) => {
      // repassa cookies p/ manter sessão (JWT em cookie HttpOnly)
      if (req.headers.cookie) {
        proxyReq.setHeader('cookie', req.headers.cookie)
      }
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: true, // acessível na rede (0.0.0.0)
      watch: {
        ignored: ['**/data/**'], // evita travas em arquivos SQLite
      },
      hmr: {
        overlay: false,
      },
      proxy: {
        // API REST (ex.: /api/me, /api/mural/..., /api/reservas)
        '/api': { ...commonProxyOpts },

        // Fluxos de autenticação (Google + local)
        '/auth': { ...commonProxyOpts },

        // Alias: frontend antigo chamando /login-admin → novo /auth/local/login
        '/login-admin': {
          ...commonProxyOpts,
          rewrite: (p: string) => p.replace(/^\/login-admin$/, '/auth/local/login'),
        },

        // Alias: /logout → /auth/logout
        '/logout': {
          ...commonProxyOpts,
          rewrite: (p: string) => p.replace(/^\/logout$/, '/auth/logout'),
        },

        // Alias de health: /healthz → /health (só p/ testes)
        '/healthz': {
          ...commonProxyOpts,
          rewrite: (p: string) => p.replace(/^\/healthz$/, '/health'),
        },
      },
      // Se precisar HMR atravessando proxy/load balancer:
      // hmr: { clientPort: 5173 }
      // allowedHosts: ['localhost', '127.0.0.1']
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        onwarn: (warning, defaultHandler) => {
          if (warning.code === 'SOURCEMAP_ERROR') return
          defaultHandler(warning)
        }
      }
    }
  }
})
