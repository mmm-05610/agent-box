import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { useI18n } from '@/i18n'
import { Archive, Cpu, Package, Users, Wrench, Zap } from '@/lib/icons'

import { AgentBoxAccounts } from './agentbox-accounts'
import { AgentBoxAssetHub } from './agentbox-asset-hub'
import { AgentBoxHookSettings } from './agentbox-hook-settings'
import { AgentBoxModelSettings } from './agentbox-model-settings'
import type { ProductSettingsView } from './settings-navigation'

const PRODUCT_ICONS = {
  data: Archive,
  harnesses: Wrench,
  hooks: Zap,
  identities: Users,
  models: Cpu,
  resources: Package
} as const

export function ProductSettings({ view }: { view: ProductSettingsView }) {
  const copy = useI18n().t.settings.product

  if (view === 'models') {
    return <AgentBoxModelSettings />
  }

  // P22: three of these views stopped being "the fields this will carry" and
  // became the faces themselves — the catalogue and its writes (58/59), the
  // managed accounts (56) and the hook ledger (59). What is left below is the
  // pair that genuinely has no service surface yet.
  if (view === 'resources') {
    return <AgentBoxAssetHub />
  }

  if (view === 'hooks') {
    return <AgentBoxHookSettings />
  }

  if (view === 'identities') {
    return <AgentBoxAccounts />
  }

  const section = copy[view]

  return (
    <SettingsContent>
      <SettingsSection
        aside={<Pill tone="warn">{copy.unavailable}</Pill>}
        icon={PRODUCT_ICONS[view]}
        title={section.title}
      >
        <ListRow description={section.description} title={copy.scope} wide />
        <ListRow description={section.boundary} title={copy.boundary} wide />
        {view === 'harnesses' && (
          /* P13's directory and version facts belong to the service (57). What
             this surface owes the user meanwhile is the shape of the answer,
             named, and an explicit statement that nothing is being guessed in
             its place — no row, no version, no size, no update badge, and no
             install/rollback button that could not run. */
          <div className="space-y-2 px-3 py-2 text-xs text-muted-foreground" data-harness-program-plan="">
            <div>{copy.harnesses.fieldsPending}</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {copy.harnesses.programFields.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
            <div data-harness-version-next-turn="">{copy.harnesses.nextTurn}</div>
          </div>
        )}
      </SettingsSection>
      <p className="max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {copy.unavailableDescription}
      </p>
    </SettingsContent>
  )
}
