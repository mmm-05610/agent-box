import type { AssetBinding, PermissionRule, ProfileMemory, ProfileRecord } from '@/types/wire/wire-v1'

/**
 * P21 (orders 58/60/63): the role page's read-only facts → what the sections
 * may show. Pure, so the honesty rules are testable without a renderer:
 * a family that declares no memory paths draws NO section, a refused file
 * shows its reason and no content, and a rule row that a later rule overrides
 * says so instead of pretending to be in force.
 */

export interface ProfileMemoryFileView {
  /** Present when the file's bytes were delivered; null when refused. */
  content: null | string
  path: string
  /** The typed refusal (`MEMORY_CONTAINS_SECRET`), or null. */
  refusal: null | string
  size: number
}

export interface ProfileMemoryView {
  files: ProfileMemoryFileView[]
  note: null | string
}

/** `available:false` means there is nothing to show — the section is hidden
 *  rather than drawn empty, and no substitute "0 files" is invented. */
export function profileMemoryView(memory: ProfileMemory): null | ProfileMemoryView {
  if (!memory.available) {
    return null
  }

  return {
    files: memory.files.map(file =>
      'refused' in file
        ? { content: null, path: file.path, refusal: file.reason, size: file.size }
        : { content: file.content, path: file.path, refusal: null, size: file.size }
    ),
    note: memory.note ?? null
  }
}

export interface ProfilePermissionView {
  /** The preset in force, or null when the service did not name one. */
  preset: null | string
  rows: ProfilePermissionRow[]
}

export interface ProfilePermissionRow {
  action: PermissionRule['action']
  key: PermissionRule['key']
  /** null = every target of this key (the contract's catch-all). */
  pattern: null | string
  /** A later rule for the same key with a pattern at least as broad decides
   *  for those targets first, so this row may never be reached. The rule set
   *  is ordered and the LAST match wins — hiding that would be the lie. */
  shadowed: boolean
}

/** The stored order is preserved (the contract re-expands it so "last match
 *  wins" survives a clone); each row states whether a later, broader rule for
 *  the same key overrides it. */
export function profilePermissionRows(rules: readonly PermissionRule[]): ProfilePermissionRow[] {
  return rules.map((rule, index) => ({
    action: rule.action,
    key: rule.key,
    pattern: rule.pattern,
    shadowed: rules
      .slice(index + 1)
      .some(later => later.key === rule.key && (later.pattern === null || later.pattern === rule.pattern))
  }))
}

export function profilePermissionView(profile: Pick<ProfileRecord, 'permissionPreset' | 'permissionRules'>): ProfilePermissionView {
  return {
    preset: profile.permissionPreset ?? null,
    rows: profilePermissionRows(profile.permissionRules ?? [])
  }
}

/** Bound assets of one kind, in the service's order; a disabled binding stays
 *  in the list because "bound but off" is a state the user must see. */
export function profileBindingsOfKind(bindings: readonly AssetBinding[], kind: AssetBinding['kind']): AssetBinding[] {
  return bindings.filter(binding => binding.kind === kind)
}
