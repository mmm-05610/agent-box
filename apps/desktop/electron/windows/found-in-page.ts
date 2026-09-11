/**
 * windows/found-in-page.ts
 *
 * One find-in-page forwarder per WebContents, torn down when its contents die.
 *
 * Extracted from `main.ts` (E5b). The registry is per-sender and self-cleaning:
 * a renderer that is destroyed must not leave its `found-in-page` listener
 * attached, or every later search in a fresh renderer would double-report.
 */

import type Electron from 'electron'

export interface FoundInPageForwarders {
  /** Attach the forwarder to this sender once; later calls are no-ops. */
  ensure(sender: Electron.WebContents): void
}

export function createFoundInPageForwarders(
  install: (sender: Electron.WebContents) => () => void
): FoundInPageForwarders {
  const bySenderId = new Map<number, () => void>()

  return {
    ensure(sender: Electron.WebContents): void {
      if (bySenderId.has(sender.id)) {
        return
      }

      const uninstall = install(sender)

      bySenderId.set(sender.id, uninstall)

      sender.once('destroyed', () => {
        bySenderId.get(sender.id)?.()
        bySenderId.delete(sender.id)
      })
    }
  }
}
