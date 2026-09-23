import { useState, useSyncExternalStore } from 'react'
import type { AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'
import { projectSessionGroups, sessionActivity } from './projection'
import { styles } from './styles'

function useWorkspace(service: AgentSessions) { return useSyncExternalStore(service.subscribe, service.getSnapshot) }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function SessionBrowser({ service }: { service: AgentSessions }) {
  const state = useWorkspace(service), agent = state.agent
  const [actionError, setActionError] = useState('')
  const perform = (action: () => Promise<void>) => { setActionError(''); void action().catch(error => setActionError(errorText(error))) }
  const groups = projectSessionGroups(agent?.sessions ?? [])
  const showGroups = groups.length > 1 || groups.some(group => !group.standalone)
  return <section className="agent-panel agent-sessions"><style>{styles}</style>
    <div className="agent-section-head"><h2>Connections</h2><span>{state.available.length}</span></div>
    {state.available.length ? <div className="agent-connections">{state.available.map(item => <button key={item.id}
      className={state.selectedConnectionId === item.id ? 'agent-selected' : ''}
      aria-pressed={state.selectedConnectionId === item.id}
      onClick={() => perform(async () => { await service.selectConnection(item.id); await service.refreshSessions() })}>
      <span className="agent-connection-mark" aria-hidden="true" /><span>{item.title}</span>
      {state.selectedConnectionId === item.id && <small>{state.connectingId === item.id ? 'Connecting' : agent?.connection.status ?? 'Disconnected'}</small>}
    </button>)}</div> : <p className="agent-empty">No agent connection is enabled. Enable an adapter in the local extension list.</p>}
    {state.selectedConnectionId && <div className="agent-actions">
      <button onClick={() => perform(async () => { await service.reconnect(state.selectedConnectionId!); await service.refreshSessions() })}>Reconnect</button>
      <button disabled={!agent || agent.connection.status !== 'connected'} onClick={() => perform(() => service.refreshSessions())}>Refresh</button>
    </div>}
    {(state.error || actionError || agent?.connection.error) && <p role="alert" className="agent-error">{actionError || state.error || agent?.connection.error}</p>}
    <div className="agent-section-head agent-session-heading"><h2>Sessions</h2><button disabled={!agent || agent.connection.status !== 'connected'}
      onClick={() => perform(() => service.newSession())}>New session</button></div>
    {agent?.sessionList === 'loading' && <p role="status" className="agent-empty">Loading sessions…</p>}
    {agent?.sessionList === 'partial' && <p className="agent-notice">Only part of the history is available.</p>}
    {agent?.sessionList === 'error' && <p role="alert" className="agent-error">Session list failed. Refresh to try again.</p>}
    {agent?.sessionList === 'ready' && !agent.sessions.length && <p className="agent-empty">No sessions yet. Start one above.</p>}
    <div className="agent-session-list">{groups.map(group => <div key={group.key} className="agent-session-group-block">
      {showGroups && <p className="agent-session-group">{group.title}</p>}
      {group.sessions.map(session => { const activity = agent && sessionActivity(agent, session.id)
        return <button key={session.id}
          aria-current={agent?.selectedSessionId === session.id ? 'true' : undefined}
          onClick={() => perform(() => service.openSession(session.id))}>
          <strong>{session.title}</strong><small>{session.updatedAt ? new Date(session.updatedAt).toLocaleString() : session.detail ?? session.id}</small>
          {activity?.openRun && <small className="agent-session-state" data-status="running">Running</small>}
          {activity?.awaiting && <small className="agent-session-state" data-status="awaiting">Awaiting answer</small>}
        </button> })}
    </div>)}</div>
  </section>
}
