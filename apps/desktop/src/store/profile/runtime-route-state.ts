import { atom } from 'nanostores'

// Which backend the live gateway is routed to, and the two presentation
// signals that ride on a switch being in flight. State only: the effects that
// PUBLISH a route (activating a socket) and the effects that REACT to it
// (re-scoping the API client, invalidating caches) are application work —
// `application/profile/{runtime-selection,active-route-effects}`.

// The profile the live gateway WebSocket is currently connected to. Initialized
// to the primary (window) backend's profile on boot. The gateway registry
// mirrors its own route into this atom via the onActiveRouteChanged callback
// (wired in use-gateway-boot's configureGatewayRegistry), so registry-internal
// eviction fallbacks (idle reap, connection removal, profile delete) can never
// leave this naming a profile the active socket no longer serves (#89206).
export const $activeGatewayProfile = atom<string>('default')

// Target profile while a gateway swap is mid-flight (spawning/reconnecting that
// profile's backend), else null. Drives the chat's "waking up <profile>" loader
// so a lazy spawn doesn't read as a hang. Single-profile users never swap.
export const $gatewaySwapTarget = atom<string | null>(null)

// Profile whose wake resolved PAINT-FIRST while the active-profile gate was
// still unsatisfied (#89843): on a shared-remote connection every profile is
// legitimately served through the primary socket, so $activeGatewayProfile
// never moves to the bot's profile and the old gate burned the whole 20s
// hydration budget with the transcript already painted. The stored history is
// shown immediately instead; this atom drives the subtle "Syncing…" affordance
// until the gate catches up (or the next wake supersedes it). Null when no
// paint-first wake is outstanding.
export const $hydrationSyncProfile = atom<string | null>(null)
