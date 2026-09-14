import { atom } from 'nanostores'

import { deriveDraftTitle } from '@/lib/draft-title'
import { triggerHaptic } from '@/lib/haptics'
import type { ComposerAttachment, ComposerAttachmentPatch } from '@/types/composer'
import type { ConfigOverride } from '@/types/wire/wire-v1'

export const $composerDraft = atom('')
export const $composerAttachments = atom<ComposerAttachment[]>([])
export const $composerTerminalSelections = atom<Record<string, string>>({})

export const createComposerAttachmentOccurrenceId = (): string => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Composer scopes — one live attachment set PER MOUNTED COMPOSER. The main
// chat's scope wraps the module-level atom above (all existing readers keep
// working); each session tile creates its own so two composers on screen
// never share chips. Draft text needs no scope: it lives in each ChatBar's
// DOM + draftRef and stashes per session key already.
// ---------------------------------------------------------------------------

export interface ComposerAttachmentScope {
  $attachments: ReturnType<typeof atom<ComposerAttachment[]>>
  add(attachment: ComposerAttachment): void
  clear(): void
  remove(id: string): ComposerAttachment | null
  removeOccurrences(attachments: readonly ComposerAttachment[]): void
  setUploadState(id: string, uploadState?: ComposerAttachment['uploadState']): void
  update(attachment: ComposerAttachment): boolean
  updateIfCurrent(expected: ComposerAttachment, patch: ComposerAttachmentPatch): boolean
}

function attachmentOccurrenceIndex(attachments: ComposerAttachment[], expected: ComposerAttachment): number {
  return attachments.findIndex(item =>
    expected.occurrenceId === undefined
      ? item === expected
      : item.id === expected.id && item.occurrenceId === expected.occurrenceId
  )
}

export function createComposerAttachmentScope($attachments = atom<ComposerAttachment[]>([])): ComposerAttachmentScope {
  return {
    $attachments,
    add(attachment) {
      const previous = $attachments.get()
      const next = upsertAttachment(previous, attachment)
      $attachments.set(next)

      if (next.length > previous.length && attachment.kind !== 'url') {
        triggerHaptic('selection')
      }
    },
    clear() {
      $attachments.set([])
    },
    remove(id) {
      const current = $attachments.get()
      const removed = current.find(attachment => attachment.id === id) || null
      $attachments.set(current.filter(attachment => attachment.id !== id))

      return removed
    },
    removeOccurrences(attachments) {
      const current = $attachments.get()

      const submittedOccurrences = new Set(
        attachments
          .filter(attachment => attachment.occurrenceId !== undefined)
          .map(attachment => `${attachment.id}\u0000${attachment.occurrenceId}`)
      )

      const submittedLegacy = new Set(attachments.filter(attachment => attachment.occurrenceId === undefined))

      const next = current.filter(attachment =>
        attachment.occurrenceId === undefined
          ? !submittedLegacy.has(attachment)
          : !submittedOccurrences.has(`${attachment.id}\u0000${attachment.occurrenceId}`)
      )

      // Preserve clear()'s notification semantics even when no captured
      // occurrence remains. Some composer consumers settle local state on the
      // successful-submit store emission.
      $attachments.set(next)
    },
    setUploadState(id, uploadState) {
      const current = $attachments.get()
      const index = current.findIndex(attachment => attachment.id === id)

      if (index < 0) {
        return
      }

      const next = [...current]
      next[index] = { ...next[index]!, uploadState }
      $attachments.set(next)
    },
    update(attachment) {
      const current = $attachments.get()
      const index = current.findIndex(item => item.id === attachment.id)

      if (index < 0) {
        return false
      }

      const next = [...current]
      next[index] = attachment
      $attachments.set(next)

      return true
    },
    updateIfCurrent(expected, patch) {
      const current = $attachments.get()
      const index = attachmentOccurrenceIndex(current, expected)

      if (index < 0) {
        return false
      }

      const next = [...current]
      next[index] = { ...next[index]!, ...patch }
      $attachments.set(next)

      return true
    }
  }
}

/** The main chat's scope — the module-level atom, so every existing
 *  `$composerAttachments` reader/writer IS this scope. */
export const mainComposerScope = createComposerAttachmentScope($composerAttachments)

// Per-session / per-workspace draft stash for the decoupled composer. Session
// lifecycle never owns this — only ChatBar's scope swap reads/writes it.
// Persist only serializable attachment references; previews and transient
// upload state stay renderer-local.
export const SESSION_DRAFTS_STORAGE_KEY = 'agentbox:composer-drafts:v4'
export const LEGACY_SESSION_DRAFTS_STORAGE_KEY = 'hermes:composer-drafts:v3'

const NEW_SESSION_DRAFT_KEY = '__new__'
const MAX_PERSISTED_DRAFTS = 50
const EMPTY_SESSION_DRAFT: SessionDraft = { attachments: [], text: '' }
const EMPTY_DRAFT_EXECUTION_CONTEXT: SessionDraftExecutionContext = { overrides: [], profileId: null }
const PERSISTED_DRAFT_SCHEMA_VERSION = 4

export interface SessionDraft {
  attachments: ComposerAttachment[]
  text: string
}

export interface SessionDraftExecutionContext {
  overrides: ConfigOverride[]
  profileId: null | string
}

interface VersionedSessionDraft extends SessionDraft, SessionDraftExecutionContext {
  version: number
}

interface PersistedDraftEnvelope {
  drafts: Record<string, VersionedSessionDraft>
  schemaVersion: typeof PERSISTED_DRAFT_SCHEMA_VERSION
}

const draftKey = (scope: string | null | undefined) => scope?.trim() || NEW_SESSION_DRAFT_KEY

export const composerDraftScopeKey = draftKey

export const workspaceDraftScope = (workspaceId: string): string => `workspace:${encodeURIComponent(workspaceId)}`

const cloneDraft = (draft: SessionDraft): SessionDraft => ({
  attachments: draft.attachments.map(attachment => ({ ...attachment })),
  text: draft.text
})

const cloneExecutionContext = (draft: SessionDraftExecutionContext): SessionDraftExecutionContext => ({
  overrides: draft.overrides.map(override => ({ ...override })),
  profileId: draft.profileId
})

function persistedAttachment(attachment: ComposerAttachment): ComposerAttachment {
  const { previewUrl: _previewUrl, thumbnailUrl: _thumbnailUrl, uploadState: _uploadState, ...reference } = attachment

  return reference
}

function isConfigOverride(value: unknown): value is ConfigOverride {
  return Boolean(value && typeof value === 'object' && typeof (value as Partial<ConfigOverride>).controlId === 'string')
}

function isVersionedDraft(value: unknown): value is VersionedSessionDraft {
  if (!value || typeof value !== 'object') {
    return false
  }

  const draft = value as Partial<VersionedSessionDraft>

  return (
    typeof draft.text === 'string' &&
    Array.isArray(draft.attachments) &&
    Number.isSafeInteger(draft.version) &&
    (draft.profileId === undefined || draft.profileId === null || typeof draft.profileId === 'string') &&
    (draft.overrides === undefined || (Array.isArray(draft.overrides) && draft.overrides.every(isConfigOverride)))
  )
}

function normalizeVersionedDraft(draft: VersionedSessionDraft): VersionedSessionDraft {
  return {
    attachments: draft.attachments,
    overrides: draft.overrides?.map(override => ({ ...override })) ?? [],
    profileId: draft.profileId ?? null,
    text: draft.text,
    version: draft.version
  }
}

function parsePersistedDrafts(raw: string): [string, VersionedSessionDraft][] {
  const parsed = JSON.parse(raw) as unknown

  if (parsed && typeof parsed === 'object' && (parsed as Partial<PersistedDraftEnvelope>).schemaVersion === 4) {
    const drafts = (parsed as Partial<PersistedDraftEnvelope>).drafts

    if (!drafts || typeof drafts !== 'object') {
      return []
    }

    return Object.entries(drafts)
      .filter((entry): entry is [string, VersionedSessionDraft] => isVersionedDraft(entry[1]))
      .map(([key, draft]) => [key, normalizeVersionedDraft(draft)])
  }

  // v3 was a plain { scope: text } dictionary. Keep accepting it so an update
  // never strands the user's unsent words.
  return Object.entries(parsed as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, text], index) => [
      key,
      { attachments: [], overrides: [], profileId: null, text, version: index + 1 }
    ])
}

function loadPersistedDrafts(): [string, VersionedSessionDraft][] {
  try {
    const current = window.localStorage.getItem(SESSION_DRAFTS_STORAGE_KEY)

    if (current) {
      return parsePersistedDrafts(current)
    }

    const legacy = window.localStorage.getItem(LEGACY_SESSION_DRAFTS_STORAGE_KEY)

    if (!legacy) {
      return []
    }

    return parsePersistedDrafts(legacy)
  } catch {
    return []
  }
}

const draftsBySession = new Map<string, VersionedSessionDraft>(loadPersistedDrafts())
let nextDraftVersion = Math.max(0, ...[...draftsBySession.values()].map(draft => draft.version)) + 1

export const $draftExecutionContexts = atom<Record<string, SessionDraftExecutionContext>>(
  Object.fromEntries(
    [...draftsBySession].map(([key, draft]) => [key, cloneExecutionContext(draft)])
  )
)

export const draftExecutionContextIn = (
  contexts: Record<string, SessionDraftExecutionContext>,
  scope: string | null | undefined
): SessionDraftExecutionContext => contexts[draftKey(scope)] ?? EMPTY_DRAFT_EXECUTION_CONTEXT

function publishDraftExecutionContext(key: string, context?: SessionDraftExecutionContext): void {
  const current = $draftExecutionContexts.get()
  const next = { ...current }

  if (context && (context.profileId !== null || context.overrides.length > 0)) {
    next[key] = cloneExecutionContext(context)
  } else {
    delete next[key]
  }

  $draftExecutionContexts.set(next)
}

/**
 * Patch one asynchronous attachment occurrence wherever the main composer owns
 * it. During a session switch the occurrence moves from the live atom into the
 * per-session in-memory draft stash; a preview may finish on either side of
 * that handoff. Updating both stores is safe because occurrence ids are unique,
 * and merging into the latest object preserves concurrent staging metadata.
 */
export function patchMainComposerAttachmentOccurrence(
  expected: ComposerAttachment,
  patch: ComposerAttachmentPatch
): boolean {
  let updated = mainComposerScope.updateIfCurrent(expected, patch)

  for (const [key, draft] of draftsBySession) {
    const index = attachmentOccurrenceIndex(draft.attachments, expected)

    if (index < 0) {
      continue
    }

    const attachments = [...draft.attachments]
    attachments[index] = { ...attachments[index]!, ...patch }
    draftsBySession.set(key, { ...draft, attachments })
    updated = true
  }

  return updated
}

/**
 * What each unsent draft would be called, keyed the same way its text is.
 *
 * A draft has no session to carry a title, so the tab showing it reads this
 * instead of the "New session" placeholder. Written from `stashSessionDraft`,
 * the one funnel every composer's text already flows through — the debounce
 * that persists a draft is the same beat that renames its tab, so typing costs
 * nothing extra. Only tabs showing a draft subscribe, and each selects its own
 * key, so a rename repaints one label rather than the strip.
 *
 * Seeded from the persisted texts: a draft left open across a restart comes
 * back already named.
 */
export const $draftTitles = atom<Record<string, string>>(
  Object.fromEntries(
    [...draftsBySession].map(([key, draft]) => [key, deriveDraftTitle(draft.text)]).filter(([, title]) => title)
  )
)

/** Read one draft's title out of the map — for a `useStoreSelector`, so a tab
 *  repaints on its OWN rename rather than on every draft's. */
export const draftTitleIn = (titles: Record<string, string>, scope: string | null | undefined): string =>
  titles[draftKey(scope)] ?? ''

export const draftTitleFor = (scope: string | null | undefined): string => draftTitleIn($draftTitles.get(), scope)

function publishDraftTitle(key: string, title: string): void {
  const current = $draftTitles.get()

  if ((current[key] ?? '') === title) {
    return
  }

  const next = { ...current }

  if (title) {
    next[key] = title
  } else {
    delete next[key]
  }

  $draftTitles.set(next)
}

/**
 * Re-read the persisted drafts written by ANOTHER window into this one's map.
 *
 * Drafts are per-renderer state backed by shared localStorage, and the map
 * above is read exactly once at module load. Two windows on the same session
 * (HUD mode ⇄ the app window) therefore diverge the moment either one types:
 * whichever window mounted first keeps its stale copy forever, so text typed
 * in the HUD is simply gone when you return to the app.
 *
 * Merge, don't clobber — the local map may hold attachments (never persisted)
 * that the incoming text-only snapshot can't know about.
 */
export function reloadPersistedDrafts(): void {
  const incoming = new Map(loadPersistedDrafts())

  for (const [key, draft] of incoming) {
    const local = draftsBySession.get(key)

    // A lower version is an older window's delayed storage event. Never let it
    // overwrite newer local intent. Preserve transient attachment fields only
    // when the versions are identical.
    if (local && local.version > draft.version) {
      continue
    }

    draftsBySession.set(
      key,
      local?.attachments.length && local.version === draft.version ? { ...draft, attachments: local.attachments } : draft
    )
    publishDraftExecutionContext(key, draft)
    nextDraftVersion = Math.max(nextDraftVersion, draft.version + 1)
    publishDraftTitle(key, deriveDraftTitle(draft.text))
  }

  // A key that vanished from storage was cleared (sent) in the other window.
  for (const [key, local] of [...draftsBySession]) {
    if (!incoming.has(key) && window.localStorage.getItem(SESSION_DRAFTS_STORAGE_KEY) && local.version < nextDraftVersion) {
      draftsBySession.delete(key)
      publishDraftTitle(key, '')
      publishDraftExecutionContext(key)
    }
  }
}

// localStorage `storage` events fire across Electron BrowserWindows of the
// same origin, so the other window's write is the sync signal.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === SESSION_DRAFTS_STORAGE_KEY) {
      reloadPersistedDrafts()
    }
  })
}

/**
 * Push a composer's live text into the shared stash (`flush`), or repaint it
 * from the stash (`reload`).
 *
 * Both halves of the HUD handoff need this. The stash is the only draft state
 * two windows share, but a mounted composer only consults it when its session
 * scope changes — so entering HUD mode has to flush the app window's in-editor
 * text down to the stash before the HUD boots and reads it, and leaving has to
 * repaint the app's editor from whatever the HUD left behind (usually empty,
 * because the HUD sent it).
 *
 * Dispatched synchronously, unlike the focus bus: the flush must complete
 * before the HUD window is created.
 */
const DRAFT_SYNC_EVENT = 'hermes:composer-draft-sync'

export type ComposerDraftSyncMode = 'flush' | 'reload'

interface ComposerDraftSyncDetail {
  mode: ComposerDraftSyncMode
  target: string
}

export function requestComposerDraftSync(mode: ComposerDraftSyncMode, target = 'main'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ComposerDraftSyncDetail>(DRAFT_SYNC_EVENT, { detail: { mode, target } }))
  }
}

export function onComposerDraftSyncRequest(handler: (detail: ComposerDraftSyncDetail) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const listener = (event: Event) => handler((event as CustomEvent<ComposerDraftSyncDetail>).detail)
  window.addEventListener(DRAFT_SYNC_EVENT, listener)

  return () => window.removeEventListener(DRAFT_SYNC_EVENT, listener)
}

function persistDraftTexts() {
  try {
    const entries = [...draftsBySession]
      .filter(
        ([, draft]) =>
          draft.text.trim() || draft.attachments.length > 0 || draft.profileId !== null || draft.overrides.length > 0
      )
      .slice(-MAX_PERSISTED_DRAFTS)
      .map(
        ([key, draft]) =>
          [
            key,
            {
              attachments: draft.attachments.map(persistedAttachment),
              overrides: draft.overrides,
              profileId: draft.profileId,
              text: draft.text,
              version: draft.version
            }
          ] as const
      )

    if (entries.length === 0) {
      window.localStorage.removeItem(SESSION_DRAFTS_STORAGE_KEY)
      window.localStorage.removeItem(LEGACY_SESSION_DRAFTS_STORAGE_KEY)
    } else {
      const envelope: PersistedDraftEnvelope = {
        drafts: Object.fromEntries(entries),
        schemaVersion: PERSISTED_DRAFT_SCHEMA_VERSION
      }

      window.localStorage.setItem(SESSION_DRAFTS_STORAGE_KEY, JSON.stringify(envelope))
      window.localStorage.removeItem(LEGACY_SESSION_DRAFTS_STORAGE_KEY)
    }
  } catch {
    // Best-effort only — quota/private-mode must never break typing.
  }
}

export function stashSessionDraft(
  scope: string | null | undefined,
  text: string,
  attachments: ComposerAttachment[]
): number {
  const key = draftKey(scope)
  const version = nextDraftVersion++
  const previousContext = draftsBySession.get(key) ?? EMPTY_DRAFT_EXECUTION_CONTEXT

  // Delete-then-set keeps MRU order for MAX_PERSISTED_DRAFTS eviction.
  draftsBySession.delete(key)

  if (
    text.trim() ||
    attachments.length > 0 ||
    previousContext.profileId !== null ||
    previousContext.overrides.length > 0
  ) {
    draftsBySession.set(key, {
      ...cloneDraft({ attachments, text }),
      ...cloneExecutionContext(previousContext),
      version
    })
  }

  persistDraftTexts()
  publishDraftTitle(key, deriveDraftTitle(text))

  return version
}

export function takeSessionDraft(scope: string | null | undefined): SessionDraft {
  const stashed = draftsBySession.get(draftKey(scope))

  return stashed ? cloneDraft(stashed) : EMPTY_SESSION_DRAFT
}

export function sessionDraftExecutionContext(scope: string | null | undefined): SessionDraftExecutionContext {
  const stashed = draftsBySession.get(draftKey(scope))

  return stashed ? cloneExecutionContext(stashed) : cloneExecutionContext(EMPTY_DRAFT_EXECUTION_CONTEXT)
}

export function setSessionDraftExecutionContext(
  scope: string | null | undefined,
  context: SessionDraftExecutionContext
): number {
  const key = draftKey(scope)
  const version = nextDraftVersion++
  const previous = draftsBySession.get(key)
  const draft = previous ? cloneDraft(previous) : EMPTY_SESSION_DRAFT

  draftsBySession.delete(key)

  if (draft.text.trim() || draft.attachments.length > 0 || context.profileId !== null || context.overrides.length > 0) {
    draftsBySession.set(key, {
      ...cloneDraft(draft),
      ...cloneExecutionContext(context),
      version
    })
  }

  persistDraftTexts()
  publishDraftExecutionContext(key, context)

  return version
}

export function clearSessionDraft(scope: string | null | undefined): number {
  const key = draftKey(scope)
  const version = nextDraftVersion++

  draftsBySession.delete(key)
  persistDraftTexts()
  publishDraftTitle(key, '')
  publishDraftExecutionContext(key)

  return version
}

export const sessionDraftVersion = (scope: string | null | undefined): number | null =>
  draftsBySession.get(draftKey(scope))?.version ?? null

/** Clear only the exact draft generation that was submitted. */
export function clearSessionDraftIfVersion(scope: string | null | undefined, expectedVersion: number): boolean {
  const key = draftKey(scope)

  if (draftsBySession.get(key)?.version !== expectedVersion) {
    return false
  }

  clearSessionDraft(scope)

  return true
}

/**
 * Move a stashed composer draft from one session key onto another.
 *
 * Auto-compression rotates the live stored tip id (root → continuation) while
 * the user may still be typing. Drafts keyed on the obsolete tip would otherwise
 * vanish from the composer when selection follows the new tip. No-op unless both
 * keys resolve, differ, and the source has content. Does not overwrite a
 * non-empty destination draft.
 */
export function migrateSessionDraft(fromKey: string | null | undefined, toKey: string | null | undefined): boolean {
  const from = draftKey(fromKey)
  const to = draftKey(toKey)

  if (!fromKey || !toKey || from === to) {
    return false
  }

  const source = draftsBySession.get(from)

  if (
    !source ||
    (!source.text.trim() &&
      source.attachments.length === 0 &&
      source.profileId === null &&
      source.overrides.length === 0)
  ) {
    return false
  }

  const dest = draftsBySession.get(to)

  if (dest && (dest.text.trim() || dest.attachments.length > 0 || dest.profileId !== null || dest.overrides.length > 0)) {
    return false
  }

  draftsBySession.delete(from)
  draftsBySession.set(to, {
    ...cloneDraft(source),
    ...cloneExecutionContext(source),
    version: nextDraftVersion++
  })
  persistDraftTexts()
  publishDraftTitle(from, '')
  publishDraftTitle(to, deriveDraftTitle(source.text))
  publishDraftExecutionContext(from)
  publishDraftExecutionContext(to, source)

  return true
}

export function setComposerDraft(value: string) {
  $composerDraft.set(value)
}

export function appendComposerDraft(value: string) {
  const text = value.trim()

  if (!text) {
    return
  }

  const current = $composerDraft.get()
  const separator = current && !current.endsWith('\n') ? '\n\n' : ''

  $composerDraft.set(`${current}${separator}${text}`)
}

export function appendComposerInline(value: string) {
  const text = value.trim()

  if (!text) {
    return
  }

  const current = $composerDraft.get().trimEnd()
  const separator = current ? ' ' : ''

  $composerDraft.set(`${current}${separator}${text}`)
}

export function clearComposerDraft() {
  $composerDraft.set('')
}

// Main-scope conveniences — the names the app has always used.
export const addComposerAttachment = (attachment: ComposerAttachment) => mainComposerScope.add(attachment)
export const removeComposerAttachment = (id: string) => mainComposerScope.remove(id)

/** Replace an existing attachment in place by id. No-op (returns false) when the
 * id is gone — e.g. the user removed the chip while an eager upload was still in
 * flight, so a late success must NOT resurrect it. Use this instead of
 * addComposerAttachment for async results that may land after a removal. */
export const updateComposerAttachment = (attachment: ComposerAttachment) => mainComposerScope.update(attachment)

export const clearComposerAttachments = () => mainComposerScope.clear()

/** Update only the upload state of an existing attachment (no-op if it's gone,
 * e.g. the user removed it mid-upload). Pass `undefined` to clear it. */
export const setComposerAttachmentUploadState = (id: string, uploadState?: ComposerAttachment['uploadState']) =>
  mainComposerScope.setUploadState(id, uploadState)

const TERMINAL_REF_RE = /@terminal:(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g

function unquoteRefValue(raw: string) {
  const head = raw[0]
  const tail = raw[raw.length - 1]
  const quoted = (head === '`' && tail === '`') || (head === '"' && tail === '"') || (head === "'" && tail === "'")

  return (quoted ? raw.slice(1, -1) : raw).replace(/[,.;!?]+$/, '').trim()
}

function terminalLabelsFromDraft(draft: string) {
  const labels: string[] = []
  const seen = new Set<string>()

  for (const match of draft.matchAll(TERMINAL_REF_RE)) {
    const label = unquoteRefValue(match[1] || '')

    if (!label || seen.has(label)) {
      continue
    }

    seen.add(label)
    labels.push(label)
  }

  return labels
}

export function setComposerTerminalSelection(label: string, text: string) {
  const nextLabel = label.trim()
  const nextText = text.trim()

  if (!nextLabel || !nextText) {
    return
  }

  const current = $composerTerminalSelections.get()

  if (current[nextLabel] === nextText) {
    return
  }

  $composerTerminalSelections.set({
    ...current,
    [nextLabel]: nextText
  })
}

export function reconcileComposerTerminalSelections(draft: string) {
  const current = $composerTerminalSelections.get()
  const labels = new Set(terminalLabelsFromDraft(draft))
  let changed = false
  const next: Record<string, string> = {}

  for (const [label, text] of Object.entries(current)) {
    if (!labels.has(label)) {
      changed = true

      continue
    }

    next[label] = text
  }

  if (changed) {
    $composerTerminalSelections.set(next)
  }
}

export function terminalContextBlocksFromDraft(draft: string) {
  const labels = terminalLabelsFromDraft(draft)

  if (labels.length === 0) {
    return []
  }

  const selections = $composerTerminalSelections.get()

  return labels.flatMap(label => {
    const text = selections[label]?.trim()

    if (!text) {
      return []
    }

    return `\`\`\`terminal\n${text}\n\`\`\``
  })
}

export function clearComposerTerminalSelections() {
  if (Object.keys($composerTerminalSelections.get()).length === 0) {
    return
  }

  $composerTerminalSelections.set({})
}

function upsertAttachment(attachments: ComposerAttachment[], attachment: ComposerAttachment) {
  const index = attachments.findIndex(item => item.id === attachment.id)

  if (index < 0) {
    return [...attachments, attachment]
  }

  const next = [...attachments]
  next[index] = attachment

  return next
}
