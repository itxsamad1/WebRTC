import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    https: true,
    host: true,    // expose on LAN so friends can connect
    port: 5173,
    proxy: {
      // Proxy WebSocket connections from the Vite HTTPS server → Node signaling server
      // changeOrigin: true is critical for external (phone) connections to work!
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
