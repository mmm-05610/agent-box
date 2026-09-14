import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { useI18n } from '@/i18n'
import { Archive, Cpu, Package, Users, Wrench } from '@/lib/icons'

import type { ProductSettingsView } from './settings-navigation'

const PRODUCT_ICONS = {
  data: Archive,
  harnesses: Wrench,
  identities: Users,
  models: Cpu,
  resources: Package
} as const

export function ProductSettings({ view }: { view: ProductSettingsView }) {
  const copy = useI18n().t.settings.product
  const section = copy[view]

  return (
    <SettingsContent>
      <SettingsSection aside={<Pill tone="warn">{copy.unavailable}</Pill>} icon={PRODUCT_ICONS[view]} title={section.title}>
        <ListRow description={section.description} title={copy.scope} wide />
        <ListRow description={section.boundary} title={copy.boundary} wide />
      </SettingsSection>
      <p className="max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {copy.unavailableDescription}
      </p>
    </SettingsContent>
  )
}
