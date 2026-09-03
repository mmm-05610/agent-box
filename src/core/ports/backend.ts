/**
 * Port 绑定点（设计 §4.2 —— 后端替换的插槽）。
 *
 * 当前唯一实现 createCodegRustBackend(transport)（映射现有命令）；
 * 未来 createAgentBoxBackend(httpClient) 映射 agent-box-web /api/v1。
 * app/ 根部 <BackendProvider backend={...}> 注入，换后端只改这一行。
 */
import type { EventChannel } from "./event-channel"
import type { ProjectsPort } from "./projects"
import type { SessionRuntime } from "./session-runtime"

/** 全部后端能力的聚合接口（设计 §4.2） */
export interface BackendPorts {
  session: SessionRuntime
  projects: ProjectsPort
  events: EventChannel
  // 后续切片按需扩展：git / terminal / skills / settings（§3、§4.2）
}
