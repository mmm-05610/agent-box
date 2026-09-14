/** Composition owns the palette's product content and hands it to the shell
 *  host (batch 30 C2): the host knows open/close and rendering, never the
 *  features. Same public surface the old `app/command-palette` barrel had. */

import { CommandPalette as CommandPaletteHost } from '@/app/shell/layers/command-palette/host'

import { CommandPaletteBody } from './body'

export { CommandPaletteBody }

export function CommandPalette() {
  return (
    <CommandPaletteHost>
      {({ key, onExited }) => (
        // The AgentBox product shell names the authority explicitly — never
        // inferred from gateway state or cache contents — so the palette never
        // offers or runs the legacy Hermes data-plane shortcuts.
        <CommandPaletteBody authority="agentbox" key={key} onExited={onExited} />
      )}
    </CommandPaletteHost>
  )
}
