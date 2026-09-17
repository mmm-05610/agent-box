import { useState } from 'react'

import { cn } from '@/lib/utils'

import { declaredSlots, roleSectionsFor } from './profile-slots'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n'

/**
 * P17 (amended): the role surface is navigation + one section at a time, and
 * which sections exist is decided by the harness registry's declared slots —
 * never by hard-coding families. A dimension the registry does not declare is
 * still listed, but says "this harness does not support it" when opened, which
 * is G2's honest form. Sections whose records belong to later backend orders
 * (58/60) say editing waits for the service; they render no control that could
 * not save. What IS editable today (the model slot's controls, through the
 * descriptor editor) is passed in by the page as `modelEditor`.
 */
export interface ProfileRoleSettingsProps {
  copy: Translations['profiles']['roleSettings']
  harness: string
  /** The role's display name (the header owns editing it). */
  displayName: string
  /** The live model-section editor (descriptor controls) or the summary. */
  modelEditor: React.ReactNode
  maintenanceAvailable: boolean
}

const SECTIONS = ['basics', 'harness', 'model', 'credentials', 'instruction', 'skill', 'mcp', 'permission'] as const

/** Registry-declared dimensions, in the nav's canonical order. */
const SLOT_OF: Partial<Record<(typeof SECTIONS)[number], 'provider' | 'permission' | 'instruction' | 'mcp' | 'skill'>> = {
  model: 'provider',
  instruction: 'instruction',
  skill: 'skill',
  mcp: 'mcp',
  permission: 'permission'
}

export function ProfileRoleSettings({ copy, displayName, harness, modelEditor, maintenanceAvailable }: ProfileRoleSettingsProps) {
  const [selected, setSelected] = useState<string>('basics')
  const sections = roleSectionsFor(harness)

  const unsupported = (id: string) => !SECTIONS.slice(0, 2).includes(id as never) && !sections.includes(id)

  return (
    <div className="grid min-h-0 gap-3 md:grid-cols-[10rem_minmax(0,1fr)]" data-role-settings="">
      <nav aria-label={copy.roleNav.basics} className="flex flex-col gap-px" data-role-nav="">
        {SECTIONS.map(id => (
          <button
            aria-current={selected === id || undefined}
            className={cn(
              'rounded-md px-2 py-1 text-left text-xs',
              selected === id ? 'bg-(--ui-row-active-background) text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            key={id}
            onClick={() => setSelected(id)}
            type="button"
          >
            {copy.roleNav[id as keyof typeof copy.roleNav]}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-3" data-role-panel={selected}>
        {selected === 'basics' && (
          <section className="space-y-1" data-role-section="basics">
            <div className="text-xs font-medium text-foreground">{displayName}</div>
            <p className="text-xs text-muted-foreground">{copy.ownership}</p>
          </section>
        )}
        {selected === 'harness' && (
          <section className="space-y-1" data-role-section="harness">
            <div className="text-xs text-muted-foreground">{harness}</div>
            {/* Family changes are clone-only (product decision); the copy below
                states both rebind consequences before any such action exists. */}
            <div className="text-xs font-medium text-foreground">{copy.rebindTitle}</div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {copy.rebind.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {selected === 'model' && (
          <section data-role-section="model">
            {maintenanceAvailable ? (
              modelEditor
            ) : (
              <p className="text-xs text-muted-foreground" data-role-pending="">{copy.pendingRecords}</p>
            )}
          </section>
        )}
        {selected === 'credentials' && (
          <p className="text-xs text-muted-foreground" data-role-section="credentials">{copy.credentialsNote}</p>
        )}
        {selected === 'instruction' && (
          <p className="text-xs text-muted-foreground" data-role-pending="instruction">{copy.pendingInstruction}</p>
        )}
        {selected === 'skill' && (
          <p className="text-xs text-muted-foreground" data-role-pending="skill">{copy.pendingSkill}</p>
        )}
        {selected === 'mcp' && (
          <p className="text-xs text-muted-foreground" data-role-pending="mcp">{copy.pendingMcp}</p>
        )}
        {selected === 'permission' && (
          <section className="space-y-1" data-role-section="permission">
            <p className="text-xs text-muted-foreground">{copy.pendingPermission}</p>
            <div className="text-xs font-medium text-foreground">{copy.permissionsTitle}</div>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {copy.permissions.map(rule => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
