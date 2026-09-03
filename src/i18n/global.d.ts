import type enMessages from "@/i18n/messages/en.json"

declare module "next-intl" {
  interface AppConfig {
    Locale: "en" | "zh-CN"
    Messages: typeof enMessages
  }
}
