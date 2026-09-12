import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { quickEntryWindowPort } from '@/app/composition/bridges/window-ports'
import { ThemeProvider } from '@/application/theme'
import { ErrorBoundary } from '@/components/error-boundary'
import { I18nProvider } from '@/i18n'

import { QuickEntryApp } from './quick-entry-app'

/**
 * Boot the Quick Entry window. Loaded by the same bundle as the main app but via
 * `?win=quick`, so it shares CSS/theme tokens while mounting a minimal capture
 * surface (no app shell, no router, no backend connection).
 *
 * This root is the window's composition entry: it assembles the providers and
 * the window-host port (from the shell's API, via the composition bridge) and
 * hands both to the host-neutral surface.
 *
 * The index.html boot script paints an OPAQUE themed background to avoid a flash
 * in normal windows; this window is a floating card on a transparent backdrop,
 * so force the host layers see-through (same trick as the pet overlay).
 */
export function mountQuickEntry(): void {
  const style = document.createElement('style')
  style.textContent = 'html,body,#root{background:transparent !important;}'
  document.head.appendChild(style)

  const root = document.getElementById('root')

  if (!root) {
    return
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary label="quick-entry">
        <ThemeProvider>
          {/* No locale persistence here: the capture window has no backend
              connection to read the preference from, so the catalog default
              applies — unchanged from when this copy was inline. */}
          <I18nProvider localePreference={null}>
            <QuickEntryApp port={quickEntryWindowPort()} />
          </I18nProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
