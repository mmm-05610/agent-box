/** Composition owns the palette's product content and hands it to the shell
 *  host (batch 30 C2): the host knows open/close and rendering, never the
 *  features. Same public surface the old `app/command-palette` barrel had. */

import { CommandPalette as CommandPaletteHost } from '@/app/shell/layers/command-palette/host'

import { CommandPaletteBody } from './body'

export { CommandPaletteBody }

export function CommandPalette() {
  return <CommandPaletteHost>{({ key, onExited }) => <CommandPaletteBody key={key} onExited={onExited} />}</CommandPaletteHost>
}
