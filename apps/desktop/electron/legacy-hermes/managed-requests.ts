/**
 * legacy-hermes/managed-requests.ts
 *
 * The Desktop-managed SSH update request: one in-flight operation per
 * connection, gated so two callers cannot start overlapping updates, and
 * resumed after a restart so a recovery that was already requested is not lost.
 *
 * Moved verbatim out of `main.ts` (E5c). `requestManagedSshUpdate` returns the
 * SAME promise to a second caller rather than starting a second operation, and
 * it refuses early — with a typed refusal the UI can render — for a connection
 * that is unknown, not SSH, or already updating.
 */
import {
  managedConnectionUpdateGate,
  managedPrimaryRestoreOwners,
  readDesktopConnectionsRegistry,
  readManagedSshRecoveryRecords
} from '../composition/bootstrap-env-composition'

import { refusedManagedSshUpdate } from './managed-ssh-update'
import {
  managedConnectionRecoveries,
  managedConnectionUpdates,
  recoverManagedSshUpdate,
  updateManagedSshConnection
} from './runtime-composition'

export function assertCanMutateManagedPrimaryRouting() {
  const durableIds = readManagedSshRecoveryRecords().map(record => record.connectionId)

  const ids = new Set([
    ...managedConnectionUpdates.keys(),
    ...managedConnectionRecoveries.keys(),
    ...managedPrimaryRestoreOwners.keys(),
    ...durableIds
  ])

  if (ids.size > 0) {
    const error: any = new Error(
      `Primary connection routing cannot change while managed SSH update recovery is pending for ${[...ids].join(', ')}.`
    )

    error.code = 'managed-update-in-progress'
    throw error
  }
}

export async function resumeManagedSshRecoveries() {
  await Promise.allSettled(readManagedSshRecoveryRecords().map(record => recoverManagedSshUpdate(record)))
}

export async function requestManagedSshUpdate(rawId) {
  const connectionId = String(rawId || '').trim()
  const existing = managedConnectionUpdates.get(connectionId)

  if (existing) {
    return existing
  }

  const correlationId = crypto.randomUUID()
  const registry = readDesktopConnectionsRegistry()
  const source = registry.connections.find(connection => connection.id === connectionId)

  if (!source) {
    return refusedManagedSshUpdate(connectionId, correlationId, `No connection with id "${connectionId}".`)
  }

  if (source.kind !== 'ssh') {
    return refusedManagedSshUpdate(
      connectionId,
      correlationId,
      'Only registered Desktop-managed SSH connections can use this update lifecycle.'
    )
  }

  if (!managedConnectionUpdateGate.claim(connectionId, correlationId)) {
    return refusedManagedSshUpdate(connectionId, correlationId, 'A managed update is already in progress.')
  }

  const operation = (async () => {
    try {
      return await updateManagedSshConnection(source, correlationId)
    } catch (error: any) {
      return refusedManagedSshUpdate(connectionId, correlationId, String(error?.message || error))
    } finally {
      managedConnectionUpdateGate.release(connectionId, correlationId)
      managedConnectionUpdates.delete(connectionId)
    }
  })()

  managedConnectionUpdates.set(connectionId, operation)

  return operation
}
