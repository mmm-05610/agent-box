/**
 * i18n bootstrap — i18next + react-i18next.
 *
 * Default language is Chinese (zh); English is available via the settings
 * language switch. The chosen language is persisted in localStorage and
 * re-read on startup. "跟随系统 / Follow System" means we don't force a
 * language — i18next keeps its init default (zh).
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { zh } from './zh'
import { workbench } from './workbench'

export const LANG_KEY = 'agent-box-language'
export type UILanguage = 'zh' | 'en' | 'system'

/** Read the persisted UI language (safe outside the browser). */
export function readStoredLanguage(): UILanguage {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'zh' || saved === 'en' || saved === 'system') return saved
  } catch {
    // localStorage unavailable (SSR/tests) — fall back to default.
  }
  return 'system'
}

function initialLng(): string {
  return readStoredLanguage() === 'en' ? 'en' : 'zh'
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh, workbench },
    en: { translation: en, workbench },
  },
  lng: initialLng(),
  fallbackLng: 'zh',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
