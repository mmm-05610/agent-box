import type { ResourceScope } from '@ordessa/extension-api'
import type { AgentClient, AgentConnections, AgentSessions, AgentSnapshot, AgentWorkspaceSnapshot } from '@extensions/ordessa.agent-contracts/contract.js'

/** Thin delegate facade: client holding, selection, and reconnection live in the connections
 * service workspace (P2-1 extraction); session operations project through its selected client.
 * CP-SESSION-001 (FC-0021): the draft and the per-Server project gate are owned here —
 * New session never reaches a client, and first send goes through createAndSend with one
 * requestId held until accepted. */
export function createAgentSessions(lifetime: ResourceScope, connections: AgentConnections): AgentSessions {
  void lifetime // workspace ownership moved to the connections service scope (P2-1)
  const workspace = connections.workspace
  interface ConnState { draftActive: boolean; requestId?: string; restoreFailed: boolean }
  const states = new Map<string, ConnState>()
  const stateFor = (id: string) => { let s = states.get(id); if (!s) states.set(id, s = { draftActive: false, restoreFailed: false }); return s }
  // Non-secret UI selection: last valid project per authenticated Server instance (origin+serverId),
  // mirrored to renderer localStorage so the choice survives a desktop restart (FC-0030). Never keyed
  // by plugin id or bare origin; without identity there is no restore path at all.
  const lastProject = new Map<string, string>()
  const storageKey = (identity: string) => `ordessa.agent.project.${identity}`
  const rememberProject = (identity: string, id: string) => {
    lastProject.set(identity, id)
    try { globalThis.localStorage?.setItem(storageKey(identity), id) } catch { /* the gate revalidates on open regardless */ }
  }
  const forgetProject = (identity: string) => {
    lastProject.delete(identity)
    try { globalThis.localStorage?.removeItem(storageKey(identity)) } catch { /* best effort */ }
  }
  const recallProject = (identity: string) => {
    const remembered = lastProject.get(identity)
    if (remembered) return remembered
    try {
      const stored = globalThis.localStorage?.getItem(storageKey(identity))
      if (stored) { lastProject.set(identity, stored); return stored }
    } catch { /* storage unavailable: manual selection only */ }
    return undefined
  }
  const identityOf = (client: AgentClient) => client.getSnapshot().connection.serverInstanceId
  const supported = (agent: AgentSnapshot | undefined) => agent?.connection.capabilities.workspaces === 'supported'

  async function revalidate(connectionId: string) {
    const state = stateFor(connectionId)
    state.restoreFailed = false
    let client: AgentClient
    try { client = workspace.selected() } catch { return }
    if (!client.openWorkspace || !supported(client.getSnapshot())) return
    const identity = identityOf(client)
    if (!identity) return // no authenticated instance identity: require a manual selection, never a stale unlock
    const snapshot = client.getSnapshot()
    const saved = recallProject(identity)
    if (!saved) {
      const current = snapshot.workspaces?.selectedWorkspaceId
      if (current) rememberProject(identity, current)
      return
    }
    // The stored id must still be listed unarchived by this Server before it may be opened (FC-0030).
    if (snapshot.workspaces?.state === 'ready' && !snapshot.workspaces.items.some(item => item.id === saved)) {
      state.restoreFailed = true; forgetProject(identity)
      return
    }
    try { await client.openWorkspace(saved) }
    catch { state.restoreFailed = true; forgetProject(identity) } // invalid: clear the record and block sends
  }

  const listeners = new Set<() => void>()
  workspace.subscribe(notify)
  function notify() { cached = null; for (const listener of [...listeners]) listener() }

  let cached: { base: AgentWorkspaceSnapshot; signature: string; derived: AgentWorkspaceSnapshot } | null = null
  const signature = (base: AgentWorkspaceSnapshot) => {
    const state = base.selectedConnectionId ? stateFor(base.selectedConnectionId) : undefined
    return `${base.selectedConnectionId ?? '-'}|${state?.draftActive}|${state?.restoreFailed}|${base.agent?.connection.capabilities.workspaces}|${base.agent?.workspaces?.selectedWorkspaceId}`
  }
  function derive(base: AgentWorkspaceSnapshot): AgentWorkspaceSnapshot {
    if (!base.selectedConnectionId) return base
    const state = stateFor(base.selectedConnectionId)
    const block = !supported(base.agent) ? 'unsupported' as const
      : state.restoreFailed ? 'project-invalid' as const
      : !base.agent?.workspaces?.selectedWorkspaceId ? 'no-project' as const : undefined
    return { ...base, draft: {
      active: state.draftActive,
      workspaceId: base.agent?.workspaces?.selectedWorkspaceId,
      canSend: block === undefined,
      ...(block ? { blockReason: block } : {}),
    } }
  }
  const gate = () => {
    const snapshot = derive(workspace.getSnapshot())
    if (!snapshot.draft?.canSend) throw Error(`Agent project gate: ${snapshot.draft?.blockReason ?? 'closed'}`)
    return snapshot
  }

  return {
    getSnapshot: () => {
      const base = workspace.getSnapshot()
      const next = signature(base)
      if (cached && cached.base === base && cached.signature === next) return cached.derived
      cached = { base, signature: next, derived: derive(base) }
      return cached.derived
    },
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectConnection: async id => { await workspace.selectConnection(id); await revalidate(id) },
    reconnect: async id => { await workspace.reconnect(id); await revalidate(id) },
    refreshSessions: () => workspace.selected().refreshSessions(),
    // Legacy passthrough kept type-compatible for the direct prototypes; the CP UI never calls it (FC-0021).
    newSession: () => workspace.selected().newSession().then(() => undefined),
    openSession: id => { const state = workspace.getSnapshot().selectedConnectionId ? stateFor(workspace.getSnapshot().selectedConnectionId!) : undefined; if (state) state.draftActive = false; return workspace.selected().openSession(id) },
    send: async text => {
      const client = workspace.selected()
      const sessionId = client.getSnapshot().selectedSessionId
      if (sessionId) return client.send(sessionId, text) // existing session keeps its own bound project
      const state = stateFor(workspace.getSnapshot().selectedConnectionId ?? '-')
      if (!state.draftActive) throw Error('No Agent session selected')
      gate() // first send is blocked without a revalidated project — never falls back
      if (!client.createAndSend) throw Error('Agent project gate: unsupported')
      const workspaceId = client.getSnapshot().workspaces?.selectedWorkspaceId!
      state.requestId ??= globalThis.crypto.randomUUID() // one requestId held across unknown outcomes; no blind second create
      try {
        const accepted = await client.createAndSend(workspaceId, text, state.requestId)
        // The draft ends only when the accepted real session id is in the snapshot, selected, and bound
        // to the chosen project (FC-0031); otherwise input and requestId stay held for an idempotent retry.
        const after = client.getSnapshot()
        const session = after.sessions.find(item => item.id === accepted?.sessionId)
        const project = after.workspaces?.items.find(item => item.id === workspaceId)
        const bound = !!session?.workspaceId
          && (session.workspaceId === workspaceId || session.workspaceId === project?.normalizedPath)
        if (!accepted?.sessionId || !bound || after.selectedSessionId !== accepted.sessionId)
          throw Error('Agent first-send session mismatch')
        state.requestId = undefined
        state.draftActive = false
        notify()
      } catch (error) { notify(); throw error }
    },
    stop: runId => {
      const client = workspace.selected(), run = client.getSnapshot().runs[runId]
      if (!run) throw Error('Agent run unavailable')
      return client.stop(run.sessionId, runId)
    },
    respond: (id, answer) => workspace.selected().respond(id, answer),
    setOption: (id, value) => workspace.selected().setOption(id, value),
    startDraft: () => { const id = workspace.getSnapshot().selectedConnectionId; if (id) { stateFor(id).draftActive = true; notify() } },
    discardDraft: () => { const id = workspace.getSnapshot().selectedConnectionId; if (id) { const state = stateFor(id); state.draftActive = false; state.requestId = undefined; notify() } },
    selectWorkspace: async id => {
      const client = workspace.selected()
      if (!client.openWorkspace) throw Error('Agent project gate: unsupported')
      const info = await client.openWorkspace(id)
      const identity = identityOf(client)
      if (identity) rememberProject(identity, info.id) // a selection without identity is live but never persisted
      const connectionId = workspace.getSnapshot().selectedConnectionId
      if (connectionId) stateFor(connectionId).restoreFailed = false
    },
    refreshWorkspaces: async () => { await workspace.selected().refreshWorkspaces?.() },
  }
}
