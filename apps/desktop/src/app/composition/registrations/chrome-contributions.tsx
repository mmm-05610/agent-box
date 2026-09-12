/**
 * Statusbar/titlebar contribution wiring: collects the DATA contributions
 * plugins and pages register into `statusBar.left/right` and
 * `titleBar.tools.left/right` and hands them to the real statusbar/titlebar.
 * No core filler here — the real statusbar owns the core items (model pill,
 * terminal toggle, …).
 */

import type { GroupSetter } from '@/app/shell/chrome/group-setter'
import type { StatusbarItem } from '@/app/shell/chrome/statusbar/statusbar-controls'
import type { TitlebarTool } from '@/app/shell/chrome/titlebar/controls'
import { ContribBoundary, ContribRender } from '@/extension/contrib/react/boundary'
import { useContributions } from '@/extension/contrib/react/use-contributions'
import { registry } from '@/lib/contributions'

/** Collect statusbar contributions for one side. A `render()` contribution
 *  becomes a render-item (arbitrary stateful node); otherwise the declarative
 *  `data` payload is the StatusbarItem. */
export function useStatusbarContributions(side: 'left' | 'right'): StatusbarItem[] {
  const items = useContributions(`statusBar.${side}`)

  return items
    .map(c =>
      c.render
        ? ({
            id: c.id,
            render: () => (
              <ContribBoundary id={c.id} variant="chip">
                <ContribRender render={c.render!} />
              </ContribBoundary>
            )
          } satisfies StatusbarItem)
        : (c.data as StatusbarItem)
    )
    .filter(Boolean)
}

/** Collect TitlebarTool data contributions for one side of the titlebar. */
export function useTitlebarToolContributions(side: 'left' | 'right'): TitlebarTool[] {
  const items = useContributions(`titleBar.tools.${side}`)

  return items.map(c => c.data as TitlebarTool).filter(Boolean)
}

/**
 * Bridge a page's `GroupSetter` extension point (SkillsView, ArtifactsView,
 * ChatPreviewRail, …) into the registry: each call replaces the group's items
 * as DATA contributions in `<prefix>.<side>`, so page-owned items flow through
 * the same pipe plugins use. Setting an empty list clears the group.
 */
export function registryGroupSetter<T>(prefix: string): GroupSetter<T> {
  const disposers = new Map<string, () => void>()

  return (id, items, side = 'right') => {
    const key = `${side}:${id}`

    disposers.get(key)?.()
    disposers.set(
      key,
      registry.registerMany(
        items.map((item, i) => ({
          id: `${id}-${i}`,
          area: `${prefix}.${side}`,
          source: 'core',
          order: 100 + i,
          data: item as object
        }))
      )
    )
  }
}

/** The app's page-facing setters — the same `GroupSetter` shape pages already
 *  take as props, backed by the registry instead of component state. */
export const setStatusbarItemGroup = registryGroupSetter<StatusbarItem>('statusBar')
export const setTitlebarToolGroup = registryGroupSetter<TitlebarTool>('titleBar.tools')
