import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { petOverlayWindowPort } from '@/app/composition/bridges/window-ports'
import { ThemeProvider } from '@/application/theme'
import { ErrorBoundary } from '@/components/error-boundary'
import { I18nProvider } from '@/i18n'

import { PetOverlayApp } from './pet-overlay-app'

/**
 * Boot the pet-overlay window. Loaded by the same bundle as the main app but
 * via `?win=overlay`, so it shares CSS/atoms while mounting a minimal, transparent
 * surface (no app shell, no router, no backend connection).
 *
 * This root is the window's composition entry: it assembles the providers and
 * the window-host port (from the shell's API, via the composition bridge) and
 * hands both to the host-neutral surface.
 *
 * The index.html boot script paints an OPAQUE themed background to avoid a flash
 * in normal windows; the overlay must be see-through, so we force every host
 * layer transparent with a late, high-specificity style tag.
 */
export function mountPetOverlay(): void {
  const style = document.createElement('style')
  style.textContent = 'html,body,#root{background:transparent !important;}'
  document.head.appendChild(style)

  const root = document.getElementById('root')

  if (!root) {
    return
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="pet-overlay">
        <ThemeProvider>
          {/* No locale persistence here: the overlay window has no backend
              connection to read the preference from, so the catalog default
              applies — unchanged from when this copy was inline. */}
          <I18nProvider localePreference={null}>
            <PetOverlayApp port={petOverlayWindowPort()} />
          </I18nProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
