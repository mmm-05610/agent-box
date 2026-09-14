import type { ReactNode } from 'react'

import type { HermesGateway } from '@/api/client'
import type { QuickModelOption, SubmitTextOptions } from '@/types/composer'
import type { ContextSuggestion } from '@/types/context-suggestion'
import type { ConfigDescriptor, ConfigOverride } from '@/types/wire/wire-v1'

/** One entry resolved from a drop event. Declared here rather than beside the
 *  runtime that resolves it (`hooks/use-composer-actions`), so a consumer that
 *  only needs the shape does not drag that module's closure in with it. */
export interface DroppedFile {
  /** Browser-native File handle. Absent for in-app drags (e.g. project tree). */
  file?: File
  /** Absolute filesystem path. Empty when an OS drop didn't carry one. */
  path: string
  /** True if the entry is a directory. Set by in-app drags, and by OS drops via
   * DataTransferItem.webkitGetAsEntry(). */
  isDirectory?: boolean
  /** First line number for in-app line-ref drags (source view gutter). */
  line?: number
  /** Last line number for line-range drags (`line..lineEnd` inclusive). */
  lineEnd?: number
}

export interface ChatBarState {
  model: {
    model: string
    provider: string
    canSwitch: boolean
    /** Hides the legacy model pill while retaining profile-owned config UI. */
    hidden?: boolean
    loading?: boolean
    quickModels?: QuickModelOption[]
    /** Reused status-bar dropdown (built with gateway + selectModel upstream). */
    modelMenuContent?: ReactNode
  }
  tools: { enabled: boolean; label: string; suggestions?: ContextSuggestion[] }
  voice: { enabled: boolean; active: boolean }
  profile?: ComposerProfileState
  /** Present only after the composer is wired to the server-owned queue
   * projection. A hello capability by itself must never reactivate the old
   * renderer-local queue engine. */
  queue?: { authority: 'server' }
}

export interface ComposerProfileOption {
  displayName: string
  harness: string
  id: string
  selectable: boolean
  unavailableReason?: string
}

export interface ComposerProfileState {
  modelChoices?: ComposerProviderModelChoice[]
  configDescriptor?: ConfigDescriptor | null
  onOverrideChange: (overrides: ConfigOverride[]) => void
  onSelect: (profileId: string) => Promise<boolean> | boolean
  options: ComposerProfileOption[]
  overrides: ConfigOverride[]
  selectedId: null | string
  switching?: boolean
  unavailableReason?: string
}

export interface ComposerProviderModelChoice {
  availability: 'available' | 'unknown' | 'unavailable'
  displayName: string
  modelId: string
  providerDisplayName: string
  providerId: string
  unavailableReason: string | null
}

export interface ChatBarProps {
  busy: boolean
  disabled: boolean
  /** Selects the business authority for submit/queue/input behavior. AgentBox
   * never falls through to Hermes steering or the renderer-owned queue. */
  runtimeAuthority?: 'agentbox' | 'hermes'
  /** Server-owned queue projection. AgentBox supplies this as presentation;
   * the Composer never copies it into the renderer queue engine. */
  serverQueue?: ReactNode
  focusKey?: string | null
  maxRecordingSeconds?: number
  state: ChatBarState
  gateway?: HermesGateway | null
  /** Stable workspace identity for a not-yet-created Session draft. */
  draftScopeKey?: string | null
  queueSessionKey?: string | null
  sessionId?: string | null
  cwd?: string | null
  onCancel: () => Promise<void> | void
  onAddContextRef?: (refText: string, label?: string, detail?: string) => void
  onAddUrl?: (url: string) => void
  onAttachImageBlob?: (blob: Blob) => Promise<boolean | void> | boolean | void
  onAttachDroppedItems?: (candidates: DroppedFile[]) => Promise<boolean | void> | boolean | void
  /** Pasted GitHub PR-comment deep link → structured review attachment.
   *  Returns true when the paste was consumed as an attachment. */
  onAttachPrCommentUrl?: (url: string) => boolean
  onPasteClipboardImage?: (opts?: { silent?: boolean }) => Promise<boolean> | void
  onPickFiles?: () => void
  onPickFolders?: () => void
  onPickImages?: () => void
  onRemoveAttachment?: (id: string) => void
  onSteer?: (text: string) => Promise<boolean> | boolean
  onSubmit: (value: string, options?: SubmitTextOptions) => Promise<boolean> | boolean
  onTranscribeAudio?: (audio: Blob) => Promise<string>
}

export type VoiceStatus = 'idle' | 'recording' | 'transcribing'

export interface VoiceActivityState {
  elapsedSeconds: number
  level: number
  status: VoiceStatus
}
