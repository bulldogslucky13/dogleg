import { defineConfig } from 'vite'

/**
 * Bundles the marketing-page generator (scripts/pages-entry.tsx) into a
 * runnable node script. Needed because the generator renders real app
 * components (HoleMap, Wordmark) — JSX node can't strip — same reason
 * vite.validator.config.ts exists for the edge function. Output is generated
 * (scripts-dist/, gitignored), never committed; `pnpm gen:pages` builds and
 * runs it in one go.
 */
export default defineConfig({
  publicDir: false,
  esbuild: { jsx: 'automatic' },
  build: {
    ssr: 'scripts/pages-entry.tsx',
    outDir: 'scripts-dist',
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    sourcemap: false,
    rollupOptions: {
      output: { entryFileNames: 'gen-pages.mjs' },
    },
  },
})
