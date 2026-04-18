/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string
  readonly VITE_CONVEX_SITE_URL?: string
  readonly VITE_STADIA_MAPS_API_KEY?: string
  readonly VITE_STADIA_STYLE_ID?: string
  readonly VITE_MAP_STYLE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
