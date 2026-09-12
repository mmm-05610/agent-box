/**
 * FilesPane — real file browser; activating a file opens it in preview.
 */

import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { RightSidebarPane } from '@/features/right-sidebar'
import { openPreview } from '@/store/preview'
import { $currentCwd } from '@/store/session'

/** Open a file from the tree in the real preview pipeline. */
function previewFile(path: string) {
  void normalizeOrLocalPreviewTarget(path, $currentCwd.get() || undefined)
    .then(target => {
      if (target) {
        openPreview(target, 'file-browser')
      }
    })
    .catch(() => undefined)
}

// Layout fit for wrapped asides. Edge chrome (borders/shadows) is neutralized
// GLOBALLY by the tree's seam invariant (see LayoutTreeRoot) — only sizing
// and titlebar clearance are per-wrapper concerns.
const ZONE_CONTENT = 'h-full [&>aside]:h-full [&>aside]:w-full [&>aside]:pt-0'

export function FilesPane() {
  return (
    <div className={ZONE_CONTENT}>
      <RightSidebarPane onActivateFile={previewFile} onActivateFolder={previewFile} />
    </div>
  )
}
