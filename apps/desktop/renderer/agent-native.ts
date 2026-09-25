export interface AgentNativeBridge {
  open(adapterId: string): Promise<string>
  send(instanceId: string, frame: unknown): Promise<unknown>
  close(instanceId: string): Promise<void>
  subscribe(listener: (event: { instanceId: string; frame?: unknown; error?: string }) => void): () => void
}
declare global { interface Window {
  agentNative: AgentNativeBridge
  projectDirectory?: { choose(): Promise<string | undefined> }
} }
export function agentNative(): AgentNativeBridge { return window.agentNative }
