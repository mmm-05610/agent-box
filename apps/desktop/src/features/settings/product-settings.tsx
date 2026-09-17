import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { useI18n } from '@/i18n'
import { Archive, Cpu, Package, Zap, Users, Wrench } from '@/lib/icons'

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
        {view === 'hooks' && (
          /* P16: the hook model lives in the service (59) — per-family schema,
             storage, materialization and the trigger ledger. Until it declares
             them this surface names each family's real shape, states what is
             missing, and renders NOTHING that could be pressed: a read-only
             shell here would be a dead control, and the order's top discipline
             is that a control which cannot act is not shown at all. */
          <div className="space-y-3 px-3 py-2 text-xs text-muted-foreground" data-hook-plan="">
            <div>{copy.hooks.familiesPending}</div>
            <ul className="list-disc space-y-0.5 pl-4" data-hook-families="">
              {copy.hooks.families.map(family => (
                <li key={family}>{family}</li>
              ))}
            </ul>
            <div data-hook-safety="">{copy.hooks.safety}</div>
            <div className="space-y-1" data-hook-ledger="">
              <ul className="list-disc space-y-0.5 pl-4">
                {copy.hooks.ledgerFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {view === 'resources' && (
          /* P15-B/C: the skill library and the MCP server list belong to the
             service (58). Until it declares them, the surface names the fields
             of each list and says outright that nothing is being guessed: no
             installed state, no digest, no update badge, no credential VALUE,
             no test button that could not run — and the per-profile enablement
             rule stated before it can ever be used. */
          <div className="space-y-3 px-3 py-2 text-xs text-muted-foreground" data-skill-mcp-plan="">
            <div className="space-y-1" data-skill-plan="">
              <div>{copy.resources.skillPending}</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {copy.resources.skillFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1" data-mcp-plan="">
              <div>{copy.resources.mcpPending}</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {copy.resources.mcpFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
            <div data-resource-enablement-rule="">{copy.resources.enablement}</div>
          </div>
        )}
      </SettingsSection>
      <p className="max-w-2xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {copy.unavailableDescription}
      </p>
    </SettingsContent>
  )
}
