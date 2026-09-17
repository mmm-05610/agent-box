import { useMemo } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ComposerProfileState } from '@/lib/composer/types'

/** Access-mode chip: visible only when the service's config descriptor
 *  declares a permission-type enum control. The chip renders the declared
 *  values and lets the user override (per-turn) through the existing override
 *  seam. A harness with no permission control gets no chip — not a disabled
 *  placeholder. */
export function ComposerAccessChip({ profile }: { profile: ComposerProfileState }) {
  const permissionControl = useMemo(() => {
    const controls = profile.configDescriptor?.controls ?? []
    return controls.find(c => c.controlId === 'permission' || /permission/i.test(c.controlId)) ?? null
  }, [profile.configDescriptor])

  if (!permissionControl || !profile.onOverrideChange) {
    return null
  }

  const values = 'values' in permissionControl ? permissionControl.values : []
  const current = profile.overrides.find(o => o.controlId === permissionControl.controlId)?.value
  const currentStr = typeof current === 'string' && current ? current : undefined

  return (
    <Select
      onValueChange={next => {
        profile.onOverrideChange([
          ...profile.overrides.filter(o => o.controlId !== permissionControl.controlId),
          { controlId: permissionControl.controlId, value: next === '__none__' ? null : next }
        ])
      }}
      value={currentStr ?? '__none__'}
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
