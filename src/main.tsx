import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import 'maplibre-gl/dist/maplibre-gl.css'
import { router } from './app/router.tsx'
import { AppProviders } from './lib/convex.tsx'
import './styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
