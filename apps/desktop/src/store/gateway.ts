// Multi-profile gateway routing, decomposed:
// - registry-state  — the HMR-stable singleton, activation, turn-lease ledger
// - route-probes    — primary/shared-remote classification + primary RPCs
// - secondary-pool  — socket entries: create/open/reconnect/dispose/prune
// - requests        — one-shot RPC facades
// - leases          — holds across sequences, relay ticks, live turns
// This file stays the stable import path with the unchanged public surface.

export {
  $activeGatewayRoute,
  $gateway,
  activeGateway,
  activeGatewayConnectionId,
  activeGatewayProfileKey,
  configureGatewayRegistry,
  emitLocalGatewayEvent,
  gatewayActivationEpoch,
  isActivePrimary,
  liveSecondaryConnectionIds,
  reportPrimaryGatewayState,
  setPrimaryGateway,
  setPrimaryGatewayConnection,
  setPrimaryGatewayConnectionId
} from './gateway/registry-state'
export {
  closeLegacySecondaryGateways,
  closeSecondaryGateways,
  disposeSecondariesForConnection,
  ensureActiveGatewayOpen,
  ensureGatewayForAgent,
  ensureGatewayForProfile,
  openGatewayForAgent,
  openGatewayForProfile,
  openSecondaryCount,
  pruneSecondaryGateways,
  reconnectSecondaryGateways,
  retireLocalProfileGateways,
  touchSecondaryGateways
} from './gateway/secondary-pool'
export { requestGatewayForAgent, requestGatewayForProfile } from './gateway/requests'
export {
  retainGatewayForAgent,
  retainGatewayForRelay,
  retainGatewayForSessionTurn
} from './gateway/leases'
