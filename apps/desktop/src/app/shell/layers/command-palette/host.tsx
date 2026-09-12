import { useStore } from '@nanostores/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import {
  $commandPaletteOpen,
  setCommandPaletteOpen
} from '@/store/command-palette'
const EXIT_FALLBACK_MS = 1000

/** The palette host owns open/close, the remount key and the exit fallback;
 *  the body content is handed in by composition (it knows the features). */
export function CommandPalette({ children }: { children: (state: { key: number; onExited: () => void }) => ReactNode }) {
  const open = useStore($commandPaletteOpen)
  const [mounted, setMounted] = useState(open)
  const [openCount, setOpenCount] = useState(0)

  const retire = useCallback(() => {
    // Only retire the body if the palette is still closed — a reopen mid-fade
    // must not unmount the fresh instance.
    if (!$commandPaletteOpen.get()) {
      setMounted(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setOpenCount(count => count + 1)
      setMounted(true)

      return
    }

    // Safety net for environments where the exit animation never runs (jsdom,
    // `animation: none`), so the body can't be stranded mounted. The real
    // unmount is `onExited` below; whichever fires first wins.
    const timer = setTimeout(retire, EXIT_FALLBACK_MS)

    return () => clearTimeout(timer)
  }, [open, retire])

  return (
    <DialogPrimitive.Root onOpenChange={setCommandPaletteOpen} open={open}>
      {mounted && children({ key: openCount, onExited: retire })}
    </DialogPrimitive.Root>
  )
}
