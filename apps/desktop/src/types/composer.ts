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
