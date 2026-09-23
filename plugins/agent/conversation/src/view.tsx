import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, MessagePartPrimitive,
  type AppendMessage, type ThreadMessageLike, type ToolCallMessagePartProps } from '@assistant-ui/react'
import type { AgentMessage, AgentSessions, AgentToolCall, AgentWorkspaceSnapshot } from '@extensions/ordessa.agent-contracts/contract.js'
import { styles } from './styles'
import { SessionInteractions } from './interaction-card'

type Draft = NonNullable<AgentWorkspaceSnapshot['draft']>

// The project gate is decided by the Sessions facade; this surface only names the reason and points there (FC-0043 Q2).
const draftBlockCopy: Record<NonNullable<Draft['blockReason']>, string> = {
  unsupported: 'This connection cannot open a session in a project. Pick the project in Sessions before sending.',
  'no-project': 'No project is selected for the new session. Choose it in Sessions first.',
  'project-invalid': 'The selected project is no longer valid on this Server. Re-select it in Sessions first.',
}

function useWorkspace(service: AgentSessions) { return useSyncExternalStore(service.subscribe, service.getSnapshot) }
// Pane identity inside one connection: a draft is keyed by a fixed marker that no session id can produce,
// so `session:<id>` and the draft slot never collide (FC-0052).
const draftPane = 'draft'
const sessionPane = (sessionId: string) => `session:${sessionId}`
interface Compositions { read(connectionId: string, pane: string): string; write(connectionId: string, pane: string, value: string): void }
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
// Provider and thinking-intensity selection stay off this surface by product decision; any other supported option still renders.
const hiddenOptionIds = new Set(['model', 'thinking', 'effort'])

export function convertMessage(message: AgentMessage): ThreadMessageLike {
  const content: ThreadMessageLike['content'] = [
    ...(message.reasoning ? [{ type: 'reasoning' as const, text: message.reasoning }] : []),
    ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
    ...(message.tools ?? []).map(tool => ({ type: 'tool-call' as const, toolCallId: tool.id, toolName: tool.name,
      args: { value: JSON.stringify(tool.arguments ?? null) }, argsText: JSON.stringify(tool.arguments ?? null),
      result: tool.result === undefined ? undefined : typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result),
      // The connector reports four terminal-ish states; result presence alone cannot distinguish unknown from running.
      artifact: { toolStatus: tool.status },
      ...(tool.status === 'failed' ? { isError: true } : {}) })),
  ]
  return { id: message.id, role: message.role === 'user' ? 'user' : 'assistant', content,
    ...(message.role !== 'user' ? { status: message.status === 'starting' || message.status === 'running' || message.status === 'stop-requested' ? { type: 'running' as const }
      : message.status === 'cancelled' ? { type: 'incomplete' as const, reason: 'cancelled' as const }
        : message.status === 'failed' || message.status === 'unknown' ? { type: 'incomplete' as const, reason: 'error' as const, error: message.status }
          : { type: 'complete' as const, reason: 'stop' as const } } : {}) }
}
function TextPart() { return <MessagePartPrimitive.Text smooth={false} /> }
function ReasoningPart() { return <details className="agent-reasoning"><summary>Thinking</summary><MessagePartPrimitive.Text smooth={false} /></details> }
// Partially streamed arguments are not valid JSON yet; show them verbatim rather than dropping them.
const prettyJson = (text: string) => { try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return text } }
const toolStateLabels: Record<AgentToolCall['status'], string> = { running: 'Running', completed: 'Result', failed: 'Failed', unknown: 'Outcome unknown' }
function ToolPart({ toolName, argsText, result, artifact }: ToolCallMessagePartProps) {
  const status = (artifact as { toolStatus: AgentToolCall['status'] }).toolStatus
  return <details className="agent-tool" data-tool-state={status}><summary>{toolName} · {toolStateLabels[status]}</summary>
    <pre>{prettyJson(argsText)}</pre>{result !== undefined && <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>}</details>
}
function ChatMessage() {
  return <MessagePrimitive.Root className="agent-message"><MessagePrimitive.Parts components={{ Text: TextPart, Reasoning: ReasoningPart, tools: { Fallback: ToolPart } }} /></MessagePrimitive.Root>
}
function ConversationThread({ service, connectionId, sessionId, draft, compositions }: { service: AgentSessions; connectionId: string; sessionId: string; draft: Draft | undefined; compositions: Compositions }) {
  const state = useWorkspace(service), agent = state.agent!
  const [actionError, setActionError] = useState('')
  // FC-0043's rule, kept deliberately: a draft is the pane only while nothing is selected, because the
  // facade routes a send by `selectedSessionId` first (plugins/agent/sessions/src/model.ts:110).
  const drafting = !sessionId && draft?.active === true
  const pane = drafting ? draftPane : sessionPane(sessionId)
  // Held above the keyed remount so switching panes costs the user nothing, and a rejected send cannot
  // silently empty the field (FC-0043 Q3).
  const [text, setText] = useState(() => compositions.read(connectionId, pane)), [sending, setSending] = useState(false)
  const edit = (value: string) => { setText(value); compositions.write(connectionId, pane, value) }
  const blocked = drafting && draft?.canSend === false
  const messages = agent.messages[sessionId] ?? []
  const run = Object.values(agent.runs).filter(item => item.sessionId === sessionId).at(-1)
  const running = run?.status === 'starting' || run?.status === 'running' || run?.status === 'stop-requested'
  const deliver = async (value: string) => {
    if (sending || blocked || !value.trim()) return
    setSending(true); setActionError('')
    // The facade only resolves once the real session id is confirmed in the snapshot; anything else keeps the text.
    try { await service.send(value); edit('') } catch (error) { setActionError(errorText(error)) }
    finally { setSending(false) }
  }
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage,
    onNew: async (message: AppendMessage) => { await deliver(message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')) },
  })
  const submit = async () => { await deliver(text) }
  return <AssistantRuntimeProvider runtime={runtime}><section className="agent-panel agent-conversation"><style>{styles}</style>
    <header className="agent-conversation-head"><div><small>{drafting ? 'NEW SESSION' : 'SESSION'}</small><h2>{agent.sessions.find(item => item.id === sessionId)?.title ?? (drafting ? 'New session' : sessionId)}</h2></div>
      <div className="agent-run-state" data-status={run?.status ?? 'idle'}>{run?.status ?? 'idle'}</div></header>
    {agent.connection.status !== 'connected' && <p role="alert" className="agent-error">Connection lost. The result of an active run is unknown. Reconnect from Connections.</p>}
    {run?.status === 'stop-requested' && <p role="status" className="agent-notice">Stop requested. Waiting for the agent to confirm.</p>}
    {run?.status === 'unknown' && <p role="status" className="agent-notice">Run outcome unknown after disconnect.</p>}
    {agent.diagnostic && <p role="status" className="agent-notice">{agent.diagnostic}</p>}
    <SessionInteractions service={service} agent={agent} sessionId={sessionId} />
    {agent.options.length > 0 && <div className="agent-options">{agent.options.filter(option => !hiddenOptionIds.has(option.id) && option.availability === 'supported' && option.values?.length).map(option =>
      <label key={option.id}>{option.title}<select value={option.value ?? ''} onChange={event => { setActionError(''); void service.setOption(option.id, event.target.value).catch(error => setActionError(errorText(error))) }}>
        {option.values!.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}
      </select></label>)}</div>}
    <ThreadPrimitive.Root className="agent-thread"><ThreadPrimitive.Viewport className="agent-viewport">
      <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
      {!messages.length && <p className="agent-empty">{drafting ? 'Nothing has been sent yet. Your first message opens the session in the selected project.' : 'No messages in this session yet.'}</p>}
    </ThreadPrimitive.Viewport><div className="agent-compose">
      {drafting && blocked && <p role="status" className="agent-compose-block">{draftBlockCopy[draft!.blockReason ?? 'no-project']}</p>}
      <form onSubmit={event => { event.preventDefault(); void submit() }}>
        <textarea aria-label="Message" placeholder={drafting ? 'Message the new session' : 'Message this agent'}
          value={text} onChange={event => edit(event.target.value)} readOnly={sending}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() } }} />
        <button type="submit" disabled={sending || blocked || !text.trim()}>{drafting ? 'Start session' : 'Send'}</button>
      </form>
      {running && <button disabled={run.status === 'stop-requested' || run.status === 'starting'} onClick={() => { setActionError(''); void service.stop(run.id).catch(error => setActionError(errorText(error))) }}>
        {run.status === 'stop-requested' ? 'Stop requested' : 'Request stop'}</button>}
    </div></ThreadPrimitive.Root>
    {actionError && <p role="alert" className="agent-error">{actionError}</p>}
  </section></AssistantRuntimeProvider>
}
export function Conversation({ service }: { service: AgentSessions }) {
  const state = useWorkspace(service), agent = state.agent, sessionId = agent?.selectedSessionId, connectionId = state.selectedConnectionId
  // Unsent text lives here, not in the thread: the thread remounts on every pane change (FC-0052).
  const compositions = useState(() => new Map<string, Map<string, string>>())[0]
  const lastDraftState = useState(() => new Map<string, { active: boolean; sessionId: string }>())[0]
  const store = useMemo<Compositions>(() => ({
    read(connection, pane) { return compositions.get(connection)?.get(pane) ?? '' },
    write(connection, pane, value) {
      let panes = compositions.get(connection)
      if (!panes) compositions.set(connection, panes = new Map())
      panes.set(pane, value)
    },
  }), [compositions])
  // The Sessions facade ends a draft both on discard and on opening another session
  // (plugins/agent/sessions/src/model.ts:106, :141), and only this surface can tell them apart:
  // a draft that ends while the selection stays exactly as it was was discarded, so it must not
  // come back. A draft that ends because the selection moved is only being waited on.
  const active = state.draft?.active === true
  useEffect(() => {
    if (!connectionId) return
    const current = { active, sessionId: sessionId ?? '' }
    const previous = lastDraftState.get(connectionId)
    lastDraftState.set(connectionId, current)
    if (previous?.active && !active && previous.sessionId === current.sessionId)
      compositions.get(connectionId)?.delete(draftPane)
  })
  // A draft has no backend session yet, so the absence of a selection is the new-session case, not an empty pane (FC-0030).
  if (!connectionId) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Choose a connection</h2><p>Select an enabled agent from the left panel.</p></div>
  if (!agent) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Connecting</h2><p>{state.error ?? 'Waiting for the agent connection.'}</p></div>
  if (!active && !sessionId) return <div className="agent-panel agent-placeholder"><style>{styles}</style><h2>Choose a session</h2><p>Open a previous session or start a new one.</p></div>
  return <ConversationThread key={`${connectionId}:${sessionId ?? 'draft'}`} service={service} connectionId={connectionId} sessionId={sessionId ?? ''} draft={state.draft} compositions={store} />
}
