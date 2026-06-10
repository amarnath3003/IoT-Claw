import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/hls':     { target: 'http://localhost:8000', changeOrigin: true },
      '/cameras': { target: 'http://localhost:8000', changeOrigin: true },
      '/devices': { target: 'http://localhost:8000', changeOrigin: true },
    }
  }
})