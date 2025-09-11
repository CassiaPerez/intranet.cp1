import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // API target configuration
  const target = env.VITE_API_URL || 'http://localhost:3006'
  
  console.log(`[VITE] Proxy target: ${target}`)
  console.log(`[VITE] Mode: ${mode}`)

  const commonProxyOpts = {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 60000, // Increased timeout
    followRedirects: true,
    onError: (err: any) => {
      console.error('[VITE-PROXY] Error:', err?.code || err?.message || err)
    },
    onProxyReq: (proxyReq: any, req: any) => {
      // Forward cookies properly
      if (req.headers.cookie) {
        proxyReq.setHeader('cookie', req.headers.cookie)
      }
      console.log(`[VITE-PROXY] ${req.method} ${req.url} -> ${proxyReq.getHeader('host')}${req.url}`)
    },
    onProxyRes: (proxyRes: any, req: any) => {
      // Log response for debugging
      console.log(`[VITE-PROXY] ${req.method} ${req.url} <- ${proxyRes.statusCode}`)
      
      // Handle redirects properly
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
        const location = proxyRes.headers.location;
        if (location) {
          console.log(`[VITE-PROXY] Redirect to: ${location}`)
        }
      }
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      watch: { ignored: ['**/data/**'] },
      hmr: { overlay: false },
      proxy: {
        // REST
        '/api': { 
          ...commonProxyOpts,
          // Don't rewrite API paths
        },

        // Autenticação (Google + logout)
        '/auth': { 
          ...commonProxyOpts,
          // Don't rewrite auth paths
        },

        // Login admin endpoint
        '/login-admin': { ...commonProxyOpts },

        // Health check endpoints
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
