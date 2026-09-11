import type { SessionMessage, UsageStats } from '@/types/hermes'

export interface ImageAttachResponse {
  attached?: boolean
  path?: string
  text?: string
  message?: string
  // Returned by the byte-upload variant (image.attach_bytes) used in remote mode.
  count?: number
  bytes?: number
  name?: string
  width?: number
  height?: number
  token_estimate?: number
}

export interface ImageDetachResponse {
  detached?: boolean
  count?: number
}

export interface FileAttachResponse {
  attached?: boolean
  message?: string
  // Gateway-side absolute path the file was staged to.
  path?: string
  // Workspace-relative path used to build ref_text.
  ref_path?: string
  // Rewritten @file: ref that resolves on the gateway (workspace-relative).
  ref_text?: string
  // True when bytes/host file were copied into the session workspace.
  uploaded?: boolean
  name?: string
}

export interface SlashExecResponse {
  output?: string
  warning?: string
}

export interface BrowserManageResponse {
  connected?: boolean
  url?: string
  messages?: string[]
}

/** Response from the `session.compress` RPC. `messages` is the post-compress
 *  history (same shape `session.resume` returns via `_history_to_messages`),
 *  so the desktop can replace its transcript from it rather than leaving stale
 *  bubbles on screen. `summary` carries the "compressed N → M messages" line. */
export interface SessionCompressResponse {
  host_ack?: {
    output?: string
  }
  info?: {
    title?: string
    usage?: Partial<UsageStats>
  }
  messages?: SessionMessage[]
  /** Set with `status: 'pending'` when the gateway's compute-host wait expired
   *  while compression is still running; the transcript refreshes from the
   *  pushed session.info / `compacted` status edge (#97948). */
  message?: string
  removed?: number
  status?: string
  summary?: {
    aborted?: boolean
    headline?: string
    noop?: boolean
    note?: null | string
    token_line?: string
  }
  usage?: Partial<UsageStats>
}

export interface SessionSteerResponse {
  // 'queued' == accepted into the live turn's steer slot (injected at the next
  // tool-result boundary); 'rejected' == no live tool window, caller queues.
  status?: 'queued' | 'rejected'
  text?: string
}

export interface SessionRedirectResponse {
  status?: 'redirected' | 'queued' | 'rejected'
  text?: string
}

export interface SessionTitleResponse {
  title?: string
  // True when the session row isn't persisted yet and the title was queued
  // to be applied on the first turn (see tui_gateway session.title handler).
  pending?: boolean
  session_key?: string
}

export interface HandoffRequestResponse {
  queued?: boolean
  session_key?: string
  platform?: string
  // Human-readable home channel name for the destination platform.
  home_name?: string
}

export interface HandoffStateResponse {
  // '' | 'pending' | 'running' | 'completed' | 'failed'
  state?: string
  platform?: string
  error?: string
}

export interface HandoffFailResponse {
  failed?: boolean
  state?: string
}

export interface ExecCommandDispatchResponse {
  type: 'exec' | 'plugin'
  output?: string
}

export interface AliasCommandDispatchResponse {
  type: 'alias'
  target: string
}

export interface SkillCommandDispatchResponse {
  type: 'skill'
  name: string
  message?: string
  /** The invocation the UI renders (`/work fix the leak`). `message` is the
   *  expanded skill body — model-facing scaffolding no surface may show. */
  display?: string
}

export interface SendCommandDispatchResponse {
  type: 'send'
  message: string
  notice?: string
  /** Set for a skill-bundle send: see SkillCommandDispatchResponse.display. */
  display?: string
}

export interface PrefillCommandDispatchResponse {
  type: 'prefill'
  message: string
  notice?: string
}

export type CommandDispatchResponse =
  | ExecCommandDispatchResponse
  | AliasCommandDispatchResponse
  | SkillCommandDispatchResponse
  | SendCommandDispatchResponse
  | PrefillCommandDispatchResponse
