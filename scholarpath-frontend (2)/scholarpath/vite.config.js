import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Disable proxy buffering for streaming endpoints (chat)
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, req, res) => {
            // Forward streaming headers immediately
            if (req.url === '/api/chat') {
              res.flushHeaders?.();
            }
          });
        },
      },
    },
  },
})
