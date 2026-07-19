import { defineConfig } from 'vite'

/**
 * Bundles the pure game engine's replay module into a single ESM file the
 * Supabase edge function (Deno) imports. Run via `pnpm build:validator`
 * before `supabase functions deploy` — the output is generated, not committed.
 */
export default defineConfig({
  publicDir: false, // don't copy site icons into the function bundle
  build: {
    lib: {
      entry: 'src/engine/replay.ts',
      formats: ['es'],
      fileName: () => 'engine.mjs',
    },
    outDir: 'supabase/functions/submit-round',
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    sourcemap: false,
  },
})
