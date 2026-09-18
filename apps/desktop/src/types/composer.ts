/**
 * The composer's value shapes.
 *
 * These are plain data contracts shared by the stores, `lib/` and the UI, so
 * they live in a shape module rather than beside the runtime object that
 * happens to produce them:
 *
 *  - `lib/chat-runtime` builds model options and formats attachments, and
 *    naming these shapes used to mean importing *upward* into `app/` (for
 *    `QuickModelOption`) and into `store/composer`'s runtime graph (for
 *    `ComposerAttachment`);
 *  - every consumer of the attachment shape imported it through the store that
 *    mutates attachments, so a pure shape carried a runtime module's whole
 *    closure.
 *
 * Nothing here imports a store, a component or a hook.
 */

export interface QuickModelOption {
  provider: string
  providerName: string
  model: string
}

export interface ComposerAttachment {
  id: string
  /** Renderer-lifetime identity for one attachment occurrence. Unlike `id`,
   * which is content/path-derived, this survives draft cloning but changes
   * when the user removes and re-adds the same attachment. */
  occurrenceId?: string
  kind: 'file' | 'folder' | 'image' | 'review' | 'terminal' | 'url'
  label: string
  detail?: string
  refText?: string
  /** Legacy/on-demand full source. New local image chips omit this and read
   * `path` only when the lightbox opens, avoiding retained multi-MB base64. */
  previewUrl?: string
  /** Downscaled data URL for the attachment card and optimistic bubble only. */
  thumbnailUrl?: string
  path?: string
  attachedSessionId?: string
  /** Set while the file/image bytes are being staged into the session
   * workspace (remote upload or local stage), and 'error' if that failed.
   * Drives the spinner / error state on the composer attachment card. */
  uploadState?: 'uploading' | 'error'
}

export type ComposerAttachmentPatch = Partial<Omit<ComposerAttachment, 'id' | 'occurrenceId'>>

export interface SubmitTextOptions {
  attachments?: ComposerAttachment[]
  /** Exact persisted draft version banked immediately before dispatch. The
   * AgentBox caller uses it as the durable intent key, so a late response for
   * an older send can never clear a newer draft. */
  draftVersion?: number
  /** The composer scope key that was actually loaded when this text was
   *  submitted (see use-composer-draft's activeQueueSessionKeyRef). Compared
   *  against the resolved submit target in sessionContextDrift — a mismatch
   *  means the composer and the session-side refs disagreed about which
   *  session this send belongs to (#59305). Omit for non-composer submits
   *  (queue drain, steer, external submit requests): the check is a no-op
   *  without it. */
  composerScope?: string | null
  /** What the transcript shows for this send, when it differs from the text
   *  the agent receives. A `/skill` invocation expands into the whole skill
   *  body — model-facing scaffolding the UI must never render — so the slash
   *  dispatcher passes the invocation (`/work fix the leak`) here. */
  displayText?: string
  /** `hidden` types the persisted user row (display_kind) so no bubble
   *  renders anywhere — the off-screen path for widget intents. The agent
   *  still receives the text as a normal user turn. */
  displayKind?: 'hidden'
  fromQueue?: boolean
  /** Runtime session id to submit into. Queue drains pass this so a
   *  backgrounded/source session cannot be replaced by the current foreground
   *  session between enqueue and drain. */
  sessionId?: string | null
  /** Stable stored session id for optimistic/cache updates and stale-runtime
   *  recovery. Distinct from the runtime session id minted by the gateway. */
  storedSessionId?: string | null
}
