/**
 * connection-registry.ts — barrel over the registry responsibility modules
 * (identity, route-resolution, roster, schema, migration, registry-ops).
 * Pure, electron-free helpers for the desktop's multi-connection registry;
 * the public surface of this module is unchanged.
 */

export type {
  ConnectionKind,
  ConnectionRegistry,
  QuarantinedRegistryEntry,
  RegistryConnection,
  RegistryLocalRoute,
  ResolvedConnectionDescriptor,
  ResolvedConnectionSshDescriptor,
} from './connection-registry/identity'
export {
  agentHandle,
  backendScopeKey,
  backendScopePrefix,
  labelKey,
  labelSlug,
  LOCAL_CONNECTION_ID,
  parseBackendScopeKey,
  REGISTRY_QUARANTINE_CAP,
  REGISTRY_VERSION,
  resolvedConnectionId,
  uniqueLabel,
} from './connection-registry/identity'
export {
  migrateV1ToRegistry,
} from './connection-registry/migration'
export {
  reconcileAppliedGlobalConnection,
  reconcileRegistryDrift,
  removeConnection,
  setConnectionLaunchMode,
  setLastUsedConnection,
  setPrimaryConnection,
  upsertConnection,
} from './connection-registry/registry-ops'
export type {
  ConnectionAgents,
  RosterAgent,
  RosterProfileMetadata,
} from './connection-registry/roster'
export {
  buildAgentRoster,
  parseRemoteProfileListing,
  rememberSshEnumeration,
  shouldRetrySshInventory,
} from './connection-registry/roster'
export type {
  ReuseMatchingPrimarySshBackendOptions,
} from './connection-registry/route-resolution'
export {
  registrySourceOwnsPrimaryBackend,
  resolveRegistryLocalRoute,
  reuseMatchingPrimarySshBackend,
  shouldDeferLocalEnumeration,
} from './connection-registry/route-resolution'
export type {
  ConnectionInput,
  UpdateEligibility,
} from './connection-registry/schema'
export {
  connectionDialFieldsChanged,
  connectionIdForLabel,
  mergeConnectionInput,
  normalizeConnectionInput,
  normalizeRegistry,
  updateEligibility,
} from './connection-registry/schema'
