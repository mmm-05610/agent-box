/**
 * features/agentbox barrel（G6）：门面 API + 启用态 hook。
 *
 * 组件（binding-bar / profiles-settings-section / session-view-agentbox）
 * 不进 barrel —— 页面与测试按路径直取，避免 feature 内部经 barrel 自引用。
 */
export {
  getAgentBoxProfilesApi,
  getAgentBoxTransport,
  isAgentBoxEnabled,
  listAgentBoxHarnesses,
  notifyAgentBoxConfigChanged,
  resetAgentBoxCacheForTests,
  subscribeAgentBoxConfigChanged,
  type AgentBoxHarnessInfo,
} from "./api"
export type {
  AgentBoxProfile,
  AgentBoxProfilesPort,
  CreateAgentBoxProfileInput,
} from "./api"
export { useAgentBoxEnabled } from "./use-agent-box-enabled"
