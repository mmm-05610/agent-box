// Extracted verbatim from chat-sidebar.tsx (see docs/desktop-megafile-decomposition.md).
// Round 36: the fixed nav rows (New session / Capabilities / Artifacts /
// Scheduled jobs) are retired — the sidebar's primary navigation is the
// workspace tree below. What remains at the top: the Profiles management
// entry (the persistent-role library, NOT the legacy Bots group-chat pane),
// then contributed plugin pages with the same chrome.
//
// The global "New session" row is gone by design: new sessions are created
// inside their workspace (the workspace rows' "+"), so one always lands in a
// workspace. The ⌘N hotkey still creates a session through its own action.

import { useStore } from '@nanostores/react'
import { useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'

import {
  type AppView,
  PROFILES_ROUTE,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution
} from '@/app/routes'
import { Codicon } from '@/components/ui/codicon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { useContributions } from '@/extension/contrib/react/use-contributions'
import type { Translations } from '@/i18n'
import { cn } from '@/lib/utils'
import { $profileCreateRequest } from '@/store/profile'
import { openRouteTile } from '@/store/route-tiles'
import { type SidebarNavItem } from '@/types/sidebar'

import { CONTEXT_SPLIT_KIT, SplitSubmenu } from './split-submenu'

interface SidebarNavMenuProps {
  currentView: AppView
  onNavigate: (item: SidebarNavItem) => void
  pathname: string
  s: Translations['sidebar']
}

export function SidebarNavMenu({ currentView, onNavigate, pathname, s }: SidebarNavMenuProps) {
  const navigate = useNavigate()
  // Contributed nav rows (plugins pairing a page with a sidebar entry) render
  // below the Profiles entry with the same chrome; active = at their route.
  const navContributions = useContributions(SIDEBAR_NAV_AREA)

  const contributedNav = useMemo<SidebarNavItem[]>(
    () =>
      navContributions.flatMap(c => {
        const data = c.data as Partial<SidebarNavContribution> | undefined

        if (!data?.path?.startsWith('/') || !data.label) {
          return []
        }

        const codicon = data.codicon || 'plug'

        return [
          {
            id: c.id,
            label: data.label,
            icon: (props: { className?: string }) => (
              <Codicon name={codicon} {...props} />
            ),
            route: data.path
          }
        ]
      }),
    [navContributions]
  )

  // The `profile.create` hotkey used to be watched by the bottom profile rail;
  // the rail is retired, so the Profiles entry inherits the request and lands
  // on the profile manager where "New profile" lives.
  const createRequest = useStore($profileCreateRequest)
  const lastCreateRef = useRef(createRequest)

  // eslint-disable-next-line no-restricted-syntax -- one-shot request-seen sentinel, not an atom mirror
  useEffect(() => {
    if (createRequest === lastCreateRef.current) {
      return
    }

    lastCreateRef.current = createRequest
    navigate(PROFILES_ROUTE)
  }, [createRequest, navigate])

  return (
    <SidebarGroup className="shrink-0 p-0 pb-2 pt-[calc(var(--titlebar-height)+0.375rem)]">
      <SidebarGroupContent>
        <SidebarMenu className="gap-px">
          <ProfilesNavItem active={pathname === PROFILES_ROUTE} label={s.profilesEntry} onSelect={() => navigate(PROFILES_ROUTE)} />
          {contributedNav.map(item => {
            const active = currentView === 'extension' && pathname === item.route

            const button = (
              <SidebarMenuButton
                className={cn(
                  'flex h-7 w-full justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out [-webkit-app-region:no-drag] hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none',
                  active &&
                    'border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground shadow-none hover:border-(--ui-stroke-tertiary)!'
                )}
                data-tip-region=""
                onClick={() => onNavigate(item)}
                tooltip={item.label}
                type="button"
              >
                <item.icon className="size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]" />
                <span className="min-w-0 truncate" data-tip-arrow-only="" data-tour={`sidebar-nav-${item.id}`}>
                  {item.label}
                </span>
              </SidebarMenuButton>
            )

            // Route-backed pages can open in a split — right-click for the
            // directional "Open in split" submenu.
            return (
              <SidebarMenuItem key={item.id}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>{button}</ContextMenuTrigger>
                  <ContextMenuContent aria-label={item.label}>
                    <SplitSubmenu
                      kit={CONTEXT_SPLIT_KIT}
                      label={s.row.openInSplit}
                      onSplit={dir => {
                        if (item.route) {
                          openRouteTile(item.route, dir)
                        }
                      }}
                    />
                  </ContextMenuContent>
                </ContextMenu>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// The top-of-sidebar Profiles entry: a plain nav row into the existing
// profile manager (list, create/rename/delete, description, model/skills
// summary). It deliberately does NOT open the legacy Bots group-chat pane.
function ProfilesNavItem({ active, label, onSelect }: { active: boolean; label: string; onSelect: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        aria-label={label}
        className={cn(
          'flex h-7 w-full justify-start gap-2 rounded-md border border-transparent px-2 text-left text-[0.8125rem] font-medium text-(--ui-text-secondary) transition-colors duration-100 ease-out [-webkit-app-region:no-drag] hover:bg-(--ui-control-hover-background) hover:text-foreground hover:transition-none',
          active &&
            'border-(--ui-stroke-tertiary) bg-(--ui-control-active-background) text-foreground shadow-none hover:border-(--ui-stroke-tertiary)!'
        )}
        data-tip-region=""
        data-tour="sidebar-nav-profiles"
        onClick={onSelect}
        tooltip={label}
        type="button"
      >
        <Codicon className="size-4 shrink-0 text-[color-mix(in_srgb,currentColor_72%,transparent)]" name="hubot" />
        <span className="min-w-0 truncate" data-tip-arrow-only="">
          {label}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
