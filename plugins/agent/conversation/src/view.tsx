import { useState, useSyncExternalStore } from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, MessagePartPrimitive, ComposerPrimitive,
  type AppendMessage, type ThreadMessageLike, type ToolCallMessagePartProps } from '@assistant-ui/react'
import type { AgentMessage, AgentSessions } from '@extensions/ordessa.agent-contracts/contract.js'
import { styles } from './styles'

function useWorkspace(service: AgentSessions) { return useSyncExternalStore(service.subscribe, service.getSnapshot) }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export function SessionBrowser({ service }: { service: AgentSessions }) {
  const state = useWorkspace(service), agent = state.agent
  const [actionError, setActionError] = useState('')
  const perform = (action: () => Promise<void>) => { setActionError(''); void action().catch(error => setActionError(errorText(error))) }
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
    <div className="agent-session-list">{agent?.sessions.map(session => <button key={session.id}
      aria-current={agent.selectedSessionId === session.id ? 'true' : undefined}
      onClick={() => perform(() => service.openSession(session.id))}>
      <strong>{session.title}</strong><small>{session.updatedAt ? new Date(session.updatedAt).toLocaleString() : session.detail ?? session.id}</small>
    </button>)}</div>
  </section>
}

export function convertMessage(message: AgentMessage): ThreadMessageLike {
  const content: ThreadMessageLike['content'] = [
    ...(message.reasoning ? [{ type: 'reasoning' as const, text: message.reasoning }] : []),
    ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
    ...(message.tools ?? []).map(tool => ({ type: 'tool-call' as const, toolCallId: tool.id, toolName: tool.name,
      args: { value: JSON.stringify(tool.arguments ?? null) }, argsText: JSON.stringify(tool.arguments ?? null),
      result: tool.result === undefined ? undefined : typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result) })),
  ]
  return { id: message.id, role: message.role === 'user' ? 'user' : 'assistant', content,
    ...(message.role !== 'user' ? { status: message.status === 'starting' || message.status === 'running' || message.status === 'stop-requested' ? { type: 'running' as const }
      : message.status === 'cancelled' ? { type: 'incomplete' as const, reason: 'cancelled' as const }
        : message.status === 'failed' || message.status === 'unknown' ? { type: 'incomplete' as const, reason: 'error' as const, error: message.status }
          : { type: 'complete' as const, reason: 'stop' as const } } : {}) }
}
function TextPart() { return <MessagePartPrimitive.Text smooth={false} /> }
function ReasoningPart() { return <details className="agent-reasoning"><summary>Thinking</summary><MessagePartPrimitive.Text smooth={false} /></details> }
function ToolPart({ toolName, args, result }: ToolCallMessagePartProps) {
  return <details className="agent-tool"><summary>{toolName} · {result === undefined ? 'Running' : 'Result'}</summary>
    <pre>{JSON.stringify(args, null, 2)}</pre>{result !== undefined && <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>}</details>
}
function ChatMessage() {
  return <MessagePrimitive.Root className="agent-message"><MessagePrimitive.Parts components={{ Text: TextPart, Reasoning: ReasoningPart, tools: { Fallback: ToolPart } }} /></MessagePrimitive.Root>
}
function ConversationThread({ service, connectionId, sessionId }: { service: AgentSessions; connectionId: string; sessionId: string }) {
  const state = useWorkspace(service), agent = state.agent!
  const [actionError, setActionError] = useState('')
  const messages = agent.messages[sessionId] ?? []
  const run = Object.values(agent.runs).filter(item => item.sessionId === sessionId).at(-1)
  const running = run?.status === 'starting' || run?.status === 'running' || run?.status === 'stop-requested'
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage,
    onNew: async (message: AppendMessage) => {
      const text = message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
      setActionError('')
      try { await service.send(text) } catch (error) { setActionError(errorText(error)); throw error }
    },
  })
  return <AssistantRuntimeProvider runtime={runtime}><section className="agent-panel agent-conversation"><style>{styles}</style>
    <header className="agent-conversation-head"><div><small>SESSION</small><h2>{agent.sessions.find(item => item.id === sessionId)?.title ?? sessionId}</h2></div>
      <div className="agent-run-state" data-status={run?.status ?? 'idle'}>{run?.status ?? 'idle'}</div></header>
    {agent.connection.status !== 'connected' && <p role="alert" className="agent-error">Connection lost. The result of an active run is unknown. Reconnect from Connections.</p>}
    {run?.status === 'stop-requested' && <p role="status" className="agent-notice">Stop requested. Waiting for the agent to confirm.</p>}
    {run?.status === 'unknown' && <p role="status" className="agent-notice">Run outcome unknown after disconnect.</p>}
    {agent.diagnostic && <p role="status" className="agent-notice">{agent.diagnostic}</p>}
    {agent.options.length > 0 && <div className="agent-options">{agent.options.filter(option => option.id !== 'model' && option.availability === 'supported' && option.values?.length).map(option =>
      <label key={option.id}>{option.title}<select value={option.value ?? ''} onChange={event => { setActionError(''); void service.setOption(option.id, event.target.value).catch(error => setActionError(errorText(error))) }}>
        {option.values!.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}
      </select></label>)}</div>}
    <ThreadPrimitive.Root className="agent-thread"><ThreadPrimitive.Viewport className="agent-viewport">
      <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
    </ThreadPrimitive.Viewport><div className="agent-compose">
      <ComposerPrimitive.Root><ComposerPrimitive.Input aria-label="Message" placeholder="Message this agent" />
        <ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root>
      {running && <button disabled={run.status === 'stop-requested' || run.status === 'starting'} onClick={() => { setActionError(''); void service.stop(run.id).catch(error => setActionError(errorText(error))) }}>
        {run.status === 'stop-requested' ? 'Stop requested' : 'Request stop'}</button>}
    </div></ThreadPrimitive.Root>
    {actionError && <p role="alert" className="agent-error">{actionError}</p>}
  </section></AssistantRuntimeProvider>
}
export function Conversation({ service }: { service: AgentSessions }) {
  const state = useWorkspace(service), agent = state.agent, sessionId = agent?.selectedSessionId
  if (!state.selectedConnectionId) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Choose a connection</h2><p>Select an enabled agent from the left panel.</p></div>
  if (!agent) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Connecting</h2><p>{state.error ?? 'Waiting for the agent connection.'}</p></div>
  if (!sessionId) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Choose a session</h2><p>Open a previous session or start a new one.</p></div>
  return <ConversationThread key={`${state.selectedConnectionId}:${sessionId}`} service={service} connectionId={state.selectedConnectionId} sessionId={sessionId} />
}
