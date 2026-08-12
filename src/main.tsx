import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAnalytics } from './lib/analytics'
import { handoffPending, runHandoff } from './lib/handoff'
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
// the paper play/pick screens lean on 800/900 for kickers and headline
// numerals — without these files the browser fakes them from 700
import '@fontsource/barlow/800.css'
import '@fontsource/barlow/900.css'
import './styles.css'
import './ui/theme.css'
import './ui/broadcast.css'

initAnalytics()

const mount = () =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

// A #handoff= link carries a clubhouse over from the old domain (see
// lib/handoff.ts). It has to land BEFORE the app boots: a frame rendered as
// the wrong player is bad enough, but ensureIdentity would also mint a
// competing anonymous id in the meantime. Costs one regex when absent, which
// is every load but the one.
if (handoffPending()) void runHandoff().finally(mount)
else mount()
