import type * as React from 'react'

import { Codicon } from '@/components/ui/codicon'
import type { SidebarProjectTree } from '@/store/projects/membership'

import {
  SIDEBAR_LEAD_ICON_SIZE,
  SidebarRowBody,
  SidebarRowLabel,
  SidebarRowLead,
  SidebarRowLeadGlyph,
  SidebarRowShell
} from '../chrome'
// The project OVERVIEW row retired in 36R: the workspace root list
// (workspace-list/workspace-row.tsx) carries the local rows on the shared
// workspace-row skeleton. What stays here is what other surfaces still
// consume: the project glyph and the entered-project back row.

// A bare color dot (no icon) or an icon glyph — tinted by `color` when set, else
// the lead's default tertiary. The glyph wrapper centers + caps size either way.
// Auto-discovered repos (git lanes Desktop found by scanning disk, not rows in
// projects.db) get the `repo` glyph so a glance tells explicit projects
// (`folder-library`) apart from incidental disk/session findings.
export function projectIcon({ color, icon, isAuto, isNoProject }: SidebarProjectTree) {
  if (color && !icon) {
    return (
      <SidebarRowLeadGlyph>
        <span aria-hidden="true" className="size-1 rounded-full" style={{ backgroundColor: color }} />
      </SidebarRowLeadGlyph>
    )
  }

  return (
    <SidebarRowLeadGlyph style={color ? { color } : undefined}>
      <Codicon
        name={icon || (isNoProject ? 'home' : isAuto ? 'repo' : 'folder-library')}
        size={SIDEBAR_LEAD_ICON_SIZE}
      />
    </SidebarRowLeadGlyph>
  )
}

export function ProjectBackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <SidebarRowShell>
      <SidebarRowBody
        className="group/back w-full text-(--ui-text-tertiary) opacity-40 hover:text-foreground"
        onClick={onClick}
      >
        <SidebarRowLead>
          <SidebarRowLeadGlyph>
            <Codicon name="arrow-left" size={SIDEBAR_LEAD_ICON_SIZE} />
          </SidebarRowLeadGlyph>
        </SidebarRowLead>
        <SidebarRowLabel className="text-xs underline-offset-4 group-hover/back:underline">{label}</SidebarRowLabel>
      </SidebarRowBody>
    </SidebarRowShell>
  )
}
