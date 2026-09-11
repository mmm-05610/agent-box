/**
 * app/spellcheck.ts
 *
 * Point Chromium's spellchecker at the one language that best matches this
 * machine's locale, from the languages the build actually ships.
 *
 * Extracted from `main.ts` (E5b). Best-effort by design: a missing
 * `setSpellCheckerLanguages` (an older Electron, or a stripped build) must leave
 * spellchecking at its default rather than failing startup.
 */

import { app, session } from 'electron'

export interface SpellcheckDeps {
  log: (line: string) => void
}

export function configureSpellChecker(deps: SpellcheckDeps): void {
  try {
    const defaultSession = session.defaultSession

    if (!defaultSession || typeof defaultSession.setSpellCheckerLanguages !== 'function') {
      return
    }

    const available = defaultSession.availableSpellCheckerLanguages || []
    const locale = (app.getLocale && app.getLocale()) || 'en-US'
    const candidates = [locale, locale.split('-')[0], 'en-US', 'en']
    const chosen = candidates.find(lang => available.includes(lang)) || 'en-US'

    defaultSession.setSpellCheckerLanguages([chosen])
  } catch (error: any) {
    deps.log(`Spellchecker setup failed: ${error?.message || error}`)
  }
}
