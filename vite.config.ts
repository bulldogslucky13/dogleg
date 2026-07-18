import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the build works on any host (root domain, subdomain,
  // or a GitHub Pages sub-path) without configuration
  base: './',
  server: {
    port: 5173,
  },
  test: {
    // git worktrees live under .claude/worktrees; without this vitest scans
    // their copies of the suite and runs every test twice
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
