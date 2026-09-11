/**
 * Command-palette contribution surface — `palette` data contributions become
 * rows in the ⌘K root list, same schema as every other area. Contributions
 * with an `action` id render that action's live keybind as their hotkey hint.
 */

import { useContributions } from '@/extension/contrib/react/use-contributions'
import { PALETTE_AREA, type PaletteContribution } from '@/lib/contribution-areas'

export { PALETTE_AREA, type PaletteContribution } from '@/lib/contribution-areas'

/** Contributed palette rows, with stable render keys. */
export function usePaletteContributions(): Array<PaletteContribution & { key: string }> {
  return useContributions(PALETTE_AREA)
    .map(c => ({ key: `${c.source ?? 'core'}:${c.id}`, ...(c.data as PaletteContribution) }))
    .filter(item => Boolean(item.label && item.run))
}

/**
 * A binary setting as one palette row: `Toggle status bar` trailed by the live
 * state. The verb says what the row does, the note says where it stands —
 * neither alone is enough to act on.
 *
 * Rows keep the palette open: flipping a setting is the kind of thing you do
 * two or three of in a row, and the note updating in place is the receipt.
 */
export function paletteToggle(
  spec: Omit<PaletteContribution, 'detail' | 'detailVariant' | 'keepOpen' | 'run'> & {
    get: () => boolean
    set: (enabled: boolean) => void
  }
) {
  const { get, keywords = [], set, ...rest } = spec

  const data: PaletteContribution = {
    ...rest,
    detail: () => (get() ? 'on' : 'off'),
    detailVariant: 'state',
    keepOpen: true,
    keywords: [...keywords, 'on', 'off', 'enable', 'disable'],
    run: () => set(!get())
  }

  return { id: data.id, area: PALETTE_AREA, data }
}
