/**
 * The harness registry's declared configuration slots, as data.
 *
 * Source of truth is the registry the SERVER ships (`harnesses.toml`): each
 * family declares which configuration dimensions it supports. This table is
 * the client's copy of that declaration, keyed by the family's own name —
 * a family added to the registry appears by adding a row here, and a family
 * that declares no slot for a dimension gets an honest "not supported" instead
 * of a control that could not work.
 *
 * Dimensions NOT in the registry yet (memory viewing, hooks-per-family) stay
 * out of the nav until their backend orders land — the visibility rule is the
 * registry's, not this file's ambition.
 */
export interface HarnessSlots {
  harness: string
  slots: readonly string[]
}

export const HARNESS_SLOTS: readonly HarnessSlots[] = [
  { harness: 'codex', slots: ['provider', 'permission', 'instruction', 'mcp', 'skill'] },
  { harness: 'claude-code', slots: ['instruction', 'mcp', 'skill', 'permission'] },
  { harness: 'opencode', slots: ['provider', 'instruction', 'mcp', 'skill'] },
  { harness: 'hermes', slots: ['instruction', 'mcp', 'skill'] },
  { harness: 'pi', slots: ['instruction', 'mcp', 'skill'] }
]

/** Sections every role has, regardless of slots. */
export const ALWAYS_SECTIONS = ['basics', 'harness'] as const

/** A dimension a registry row may declare. */
export type RoleSlot = 'provider' | 'permission' | 'instruction' | 'mcp' | 'skill'

export function declaredSlots(harness: string): readonly string[] {
  return HARNESS_SLOTS.find(row => row.harness === harness)?.slots ?? []
}

export function supportsSlot(harness: string, slot: RoleSlot): boolean {
  return declaredSlots(harness).includes(slot)
}

/** The section ids a role's surface shows, in canonical order: the always-on
 *  pair first, then each registry-declared dimension. An unknown harness
 *  (not in the registry copy) still gets the always-on pair — the surface
 *  never disappears, it just has nothing more to say yet. */
export function roleSectionsFor(harness: string): string[] {
  const sections: string[] = [...ALWAYS_SECTIONS]

  for (const slot of ['provider', 'instruction', 'skill', 'mcp', 'permission'] as const) {
    if (supportsSlot(harness, slot)) {
      sections.push(slot as string)
    }
  }

  return sections
}
