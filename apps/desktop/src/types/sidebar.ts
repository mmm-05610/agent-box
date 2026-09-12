import type * as React from 'react'

export type SidebarNavId = 'artifacts' | 'command-center' | 'cron' | 'new-session' | 'settings' | 'skills'

export interface SidebarNavItem {
  /** Built-in view id, or a contributed row's namespaced contribution id. */
  id: SidebarNavId | (string & {})
  label: string
  icon: React.ComponentType<{ className?: string }>
  route?: string
  action?: 'new-session'
  /** Keybind action id — when set, the tooltip shows the keybind hint. */
  keybindActionId?: string
}
