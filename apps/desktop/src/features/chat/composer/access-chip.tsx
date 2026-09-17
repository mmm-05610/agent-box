import { useMemo } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ComposerProfileState } from '@/lib/composer/types'
import type { ConfigControl } from '@/types/wire/wire-v1'

/** Access-mode chip: visible only when the service's config descriptor
 *  declares a permission-type enum control the user may actually override —
 *  an `editable: false` control or one listed in `securityLockedIds` is the
 *  service's fixed choice (core v1 §5: security limits cannot be overridden),
 *  and a non-enum permission control has no declared value set to present.
 *  The chip renders the declared values and lets the user override (per-turn)
 *  through the existing override seam. A harness with no overridable
 *  permission control gets no chip — not a disabled placeholder. */
export function ComposerAccessChip({ profile }: { profile: ComposerProfileState }) {
  const permissionControl = useMemo(() => {
    const descriptor = profile.configDescriptor
    const locked = new Set(descriptor?.securityLockedIds ?? [])

    return (
      descriptor?.controls.find(
        (c): c is Extract<ConfigControl, { kind: 'enum' }> =>
          c.kind === 'enum' && c.editable && !locked.has(c.controlId) && /permission/i.test(c.controlId)
      ) ?? null
    )
  }, [profile.configDescriptor])

  if (!permissionControl || !profile.onOverrideChange) {
    return null
  }

  const values = permissionControl.values
  const current = profile.overrides.find(o => o.controlId === permissionControl.controlId)?.value
  const currentStr = typeof current === 'string' && current ? current : undefined

  return (
    <Select
      onValueChange={next => {
        profile.onOverrideChange([
          ...profile.overrides.filter(o => o.controlId !== permissionControl.controlId),
          { controlId: permissionControl.controlId, value: next }
        ])
      }}
      value={currentStr}
    >
      <SelectTrigger aria-label="Access mode" className="h-7 min-w-0 max-w-32 gap-1 rounded-md px-2 text-xs">
        <SelectValue placeholder="Access mode" />
      </SelectTrigger>
      <SelectContent>
        {values.map(v => (
          <SelectItem key={v} value={v}>{v}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
