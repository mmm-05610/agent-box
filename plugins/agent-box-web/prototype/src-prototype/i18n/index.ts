import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './locales/en'
import { zh } from './locales/zh'

export const PROTOTYPE_LANG_KEY = 'agent-box-prototype-language'
export type LanguageChoice = 'zh' | 'en' | 'system'
const systemLanguage = () => navigator.languages?.some((language) => language.toLowerCase().startsWith('en')) ? 'en' : 'zh'
export const savedChoice = (): LanguageChoice => {
  const value = localStorage.getItem(PROTOTYPE_LANG_KEY)
  return value === 'zh' || value === 'en' || value === 'system' ? value : 'system'
}
export const setPrototypeLanguage = (choice: LanguageChoice) => {
  localStorage.setItem(PROTOTYPE_LANG_KEY, choice)
  return i18n.changeLanguage(choice === 'system' ? systemLanguage() : choice)
}
i18n.use(initReactI18next).init({ resources: { zh, en }, lng: savedChoice() === 'system' ? systemLanguage() : savedChoice(), fallbackLng: 'zh', supportedLngs: ['zh', 'en'], interpolation: { escapeValue: false } })
export default i18n
