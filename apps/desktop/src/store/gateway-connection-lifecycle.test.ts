import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Connection lifecycle for registry-scoped secondary gateways:
//
//  1. Removing a connection must dispose its secondaries — remote/cloud
//     sources have no local process whose death would drop the socket, so
//     without an explicit dispose the WebSocket stays open and streams ghost
//     events until page reload.
//  2. A materially edited connection re-dials so fresh sockets target the
//     NEW endpoint.
//  3. When the Electron main reports the connection no longer exists
//     (`No connection with id`), the reconnect loop fail-stops and evicts
//     the entry instead of retrying forever.

const gatewayMocks = vi.hoisted(() => {
  const instances: { close: ReturnType<typeof vi.fn>; connectionState: string }[] = []

  return {
    connect: vi.fn(async (_wsUrl: string): Promise<void> => undefined),
    instances
  }
})

const reconnectStateMocks = vi.hoisted(() => ({
  afterSecondaryReopen: vi.fn(),
  beforeSecondaryReopen: vi.fn()
}))

vi.mock('@/api/client', () => ({
  setApiRequestConnection: vi.fn(),
  HermesGateway: class {
    connectionState = 'closed'
    close = vi.fn(() => {
      this.connectionState = 'closed'
    })
    connect = async (wsUrl: string): Promise<void> => {
      await gatewayMocks.connect(wsUrl)
      this.connectionState = 'open'
    }
    onEvent = vi.fn(() => () => {})
    onState = vi.fn(() => () => {})
    constructor() {
      gatewayMocks.instances.push(this as never)
    }
  }
}))
vi.mock('@/store/session', () => ({
  setConnection: vi.fn(),
  setGatewayState: vi.fn()
}))
vi.mock('@/store/notify-baseline', () => ({ markNativeNotifyBaseline: vi.fn() }))

const {
  activeGateway,
  closeLegacySecondaryGateways,
  closeSecondaryGateways,
  configureGatewayRegistry,
  disposeSecondariesForConnection,
  ensureActiveGatewayOpen,
  ensureGatewayForAgent,
  ensureGatewayForProfile,
  openGatewayForAgent,
  openGatewayForProfile,
  pruneSecondaryGateways,
  reconnectSecondaryGateways,
  registerSecondaryLifecycleObserver,
  retainGatewayForAgent,
  retireLocalProfileGateways,
  setPrimaryGateway
} = await import('./gateway')

function installDesktop(stub: Record<string, unknown>): void {
  ;(window as unknown as { hermesDesktop: unknown }).hermesDesktop = stub
}

function descriptorFor(connectionId: string, profile: string) {
  return {
    authMode: 'token',
    baseUrl: `https://${connectionId}.invalid`,
    mode: 'remote',
    profile,
    token: 'fake-test-token',
    wsUrl: `wss://${connectionId}.invalid/api/ws?profile=${profile}`
  }
}

beforeEach(() => {
  configureGatewayRegistry({ onEvent: vi.fn() } as never)
  setPrimaryGateway({ connectionState: 'open' } as never, 'default')
})

afterEach(() => {
  closeSecondaryGateways()
  gatewayMocks.instances.length = 0
  vi.clearAllMocks()
  vi.useRealTimers()
  delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
})

describe('disposeSecondariesForConnection', () => {
  it('keeps the previous source socket alive when another source becomes foreground', async () => {
    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    const homelab = gatewayMocks.instances[0]

    await ensureGatewayForAgent('office', 'default')

    expect(gatewayMocks.instances).toHaveLength(2)
    expect(homelab.close).not.toHaveBeenCalled()
    expect(homelab.connectionState).toBe('open')

    // Returning to the first source reuses its live socket. A source switch is
    // only a foreground routing change; it must never interrupt backend work.
    await ensureGatewayForAgent('homelab', 'default')
    expect(gatewayMocks.instances).toHaveLength(2)
    expect(activeGateway()).toBe(homelab)
  })

  it('closes and evicts every secondary scoped to the removed connection', async () => {
    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    await ensureGatewayForAgent('homelab', 'work')
    await ensureGatewayForAgent('office', 'default')

    expect(gatewayMocks.instances).toHaveLength(3)

    disposeSecondariesForConnection('homelab')

    // Both homelab sockets closed; the office socket untouched.
    expect(gatewayMocks.instances[0].close).toHaveBeenCalledOnce()
    expect(gatewayMocks.instances[1].close).toHaveBeenCalledOnce()
    expect(gatewayMocks.instances[2].close).not.toHaveBeenCalled()

    // No redial for a removal.
    expect(getConnectionFor).toHaveBeenCalledTimes(3)
  })

  it('re-dials disposed secondaries when redial is requested (material edit)', async () => {
    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    expect(gatewayMocks.connect).toHaveBeenCalledTimes(1)

    disposeSecondariesForConnection('homelab', { redial: true })

    // The redial runs async through the normal open path — flush it.
    await vi.waitFor(() => {
      expect(gatewayMocks.connect).toHaveBeenCalledTimes(2)
    })

    // Old socket closed, fresh descriptor fetched (would carry the new URL).
    expect(gatewayMocks.instances[0].close).toHaveBeenCalledOnce()
    expect(getConnectionFor).toHaveBeenCalledTimes(2)
  })

  it('defers edit redials until request and foreground owners release the old sockets', async () => {
    const foregroundScopes = new Set<string>()

    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    configureGatewayRegistry({ foregroundScopes: () => foregroundScopes, onEvent: vi.fn() } as never)
    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    await ensureGatewayForAgent('office', 'default')
    const release = await retainGatewayForAgent('homelab', 'default')
    await openGatewayForAgent('homelab', 'work')
    foregroundScopes.add('conn:homelab::work')

    const retainedSocket = gatewayMocks.instances[0]
    const foregroundSocket = gatewayMocks.instances[2]

    disposeSecondariesForConnection('homelab', { redial: true })

    // An edit may need a new endpoint, but it cannot sever an in-flight turn
    // or a mounted runtime's owner socket. No replacement is dialed yet.
    expect(retainedSocket.close).not.toHaveBeenCalled()
    expect(foregroundSocket.close).not.toHaveBeenCalled()
    expect(gatewayMocks.connect).toHaveBeenCalledTimes(3)

    release()
    await vi.waitFor(() => expect(gatewayMocks.connect).toHaveBeenCalledTimes(4))
    expect(retainedSocket.close).toHaveBeenCalledOnce()
    expect(foregroundSocket.close).not.toHaveBeenCalled()

    foregroundScopes.clear()
    pruneSecondaryGateways(new Set(['conn:homelab::default']))
    await vi.waitFor(() => expect(gatewayMocks.connect).toHaveBeenCalledTimes(5))
    expect(foregroundSocket.close).toHaveBeenCalledOnce()
  })

  it('is a no-op for blank or unknown connection ids', async () => {
    installDesktop({
      getConnectionFor: vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
        descriptorFor(connectionId, profile)
      )
    })

    await ensureGatewayForAgent('homelab', 'default')

    disposeSecondariesForConnection('')
    disposeSecondariesForConnection('ghost')

    expect(gatewayMocks.instances[0].close).not.toHaveBeenCalled()
  })
})

describe('legacy secondary teardown', () => {
  it('closes v1 profile sockets without detaching registered sources', async () => {
    const getConnection = vi.fn(async (profile: string) => descriptorFor('legacy-local', profile))

    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnection, getConnectionFor })

    await openGatewayForProfile('writer')
    await ensureGatewayForAgent('homelab', 'default')

    const legacy = gatewayMocks.instances[0]
    const registered = gatewayMocks.instances[1]

    closeLegacySecondaryGateways()

    expect(legacy.close).toHaveBeenCalledOnce()
    expect(registered.close).not.toHaveBeenCalled()
    expect(activeGateway()).toBe(registered)
  })
})

describe('secondary reconnect runtime scope', () => {
  // The gateway publishes generational facts and nothing else; the session-state
  // reaction to them is application/gateway/reconnect-session-effects. These
  // cases pin the FACTS (which generation boundary fires, in what order) and the
  // install/dispose contract the application module's single registration rides.
  interface ReopenFact {
    connectionId: string
    phase: 'after-reopen' | 'before-reopen'
    profile: string
    scope: string
  }

  let facts: ReopenFact[]
  let disposeObserver: () => void

  beforeEach(() => {
    facts = []
    disposeObserver = registerSecondaryLifecycleObserver({
      afterSecondaryReopen: scope => facts.push({ ...scope, phase: 'after-reopen' }),
      beforeSecondaryReopen: scope => facts.push({ ...scope, phase: 'before-reopen' })
    })
  })

  afterEach(() => {
    disposeObserver()
  })

  function installAgentDesktop() {
    installDesktop({
      getConnectionFor: vi.fn(async ({ connectionId, profile }) => descriptorFor(connectionId, profile))
    })
  }

  it('publishes nothing for a scope opening for the first time', async () => {
    installAgentDesktop()

    await openGatewayForAgent('homelab', 'writer')

    // A first open replaced no backend, so there is no stale generation to
    // invalidate and no claim from an old socket to reconcile.
    expect(facts).toEqual([])
  })

  it('invalidates the previous generation before the dial and reconciles after the socket opens', async () => {
    installAgentDesktop()

    await openGatewayForAgent('homelab', 'writer')
    const firstSocket = gatewayMocks.instances[0]
    pruneSecondaryGateways(new Set())
    expect(firstSocket.close).toHaveBeenCalledOnce()

    let finishReconnect!: () => void

    const reconnect = new Promise<void>(resolve => {
      finishReconnect = resolve
    })

    gatewayMocks.connect.mockImplementationOnce(() => reconnect)

    // A real user action after the renderer/main-process pool reaped an idle
    // profile creates a fresh Secondary entry and opens it directly. Runtime
    // bindings from the previous backend generation must be gone before the
    // new socket can publish `open`, or the request can immediately reuse a
    // process-local id the respawned backend never minted.
    const reopening = openGatewayForAgent('homelab', 'writer')

    await vi.waitFor(() => expect(gatewayMocks.connect).toHaveBeenCalledTimes(2))

    const expectedScope = { connectionId: 'homelab', profile: 'writer', scope: 'conn:homelab::writer' }

    expect(facts).toEqual([{ ...expectedScope, phase: 'before-reopen' }])
    expect(gatewayMocks.connect).toHaveBeenCalledTimes(2)

    finishReconnect()
    await reopening

    // The reconcile fact is withheld until the socket is actually usable.
    expect(facts).toEqual([
      { ...expectedScope, phase: 'before-reopen' },
      { ...expectedScope, phase: 'after-reopen' }
    ])
  })

  it('publishes the reconcile fact only on the far side of the dial', async () => {
    installAgentDesktop()

    await openGatewayForAgent('homelab', 'writer')
    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    reconnectSecondaryGateways()

    await vi.waitFor(() => expect(facts.filter(fact => fact.phase === 'after-reopen')).toHaveLength(1))

    expect(facts.map(fact => fact.phase)).toEqual(['before-reopen', 'after-reopen'])
    // The composite scope, not the bare profile: a reconnect must reconcile only
    // the sessions that arrived on THIS socket (two sources share profile names).
    expect(facts[1].scope).toBe('conn:homelab::writer')
  })

  it('publishes no reconcile fact when the reopen dial fails', async () => {
    installAgentDesktop()

    await openGatewayForAgent('homelab', 'writer')
    pruneSecondaryGateways(new Set())

    gatewayMocks.connect.mockRejectedValueOnce(new Error('ECONNRESET'))

    await expect(openGatewayForAgent('homelab', 'writer')).rejects.toThrow('ECONNRESET')

    // The dial never reached `open`: the session state stays exactly as the
    // working socket left it, and the reconnect backoff owns recovery.
    expect(facts.map(fact => fact.phase)).toEqual(['before-reopen'])
  })

  it('publishes the local pool identity for a legacy profile socket', async () => {
    installDesktop({
      getConnection: vi.fn(async (profile: string) => descriptorFor('legacy-local', profile))
    })

    await openGatewayForProfile('writer')
    pruneSecondaryGateways(new Set())

    await openGatewayForProfile('writer')

    expect(facts).toEqual([
      { connectionId: 'local', phase: 'before-reopen', profile: 'writer', scope: 'writer' },
      { connectionId: 'local', phase: 'after-reopen', profile: 'writer', scope: 'writer' }
    ])
  })

  it('keeps the live observer when a superseded installation is disposed', async () => {
    const stale = vi.fn()

    disposeObserver()

    const disposeStale = registerSecondaryLifecycleObserver({
      afterSecondaryReopen: stale,
      beforeSecondaryReopen: stale
    })

    const current = reconnectStateMocks.beforeSecondaryReopen

    disposeObserver = registerSecondaryLifecycleObserver({
      afterSecondaryReopen: reconnectStateMocks.afterSecondaryReopen,
      beforeSecondaryReopen: current
    })

    installAgentDesktop()

    await openGatewayForAgent('homelab', 'writer')
    pruneSecondaryGateways(new Set())
    await openGatewayForAgent('homelab', 'writer')

    // A previous mount's cleanup must not tear down the live wiring.
    disposeStale()

    await openGatewayForAgent('homelab', 'writer')
    pruneSecondaryGateways(new Set())
    await openGatewayForAgent('homelab', 'writer')

    expect(stale).not.toHaveBeenCalled()
    expect(current).toHaveBeenCalledTimes(2)
  })
})

describe('retireLocalProfileGateways', () => {
  it('retires both local profile scopes without touching the same-named remote agent', async () => {
    const getConnection = vi.fn(async (profile: string) => descriptorFor('legacy-local', profile))

    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnection, getConnectionFor })

    await openGatewayForProfile('selena')
    await ensureGatewayForAgent('local', 'selena')
    await ensureGatewayForAgent('homelab', 'selena')

    expect(gatewayMocks.instances).toHaveLength(3)
    const connectionCallsBeforeRetire = getConnection.mock.calls.length + getConnectionFor.mock.calls.length

    retireLocalProfileGateways('selena')

    expect(gatewayMocks.instances[0].close).toHaveBeenCalledOnce()
    expect(gatewayMocks.instances[1].close).toHaveBeenCalledOnce()
    expect(gatewayMocks.instances[2].close).not.toHaveBeenCalled()

    // A wake/reconnect sweep cannot redial either retired local scope. The
    // homelab entry remains open and therefore also needs no extra dial.
    reconnectSecondaryGateways()
    await Promise.resolve()
    expect(getConnection.mock.calls.length + getConnectionFor.mock.calls.length).toBe(connectionCallsBeforeRetire)
  })

  it('allows an explicit later access to create a fresh profile secondary', async () => {
    const getConnection = vi.fn(async (profile: string) => descriptorFor('legacy-local', profile))

    installDesktop({ getConnection })

    await openGatewayForProfile('selena')
    retireLocalProfileGateways('selena')
    await openGatewayForProfile('selena')

    expect(gatewayMocks.instances).toHaveLength(2)
    expect(gatewayMocks.instances[0].close).toHaveBeenCalledOnce()
    expect(gatewayMocks.instances[1].close).not.toHaveBeenCalled()
  })
})

describe('reconnectSecondaryGateways', () => {
  it('force-redials an open secondary whose transport may be half-open after wake', async () => {
    const getConnectionFor = vi.fn(async ({ connectionId, profile }: { connectionId: string; profile: string }) =>
      descriptorFor(connectionId, profile)
    )

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    expect(gatewayMocks.connect).toHaveBeenCalledTimes(1)
    expect(gatewayMocks.instances[0].connectionState).toBe('open')

    reconnectSecondaryGateways({ forceOpenSockets: true })

    await vi.waitFor(() => {
      expect(gatewayMocks.connect).toHaveBeenCalledTimes(2)
    })
    expect(gatewayMocks.instances[0].close).toHaveBeenCalledOnce()
    expect(getConnectionFor).toHaveBeenCalledTimes(2)
    expect(gatewayMocks.instances[0].connectionState).toBe('open')
  })
})

describe('reconnect fail-stop on a removed connection', () => {
  it('evicts the entry instead of retrying when the registry no longer knows the id', async () => {
    const getConnectionFor = vi
      .fn()
      .mockResolvedValueOnce(descriptorFor('homelab', 'default'))
      .mockRejectedValue(new Error('No connection with id "homelab".'))

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')
    expect(gatewayMocks.instances).toHaveLength(1)

    // Simulate the socket dropping after the connection was removed.
    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    // ensureActiveGatewayOpen drives reconnectSecondary for the active scope.
    const result = await ensureActiveGatewayOpen()

    expect(result).toBeNull()
    // Fail-stop: the entry was disposed + evicted, so a second drive finds
    // nothing to retry (no further getConnectionFor calls).
    const callsAfterFailStop = getConnectionFor.mock.calls.length
    await ensureActiveGatewayOpen()
    expect(getConnectionFor.mock.calls.length).toBe(callsAfterFailStop)
  })

  it('keeps retrying on ordinary transport failures', async () => {
    const getConnectionFor = vi
      .fn()
      .mockResolvedValueOnce(descriptorFor('homelab', 'default'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(descriptorFor('homelab', 'default'))

    installDesktop({ getConnectionFor })

    await ensureGatewayForAgent('homelab', 'default')

    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    // First drive fails with a transport error → entry survives.
    await ensureActiveGatewayOpen()
    // Second drive succeeds against the surviving entry.
    const reopened = await ensureActiveGatewayOpen()

    expect(reopened).not.toBeNull()
  })

  it('evicts a LOCAL profile entry when the deletion guard reports the profile gone (#88769)', async () => {
    // A stale rail badge clicked after deletion drives reconnects against
    // Electron's spawn guard, which rejects every attempt. That rejection is
    // permanent — the loop must fail-stop, not hammer the guard on backoff.
    // sharedPrimaryRoute probes getConnection too, so resolve enough calls to
    // get the socket open before the guard starts rejecting.
    let connectionCalls = 0

    const getConnection = vi.fn(async () => {
      connectionCalls += 1

      if (connectionCalls <= 3) {
        return descriptorFor('legacy-local', 'selena')
      }

      throw new Error('Profile "selena" no longer exists.')
    })

    installDesktop({ getConnection })

    await openGatewayForProfile('selena')
    await ensureGatewayForProfile('selena')
    expect(gatewayMocks.instances).toHaveLength(1)
    connectionCalls = 99

    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    // Drive the reconnect: the guard rejection must dispose + evict.
    const result = await ensureActiveGatewayOpen()

    expect(result).toBeNull()
    const callsAfterFailStop = getConnection.mock.calls.length
    await ensureActiveGatewayOpen()
    expect(getConnection.mock.calls.length).toBe(callsAfterFailStop)
  })

  it('fail-stops on the mid-delete guard rejection too', async () => {
    let connectionCalls = 0

    const getConnection = vi.fn(async () => {
      connectionCalls += 1

      if (connectionCalls <= 3) {
        return descriptorFor('legacy-local', 'selena')
      }

      throw new Error('Profile "selena" is being deleted.')
    })

    installDesktop({ getConnection })

    await openGatewayForProfile('selena')
    await ensureGatewayForProfile('selena')
    connectionCalls = 99

    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    await ensureActiveGatewayOpen()

    const callsAfterFailStop = getConnection.mock.calls.length
    await ensureActiveGatewayOpen()
    expect(getConnection.mock.calls.length).toBe(callsAfterFailStop)
  })

  it('waits out an in-flight secondary activation instead of failing instantly (#88880)', async () => {
    // A remote secondary whose activation is ALREADY in flight from another
    // path (wake sweep, agent activation) used to make ensureActiveGatewayOpen
    // return null immediately: reconnectSecondary early-returns on
    // `reconnecting`, the socket is still closed, and the caller surfaced
    // "Hermes gateway is not connected" on the Sessions + action. The drive
    // must ride out the in-flight activation and hand back the opened socket.
    let releaseDial: (() => void) | undefined

    const dialGate = new Promise<void>(resolve => {
      releaseDial = resolve
    })

    const getConnectionFor = vi.fn(async () => descriptorFor('homelab', 'default'))

    installDesktop({ getConnectionFor })

    gatewayMocks.connect
      .mockImplementationOnce(async () => undefined) // initial open
      .mockImplementationOnce(async () => {
        await dialGate // the sweep-driven reconnect dial hangs until released
      })

    await ensureGatewayForAgent('homelab', 'default')

    const socket = gatewayMocks.instances[0] as unknown as { connectionState: string }
    socket.connectionState = 'closed'

    // Another path (the wake sweep) starts the reconnect first — the drive
    // below meets an entry that is already `reconnecting`.
    reconnectSecondaryGateways()
    await Promise.resolve()

    const driving = ensureActiveGatewayOpen()

    await new Promise(resolve => setTimeout(resolve, 300))
    releaseDial?.()

    const result = await driving

    expect(result).not.toBeNull()
    expect((result as unknown as { connectionState: string }).connectionState).toBe('open')
  })
})
