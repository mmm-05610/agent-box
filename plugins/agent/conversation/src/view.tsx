import { useState, useSyncExternalStore } from 'react'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, MessagePartPrimitive, ComposerPrimitive,
  type AppendMessage, type ThreadMessageLike, type ToolCallMessagePartProps } from '@assistant-ui/react'
import type { AgentMessage, AgentSessions, AgentToolCall } from '@extensions/ordessa.agent-contracts/contract.js'
import { styles } from './styles'
import { SessionInteractions } from './interaction-card'

function useWorkspace(service: AgentSessions) { return useSyncExternalStore(service.subscribe, service.getSnapshot) }
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
    <SessionInteractions service={service} agent={agent} sessionId={sessionId} />
    {agent.options.length > 0 && <div className="agent-options">{agent.options.filter(option => !hiddenOptionIds.has(option.id) && option.availability === 'supported' && option.values?.length).map(option =>
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
