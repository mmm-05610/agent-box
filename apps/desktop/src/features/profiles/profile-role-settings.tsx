import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n'

export type ProfileSettingsCopy = Translations['profiles']['roleSettings']

/**
 * P17, the client half of a service that does not exist yet (backend 60).
 *
 * Three things belong on the role surface TODAY, because they are decisions
 * rather than data, and getting them wrong is how the semantics drift:
 *
 *  1. **Ownership.** A session belongs to a WORKSPACE. A role is bound to a
 *     run; the binding can change, and changing it is an action on the SESSION,
 *     never a property the role owns. The surface states this instead of
 *     showing "this role's sessions".
 *  2. **The permission model.** Tool keys with ask/allow/deny and globs, last
 *     matching rule wins, presets that fill once and stay overridable, and
 *     `ask` meaning our approval round trip — all written down before there is
 *     anything to edit.
 *  3. **The consequences of a rebind or a clone**, stated BEFORE the action:
 *     same-family rebinds differ by family (file-journal families carry their
 *     native sessions; shared-DB families restart native continuity), a family
 *     change is clone-only, and session-class assets never migrate.
 *
 * What is NOT here is equally deliberate: no editable slot, switch or rule row,
 * because the service that would accept those edits has not declared them —
 * a control that cannot act is not shown (P16's rule).
 */
export function ProfileRoleSettings({ copy }: { copy: ProfileSettingsCopy }) {
  return (
    <section className="space-y-3" data-role-settings="">
      <div className="space-y-1">
        <div className="text-xs font-medium text-foreground">{copy.zonesTitle}</div>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground" data-role-zones="">
          {copy.zones.map(zone => (
            <li key={zone}>{zone}</li>
          ))}
        </ul>
        <p className="text-[0.6875rem] leading-4 text-muted-foreground" data-role-zones-pending="">
          {copy.zonesPending}
        </p>
      </div>

      <div className="space-y-1" data-session-ownership="">
        <div className="text-xs font-medium text-foreground">{copy.ownershipTitle}</div>
        <p className="text-xs text-muted-foreground">{copy.ownership}</p>
      </div>

      <div className="space-y-1" data-permission-model="">
        <div className="text-xs font-medium text-foreground">{copy.permissionsTitle}</div>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {copy.permissions.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <div className="space-y-1" data-rebind-consequences="">
        <div className="text-xs font-medium text-foreground">{copy.rebindTitle}</div>
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {copy.rebind.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Reusable in tests and by the surface that later gains the real controls. */
export function profileRoleSettingsCopy(copy: ProfileSettingsCopy): string[] {
  return [copy.ownership, copy.zonesPending, ...copy.permissions, ...copy.rebind]
}
