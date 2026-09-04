/**
 * AgentBox 模块门面（G6）——G5 换绑插槽之上的 UI 数据入口。
 *
 * 职责只有三件：
 * - 判定 agentbox 后端是否处于激活态（backendSelector 的 localStorage 键）
 * - 按「url+token」键控缓存一条 AgentBoxTransport，并在此之上暴露
 *   profiles CRUD（createAgentBoxBackend 的 AgentBoxProfilesFacade 透传）
 *   与 harness 列表（GET /api/v1/harnesses）
 * - 配置变更广播：跨文档走原生 storage 事件，同文档由写入口调用
 *   notifyAgentBoxConfigChanged() —— useAgentBoxEnabled 的 store 侧
 *
 * 不含任何 React；组件消费经 index barrel（useAgentBoxEnabled 等）。
 */
import {
  AgentBoxBackendError,
  AgentBoxProfilesFacade,
} from "@/core/ports/backend-agentbox"
import type { AgentBoxProfilesPort } from "@/core/ports/backend-agentbox"
import type { UnsubscribeFn } from "@/core/ports/transport"
import {
  getAgentBoxConnection,
  resolveBackend,
} from "@/core/ports/backendSelector"
import { AgentBoxTransport } from "@/core/transport/agentbox-transport"

/** profiles 工件行（服务端权威形状：profile_id/name/revision/digest） */
export type {
  AgentBoxProfile,
  AgentBoxProfilesPort,
  CreateAgentBoxProfileInput,
} from "@/core/ports/backend-agentbox"

/** GET /api/v1/harnesses 行（extension registry 的投影） */
export interface AgentBoxHarnessInfo {
  harness_type: string
  display_name?: string
  capabilities?: Record<string, unknown>
}

/** 当前是否处于 agentbox 后端模式：backend=agentbox 且连接已配置 */
export function isAgentBoxEnabled(): boolean {
  return resolveBackend() === "agentbox" && getAgentBoxConnection() !== null
}

// ── 配置变更广播（useAgentBoxEnabled 的 store 侧） ──

const CONFIG_CHANGED_EVENT = "studio:agentbox-config-changed"

/**
 * 同文档内的配置写入口广播（原生 storage 事件只通知其他 window，
 * 本窗口的写入方调用此函数让 useAgentBoxEnabled 即时重读）。
 */
export function notifyAgentBoxConfigChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(CONFIG_CHANGED_EVENT))
}

/** 订阅同文档配置广播；跨文档的 storage 事件由 hook 侧自行订阅 */
export function subscribeAgentBoxConfigChanged(
  listener: () => void
): UnsubscribeFn {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CONFIG_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener(CONFIG_CHANGED_EVENT, listener)
  }
}

// ── 后端/transport 单例（按 url+token 键控，配置变更即重建） ──

interface BackendCache {
  key: string
  transport: AgentBoxTransport
  profiles: AgentBoxProfilesPort
}

let cache: BackendCache | null = null

function connectionKey(connection: {
  url: string
  token: string | null
}): string {
  return `${connection.url}\n${connection.token ?? ""}`
}

/** 取当前 agentbox transport（懒建缓存）；未启用返回 null */
export function getAgentBoxTransport(): AgentBoxTransport | null {
  if (resolveBackend() !== "agentbox") return null
  const connection = getAgentBoxConnection()
  if (!connection) return null
  const key = connectionKey(connection)
  if (cache?.key === key) return cache.transport
  cache?.transport.destroy()
  // token 惰性读取：闭包在缓存存续期内始终重读 selector
  const transport = new AgentBoxTransport({
    baseUrl: connection.url,
    token: () => getAgentBoxConnection()?.token ?? null,
  })
  cache = {
    key,
    transport,
    profiles: new AgentBoxProfilesFacade(transport),
  }
  return transport
}

/**
 * profiles CRUD 门面（G6 设置分区数据源）；
 * 绑定到当前连接的 AgentBoxProfilesFacade 透传，未启用返回 null。
 */
export function getAgentBoxProfilesApi(): AgentBoxProfilesPort | null {
  const transport = getAgentBoxTransport()
  if (!transport) return null
  return cache?.profiles ?? null
}

/**
 * GET /api/v1/harnesses —— harness 下拉数据源（extension registry 投影）；
 * 未启用时抛 NOT_ENABLED（调用方先经 useAgentBoxEnabled 门控）。
 */
export async function listAgentBoxHarnesses(): Promise<AgentBoxHarnessInfo[]> {
  const transport = getAgentBoxTransport()
  if (!transport) {
    throw new AgentBoxBackendError(
      "NOT_ENABLED",
      "AgentBox backend is not enabled (set studio:backend=agentbox and studio:agentboxUrl)"
    )
  }
  const dto = await transport.get<{
    harnesses?: AgentBoxHarnessInfo[]
  }>("harnesses")
  return dto.harnesses ?? []
}

/** 测试隔离：清空缓存并释放底层 sockets（生产路径不调用） */
export function resetAgentBoxCacheForTests(): void {
  cache?.transport.destroy()
  cache = null
}
