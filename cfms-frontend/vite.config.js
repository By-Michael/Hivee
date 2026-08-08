import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Hot Module Reload: every file edit pushes instantly with no full
    // page reload, so the UI always feels "live". Polling is enabled so
    // this also works reliably in Docker / networked-filesystem setups
    // where native fs events can be missed.
    watch: {
      usePolling: true,
      interval: 300,
    },
    hmr: {
      overlay: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
