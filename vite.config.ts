import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { ENGINE_VERSION } from './src/engine/version'

export default defineConfig({
  plugins: [
    react(),
    // version.json rides next to the bundle so a running tab can ask "has an
    // engine-changing deploy landed since I loaded?" (src/lib/freshness.ts
    // fetches it no-store at the home screen). Emitted at build time from the
    // SAME constant the bundle compiles in — the two can never disagree.
    {
      name: 'emit-engine-version',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify({ engineVersion: ENGINE_VERSION }),
        })
      },
    },
  ],
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
