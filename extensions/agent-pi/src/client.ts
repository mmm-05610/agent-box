import type { AgentClient, AgentInteraction, AgentMessage, AgentOption, AgentSnapshot, AgentToolCall, InteractionAnswer, RunStatus } from '@extensions/ordessa.agent-contracts/contract.js'
import type { AgentNativeBridge } from '../../../apps/desktop/src/agent-native'

type Value = Record<string, unknown>
const object = (value: unknown): Value | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Value : undefined
const str = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const textBlocks = (content: unknown) => Array.isArray(content) ? content.map(object).filter(Boolean).filter(item => item?.type === 'text').map(item => str(item?.text) ?? '').join('\n') : ''
const thinkingBlocks = (content: unknown) => Array.isArray(content) ? content.map(object).filter(Boolean).filter(item => item?.type === 'thinking').map(item => str(item?.thinking) ?? '').join('\n') : ''
const initial: AgentSnapshot = { connection: { id: 'pi', title: 'Pi', status: 'connecting', capabilities: {
  history: 'supported', reasoning: 'supported', tools: 'supported', stop: 'supported', interactions: 'supported', models: 'supported', modes: 'supported',
} }, sessions: [], sessionList: 'unknown', messages: {}, runs: {}, interactions: [], options: [] }

const KNOWN_EVENT_TYPES = new Set(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end',
  'message_start', 'message_update', 'message_end', 'bash_execution_update', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
  'queue_update', 'compaction_start', 'compaction_end', 'auto_retry_start', 'auto_retry_end',
  'summarization_retry_scheduled', 'summarization_retry_attempt_start', 'summarization_retry_finished',
  'extension_error', 'extension_ui_request', 'extension_ui_expired', 'transport_exit'])

function projectMessage(value: Value, id: string): AgentMessage | undefined {
  const role = str(value.role)
  if (role !== 'user' && role !== 'assistant' && role !== 'toolResult') return
  const tools: AgentToolCall[] = []
  if (role === 'assistant' && Array.isArray(value.content)) for (const part of value.content) {
    const item = object(part)
    if (item?.type === 'toolCall' && str(item.id)) tools.push({ id: item.id as string, name: str(item.name) ?? 'Tool', arguments: item.arguments, status: 'running' })
  }
  if (role === 'toolResult') tools.push({ id: str(value.toolCallId) ?? id, name: str(value.toolName) ?? 'Tool', result: textBlocks(value.content),
    status: value.isError === true ? 'failed' : 'completed' })
  const stop = str(value.stopReason)
  return { id, role: role === 'user' ? 'user' : 'assistant', text: textBlocks(value.content),
    reasoning: thinkingBlocks(value.content) || undefined, tools: tools.length ? tools : undefined,
    status: stop === 'aborted' ? 'cancelled' : stop === 'error' ? 'failed' : stop === 'stop' ? 'completed' : undefined }
}

/** Pi 0.86.1 RPC event projection; each session's native RpcClient has its own process. */
export class PiClient implements AgentClient {
  isDisposed = false
  private instanceId = ''
  private unsubscribeNative: () => void
  private listeners = new Set<() => void>()
  private state: AgentSnapshot = initial
  private sequence = 0
  private activeRuns = new Map<string, string>()
  private activeMessages = new Map<string, string>()
  private lastStop = new Map<string, string>()
  private interactionRoutes = new Map<string, { sessionId: string; requestId: string; method: string; used: boolean }>()
  private constructor(private bridge: AgentNativeBridge) {
    this.unsubscribeNative = bridge.subscribe(event => {
      if (event.instanceId === this.instanceId && !this.isDisposed) this.receive(event.error ? { type: 'bridge_error', message: event.error } : event.frame)
    })
  }
  static async connect(bridge: AgentNativeBridge) {
    const client = new PiClient(bridge)
    try {
      client.instanceId = await bridge.open('ordessa.agent-pi')
      client.publish({ connection: { ...client.state.connection, status: 'connected' } })
      return client
    } catch (error) { client.dispose(); throw error }
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<AgentSnapshot>) {
    if (this.isDisposed) return
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }
  private request<T>(method: string, params: Value = {}): Promise<T> {
    if (this.isDisposed || !this.instanceId) return Promise.reject(Error('Pi connection unavailable'))
    let timer: ReturnType<typeof setTimeout>
    return Promise.race([this.bridge.send(this.instanceId, { method, params }) as Promise<T>,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(Error(`Pi operation timed out: ${method}`)), 30000) }),
    ]).finally(() => clearTimeout(timer))
  }
  private upsert(sessionId: string, message: AgentMessage) {
    const current = this.state.messages[sessionId] ?? []
    const index = current.findIndex(item => item.id === message.id), next = [...current]
    if (index < 0) next.push(message); else next[index] = message
    this.publish({ messages: { ...this.state.messages, [sessionId]: next } })
  }
  private patch(sessionId: string, id: string, change: (previous: AgentMessage) => AgentMessage) {
    const previous = this.state.messages[sessionId]?.find(item => item.id === id) ?? { id, role: 'assistant' as const, text: '' }
    this.upsert(sessionId, change(previous))
  }
  private receive(frame: unknown) {
    const wrapper = object(frame)
    if (!wrapper) { this.publish({ diagnostic: 'Unknown Pi native event' }); return }
    if (wrapper.type === 'bridge_error') { this.publish({ diagnostic: str(wrapper.message) ?? 'Pi bridge error' }); return }
    if (wrapper.method !== 'pi/event') { this.publish({ diagnostic: 'Unknown Pi native event' }); return }
    const params = object(wrapper.params), sessionId = str(params?.sessionId), event = object(params?.event)
    if (!sessionId || !event) { this.publish({ diagnostic: 'Unroutable Pi event' }); return }
    const type = str(event.type)
    if (type === 'transport_exit') {
      const id = this.activeRuns.get(sessionId)
      if (id) this.updateRun(id, sessionId, 'unknown')
      this.activeRuns.delete(sessionId)
      this.publish({ diagnostic: `Pi session ${sessionId} disconnected; active outcome unknown`,
        interactions: this.state.interactions.map(item => item.sessionId === sessionId && (item.state === 'pending' || item.state === 'responding') ? { ...item, state: 'unknown' } : item) })
      return
    }
    if (type === 'agent_start') {
      const id = this.activeRuns.get(sessionId)
      if (id) this.updateRun(id, sessionId, 'running')
      return
    }
    if (type === 'message_start') {
      const message = object(event.message)
      if (message?.role === 'assistant') {
        const id = `pi-message-${++this.sequence}`
        this.activeMessages.set(sessionId, id)
        this.upsert(sessionId, { id, role: 'assistant', text: '', status: 'running' })
      }
      return
    }
    if (type === 'message_update') {
      const delta = object(event.assistantMessageEvent), id = this.activeMessages.get(sessionId)
      if (!id || !delta) return
      const text = delta.type === 'text_delta' ? str(delta.delta) : undefined
      if (text !== undefined) this.patch(sessionId, id, previous => ({ ...previous, text: previous.text + text }))
      const thinking = delta.type === 'thinking_delta' ? str(delta.delta) : undefined
      if (thinking !== undefined) this.patch(sessionId, id, previous => ({ ...previous, reasoning: (previous.reasoning ?? '') + thinking }))
      return
    }
    if (type === 'message_end') {
      const message = object(event.message)
      if (!message) return
      const id = message.role === 'assistant' ? this.activeMessages.get(sessionId) ?? `pi-message-${++this.sequence}` : `pi-message-${++this.sequence}`
      const projected = projectMessage(message, id)
      if (projected) this.upsert(sessionId, projected)
      if (message.role === 'assistant') {
        this.activeMessages.delete(sessionId)
        if (str(message.stopReason)) this.lastStop.set(sessionId, message.stopReason as string)
      }
      return
    }
    if (type === 'tool_execution_start' || type === 'tool_execution_update' || type === 'tool_execution_end') {
      const toolId = str(event.toolCallId)
      if (!toolId) return
      const id = `pi-tool-${toolId}`
      const tool: AgentToolCall = { id: toolId, name: str(event.toolName) ?? 'Tool', arguments: event.args,
        result: type === 'tool_execution_update' ? event.partialResult : type === 'tool_execution_end' ? event.result : undefined,
        status: type === 'tool_execution_end' ? event.isError === true ? 'failed' : 'completed' : 'running' }
      this.upsert(sessionId, { id, role: 'assistant', text: '', tools: [tool] })
      return
    }
    if (type === 'agent_settled') {
      const id = this.activeRuns.get(sessionId)
      if (id) {
        const run = this.state.runs[id]
        const stop = this.lastStop.get(sessionId)
        // A requested stop that settles without a final assistant message still means cancelled.
        const status: RunStatus = run?.status === 'stop-requested' || stop === 'aborted' ? 'cancelled'
          : stop === 'error' ? 'failed' : 'completed'
        this.updateRun(id, sessionId, status)
        this.activeRuns.delete(sessionId); this.lastStop.delete(sessionId)
      }
      this.publish({ interactions: this.state.interactions.map(item => item.sessionId === sessionId && item.state === 'pending' ? { ...item, state: 'expired' } : item) })
      return
    }
    if (type === 'extension_ui_request') { this.uiRequest(sessionId, event); return }
    if (type === 'extension_ui_expired' && str(event.id)) {
      const id = `${sessionId}:${event.id}`
      this.interactionRoutes.delete(id)
      this.publish({ interactions: this.state.interactions.map(item => item.id === id ? { ...item, state: 'expired' } : item) }); return
    }
    if (type === 'extension_error') { this.publish({ diagnostic: str(event.error) ?? 'Pi extension error' }); return }
    // Documented Pi 0.86.1 events without their own projection are safe to skip;
    // anything else is version drift and must stay diagnosable.
    if (type === undefined || !KNOWN_EVENT_TYPES.has(type)) this.publish({ diagnostic: `Unknown Pi event: ${type || 'untyped'}` })
  }
  private updateRun(id: string, sessionId: string, status: RunStatus) {
    const previous = this.state.runs[id]
    if (previous && !['starting', 'running', 'stop-requested'].includes(previous.status)) return
    this.publish({ runs: { ...this.state.runs, [id]: { id, sessionId, status } } })
  }
  private uiRequest(sessionId: string, event: Value) {
    const requestId = str(event.id), method = str(event.method)
    if (!requestId || !method) { this.publish({ diagnostic: 'Unknown Pi interaction request' }); return }
    if (!['select', 'confirm', 'input', 'editor'].includes(method)) {
      if (method === 'notify') this.publish({ diagnostic: str(event.message) ?? 'Pi notification' })
      else this.publish({ diagnostic: `Pi UI event: ${method}` })
      return
    }
    const id = `${sessionId}:${requestId}`, choices = method === 'select' && Array.isArray(event.options)
      ? event.options.filter(option => typeof option === 'string').map(option => ({ id: option as string, label: option as string })) : undefined
    const kind: AgentInteraction['kind'] = method === 'select' ? 'choice' : method === 'confirm' ? 'confirm' : method === 'editor' ? 'editor' : 'input'
    const item: AgentInteraction = { id, sessionId, kind,
      title: str(event.title) ?? 'Pi request', detail: str(event.message), choices, state: 'pending' }
    this.interactionRoutes.set(id, { sessionId, requestId, method, used: false })
    this.publish({ interactions: [...this.state.interactions.filter(previous => previous.id !== id), item] })
  }
  async refreshSessions() {
    this.publish({ sessionList: 'loading' })
    try {
      const sessions = await this.request<AgentSnapshot['sessions']>('list')
      this.publish({ sessions, sessionList: 'ready' })
    } catch (error) { this.publish({ sessionList: 'error', diagnostic: errorText(error) }); throw error }
  }
  private async opened(result: Value) {
    const sessionId = str(result.sessionId), state = object(result.state)
    if (!sessionId || !state) throw Error('Pi returned invalid session state')
    const messages = Array.isArray(result.messages) ? result.messages.map(object).filter(Boolean) as Value[] : []
    this.publish({ selectedSessionId: sessionId, messages: { ...this.state.messages,
      [sessionId]: messages.map((message, index) => projectMessage(message, `pi-history-${sessionId}-${index}`)).filter((message): message is AgentMessage => !!message) } })
    await this.loadOptions(sessionId, state)
    return sessionId
  }
  async newSession() {
    const result = await this.request<Value>('new')
    const sessionId = await this.opened(result)
    await this.refreshSessions()
    return sessionId
  }
  async openSession(id: string) { await this.opened(await this.request<Value>('open', { sessionId: id })) }
  async send(sessionId: string, text: string) {
    if (!text.trim()) return
    if (this.activeRuns.has(sessionId)) throw Error('Pi session already running')
    const id = `pi-run-${++this.sequence}`
    this.activeRuns.set(sessionId, id)
    this.updateRun(id, sessionId, 'starting')
    try { await this.request('prompt', { sessionId, text }) }
    catch (error) { this.updateRun(id, sessionId, 'unknown'); this.activeRuns.delete(sessionId); throw error }
  }
  async stop(sessionId: string, runId: string) {
    const run = this.state.runs[runId]
    // 'starting' is stoppable too: the prompt ack can precede agent_start.
    if (!run || run.sessionId !== sessionId || (run.status !== 'running' && run.status !== 'starting')) throw Error('Pi run unavailable for stop')
    this.updateRun(runId, sessionId, 'stop-requested')
    try { await this.request('abort', { sessionId }) }
    catch (error) { this.updateRun(runId, sessionId, 'unknown'); throw error }
  }
  async respond(interactionId: string, answer: InteractionAnswer) {
    const route = this.interactionRoutes.get(interactionId)
    const item = this.state.interactions.find(value => value.id === interactionId)
    if (!route || !item || route.used || item.state !== 'pending') throw Error('Pi interaction no longer pending')
    let response: Value = { type: 'extension_ui_response', id: route.requestId }
    if (answer.kind === 'cancel') response = { ...response, cancelled: true }
    else if (route.method === 'select' && answer.kind === 'choice' && item.choices?.some(choice => choice.id === answer.choiceId)) response = { ...response, value: answer.choiceId }
    else if (route.method === 'confirm' && answer.kind === 'confirm') response = { ...response, confirmed: answer.confirmed }
    else if ((route.method === 'input' || route.method === 'editor') && answer.kind === 'text') response = { ...response, value: answer.value }
    else throw Error('Invalid Pi interaction answer')
    route.used = true
    this.publish({ interactions: this.state.interactions.map(value => value.id === interactionId ? { ...value, state: 'responding' } : value) })
    try { await this.request('respond', { sessionId: route.sessionId, requestId: route.requestId, response })
      this.interactionRoutes.delete(interactionId)
      this.publish({ interactions: this.state.interactions.map(value => value.id === interactionId ? { ...value, state: 'resolved' } : value) })
    } catch (error) { this.interactionRoutes.delete(interactionId)
      this.publish({ interactions: this.state.interactions.map(value => value.id === interactionId ? { ...value, state: 'unknown' } : value) }); throw error }
  }
  private async loadOptions(sessionId: string, state: Value) {
    const results = await Promise.allSettled([this.request<Value[]>('models', { sessionId }), this.request<string[]>('thinking-levels', { sessionId })])
    const models = results[0].status === 'fulfilled' ? results[0].value : []
    const levels = results[1].status === 'fulfilled' ? results[1].value : []
    const currentModel = object(state.model)
    const options: AgentOption[] = []
    if (models.length) options.push({ id: 'model', title: 'Model', availability: 'supported',
      value: currentModel ? `${currentModel.provider}/${currentModel.id}` : undefined,
      values: models.map(model => ({ id: `${model.provider}/${model.id}`, title: `${model.provider}/${model.id}` })) })
    if (levels.length) options.push({ id: 'thinking', title: 'Thinking', availability: 'supported', value: str(state.thinkingLevel),
      values: levels.map(level => ({ id: level, title: level })) })
    this.publish({ options })
  }
  async setOption(id: string, value: string) {
    const sessionId = this.state.selectedSessionId, option = this.state.options.find(item => item.id === id)
    if (!sessionId || !option?.values?.some(item => item.id === value)) throw Error('Pi option unavailable')
    if (id === 'model') {
      const slash = value.indexOf('/')
      if (slash < 1) throw Error('Invalid Pi model')
      await this.request('set-model', { sessionId, provider: value.slice(0, slash), modelId: value.slice(slash + 1) })
    } else if (id === 'thinking') await this.request('set-thinking-level', { sessionId, level: value })
    else throw Error('Unsupported Pi option')
    this.publish({ options: this.state.options.map(item => item.id === id ? { ...item, value } : item) })
  }
  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.unsubscribeNative(); this.listeners.clear(); this.interactionRoutes.clear()
    if (this.instanceId) void this.bridge.close(this.instanceId).catch(() => {})
  }
}
