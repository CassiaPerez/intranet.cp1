import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 🔧 Padronize em localhost para evitar mismatch de cookies
  const target = env.VITE_API_URL || 'http://localhost:3006'

  const commonProxyOpts = {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 30000,
    onError: (err: any) => {
      console.error('[VITE-PROXY] Error:', err?.code || err?.message)
    },
    onProxyReq: (proxyReq: any, req: any) => {
      // Opcional — em geral nem precisa, mas não atrapalha:
      if (req.headers.cookie) proxyReq.setHeader('cookie', req.headers.cookie)
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: true, // 0.0.0.0
      watch: { ignored: ['**/data/**'] },
      hmr: { overlay: false },
      proxy: {
        // REST
        '/api': { ...commonProxyOpts },

        // Autenticação (Google + logout)
        '/auth': { ...commonProxyOpts },

        // ✅ Login admin: backend expõe /login-admin (sem rewrite)
        '/login-admin': { ...commonProxyOpts },

        // ✅ Alias opcional: /logout → /auth/logout (ok manter)
        '/logout': {
          ...commonProxyOpts,
          rewrite: (p: string) => p.replace(/^\/logout$/, '/auth/logout'),
        },

        // ✅ Health: backend já usa /healthz (sem rewrite)
        '/healthz': { ...commonProxyOpts },
      },
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
