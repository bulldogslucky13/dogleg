/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string
  /** Pinterest conversion tag id — unset means the tag never loads */
  readonly VITE_PINTEREST_TAG_ID?: string
}
