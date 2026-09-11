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
} from './identity'
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
} from './identity'
export {
  migrateV1ToRegistry,
} from './migration'
export {
  reconcileAppliedGlobalConnection,
  reconcileRegistryDrift,
  removeConnection,
  setConnectionLaunchMode,
  setLastUsedConnection,
  setPrimaryConnection,
  upsertConnection,
} from './registry-ops'
export type {
  ConnectionAgents,
  RosterAgent,
  RosterProfileMetadata,
} from './roster'
export {
  buildAgentRoster,
  parseRemoteProfileListing,
  rememberSshEnumeration,
  shouldRetrySshInventory,
} from './roster'
export type {
  ReuseMatchingPrimarySshBackendOptions,
} from './route-resolution'
export {
  registrySourceOwnsPrimaryBackend,
  resolveRegistryLocalRoute,
  reuseMatchingPrimarySshBackend,
  shouldDeferLocalEnumeration,
} from './route-resolution'
export type {
  ConnectionInput,
  UpdateEligibility,
} from './schema'
export {
  connectionDialFieldsChanged,
  connectionIdForLabel,
  mergeConnectionInput,
  normalizeConnectionInput,
  normalizeRegistry,
  updateEligibility,
} from './schema'
