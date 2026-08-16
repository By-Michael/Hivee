import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // The whole app was shipping as one ~1.8MB JS file, so even a
        // resident just checking their balance downloaded and parsed the
        // charting library, exporters, etc. before the login page could
        // even render. Splitting heavy, rarely-changing libraries into
        // their own cacheable chunks means: (a) the browser can fetch them
        // in parallel with the app code instead of one giant serial blob,
        // and (b) they're cached across deploys as long as the library
        // version doesn't change, instead of being re-downloaded every
        // time any app code changes.
        manualChunks: {
          vendor_react: ['react', 'react-dom', 'react-router-dom'],
          vendor_charts: ['recharts'],
          vendor_icons: ['lucide-react'],
          vendor_utils: ['axios'],
        },
      },
    },
  },
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
