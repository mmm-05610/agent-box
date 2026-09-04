/**
 * 后端开关（设计 §4.2 换绑机制的入口；G7 UI 接线，本模块只交付读写）。
 *
 * localStorage 键：
 * - `studio:backend` —— "codeg" | "agentbox"；缺省/非法值 → null，
 *   表示沿用现有 codeg 默认绑定（现有 store/context 行为不变）
 * - `studio:agentboxUrl` / `studio:agentboxToken` —— agentbox 模式的
 *   服务地址与 Bearer token（服务端 AGENT_BOX_STUDIO_TOKEN）
 */

/** 可选后端 id */
export type BackendId = "codeg" | "agentbox"

export const BACKEND_STORAGE_KEY = "studio:backend"
export const AGENTBOX_URL_STORAGE_KEY = "studio:agentboxUrl"
export const AGENTBOX_TOKEN_STORAGE_KEY = "studio:agentboxToken"

const VALID_BACKENDS: readonly BackendId[] = ["codeg", "agentbox"]

function isBackendId(value: unknown): value is BackendId {
  return value === "codeg" || value === "agentbox"
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    // localStorage 可能被隐私模式 / 策略禁用：等价于未设置
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  if (typeof window === "undefined") return
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch (err) {
    console.warn(`[backend-selector] failed to write "${key}":`, err)
  }
}

/**
 * 解析当前激活后端；null = 未设置或非法值，调用方沿用现有 codeg
 * 绑定（默认路径零改动）。
 */
export function resolveBackend(): BackendId | null {
  const raw = readStorage(BACKEND_STORAGE_KEY)
  return isBackendId(raw) ? raw : null
}

/**
 * 写入激活后端；null = 清除键（回到 codeg 默认）。
 * G7 接线前没有任何调用方，写入仅影响下次 resolveBackend()。
 */
export function setActiveBackend(backend: BackendId | null): void {
  if (backend === null) {
    writeStorage(BACKEND_STORAGE_KEY, null)
    return
  }
  writeStorage(BACKEND_STORAGE_KEY, backend)
}

/**
 * 读取 agentbox 模式的连接配置；url 未设置时返回 null
 * （调用方不应猜测默认地址）。
 */
export function getAgentBoxConnection(): {
  url: string
  token: string | null
} | null {
  const url = readStorage(AGENTBOX_URL_STORAGE_KEY)
  if (!url) return null
  return {
    url: url.replace(/\/+$/, ""),
    token: readStorage(AGENTBOX_TOKEN_STORAGE_KEY),
  }
}

/** 写入 agentbox 连接配置；null 字段表示清除对应键（url 归一去尾斜杠） */
export function setAgentBoxConnection(config: {
  url: string | null
  token?: string | null
}): void {
  const url = config.url === null ? null : config.url.replace(/\/+$/, "")
  writeStorage(AGENTBOX_URL_STORAGE_KEY, url)
  if (config.token !== undefined) {
    writeStorage(AGENTBOX_TOKEN_STORAGE_KEY, config.token)
  }
}

/** 校验用：把任意存储值归一为合法 BackendId | null */
export function normalizeBackendId(value: unknown): BackendId | null {
  return isBackendId(value) ? value : null
}

/** 全量有效值（G7 设置 UI 的选项列表） */
export function validBackendIds(): readonly BackendId[] {
  return VALID_BACKENDS
}
