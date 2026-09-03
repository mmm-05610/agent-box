/** features/session barrel（设计 §3、§12.2、§13-F3） */
export { CodegRustSessionRuntime, SessionRuntimeError } from "./runtime"
export type {
  AttachCapableTransport,
  CodegRustSessionRuntimeOptions,
} from "./runtime"
export {
  envelopeToSessionEvent,
  snapshotToHydration,
  snapshotToSessionSnapshot,
} from "./model/normalize"
export type { UserPartAppendedEvent } from "./model/normalize"
// ── F3：provider 挂接（原 acp-connections-context 的实现体）──
export {
  SessionRuntimeProvider,
  AcpConnectionsProvider,
  useAcpActions,
  useAcpEvent,
  useConnectionStore,
  useSessionRuntime,
  type AcpActionsValue,
  type ConnectionStoreApi,
  type LiveMessageSink,
} from "./provider"
export {
  extractQuestionText,
  getCachedSelectors,
} from "./model/connections-reducer"
export type {
  ClaudeApiRetryState,
  ConnectionsMap,
  ConnectionState,
  LiveContentBlock,
  LiveMessage,
  PendingPermission,
  PendingQuestion,
  PendingUserMessage,
  ToolCallImage,
  ToolCallInfo,
  ToolCallMeta,
} from "./model/connection-types"
