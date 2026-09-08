import '@fontsource-variable/inter/wght.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')!

/**
 * One bundle, two apps. `/demo/store/*` is the customer-facing storefront the
 * recorder is pointed at (loaded inside an iframe on the dashboard's Demo
 * page, or in its own tab). Everything else is the analytics dashboard.
 */
if (location.pathname.startsWith('/demo/store')) {
  document.title = 'Northlight Supply'
  const [{ StoreApp }, { bootTracking }] = await Promise.all([import('./demo/StoreApp'), import('./demo/tracking')])
  // Start recording before the first render so the snapshot + React's mount
  // mutations are both part of the session.
  await bootTracking()
  createRoot(root).render(
    <StrictMode>
      <StoreApp />
    </StrictMode>,
  )
} else {
  const { App } = await import('./app/App')
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
