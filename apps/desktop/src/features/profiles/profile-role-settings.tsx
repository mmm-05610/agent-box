import { useState } from 'react'

import type { Translations } from '@/i18n'
import { cn } from '@/lib/utils'
import type { AssetBinding } from '@/types/wire/wire-v1'

import { profileBindingsOfKind, type ProfileMemoryView, type ProfilePermissionView } from './profile-read-facts'
import { roleSectionsFor } from './profile-slots'

/**
 * P17 (amended): the role surface is navigation + one section at a time, and
 * which sections exist is decided by the harness registry's declared slots —
 * never by hard-coding families. A dimension the registry does not declare is
 * still listed, but says "this harness does not support it" when opened, which
 * is G2's honest form. Sections whose records belong to later backend orders
 * (58/60) say editing waits for the service; they render no control that could
 * not save. What IS editable today (the model slot's controls, through the
 * descriptor editor) is passed in by the page as `modelEditor`.
 *
 * P21: the faces that HAVE landed render read-only facts instead of a promise.
 * The memory section is the sharpest case — it is in the nav only when the
 * service answered `available:true` for this role, because the service's own
 * registry declaration (not a client-side list) decides whether a family has
 * memory paths at all.
 */
export interface ProfileRoleSettingsProps {
  copy: Translations['profiles']['roleSettings']
  harness: string
  /** The role's display name (the header owns editing it). */
  displayName: string
  /** The live model-section editor (descriptor controls) or the summary. */
  modelEditor: React.ReactNode
  maintenanceAvailable: boolean
  /** Order 58: assets bound to this role (read-only, disabled ones included). */
  bindings?: readonly AssetBinding[]
  /** Order 63: null means "no section" — the service declared no memory paths,
   *  or has not answered yet. Never an empty partition. */
  memory?: null | ProfileMemoryView
  /** Order 60: the posture in force, with overridden rows marked. */
  permissions?: ProfilePermissionView
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

/** One bound asset: name, revision, and whether it is currently off. */
function BindingRow({ binding, copy }: { binding: AssetBinding; copy: Translations['profiles']['roleSettings'] }) {
  return (
    <li className="flex items-center gap-1.5 text-xs text-muted-foreground" data-role-binding={binding.assetId}>
      <span className="truncate text-foreground">{binding.name}</span>
      <span className="font-mono text-[0.6875rem]">{copy.bindingsRevision(binding.revision)}</span>
      {binding.enabled ? null : <span className="text-[0.6875rem] italic">{copy.bindingsDisabled}</span>}
    </li>
  )
}

export function ProfileRoleSettings({
  bindings = [],
  copy,
  displayName,
  harness,
  maintenanceAvailable,
  memory = null,
  modelEditor,
  permissions = { preset: null, rows: [] }
}: ProfileRoleSettingsProps) {
  const [selected, setSelected] = useState<string>('basics')
  const sections = roleSectionsFor(harness)
  const skillBindings = profileBindingsOfKind(bindings, 'skill')
  const mcpBindings = profileBindingsOfKind(bindings, 'mcp')

  const unsupported = (id: string) => !SECTIONS.slice(0, 2).includes(id as never) && !sections.includes(id)

  return (
    <div className="grid min-h-0 gap-3 md:grid-cols-[10rem_minmax(0,1fr)]" data-role-settings="">
      <nav aria-label={copy.roleNav.basics} className="flex flex-col gap-px" data-role-nav="">
        {[...SECTIONS, ...(memory ? (['memory'] as const) : [])].map(id => (
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
          <section className="space-y-1" data-role-section="skill">
            <div className="text-xs font-medium text-foreground">{copy.bindingsTitle}</div>
            {skillBindings.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-role-bindings="empty">{copy.bindingsEmpty}</p>
            ) : (
              <ul className="space-y-0.5" data-role-bindings="skill">
                {skillBindings.map(binding => (
                  <BindingRow binding={binding} copy={copy} key={binding.assetId} />
                ))}
              </ul>
            )}
            {/* Editing waits for the order that owns the write path; this
                section shows what is bound rather than a control that could
                not save (G3: read-only). */}
            <p className="text-xs text-muted-foreground" data-role-pending="skill">{copy.pendingSkill}</p>
          </section>
        )}
        {selected === 'mcp' && (
          <section className="space-y-1" data-role-section="mcp">
            <div className="text-xs font-medium text-foreground">{copy.bindingsTitle}</div>
            {mcpBindings.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-role-bindings="empty">{copy.bindingsEmpty}</p>
            ) : (
              <ul className="space-y-0.5" data-role-bindings="mcp">
                {mcpBindings.map(binding => (
                  <BindingRow binding={binding} copy={copy} key={binding.assetId} />
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground" data-role-pending="mcp">{copy.pendingMcp}</p>
          </section>
        )}
        {selected === 'memory' && memory && (
          <section className="space-y-1" data-role-section="memory">
            <div className="text-xs font-medium text-foreground">{copy.memoryTitle}</div>
            {memory.note ? <p className="text-xs text-muted-foreground">{memory.note}</p> : null}
            <ul className="space-y-0.5" data-role-memory="files">
              {memory.files.map(file => (
                <li className="text-xs" data-role-memory-file={file.path} key={file.path}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-[0.6875rem] text-foreground">{file.path}</span>
                    <span className="font-mono text-[0.625rem] text-muted-foreground">{file.size}</span>
                  </div>
                  {file.refusal ? (
                    <div className="text-[0.6875rem] italic text-muted-foreground" data-role-memory-refused="">
                      {copy.memoryRefused(file.refusal)}
                    </div>
                  ) : (
                    /* The file's own bytes, shown as they are — the service
                       decided they are safe to deliver. */
                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/30 p-1.5 text-[0.6875rem] text-muted-foreground">
                      {file.content}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {selected === 'permission' && (
          <section className="space-y-1" data-role-section="permission">
            <p className="text-xs text-muted-foreground" data-role-pending="permission">{copy.pendingPermission}</p>
            <div className="text-xs font-medium text-foreground">{copy.permissionsTitle}</div>
            <p className="text-xs text-muted-foreground" data-role-permission-preset={permissions.preset ?? ''}>
              {permissions.preset === null ? copy.permissionsPresetUnknown : copy.permissionsPreset(permissions.preset)}
            </p>
            {permissions.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-role-permission="empty">{copy.permissionsEmpty}</p>
            ) : (
              <ul className="space-y-0.5" data-role-permission="rules">
                {permissions.rows.map((rule, index) => (
                  <li
                    className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-muted-foreground"
                    key={`${rule.key}:${rule.pattern ?? ''}:${index}`}
                  >
                    <span className="text-foreground">{rule.key}</span>
                    <span className="truncate">{rule.pattern ?? copy.permissionsAnyTarget}</span>
                    <span>{rule.action}</span>
                    {rule.shadowed ? (
                      <span className="italic" data-role-permission-shadowed="">{copy.permissionsShadowed}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
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
