import { atom } from 'nanostores'

/** True while the workspace pane shows a FULL PAGE (skills/artifacts/
 *  plugin routes) instead of the chat. Published by the wiring
 *  (which owns the router location); the workspace pane contribution mirrors
 *  it as `headerVeto` so the zone tab bar stands down on pages. Overlays
 *  (settings/…) don't count — the chat stays beneath them. */
export const $workspaceIsPage = atom(false)
