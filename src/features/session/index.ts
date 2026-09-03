/** features/session barrel（设计 §3、§12.2） */
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
