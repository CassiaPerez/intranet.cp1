import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // API target configuration - production vs development
  const target = mode === 'production' 
    ? 'https://intranet.cropfield.com.br'
    : (env.VITE_API_URL || 'http://localhost:3006')
  
  console.log(`[VITE] Proxy target: ${target}`)

  const commonProxyOpts = {
    target,
    changeOrigin: true,
    secure: false,
    timeout: 60000, // Increased timeout
    followRedirects: true,
    ws: true, // Enable WebSocket proxying
    configure: (proxy, options) => {
      proxy.on('error', (err) => {
        console.error('[VITE-PROXY] Proxy error:', err?.code || err?.message || err)
      })
      proxy.on('proxyReq', (proxyReq, req, res) => {
        console.log(`[VITE-PROXY] → ${req.method} ${req.url}`)
      })
      proxy.on('proxyRes', (proxyRes, req, res) => {
        console.log(`[VITE-PROXY] ← ${req.method} ${req.url} [${proxyRes.statusCode}]`)
      })
    },
    onError: (err: any) => {
      console.error('[VITE-PROXY] Error:', err?.code || err?.message || err)
    },
    onProxyReq: (proxyReq: any, req: any) => {
      // Forward cookies properly
      if (req.headers.cookie) {
        proxyReq.setHeader('cookie', req.headers.cookie)
      }
      
      // Forward authorization headers
      if (req.headers.authorization) {
        proxyReq.setHeader('authorization', req.headers.authorization)
      }
    },
    onProxyRes: (proxyRes: any, req: any) => {
      // Handle redirects properly
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400) {
        const location = proxyRes.headers.location;
        if (location) {
          console.log(`[VITE-PROXY] Redirect to: ${location}`)
        }
      }
      
      // Handle cookies properly
      if (proxyRes.headers['set-cookie']) {
        console.log(`[VITE-PROXY] Setting cookies from backend`)
      }
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: false,
      host: '0.0.0.0',
      watch: { ignored: ['**/data/**'] },
      hmr: { overlay: false },
      proxy: {
        // REST
        '/api': { 
          ...commonProxyOpts,
        },

        // Autenticação (Google + logout)
        '/auth': { 
          ...commonProxyOpts,
        },

        // Health check endpoints
        '/healthz': { ...commonProxyOpts },
      },
    },
    build: {
      sourcemap: true,
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: { // Merged duplicate rollupOptions
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            calendar: ['@fullcalendar/react', '@fullcalendar/daygrid', '@fullcalendar/timegrid'],
            utils: ['date-fns', 'lucide-react']
          }
        },
        onwarn: (warning, defaultHandler) => {
          if (warning.code === 'SOURCEMAP_ERROR') return
          defaultHandler(warning)
        }
      }
    }
  }
})
