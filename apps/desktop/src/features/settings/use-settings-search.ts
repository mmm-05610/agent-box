import { useI18n } from '@/i18n'
import { Palette } from '@/lib/icons'
import { TRANSLUCENCY_SUPPORTED } from '@/store/translucency'

import { APPEARANCE_SETTING_IDS, type SettingsSearchEntry } from './settings-search'

/**
 * Settings search is deliberately device-local until AgentBox exposes the
 * peripheral settings contracts. Querying legacy Hermes config, credentials,
 * plugins, or MCP here would make opening the palette a hidden production
 * fallback even though their visible settings pages have retired.
 */
export function useSettingsSearchCatalog(_enabled: boolean) {
  const { t } = useI18n()
  const appearanceContext = t.settings.sections.appearance
  const appearance = t.settings.appearance

  const appearanceEntries: SettingsSearchEntry[] = [
    {
      context: appearanceContext,
      description: t.language.description,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.language}`,
      keywords: ['locale'],
      label: t.language.label,
      target: { setting: APPEARANCE_SETTING_IDS.language, view: 'appearance' }
    },
    {
      context: appearanceContext,
      description: appearance.themeDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.theme}`,
      keywords: ['color mode', 'skin'],
      label: appearance.themeTitle,
      target: { setting: APPEARANCE_SETTING_IDS.theme, view: 'appearance' }
    },
    {
      context: appearanceContext,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.uiScale}`,
      keywords: ['zoom', 'size'],
      label: appearance.uiScaleTitle,
      target: { setting: APPEARANCE_SETTING_IDS.uiScale, view: 'appearance' }
    },
    ...(TRANSLUCENCY_SUPPORTED
      ? [
          {
            context: appearanceContext,
            description: appearance.translucencyDesc,
            icon: Palette,
            id: `setting:${APPEARANCE_SETTING_IDS.translucency}`,
            keywords: ['opacity', 'transparent'],
            label: appearance.translucencyTitle,
            target: { setting: APPEARANCE_SETTING_IDS.translucency, view: 'appearance' as const }
          }
        ]
      : []),
    {
      context: appearanceContext,
      description: appearance.userBubbleDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.userBubble}`,
      keywords: ['opacity', 'transparent', 'message', 'bubble'],
      label: appearance.userBubbleTitle,
      target: { setting: APPEARANCE_SETTING_IDS.userBubble, view: 'appearance' }
    },
    {
      context: appearanceContext,
      description: appearance.backdropDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.backdrop}`,
      keywords: ['background', 'blur'],
      label: appearance.backdropTitle,
      target: { setting: APPEARANCE_SETTING_IDS.backdrop, view: 'appearance' }
    },
    {
      context: appearanceContext,
      description: appearance.introSplashDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.introSplash}`,
      keywords: ['splash', 'wordmark', 'empty chat', 'new chat'],
      label: appearance.introSplashTitle,
      target: { setting: APPEARANCE_SETTING_IDS.introSplash, view: 'appearance' }
    },
    {
      context: appearanceContext,
      description: appearance.toolViewDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.toolView}`,
      keywords: ['tool display', 'technical'],
      label: appearance.toolViewTitle,
      target: { setting: APPEARANCE_SETTING_IDS.toolView, view: 'appearance' }
    },
    {
      context: appearanceContext,
      description: appearance.embedsDesc,
      icon: Palette,
      id: `setting:${APPEARANCE_SETTING_IDS.embeds}`,
      keywords: ['external content', 'privacy'],
      label: appearance.embedsTitle,
      target: { setting: APPEARANCE_SETTING_IDS.embeds, view: 'appearance' }
    }
  ]

  return {
    appearanceEntries,
    configEntries: [] as SettingsSearchEntry[],
    credentialEntries: [] as SettingsSearchEntry[],
    pluginEntries: [] as SettingsSearchEntry[]
  }
}
