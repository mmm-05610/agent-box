import type { AgentClient, AgentInteraction, AgentMessage, AgentOption, AgentSnapshot, AgentToolCall, InteractionAnswer, RunStatus } from '@extensions/ordessa.agent-contracts/contract.js'
import type { AgentNativeBridge } from '../../../../apps/desktop/src/agent-native'
import type { InitializeParams } from './generated/InitializeParams'
import type { Thread } from './generated/v2/Thread'
import type { ThreadItem } from './generated/v2/ThreadItem'
import type { Turn } from './generated/v2/Turn'
import type { ThreadListResponse } from './generated/v2/ThreadListResponse'
import type { ThreadStartResponse } from './generated/v2/ThreadStartResponse'
import type { ThreadResumeResponse } from './generated/v2/ThreadResumeResponse'
import type { TurnStartResponse } from './generated/v2/TurnStartResponse'
import type { ModelListResponse } from './generated/v2/ModelListResponse'
import type { Model } from './generated/v2/Model'

type RecordValue = Record<string, unknown>
type Pending = { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }
type InteractionRoute = { id: number | string; method: string; sessionId: string; used: boolean; questionIds?: readonly string[] }
const asRecord = (value: unknown): RecordValue | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined
const string = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined
const failure = (error: unknown) => error instanceof Error ? error.message : String(error)
const empty: AgentSnapshot = {
  connection: { id: 'codex', title: 'Codex', status: 'connecting', capabilities: {
    history: 'supported', reasoning: 'supported', tools: 'supported', stop: 'supported',
    interactions: 'supported', models: 'supported', modes: 'supported',
  } },
  sessions: [], sessionList: 'unknown', messages: {}, runs: {}, interactions: [], options: [],
}

function itemMessage(item: ThreadItem): AgentMessage | undefined {
  if (item.type === 'userMessage') return { id: item.id, role: 'user', text: item.content.filter(input => input.type === 'text').map(input => input.text).join('\n') }
  if (item.type === 'agentMessage') return { id: item.id, role: 'assistant', text: item.text }
  if (item.type === 'reasoning') return { id: item.id, role: 'assistant', text: '', reasoning: [...item.summary, ...item.content].join('\n') }
  let tool: AgentToolCall | undefined
  if (item.type === 'commandExecution') tool = { id: item.id, name: 'Command', arguments: { command: item.command, cwd: item.cwd }, result: item.aggregatedOutput,
    status: item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'running' }
  if (item.type === 'fileChange') tool = { id: item.id, name: 'File change', arguments: item.changes, status: item.status === 'completed' ? 'completed' : 'running' }
  if (item.type === 'mcpToolCall') tool = { id: item.id, name: `${item.server}/${item.tool}`, arguments: item.arguments, result: item.result ?? item.error,
    status: item.status === 'completed' ? 'completed' : item.status === 'failed' ? 'failed' : 'running' }
  if (item.type === 'dynamicToolCall') tool = { id: item.id, name: item.tool, arguments: item.arguments, result: item.contentItems,
    status: item.status === 'completed' ? 'completed' : 'running' }
  return tool && { id: item.id, role: 'assistant', text: '', tools: [tool] }
}
function turnStatus(turn: Turn): RunStatus {
  return turn.status === 'completed' ? 'completed' : turn.status === 'interrupted' ? 'cancelled'
    : turn.status === 'failed' ? 'failed' : 'running'
}

/** Codex 0.155.1 App Server projection. Wire framing/process lifetime belongs to the native entry. */
export class CodexClient implements AgentClient {
  isDisposed = false
  private instanceId = ''
  private unsubscribeNative: () => void
  private listeners = new Set<() => void>()
  private pending = new Map<number, Pending>()
  private interactions = new Map<string, InteractionRoute>()
  private nextId = 0
  private snapshot: AgentSnapshot = empty
  private models: Model[] = []
  private constructor(private bridge: AgentNativeBridge) {
    this.unsubscribeNative = bridge.subscribe(event => {
      if (event.instanceId === this.instanceId && !this.isDisposed) this.receive(event.error ? { type: 'protocol-error', message: event.error } : event.frame)
    })
  }
  static async connect(bridge: AgentNativeBridge): Promise<CodexClient> {
    const client = new CodexClient(bridge)
    try {
      client.instanceId = await bridge.open('ordessa.agent-codex')
      const params: InitializeParams = { clientInfo: { name: 'ordessa-desktop', title: 'Ordessa Desktop', version: '0.1.0' }, capabilities: null }
      await client.request('initialize', params)
      await bridge.send(client.instanceId, { method: 'initialized', params: {} })
      client.publish({ connection: { ...client.snapshot.connection, status: 'connected' } })
      await client.loadOptions().catch(error => client.publish({
        connection: { ...client.snapshot.connection, capabilities: { ...client.snapshot.connection.capabilities, models: 'unavailable', modes: 'unavailable' } },
        diagnostic: `Model options unavailable: ${failure(error)}`,
      }))
      return client
    } catch (error) { client.dispose(); throw error }
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(patch: Partial<AgentSnapshot>) {
    if (this.isDisposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  private async request<T>(method: string, params: unknown): Promise<T> {
    if (this.isDisposed || !this.instanceId) throw Error('Codex connection unavailable')
    const id = ++this.nextId
    const response = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`Codex request timed out: ${method}`)) }, 15000)
      this.pending.set(id, { resolve: value => resolve(value as T), reject, timer })
    })
    try { await this.bridge.send(this.instanceId, { id, method, params }) }
    catch (error) { const pending = this.pending.get(id); if (pending) { clearTimeout(pending.timer); this.pending.delete(id); pending.reject(Error(failure(error))) } }
    return response
  }
  private receive(frame: unknown) {
    const value = asRecord(frame)
    if (!value) { this.publish({ diagnostic: 'Unknown Codex frame' }); return }
    if (value.type === 'exit' || value.type === 'protocol-error') {
      const error = value.type === 'exit' ? 'Codex process disconnected; running outcomes are unknown' : string(value.message) ?? 'Codex protocol error'
      const runs: AgentSnapshot['runs'] = Object.fromEntries(Object.entries(this.snapshot.runs).map(([id, run]) =>
        [id, run.status === 'running' || run.status === 'stop-requested' ? { ...run, status: 'unknown' as const } : run]))
      this.publish({ connection: { ...this.snapshot.connection, status: 'error', error }, runs,
        interactions: this.snapshot.interactions.map(item => item.state === 'pending' || item.state === 'responding' ? { ...item, state: 'unknown' } : item) })
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error(error)) }
      this.pending.clear()
      return
    }
    if (typeof value.id === 'number' && ('result' in value || 'error' in value)) {
      const pending = this.pending.get(value.id)
      if (!pending) return
      clearTimeout(pending.timer); this.pending.delete(value.id)
      value.error ? pending.reject(Error(string(asRecord(value.error)?.message) ?? 'Codex request failed')) : pending.resolve(value.result)
      return
    }
    const method = string(value.method), params = asRecord(value.params)
    if (!method || !params) { this.publish({ diagnostic: 'Unknown Codex event' }); return }
    if (value.id !== undefined) { this.serverRequest(value.id, method, params); return }
    this.notification(method, params)
  }
  private notification(method: string, params: RecordValue) {
    const sessionId = string(params.threadId), turn = asRecord(params.turn)
    if (method === 'turn/started' && sessionId && turn && string(turn.id)) {
      const id = turn.id as string
      if (!this.snapshot.runs[id] || this.snapshot.runs[id].status === 'running')
        this.publish({ runs: { ...this.snapshot.runs, [id]: { id, sessionId, status: 'running' } } })
      return
    }
    if (method === 'turn/completed' && sessionId && turn && string(turn.id)) {
      const id = turn.id as string, status = turnStatus(turn as Turn)
      this.publish({ runs: { ...this.snapshot.runs, [id]: { id, sessionId, status } },
        interactions: this.snapshot.interactions.map(item => item.sessionId === sessionId && item.turnId === id && item.state === 'pending' ? { ...item, state: 'expired' } : item) }); return
    }
    if ((method === 'item/started' || method === 'item/completed') && sessionId) {
      const item = asRecord(params.item) as ThreadItem | undefined
      if (item) { const message = itemMessage(item); if (message) this.upsert(sessionId, message) }
      return
    }
    if (method === 'item/agentMessage/delta' && sessionId) {
      const itemId = string(params.itemId), delta = string(params.delta)
      if (itemId && delta !== undefined) this.patchMessage(sessionId, itemId, message => ({ ...message, text: message.text + delta }))
      return
    }
    if ((method === 'item/reasoning/summaryTextDelta' || method === 'item/reasoning/textDelta') && sessionId) {
      const itemId = string(params.itemId), delta = string(params.delta)
      if (itemId && delta !== undefined) this.patchMessage(sessionId, itemId, message => ({ ...message, reasoning: (message.reasoning ?? '') + delta }))
      return
    }
    if (method === 'serverRequest/resolved') {
      const requestId = params.requestId
      const id = [...this.interactions].find(([, route]) => route.id === requestId)?.[0]
      if (id) this.finishInteraction(id, 'resolved')
      return
    }
    if (method === 'error' || method === 'warning') { this.publish({ diagnostic: string(params.message) ?? method }); return }
    // Unknown terminal or interactive events must be visible for version drift diagnosis.
    if (method.includes('completed') || method.includes('request') || method.includes('Approval')) this.publish({ diagnostic: `Unhandled Codex event: ${method}` })
  }
  private upsert(sessionId: string, message: AgentMessage) {
    const current = this.snapshot.messages[sessionId] ?? []
    const index = current.findIndex(item => item.id === message.id)
    const next = [...current]
    if (index < 0) next.push(message); else next[index] = message
    this.publish({ messages: { ...this.snapshot.messages, [sessionId]: next } })
  }
  private patchMessage(sessionId: string, id: string, update: (value: AgentMessage) => AgentMessage) {
    const current = this.snapshot.messages[sessionId] ?? []
    const previous = current.find(item => item.id === id) ?? { id, role: 'assistant' as const, text: '' }
    this.upsert(sessionId, update(previous))
  }
  private serverRequest(id: unknown, method: string, params: RecordValue) {
    if (typeof id !== 'string' && typeof id !== 'number') return
    const sessionId = string(params.threadId), turnId = string(params.turnId)
    if (!sessionId) { this.publish({ diagnostic: `Unroutable Codex request: ${method}` }); return }
    let interaction: AgentInteraction | undefined
    if (method === 'item/commandExecution/requestApproval') interaction = { id: String(id), sessionId, turnId, kind: 'approval',
      title: 'Approve command', detail: string(params.command) ?? string(params.reason), state: 'pending',
      choices: [{ id: 'accept', label: 'Allow once' }, { id: 'acceptForSession', label: 'Allow for session' }, { id: 'decline', label: 'Decline' }, { id: 'cancel', label: 'Cancel' }] }
    if (method === 'item/fileChange/requestApproval') interaction = { id: String(id), sessionId, turnId, kind: 'approval',
      title: 'Approve file change', detail: string(params.reason), state: 'pending',
      choices: [{ id: 'accept', label: 'Allow once' }, { id: 'acceptForSession', label: 'Allow for session' }, { id: 'decline', label: 'Decline' }, { id: 'cancel', label: 'Cancel' }] }
    if (method === 'item/tool/requestUserInput') {
      const questions = Array.isArray(params.questions) ? params.questions.map(asRecord).filter(Boolean) as RecordValue[] : []
      if (questions.length && questions.every(question => string(question.id))) {
        const fields = questions.map(question => {
          const options = Array.isArray(question.options) ? question.options.map(asRecord).filter(Boolean) as RecordValue[] : []
          return { id: question.id as string, title: string(question.header) ?? 'Input', detail: string(question.question),
            choices: options.map(option => ({ id: string(option.label) ?? '', label: string(option.label) ?? '' })), secret: question.isSecret === true }
        })
        interaction = { id: String(id), sessionId, turnId, kind: 'input', title: fields.length === 1 ? fields[0].title : 'Answer questions',
          detail: fields.length === 1 ? fields[0].detail : undefined, state: 'pending', fields }
        this.interactions.set(String(id), { id, method, sessionId, used: false, questionIds: fields.map(field => field.id) })
      }
    }
    if (!interaction) { this.publish({ diagnostic: `Unsupported Codex request: ${method}` }); return }
    if (!this.interactions.has(String(id))) this.interactions.set(String(id), { id, method, sessionId, used: false })
    this.publish({ interactions: [...this.snapshot.interactions.filter(item => item.id !== interaction.id), interaction] })
  }
  private finishInteraction(id: string, state: AgentInteraction['state']) {
    this.interactions.delete(id)
    this.publish({ interactions: this.snapshot.interactions.map(item => item.id === id ? { ...item, state } : item) })
  }
  async refreshSessions() {
    this.publish({ sessionList: 'loading' })
    const sessions: AgentSnapshot['sessions'][number][] = []
    let cursor: string | null = null
    const seen = new Set<string>()
    try {
      do {
        const result: ThreadListResponse = await this.request('thread/list', { cursor, limit: 100 })
        for (const thread of result.data) sessions.push({ id: thread.id, title: thread.name || thread.preview || thread.id,
          updatedAt: new Date(thread.updatedAt * 1000).toISOString(), detail: thread.cwd })
        cursor = result.nextCursor
        if (cursor && seen.has(cursor)) throw Error('Codex history cursor repeated')
        if (cursor) seen.add(cursor)
      } while (cursor && sessions.length < 5000)
      this.publish({ sessions, sessionList: cursor ? 'partial' : 'ready' })
    } catch (error) { this.publish({ sessions, sessionList: 'error', diagnostic: failure(error) }); throw error }
  }
  private history(thread: Thread) {
    const messages = thread.turns.flatMap(turn => turn.items.map(itemMessage).filter((item): item is AgentMessage => !!item))
    const runs = { ...this.snapshot.runs }
    for (const turn of thread.turns) runs[turn.id] = { id: turn.id, sessionId: thread.id, status: turnStatus(turn) }
    this.publish({ messages: { ...this.snapshot.messages, [thread.id]: messages }, runs })
  }
  async newSession(): Promise<string> {
    const result = await this.request<ThreadStartResponse>('thread/start', {})
    const thread = result.thread
    this.publish({ sessions: [{ id: thread.id, title: thread.name || thread.preview || 'New session' }, ...this.snapshot.sessions.filter(item => item.id !== thread.id)], selectedSessionId: thread.id })
    this.history(thread)
    this.applySelectedOptions(result.model, result.reasoningEffort)
    return thread.id
  }
  async openSession(id: string) {
    const result = await this.request<ThreadResumeResponse>('thread/resume', { threadId: id })
    this.history(result.thread)
    this.applySelectedOptions(result.model, result.reasoningEffort)
    this.publish({ selectedSessionId: id })
  }
  async send(sessionId: string, text: string) {
    if (!text.trim()) return
    const result = await this.request<TurnStartResponse>('turn/start', { threadId: sessionId,
      input: [{ type: 'text', text, text_elements: [] }],
      ...(this.snapshot.options.find(option => option.id === 'model')?.value ? { model: this.snapshot.options.find(option => option.id === 'model')!.value } : {}),
      ...(this.snapshot.options.find(option => option.id === 'effort')?.value ? { effort: this.snapshot.options.find(option => option.id === 'effort')!.value } : {}),
    })
    const id = result.turn.id
    const previous = this.snapshot.runs[id]
    if (!previous || previous.status === 'running') this.publish({ runs: { ...this.snapshot.runs, [id]: { id, sessionId, status: 'running' } } })
  }
  async stop(sessionId: string, runId: string) {
    const run = this.snapshot.runs[runId]
    if (!run || run.sessionId !== sessionId || run.status !== 'running') throw Error('Run unavailable for stop')
    this.publish({ runs: { ...this.snapshot.runs, [runId]: { ...run, status: 'stop-requested' } } })
    try { await this.request('turn/interrupt', { threadId: sessionId, turnId: runId }) }
    catch (error) { this.publish({ runs: { ...this.snapshot.runs, [runId]: { ...run, status: 'unknown' } } }); throw error }
  }
  async respond(interactionId: string, answer: InteractionAnswer) {
    const route = this.interactions.get(interactionId)
    const interaction = this.snapshot.interactions.find(item => item.id === interactionId)
    if (!route || !interaction || route.used || interaction.state !== 'pending') throw Error('Interaction no longer pending')
    let result: unknown
    if (route.method === 'item/tool/requestUserInput' && route.questionIds) {
      let answers: Readonly<Record<string, readonly string[]>>
      if (answer.kind === 'answers') answers = answer.answers
      else if (route.questionIds.length === 1) answers = { [route.questionIds[0]]: answer.kind === 'choice' ? [answer.choiceId]
        : answer.kind === 'text' ? [answer.value] : [] }
      else if (answer.kind === 'cancel') answers = {}
      else throw Error('Answers required for every question')
      if (answer.kind !== 'cancel' && route.questionIds.some(id => !Array.isArray(answers[id]) || !answers[id].every(value => typeof value === 'string')))
        throw Error('Missing or invalid answer')
      result = { answers: answer.kind === 'cancel' ? {} : Object.fromEntries(route.questionIds.map(id => [id, { answers: [...answers[id]] }])) }
    } else {
      const decision = answer.kind === 'choice' ? answer.choiceId : answer.kind === 'cancel' ? 'cancel' : undefined
      if (!decision || !interaction.choices?.some(choice => choice.id === decision)) throw Error('Invalid approval answer')
      result = { decision }
    }
    route.used = true
    this.publish({ interactions: this.snapshot.interactions.map(item => item.id === interactionId ? { ...item, state: 'responding' } : item) })
    try { await this.bridge.send(this.instanceId, { id: route.id, result }); this.finishInteraction(interactionId, 'resolved') }
    catch (error) { this.finishInteraction(interactionId, 'unknown'); throw error }
  }
  private async loadOptions() {
    const models: Model[] = []
    let cursor: string | null = null
    const seen = new Set<string>()
    do {
      const result: ModelListResponse = await this.request('model/list', { cursor, limit: 100 })
      models.push(...result.data.filter(model => !model.hidden))
      cursor = result.nextCursor
      if (cursor && seen.has(cursor)) throw Error('Codex model cursor repeated')
      if (cursor) seen.add(cursor)
    } while (cursor && models.length < 1000)
    this.models = models
    const selected = models.find(model => model.isDefault) ?? models[0]
    if (selected) this.applySelectedOptions(selected.model, selected.defaultReasoningEffort)
    else this.publish({ options: [], connection: { ...this.snapshot.connection,
      capabilities: { ...this.snapshot.connection.capabilities, models: 'unavailable', modes: 'unavailable' } } })
  }
  private applySelectedOptions(modelId?: string | null, effort?: string | null) {
    const model = this.models.find(item => item.model === modelId) ?? this.models[0]
    if (!model) return
    const options: AgentOption[] = [{ id: 'model', title: 'Model for next turn', value: model.model, availability: 'supported',
      values: this.models.map(item => ({ id: item.model, title: item.displayName })) }]
    if (model.supportedReasoningEfforts.length) options.push({ id: 'effort', title: 'Reasoning for next turn',
      value: effort && model.supportedReasoningEfforts.some(item => item.reasoningEffort === effort) ? effort : model.defaultReasoningEffort,
      availability: 'supported', values: model.supportedReasoningEfforts.map(item => ({ id: item.reasoningEffort, title: item.reasoningEffort })) })
    this.publish({ options })
  }
  async setOption(id: string, value: string): Promise<void> {
    const option = this.snapshot.options.find(item => item.id === id)
    if (!option || option.availability !== 'supported' || !option.values?.some(item => item.id === value)) throw Error('Option unavailable')
    if (id === 'model') this.applySelectedOptions(value)
    else this.publish({ options: this.snapshot.options.map(item => item.id === id ? { ...item, value } : item) })
  }
  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.unsubscribeNative()
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(Error('Codex connection closed')) }
    this.pending.clear(); this.listeners.clear(); this.interactions.clear()
    if (this.instanceId) void this.bridge.close(this.instanceId).catch(() => {})
  }
}
