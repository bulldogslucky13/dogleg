import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the build works on any host (root domain, subdomain,
  // or a GitHub Pages sub-path) without configuration
  base: './',
  server: {
    port: 5173,
  },
})
