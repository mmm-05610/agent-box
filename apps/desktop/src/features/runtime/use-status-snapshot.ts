import { useEffect, useState } from 'react'

import { evaluateRuntimeReadiness, type RuntimeReadinessResult } from '@/lib/runtime-readiness'
import type { GatewayRequester } from '@/types/gateway'
import type { StatusResponse } from '@/types/hermes'

// Statusbar health is ambient chrome, not live data — nothing the user acts on
// within seconds. 60s + an actively-viewed check keeps traffic low; focus and
// visibility listeners refresh immediately on return.
const REFRESH_MS = 60_000

/** The data the statusbar poll needs, injected by the composition root. The
 *  hook never imports a backend itself: which runtime (if any) can answer the
 *  status leg is a product decision, and a product runtime has no legacy
 *  status endpoint to fall back to. */
export interface StatusSnapshotSource {
  getStatus: () => Promise<StatusResponse>
  requestGateway: GatewayRequester
}

/**
 * Poll the injected source for the statusbar snapshot and inference readiness.
 *
 * `source === null` is a normal, final answer: no source exists for this
 * runtime, so nothing is polled, no timer or focus/visibility listener is
 * registered, and the hook publishes the neutral `null`/`null` state instead
 * of inventing health.
 */
export function useStatusSnapshot(
  source: StatusSnapshotSource | null,
  gatewayState: string | undefined,
  gatewayScope = ''
): { inferenceStatus: RuntimeReadinessResult | null; statusSnapshot: StatusResponse | null } {
  const [statusSnapshot, setStatusSnapshot] = useState<StatusResponse | null>(null)
  const [inferenceStatus, setInferenceStatus] = useState<RuntimeReadinessResult | null>(null)

  // Depend on the two callables, not the source object: a caller that builds
  // the source inline still gets one effect per real source change instead of
  // one per render.
  const getStatus = source?.getStatus
  const requestGateway = source?.requestGateway

  useEffect(() => {
    if (!getStatus || !requestGateway) {
      // Clear whatever a previous source published and register nothing. The
      // absence of a source is not a reason to schedule work: a timer or a
      // focus listener here would only be machinery for calls this hook is
      // forbidden to make under a product runtime.
      setStatusSnapshot(null)
      setInferenceStatus(null)

      return
    }

    let cancelled = false
    let timer: number | undefined

    // Status and inference readiness belong to one backend. A source switch
    // can keep gatewayState="open" throughout, so clear the previous source's
    // snapshot and start a fresh scoped request explicitly.
    setStatusSnapshot(null)
    setInferenceStatus(null)

    // A closed/connecting gateway cannot have an authoritative live-runtime
    // result. Clear readiness before starting the REST status leg so a hung
    // getStatus() cannot leave a stale "ready" state visible after disconnect.
    if (gatewayState !== 'open') {
      setInferenceStatus(null)
    }

    const scheduleRefresh = () => {
      if (!cancelled) {
        timer = window.setTimeout(() => void refresh(), REFRESH_MS)
      }
    }

    const refresh = async () => {
      // macOS commonly leaves an occluded BrowserWindow `visible`; focus is
      // the missing signal that prevents status + readiness RPCs while the
      // user is working in another app.
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        scheduleRefresh()

        return
      }

      try {
        // Wait for both legs before scheduling the next refresh. setInterval
        // allowed a slow runtime check to overlap with later polls, which
        // multiplied load on an already-busy gateway and let stale failures
        // race newer healthy results.
        const [statusResult, inferenceResult] = await Promise.allSettled([
          getStatus(),
          gatewayState === 'open' ? evaluateRuntimeReadiness(requestGateway) : Promise.resolve(null)
        ])

        if (cancelled) {
          return
        }

        if (statusResult.status === 'fulfilled') {
          setStatusSnapshot(statusResult.value)
        }

        if (inferenceResult.status === 'fulfilled') {
          const inference = inferenceResult.value

          if (inference === null) {
            setInferenceStatus(null)
          } else if (inference.source !== 'fallback') {
            // runtime_check/setup_status returned an authoritative boolean.
            // A fallback means both RPCs failed or returned no boolean, so it
            // is a transient/unknown transport state, not proof that inference
            // became unconfigured. Keep the last authoritative result instead
            // of flashing "Inference not ready" during a gateway flap.
            setInferenceStatus(inference)
          }
        }
      } finally {
        scheduleRefresh()
      }
    }

    const onReturn = () => {
      if (document.visibilityState === 'visible' && document.hasFocus() && !cancelled) {
        if (timer !== undefined) {
          window.clearTimeout(timer)
        }

        void refresh()
      }
    }

    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    void refresh()

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)

      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [gatewayScope, gatewayState, getStatus, requestGateway])

  return { inferenceStatus, statusSnapshot }
}
