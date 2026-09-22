import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { RpcClient } from './vendor/rpc-client.js'
import type { NativeConnection, NativeTransport } from '../../../platform/native-bridge/src/index'

type Frame = { method: string; params?: Record<string, unknown> }
type Opened = { client: RpcClient; sessionId: string; sessionFile: string; unsubscribe: () => void }
const packageEntry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'))
const cliPath = path.join(path.dirname(packageEntry), 'bundle/cli.js')
const asRecord = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const string = (value: unknown) => typeof value === 'string' ? value : undefined

/** Pi 0.86.1 RPC and SessionManager stay on the native side of the Electron bridge. */
export default function createTransport(): NativeTransport {
  return { async open(onFrame): Promise<NativeConnection> {
    const cwd = process.env.ORDESSA_AGENT_CWD
    if (!cwd || !path.isAbsolute(cwd)) throw Error('Set ORDESSA_AGENT_CWD to an absolute agent workspace path')
    const sessions = new Map<string, Opened>()
    const opening = new Map<string, Promise<Opened>>()
    const pendingUI = new Map<string, { sessionId: string; timer?: ReturnType<typeof setTimeout> }>()
    let closed = false
    const events = (sessionId: string, event: Record<string, unknown>) => {
      if (closed) return
      const type = string(event.type)
      if (type === 'extension_ui_request' && string(event.id) && ['select', 'confirm', 'input', 'editor'].includes(string(event.method) ?? '')) {
        const id = event.id as string, key = `${sessionId}:${id}`
        const timeout = typeof event.timeout === 'number' && event.timeout > 0 ? event.timeout : undefined
        const timer = timeout ? setTimeout(() => {
          pendingUI.delete(key)
          onFrame({ method: 'pi/event', params: { sessionId, event: { type: 'extension_ui_expired', id } } })
        }, timeout) : undefined
        pendingUI.set(key, { sessionId, timer })
      }
      if (type === 'transport_exit') {
        sessions.delete(sessionId)
        for (const [key, item] of pendingUI) if (item.sessionId === sessionId) { clearTimeout(item.timer); pendingUI.delete(key) }
      }
      onFrame({ method: 'pi/event', params: { sessionId, event } })
    }
    const start = async (sessionPath?: string) => {
      const client = new RpcClient({ cliPath, cwd, args: sessionPath ? ['--session', sessionPath] : [] })
      let sessionId: string | undefined
      const early: Record<string, unknown>[] = []
      const unsubscribe = client.onEvent(event => { if (sessionId) events(sessionId, event); else early.push(event) })
      try {
        await client.start()
        const state = await client.getState()
        sessionId = string(state.sessionId)
        const sessionFile = string(state.sessionFile)
        if (!sessionId || !sessionFile) throw Error('Pi did not return a persistent session')
        for (const event of early) events(sessionId, event)
        const opened = { client, sessionId, sessionFile, unsubscribe }
        sessions.set(sessionId, opened)
        return opened
      } catch (error) { unsubscribe(); await client.stop(); throw error }
    }
    const get = (id: unknown): Opened => {
      const session = sessions.get(string(id) ?? '')
      if (!session) throw Error('Pi session is not open')
      return session
    }
    const dispatch = async (frame: Frame): Promise<unknown> => {
      const params = frame.params ?? {}
      switch (frame.method) {
        case 'list': {
          const items = await SessionManager.list(cwd)
          return items.map(item => ({ id: item.id, title: item.name || item.firstMessage || item.id,
            updatedAt: item.modified.toISOString(), detail: item.cwd }))
        }
        case 'new': {
          const opened = await start()
          return { sessionId: opened.sessionId, state: await opened.client.getState(), messages: await opened.client.getMessages() }
        }
        case 'open': {
          const id = string(params.sessionId)
          if (!id) throw Error('Pi session ID required')
          let opened = sessions.get(id)
          if (!opened) {
            let task = opening.get(id)
            if (!task) {
              task = (async () => {
                const info = (await SessionManager.list(cwd)).find(item => item.id === id)
                if (!info) throw Error('Pi session not found in workspace history')
                return start(info.path)
              })().finally(() => opening.delete(id))
              opening.set(id, task)
            }
            opened = await task
          }
          return { sessionId: opened.sessionId, state: await opened.client.getState(), messages: await opened.client.getMessages() }
        }
        case 'prompt': await get(params.sessionId).client.prompt(string(params.text) ?? ''); return {}
        case 'abort': await get(params.sessionId).client.abort(); return {}
        case 'models': return get(params.sessionId).client.getAvailableModels()
        case 'thinking-levels': return get(params.sessionId).client.getAvailableThinkingLevels()
        case 'set-model': return get(params.sessionId).client.setModel(string(params.provider) ?? '', string(params.modelId) ?? '')
        case 'set-thinking-level': await get(params.sessionId).client.setThinkingLevel(string(params.level) ?? ''); return {}
        case 'respond': {
          const opened = get(params.sessionId), id = string(params.requestId), response = asRecord(params.response)
          if (!id || !response || response.type !== 'extension_ui_response' || response.id !== id) throw Error('Invalid Pi interaction response')
          const key = `${opened.sessionId}:${id}`, pending = pendingUI.get(key)
          if (!pending) throw Error('Pi interaction expired or already answered')
          pendingUI.delete(key); clearTimeout(pending.timer)
          await opened.client.sendExtensionUIResponse(response)
          return {}
        }
        default: throw Error('Unsupported Pi native operation')
      }
    }
    return {
      async send(input) {
        if (closed) throw Error('Pi transport closed')
        const frame = asRecord(input)
        if (!frame || !string(frame.method)) throw Error('Invalid Pi native frame')
        return dispatch(frame as Frame)
      },
      async close() {
        if (closed) return
        closed = true
        for (const item of pendingUI.values()) clearTimeout(item.timer)
        pendingUI.clear()
        const live = [...sessions.values()]
        sessions.clear()
        await Promise.allSettled(live.map(async item => { item.unsubscribe(); await item.client.stop() }))
      },
    }
  } }
}
