/**
 * app/power-state.ts
 *
 * Sleep/wake and AC/battery state: the two host events the renderer has to be
 * told about, and the dedupe that keeps the battery broadcast from becoming a
 * per-event storm.
 *
 * Extracted from `main.ts` (E5b). The remote-backend revalidation that a wake
 * should also trigger is injected as `revalidateRemoteBackends`, so this module
 * knows nothing about pooled backends or Hermes — the caller wires that in, which
 * is also what keeps a harness-neutral module from importing the Hermes adapter.
 */

import { BrowserWindow, powerMonitor } from 'electron'

export interface PowerStateDeps {
  getMainWindow: () => null | undefined | { isDestroyed?: () => boolean; webContents?: any }
  /**
   * Attach the post-resume remote revalidation. Injected rather than imported so
   * this module stays harness-neutral: the caller wires the Hermes-side
   * `attachPowerResumeRemoteRevalidation` (with its holdoff) in, and the return
   * value is kept so `dispose()` can detach it.
   */
  attachRemoteRevalidation: () => () => void
  log: (line: string) => void
}

export interface PowerState {
  /** Send one battery-state broadcast, deduped against the last value sent. */
  broadcastBatteryState(next: boolean): void
  /** Unsubscribe the powerMonitor listeners (idempotent). */
  dispose(): void
  /** Attach the listeners. Idempotent, and safe before `app.whenReady()`. */
  register(): void
  /** The last AC/battery observation, or null before one was made. */
  isOnBattery(): boolean | null
  /** Tell the main window a resume happened. */
  sendResume(): void
}

export function createPowerState(deps: PowerStateDeps): PowerState {
  let registered = false
  let onBatteryPower: boolean | null = null
  let detachRemoteRevalidation: null | (() => void) = null

  const sendResume = () => {
    const win = deps.getMainWindow()

    if (!win || win.isDestroyed?.()) {
      return
    }

    const { webContents } = win

    if (!webContents || webContents.isDestroyed?.()) {
      return
    }

    webContents.send('hermes:power-resume')
  }

  const broadcastBatteryState = (next: boolean) => {
    if (onBatteryPower === next) {
      return
    }

    onBatteryPower = next

    for (const win of BrowserWindow.getAllWindows()) {
      const { webContents } = win

      if (webContents && !webContents.isDestroyed()) {
        webContents.send('hermes:power-battery', next)
      }
    }
  }

  return {
    broadcastBatteryState,
    dispose() {
      if (!registered) {
        return
      }

      registered = false
      powerMonitor.off('resume', sendResume)
      powerMonitor.off('unlock-screen', sendResume)
      detachRemoteRevalidation?.()
      detachRemoteRevalidation = null
    },
    register() {
      if (registered) {
        return
      }

      registered = true

      try {
        // 'resume' covers sleep/wake; 'unlock-screen' covers lock/unlock without
        // a full suspend. Either can drop an idle socket.
        powerMonitor.on('resume', sendResume)
        powerMonitor.on('unlock-screen', sendResume)
        powerMonitor.on('on-battery', () => broadcastBatteryState(true))
        powerMonitor.on('on-ac', () => broadcastBatteryState(false))
        onBatteryPower = powerMonitor.isOnBatteryPower()
        // Pooled remote/SSH backends are also suspect after a wake (#93910): the
        // renderer nudge above only re-drives the PRIMARY socket, while pooled
        // tunnels have no renderer loop of their own. The injected hook is
        // bounded and coalesced internally; never a hot loop.
        detachRemoteRevalidation = deps.attachRemoteRevalidation()
      } catch (error: any) {
        registered = false
        deps.log(`power-state setup failed: ${error?.message || error}`)
      }
    },
    isOnBattery: () => onBatteryPower,
    sendResume
  }
}
