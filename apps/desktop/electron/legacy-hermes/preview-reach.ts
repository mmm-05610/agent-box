/**
 * legacy-hermes/preview-reach.ts
 *
 * Reaching a remote preview through a live SSH transport: rewrite the URL to a
 * local forwarded port, and tear the forwards down when the transport or the
 * renderer goes away.
 *
 * Moved verbatim out of `main.ts` (E5c). The `scope` check is the subtle part: a
 * preview must never reuse ANOTHER window's forward, so a reach whose scope no
 * longer matches the renderer's SSH target is closed and rebuilt rather than
 * shared. A window with no SSH transport behind its gateway gets the raw URL.
 */
import { activeSshTerminalTarget, ensureTerminalBackend, sshConnections, sshRememberLog } from '../composition/bootstrap-env-composition'
import { pickLocalPort } from '../host-capabilities/platform/ssh-connection'
import { PreviewReachRegistry } from '../host-capabilities/preview/preview-reach'

const previewReachByWebContents = new Map<number, { registry: PreviewReachRegistry; scope: string }>()

export async function resetPreviewReach(webContentsId?: number) {
  if (typeof webContentsId === 'number') {
    const current = previewReachByWebContents.get(webContentsId)

    previewReachByWebContents.delete(webContentsId)

    if (current) {
      await current.registry.closeAll()
    }

    return
  }

  const open = [...previewReachByWebContents.values()]

  previewReachByWebContents.clear()
  await Promise.allSettled(open.map(entry => entry.registry.closeAll()))
}

export async function reachablePreviewUrl(webContentsId: number, rawUrl: string): Promise<string> {
  let target = activeSshTerminalTarget(webContentsId)

  if (target === 'pending') {
    await ensureTerminalBackend(webContentsId).catch(() => undefined)
    target = activeSshTerminalTarget(webContentsId)
  }

  if (!target || target === 'pending') {
    // No SSH transport behind this renderer's gateway. Another window's
    // forward must never be reused for this preview.
    await resetPreviewReach(webContentsId)

    return rawUrl
  }

  const { scope, ssh } = target as { scope: string; ssh: any }
  let reach = previewReachByWebContents.get(webContentsId)

  if (!reach || reach.scope !== scope) {
    await resetPreviewReach(webContentsId)
    reach = { registry: new PreviewReachRegistry(), scope }
    previewReachByWebContents.set(webContentsId, reach)
  }

  try {
    const rewritten = await reach.registry.resolve(rawUrl, {
      cancel: (localPort, remotePort) => ssh.cancelForward(localPort, remotePort),
      forward: (localPort, remotePort, remoteHost) => ssh.forward(localPort, remotePort, remoteHost),
      isCurrent: () => sshConnections.get(scope)?.ssh === ssh,
      // pickLocalPort predates the typed surface here and infers `unknown`.
      pickLocalPort: () => pickLocalPort() as Promise<number>
    })

    return rewritten || rawUrl
  } catch (error: any) {
    sshRememberLog(`preview reach failed for ${rawUrl}: ${error?.message || error}`)

    return rawUrl
  }
}
