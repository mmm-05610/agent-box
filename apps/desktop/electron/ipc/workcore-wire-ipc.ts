import { ipcMain } from 'electron'

import type { AgentBoxWireDispatcher } from '../security/agentbox-wire-transport'

interface WorkCoreWireRequest {
  body: unknown
  method: string
  path: `/wire/v1/${string}`
}

export interface RegisterWorkCoreWireIpcDeps {
  requestWire: AgentBoxWireDispatcher
}

function parseWorkCoreWireRequest(value: unknown): WorkCoreWireRequest {
  if (!value || typeof value !== 'object') {
    throw new TypeError('Invalid AgentBox wire request')
  }

  const candidate = value as Record<string, unknown>
  const method = candidate.method

  if (typeof method !== 'string' || !/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(method)) {
    throw new TypeError('Invalid AgentBox wire method')
  }

  const expectedPath = `/wire/v1/${method}`

  if (candidate.path !== expectedPath) {
    throw new TypeError('AgentBox wire path does not match method')
  }

  if (!candidate.body || typeof candidate.body !== 'object') {
    throw new TypeError('Invalid AgentBox wire envelope')
  }

  const body = candidate.body as Record<string, unknown>

  if (body.jsonrpc !== '2.0' || body.method !== method || !('id' in body) || !('params' in body)) {
    throw new TypeError('AgentBox wire envelope does not match method')
  }

  return { body, method, path: expectedPath as WorkCoreWireRequest['path'] }
}

export function registerWorkCoreWireIpc({ requestWire }: RegisterWorkCoreWireIpcDeps): void {
  ipcMain.handle('agentbox:wire:request', (_event, value: unknown) => {
    const request = parseWorkCoreWireRequest(value)

    return requestWire({ body: request.body, path: request.path })
  })
}
