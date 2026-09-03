import type { AbstractIntlMessages } from "next-intl"
import enMessages from "@/i18n/messages/en.json"
import type { AppLocale } from "@/lib/types"

const MESSAGE_CACHE = new Map<AppLocale, AbstractIntlMessages>([
  ["en", enMessages],
])

async function loadMessages(locale: AppLocale): Promise<AbstractIntlMessages> {
  switch (locale) {
    case "zh_cn":
      return (await import("@/i18n/messages/zh-CN.json")).default
    case "en":
    default:
      return enMessages
  }
}

export function getFallbackMessages(): AbstractIntlMessages {
  return enMessages
}

export async function getMessagesForLocale(
  locale: AppLocale
): Promise<AbstractIntlMessages> {
  const cached = MESSAGE_CACHE.get(locale)
  if (cached) return cached

  const messages = await loadMessages(locale)
  MESSAGE_CACHE.set(locale, messages)
  return messages
}
