import { describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

import { resolveLegacyOwnerBackfillScope, stampRowsWithOwningConnection } from './session-owner-stamp'

describe('stampRowsWithOwningConnection', () => {
  const row = (over: Partial<SessionInfo> = {}): SessionInfo =>
    ({ id: 'session-1', pinned: false, profile: 'default', source: 'desktop', title: 'Session', ...over }) as SessionInfo

  it('stamps an untagged row with the serving non-local connection', () => {
    expect(stampRowsWithOwningConnection([row()], 'gw-b')).toEqual([{ ...row(), connection_id: 'gw-b' }])
  })

  it('never clobbers an owner the row already names', () => {
    // Every other connection_id writer works from an exact captured owner
    // route; those are authoritative and this helper must not overwrite them.
    const owned = row({ connection_id: 'gw-a' })

    expect(stampRowsWithOwningConnection([owned], 'gw-b')[0].connection_id).toBe('gw-a')
  })

  it("leaves a bare local row bare — `local` is never a useful owner", () => {
    for (const owner of [null, undefined, '', '   ', 'local']) {
      expect(stampRowsWithOwningConnection([row()], owner)).toEqual([row()])
    }
  })
})

describe('resolveLegacyOwnerBackfillScope (#94724 single-match owner backfill)', () => {
  it('targets the serving registered connection (the backend that serves a page owns its rows)', () => {
    const scope = resolveLegacyOwnerBackfillScope({
      hasRegistryTopology: true,
      registryConnectionIds: ['local', 'gw-b', 'gw-c'],
      servingConnectionId: 'gw-b'
    })

    expect(scope).toEqual({ connectionId: 'gw-b', profile: null })
  })

  it('targets the primary store when the primary pool is serving', () => {
    // The primary's own per-profile store is a single known owner even with
    // several registered connections — its rows can live nowhere else.
    const scope = resolveLegacyOwnerBackfillScope({
      hasRegistryTopology: true,
      registryConnectionIds: ['gw-b', 'gw-c'],
      servingConnectionId: null
    })

    expect(scope).toEqual({ connectionId: null, profile: null })
  })

  it("treats the explicit 'local' source as the primary store", () => {
    expect(
      resolveLegacyOwnerBackfillScope({
        hasRegistryTopology: true,
        registryConnectionIds: ['gw-b'],
        servingConnectionId: 'local'
      })
    ).toEqual({ connectionId: null, profile: null })
  })

  it('fails closed when the serving source is unknown and several backends could own the store', () => {
    // Multi-candidate: never guess. The rows stay NULL and the read-only
    // stored-transcript path keeps their history reachable.
    expect(
      resolveLegacyOwnerBackfillScope({
        hasRegistryTopology: true,
        registryConnectionIds: ['gw-b', 'gw-c'],
        servingConnectionId: undefined
      })
    ).toBeNull()
  })

  it('resolves the single registered backend when the serving source is unknown but only one candidate exists', () => {
    expect(
      resolveLegacyOwnerBackfillScope({
        hasRegistryTopology: true,
        registryConnectionIds: ['local', 'gw-b'],
        servingConnectionId: undefined
      })
    ).toEqual({ connectionId: 'gw-b', profile: null })
  })

  it('fails closed when the serving connection is not in the registry', () => {
    expect(
      resolveLegacyOwnerBackfillScope({
        hasRegistryTopology: true,
        registryConnectionIds: ['gw-b'],
        servingConnectionId: 'gw-unregistered'
      })
    ).toBeNull()
  })

  it('does nothing without registry topology (legacy single-backend installs are unaffected)', () => {
    expect(
      resolveLegacyOwnerBackfillScope({
        hasRegistryTopology: false,
        registryConnectionIds: [],
        servingConnectionId: null
      })
    ).toBeNull()
  })
})
