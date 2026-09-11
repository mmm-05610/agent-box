/**
 * workcore/slot.ts
 *
 * The single composition position where a Work Core lifecycle may be installed.
 *
 * ## Why a slot and nothing more
 *
 * The boot path has to be able to ask "which backend infrastructure am I
 * starting" without knowing the answer. A slot is the smallest thing that makes
 * that question expressible: exactly one lifecycle, installed here, or none.
 *
 * It is deliberately **not** a registry, a plugin system, a manifest, or a
 * capability negotiation — this repository has one candidate consumer and no
 * Work Core implementation at all, so anything larger would be a framework built
 * for an imagined second consumer (repository AGENTS.md: "do not build a
 * universal extension system, a manifest, or a plugin adapter for a single
 * consumer").
 *
 * ## Status: intentionally unpopulated
 *
 * Nothing installs a lifecycle in production this round. `current()` returns
 * null, and the boot path does **not** branch on it — so this slot cannot alter
 * behavior, and there is no fallback behind it. When a real Work Core arrives it
 * is installed here, and the caller's null-check becomes the first real decision
 * this seam makes. Until then the only installers are tests.
 */

import type { WorkCoreLifecycle } from './lifecycle'

export interface WorkCoreSlot {
  /** The installed lifecycle, or null when no Work Core is available. */
  current(): null | WorkCoreLifecycle
  /**
   * Install a lifecycle, or pass null to remove it. Returns the lifecycle that
   * was previously installed, so a caller can restore it in a `finally`.
   */
  install(lifecycle: null | WorkCoreLifecycle): null | WorkCoreLifecycle
  /** True when a lifecycle is installed. A convenience, not a second state. */
  isPopulated(): boolean
}

export function createWorkCoreSlot(): WorkCoreSlot {
  let installed: null | WorkCoreLifecycle = null

  return {
    current: () => installed,
    install(lifecycle) {
      const previous = installed

      installed = lifecycle

      return previous
    },
    isPopulated: () => installed !== null
  }
}

/**
 * The composition root's slot. Module-scoped because there is exactly one
 * Desktop host per process and the slot must be reachable from wherever the
 * install eventually happens without threading a container through the boot
 * path — which is the dependency bag this refactor exists to avoid.
 */
export const workCoreSlot: WorkCoreSlot = createWorkCoreSlot()
