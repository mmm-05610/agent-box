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
  // Non-secret UI selection: last valid project per Server instance (never per plugin id alone).
  const lastProject = new Map<string, string>()
  interface ConnState { draftActive: boolean; requestId?: string; restoreFailed: boolean }
  const states = new Map<string, ConnState>()
  const stateFor = (id: string) => { let s = states.get(id); if (!s) states.set(id, s = { draftActive: false, restoreFailed: false }); return s }
  const instanceKey = (client: AgentClient) => client.getSnapshot().connection.serverInstanceId ?? `conn:${client.getSnapshot().connection.id}`
  const supported = (agent: AgentSnapshot | undefined) => agent?.connection.capabilities.workspaces === 'supported'

  async function revalidate(connectionId: string) {
    const state = stateFor(connectionId)
    state.restoreFailed = false
    let client: AgentClient
    try { client = workspace.selected() } catch { return }
    if (!client.openWorkspace || !supported(client.getSnapshot())) return
    const key = instanceKey(client)
    const saved = lastProject.get(key)
    if (!saved) { const current = client.getSnapshot().workspaces?.selectedWorkspaceId; if (current) lastProject.set(key, current); return }
    try { await client.openWorkspace(saved) }
    catch { state.restoreFailed = true; lastProject.delete(key) } // invalid: clear selection and block sends
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
      state.requestId ??= globalThis.crypto.randomUUID() // one requestId held across unknown outcomes; no blind second create
      try {
        await client.createAndSend(client.getSnapshot().workspaces?.selectedWorkspaceId!, text, state.requestId)
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
      lastProject.set(instanceKey(client), info.id)
      const connectionId = workspace.getSnapshot().selectedConnectionId
      if (connectionId) stateFor(connectionId).restoreFailed = false
    },
    refreshWorkspaces: async () => { await workspace.selected().refreshWorkspaces?.() },
  }
}
