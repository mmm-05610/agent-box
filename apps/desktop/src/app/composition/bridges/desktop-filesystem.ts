import { useEffect } from 'react'

import { setDesktopFsConnectionSource } from '@/lib/desktop-fs'
import { $connection } from '@/store/session'

/**
 * Publishes the active connection to the host-capability adapters.
 *
 * `lib/desktop-fs` mirrors one filesystem/git/media operation onto two backends
 * — this machine through the Electron bridge, or a remote gateway through its
 * REST surface — so it has to know which one is live. It is a leaf and may not
 * read the session store to find out; the store hands it a getter instead, the
 * same way `setDesktopFsRemotePicker` already works.
 *
 * The getter is lazy on purpose: a connection that changes mid-session is picked
 * up by the next call, with no re-registration and no window where the adapter
 * holds a stale one.
 *
 * Registered unconditionally, in every window: this is not a per-window concern
 * like the pet or quick-entry bridges. Any window that reads a file needs the
 * same answer.
 */
export function useDesktopFsConnection(): void {
  useEffect(() => {
    setDesktopFsConnectionSource(() => $connection.get())

    return () => setDesktopFsConnectionSource(() => null)
  }, [])
}
