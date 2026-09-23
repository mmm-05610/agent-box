export interface RpcClientOptions {
  cliPath?: string
  cwd?: string
  env?: Record<string, string>
  args?: string[]
}
export class RpcClient {
  constructor(options?: RpcClientOptions)
  start(): Promise<void>
  stop(): Promise<void>
  onEvent(listener: (event: Record<string, unknown>) => void): () => void
  prompt(message: string): Promise<void>
  abort(): Promise<void>
  newSession(): Promise<{ cancelled: boolean }>
  switchSession(path: string): Promise<{ cancelled: boolean }>
  getState(): Promise<Record<string, unknown>>
  getMessages(): Promise<Record<string, unknown>[]>
  getAvailableModels(): Promise<Record<string, unknown>[]>
  getAvailableThinkingLevels(): Promise<string[]>
  setModel(provider: string, modelId: string): Promise<Record<string, unknown>>
  setThinkingLevel(level: string): Promise<void>
  sendExtensionUIResponse(response: Record<string, unknown>): Promise<void>
}
