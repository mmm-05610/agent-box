import type { WireV1Client } from '@/api/wire-v1-client'
import { resolveComposerConfig } from '@/application/profile/wire-composer-profile'
import type { ComposerAttachment } from '@/types/composer'
import {
  asWireId,
  type AttachmentRef,
  type ConfigOverride,
  type DraftMessage,
  type WireId
} from '@/types/wire/wire-v1'

import { type AgentBoxSendDecision, type AgentBoxSendIntent, sendAgentBoxMessage } from './wire-send'
import { refreshAgentBoxQueue } from './wire-session-control'

export interface AgentBoxComposerSubmitInput {
  attachments: ComposerAttachment[]
  draftVersion: number
  overrides: ConfigOverride[]
  profileId: null | string
  scopeKey: string
  sessionId: null | string
  text: string
  workspaceId: null | string
}

export interface AgentBoxInvalidControl {
  controlId: string
  reason: string
}

export type AgentBoxComposerSubmitResult =
  | {
      acceptedForDraft: false
      /** Present when the service rejected the resolved configuration; every
       *  returned controlId/reason is preserved for the user to act on. */
      invalidControls?: AgentBoxInvalidControl[]
      outcome: 'invalid'
      reason: string
    }
  | { acceptedForDraft: boolean; decision: AgentBoxSendDecision; outcome: 'sent' }

export interface AgentBoxComposerSubmitOptions {
  refreshQueue?: (client: WireV1Client, sessionId: WireId) => Promise<unknown>
}

function attachmentRef(attachment: ComposerAttachment): AttachmentRef | null {
  const ref = attachment.refText?.trim()

  // Browser-local paths, preview URLs and image bytes are deliberately not a
  // transport. Only an already-staged opaque reference crosses this boundary;
  // the server still validates that reference against the Workspace.
  if (!ref || attachment.uploadState || /^data:/i.test(ref)) {
    return null
  }

  return {
    displayName: attachment.label,
    mediaKind: attachment.kind === 'image' ? 'image' : attachment.kind === 'file' || attachment.kind === 'folder' ? 'file' : 'other',
    ref
  }
}

export function prepareAgentBoxDraftMessage(
  text: string,
  attachments: ComposerAttachment[]
): { message: DraftMessage; outcome: 'ready' } | { outcome: 'invalid'; reason: string } {
  if (!text.trim() && attachments.length === 0) {
    return { outcome: 'invalid', reason: 'EMPTY_DRAFT' }
  }

  const refs = attachments.map(attachmentRef)

  if (refs.some(ref => ref === null)) {
    return { outcome: 'invalid', reason: 'ATTACHMENT_NOT_STAGED' }
  }

  return { message: { attachments: refs as AttachmentRef[], text }, outcome: 'ready' }
}

/**
 * Production Composer → application send seam. It chooses create-vs-continue
 * from server identities only, resolves the effective configuration with the
 * service before anything is sent, preserves the draft version as the durable
 * intent key, and treats a queued acceptance as accepted before refreshing
 * the server-owned queue projection.
 */
export async function submitAgentBoxComposer(
  client: WireV1Client,
  input: AgentBoxComposerSubmitInput,
  options: AgentBoxComposerSubmitOptions = {}
): Promise<AgentBoxComposerSubmitResult> {
  if (!Number.isSafeInteger(input.draftVersion) || input.draftVersion < 1) {
    return { acceptedForDraft: false, outcome: 'invalid', reason: 'DRAFT_VERSION_REQUIRED' }
  }

  const prepared = prepareAgentBoxDraftMessage(input.text, input.attachments)

  if (prepared.outcome === 'invalid') {
    return { acceptedForDraft: false, ...prepared }
  }

  // Both identities are service-owned and required by every send: a new draft
  // needs them to create, and an existing Session already carries them. They are
  // never derived from a path or a legacy Session record.
  if (!input.workspaceId || !input.profileId) {
    return {
      acceptedForDraft: false,
      outcome: 'invalid',
      reason: !input.workspaceId ? 'WORKSPACE_REQUIRED' : 'PROFILE_REQUIRED'
    }
  }

  // The service decides whether this snapshot is runnable. A rejected config
  // never reaches a send, and a transport/typed failure propagates instead of
  // being reported as "the config is fine".
  const resolution = await resolveComposerConfig(client, {
    overrides: input.overrides,
    profileId: input.profileId,
    workspaceId: input.workspaceId
  })

  if (resolution.outcome === 'rejected') {
    return {
      acceptedForDraft: false,
      invalidControls: resolution.invalidControls,
      outcome: 'invalid',
      reason: 'CONFIG_REJECTED'
    }
  }

  let intent: AgentBoxSendIntent

  // The exact resolved snapshot is what the run is asked to accept — the same
  // array, in the same order, with no re-derivation in between.
  if (input.sessionId) {
    intent = {
      intentKey: String(input.draftVersion),
      kind: 'continue',
      message: prepared.message,
      overrides: input.overrides,
      scopeKey: input.scopeKey,
      sessionId: asWireId(input.sessionId)
    }
  } else {
    intent = {
      intentKey: String(input.draftVersion),
      kind: 'create',
      message: prepared.message,
      overrides: input.overrides,
      profileId: asWireId(input.profileId),
      scopeKey: input.scopeKey,
      workspaceId: asWireId(input.workspaceId)
    }
  }

  const decision = await sendAgentBoxMessage(client, intent)
  const acceptedForDraft = decision.outcome === 'accepted' && decision.intentKey === String(input.draftVersion)

  if (acceptedForDraft && decision.queueItemId) {
    void (options.refreshQueue ?? refreshAgentBoxQueue)(client, decision.sessionId).catch(() => undefined)
  }

  return { acceptedForDraft, decision, outcome: 'sent' }
}
