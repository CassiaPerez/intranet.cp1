import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Altere conforme o ambiente:
  // - Dev local: http://127.0.0.1:3006
  // - StackBlitz/Remoto: https://intranet.grupocropfield.com.br
  const target = env.VITE_API_URL || 'http://127.0.0.1:3006'

  return {
    plugins: [react()],
    server: {
      port: 0,
      strictPort: false,
      host: true, // acessível pela rede/StackBlitz
      watch: {
        ignored: ['**/data/**'], // Ignore database files to prevent EIO errors
      },
      hmr: {
        overlay: false, // Disable error overlay that can cause crashes
      },
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          timeout: 30000,
          onError: (err, req, res) => {
            console.error('[VITE-PROXY] Proxy error:', err.message);
          },
          onProxyReq: (proxyReq, req, res) => {
            console.log('[VITE-PROXY] Request:', req.method, req.url);
           // Forward authentication cookies
           if (req.headers.cookie) {
             proxyReq.setHeader('cookie', req.headers.cookie);
           }
          }
          // Se seu backend NÃO usa prefixo /api, descomente:
          // rewrite: p => p.replace(/^\/api/, ''),
        },
        '/auth': {
          target,
          changeOrigin: true,
          secure: false,
          timeout: 30000,
          onProxyReq: (proxyReq, req, res) => {
            // Forward authentication cookies for auth routes
            if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
          },
        },
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        onwarn: (warning, defaultHandler) => {
          // Suppress certain warnings that can cause build issues
          if (warning.code === 'SOURCEMAP_ERROR') {
            return;
          }
          defaultHandler(warning);
        }
      }
    }
  }
})
