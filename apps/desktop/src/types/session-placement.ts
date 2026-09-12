import type { TileDock } from '@/types/pane-dock'
import type { SessionOwnerRoute } from '@/types/session'

/** Where a dragged new session lands. `center` stacks a fresh tab into the
 *  anchor's zone (optionally at a strip slot via `before`); an edge dir splits
 *  a new tile docked to that edge of the anchor. `cwd` pins the new session to
 *  a project's path when the drag started from a project row (null = the
 *  default new-session cwd). `profile` / `route` pins the new session to a
 *  specific profile when dragged from a profile group. */
export interface NewSessionPlacement {
  anchor: string
  before?: null | string
  cwd?: null | string
  dir: TileDock
  profile?: string
  route?: SessionOwnerRoute | null
}
