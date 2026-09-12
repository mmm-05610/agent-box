/**
 * Review — the real git diff pane (⌘G / $reviewOpen).
 */

import { useStore } from '@nanostores/react'

import { ReviewPane } from '@/features/right-sidebar/review'
import { cn } from '@/lib/utils'
import { $currentCwd } from '@/store/session'

// Layout fit for wrapped asides. Edge chrome (borders/shadows) is neutralized
// GLOBALLY by the tree's seam invariant (see LayoutTreeRoot) — only sizing
// and titlebar clearance are per-wrapper concerns.
const ZONE_CONTENT = 'h-full [&>aside]:h-full [&>aside]:w-full [&>aside]:pt-0'

export function ReviewPaneContent() {
  const cwd = useStore($currentCwd)

  // Keyed by cwd like DesktopController so switching projects rebuilds the
  // diff state instead of showing the previous repo's files.
  return (
    <div className={cn(ZONE_CONTENT, 'flex min-h-0 flex-col [&>aside]:min-h-0 [&>aside]:flex-1')}>
      <ReviewPane key={cwd || 'no-cwd'} />
    </div>
  )
}
