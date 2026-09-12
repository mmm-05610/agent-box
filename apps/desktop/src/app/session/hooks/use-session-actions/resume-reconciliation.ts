import { textWithoutReferenceLines } from '@/components/assistant-ui/reference-kinds'
import { type ChatMessage, chatMessageText } from '@/lib/chat-messages'
import { embeddedImageUrls, textWithoutEmbeddedImages } from '@/lib/embedded-images'

import {
  hasStructuralParts,
  isLiveTailRow,
  isStrictAnswerTextExtension,
  preserveStructuralParts
} from '@/application/session/message-equivalence'

/** Reconcile an authoritative resume/activate transcript against the local
 *  pending-turn tail without dropping in-flight work. */
function withAppendedText(message: ChatMessage, suffix: string): ChatMessage {
  let appended = false

  const parts = message.parts.map(part => {
    if (part.type !== 'text' || appended) {
      return part
    }

    appended = true

    return { ...part, text: `${part.text}${suffix}` }
  })

  return appended ? { ...message, parts } : message
}

export function reconcileResumeMessages(nextMessages: ChatMessage[], previousMessages: ChatMessage[]): ChatMessage[] {
  if (!previousMessages.length) {
    return nextMessages
  }

  const previousByRoleOrdinal = new Map<string, ChatMessage>()
  const previousRoleCounts = new Map<string, number>()

  for (const message of previousMessages) {
    const ordinal = previousRoleCounts.get(message.role) ?? 0
    previousRoleCounts.set(message.role, ordinal + 1)
    previousByRoleOrdinal.set(`${message.role}:${ordinal}`, message)
  }

  const nextRoleCounts = new Map<string, number>()

  return nextMessages.map(message => {
    const ordinal = nextRoleCounts.get(message.role) ?? 0
    nextRoleCounts.set(message.role, ordinal + 1)

    const previous = previousByRoleOrdinal.get(`${message.role}:${ordinal}`)

    if (!previous) {
      return message
    }

    const nextText = chatMessageText(message).trim()
    const previousText = chatMessageText(previous)
    const previousVisibleText = textWithoutEmbeddedImages(previousText)
    const previousTrimmed = previousVisibleText.trim()
    let preserved = message

    // #75825: resume can project an empty (or lagging) inflight assistant shell
    // at the same role-ordinal as the live stream row that still holds the
    // streamed text, reasoning and tool calls. Prefer that richer pending row
    // instead of painting the shell — otherwise the reply vanishes until
    // restart. Guarded to the same reply further along (see
    // localPendingSupersedes) so a different turn at the same ordinal cannot
    // hijack the slot.
    if (localPendingSupersedes(previous, message)) {
      return withAuthoritativeTurnState(previous, message)
    }

    const sameText = nextText === previousVisibleText || nextText === previousText.trim()

    // Mid-turn, the authoritative text has advanced past the cached copy by one
    // or more deltas. That is still the same turn, and the cached row holds the
    // only copy of its reasoning / tool calls, so treat an extension as a match
    // for structural carry-over. Attachment refs and image re-appending stay on
    // the strict equality path — they reconcile a SETTLED row, and a growing
    // row is by definition not settled.
    //
    // Live-tail identity: structure-only same-turn carry is allowed only when
    // the *structure-bearing cached row* is still the in-flight stream
    // (pending / stream id / interim). Marking only the text-only next row
    // live is not enough — after compression a new live assistant can share a
    // role ordinal with an unrelated historical structured row and must not
    // inherit its reasoning/tool parts (#76444 review / salvage).
    const sameTurn =
      sameText ||
      (nextText.length > 0 && previousTrimmed.length > 0 && isStrictAnswerTextExtension(nextText, previousTrimmed)) ||
      (message.role === 'assistant' &&
        previous.role === 'assistant' &&
        hasStructuralParts(previous) &&
        !hasStructuralParts(message) &&
        isLiveTailRow(previous))

    if (sameTurn) {
      preserved = preserveStructuralParts(preserved, previous)

      // Never replace structured answer text with a non-extending flat dump.
      if (
        message.role === 'assistant' &&
        hasStructuralParts(previous) &&
        !hasStructuralParts(message) &&
        !isStrictAnswerTextExtension(nextText, previousVisibleText)
      ) {
        const nonText = preserved.parts.filter(part => part.type !== 'text')
        const priorAnswer = previous.parts.filter(part => part.type === 'text')
        preserved = { ...preserved, parts: [...nonText, ...priorAnswer] }
      }
    }

    if (
      sameText &&
      message.role === 'user' &&
      preserved.attachmentRefs === undefined &&
      previous.attachmentRefs?.length
    ) {
      preserved = { ...preserved, attachmentRefs: [...previous.attachmentRefs] }
    }

    // Reactions and the row id come from the same authoritative rows as the
    // text, but a live/optimistic row that hasn't round-tripped yet carries
    // neither. Carry the cached copy forward so a reaction doesn't blink off
    // mid-turn. NEW object every time — the runtime repository's WeakMap
    // caches normalized ThreadMessages by ChatMessage identity.
    if (sameTurn && preserved.rowId === undefined && previous.rowId !== undefined) {
      preserved = { ...preserved, rowId: previous.rowId }
    }

    if (sameTurn && preserved.reactions === undefined && previous.reactions?.length) {
      preserved = { ...preserved, reactions: [...previous.reactions] }
    }

    const previousImages = embeddedImageUrls(previousText)

    if (!previousImages.length || embeddedImageUrls(chatMessageText(preserved)).length) {
      return preserved
    }

    if (nextText !== previousVisibleText) {
      return preserved
    }

    return withAppendedText(preserved, previousImages.map(url => `\n${url}`).join(''))
  })
}

/**
 * Keep the local tail of a turn while a reconnect hydrates an older server
 * projection. The user's optimistic row exists before prompt.submit persists
 * it, and the pending assistant row exists before message.complete commits it;
 * dropping either makes an accepted turn appear to vanish during transport
 * churn.
 *
 * A lagging projection can be behind by one live turn, never a whole local
 * history window. Preserve only the newest optimistic user row: compression
 * rewrites past context, so older `user-*` rows in a warm cache are stale
 * history, not in-flight work. The latest authoritative user confirms whether
 * that tail has persisted. An authoritative assistant at the same ordinal
 * supersedes the local stream only when it is at least as complete; an empty
 * or lagging inflight shell must not discard a fuller local pending reply
 * (#75825).
 *
 * Gateway bookkeeping markers (the model-switch / personality notices written
 * by tui_gateway/server.py) are persisted as role=user but are not user turns.
 * They must not take part in ordinal pairing on either side: a stored marker
 * between two real user turns shifts every later user ordinal, so the optimistic
 * row misses its committed copy and is appended a second time at the end of the
 * transcript — the duplicated user bubble of #67603.
 */
const isGatewaySystemMarker = (message: ChatMessage): boolean =>
  message.role === 'user' && chatMessageText(message).trimStart().startsWith('[System:')

/**
 * Does the row carry anything a viewer would miss — streamed answer text, or
 * the reasoning / tool-call structure the gateway's flat dump cannot express?
 * An empty inflight shell carries none of it.
 */
const hasStreamedContent = (message: ChatMessage): boolean =>
  chatMessageText(message).trim().length > 0 || hasStructuralParts(message)

/**
 * May the cached local row stand in for this authoritative assistant?
 *
 * Only for a live projection of the SAME reply that the local copy is further
 * along on: an empty shell, or text the local row strictly extends. Comparing
 * lengths alone lets an unrelated (merely longer) local row hijack the ordinal
 * — or the stream id — of a genuine stored reply. A retained failure snapshot
 * (`inflight.error`, projected with empty text) is never a shell: repainting it
 * from the local partial would hide the error and mark the turn healthy again.
 */
const localPendingSupersedes = (local: ChatMessage, authoritative: ChatMessage): boolean => {
  if (local.role !== 'assistant' || !isLiveTailRow(local)) {
    return false
  }

  if (!isLiveTailRow(authoritative) || authoritative.error) {
    return false
  }

  const authoritativeText = chatMessageText(authoritative).trim()

  if (!authoritativeText.length) {
    return hasStreamedContent(local)
  }

  const localText = chatMessageText(local).trim()

  return localText.length > authoritativeText.length && isStrictAnswerTextExtension(localText, authoritativeText)
}

/**
 * Take the cached row's content, but never its liveness. The renderer holds the
 * only copy of the streamed parts; the gateway remains the authority on whether
 * the turn is still running and on durable row identity — so a settled shell
 * must not repaint the reply as perpetually streaming.
 */
const withAuthoritativeTurnState = (local: ChatMessage, authoritative: ChatMessage): ChatMessage => {
  const merged: ChatMessage = { ...local, pending: authoritative.pending === true }

  if (local.rowId === undefined && authoritative.rowId !== undefined) {
    merged.rowId = authoritative.rowId
  }

  if (local.reactions === undefined && authoritative.reactions?.length) {
    merged.reactions = [...authoritative.reactions]
  }

  return merged
}

export function preserveLocalPendingTurnMessages(
  nextMessages: ChatMessage[],
  previousMessages: ChatMessage[]
): ChatMessage[] {
  if (!previousMessages.length) {
    return nextMessages
  }

  const nextByRoleOrdinal = new Map<string, ChatMessage>()
  const nextRoleCounts = new Map<ChatMessage['role'], number>()

  for (const message of nextMessages) {
    if (isGatewaySystemMarker(message)) {
      continue
    }

    const ordinal = nextRoleCounts.get(message.role) ?? 0
    nextRoleCounts.set(message.role, ordinal + 1)
    nextByRoleOrdinal.set(`${message.role}:${ordinal}`, message)
  }

  const nextIds = new Set(nextMessages.map(message => message.id))
  const previousRoleCounts = new Map<ChatMessage['role'], number>()

  const newestOptimisticUser = [...previousMessages]
    .reverse()
    .find(message => message.role === 'user' && message.id.startsWith('user-'))

  // A mid-turn redirect inserts its correction as a second optimistic user row
  // directly before the live reply, so one turn can own a contiguous RUN of
  // them. Preserving only the newest keeps the correction and drops the prompt
  // that started the turn. Widen to the run — but only the contiguous one: any
  // `user-*` row separated by an assistant reply is stale post-compression
  // history, which is what the newest-only rule exists to discard.
  const liveOptimisticUsers = new Set<ChatMessage>()

  if (newestOptimisticUser) {
    for (let index = previousMessages.indexOf(newestOptimisticUser); index >= 0; index -= 1) {
      const candidate = previousMessages[index]

      if (candidate.role === 'user' && candidate.id.startsWith('user-')) {
        liveOptimisticUsers.add(candidate)

        continue
      }

      // Arrival-ordered mid-turn corrections sit BELOW the sealed live output
      // (#73793): a live-tail assistant row between the prompt and its
      // correction is still the same turn's run. Only a committed reply ends
      // it — that is the post-compression staleness the rule exists to catch.
      if (candidate.role === 'assistant' && isLiveTailRow(candidate)) {
        continue
      }

      break
    }
  }

  const latestAuthoritativeUser = [...nextMessages].reverse().find(message => message.role === 'user')
  const preserved: ChatMessage[] = []
  // Authoritative id → richer local pending row. Replacing (not appending)
  // avoids painting both the empty inflight shell and the full stream bubble.
  const replacements = new Map<string, ChatMessage>()

  for (const message of previousMessages) {
    if (isGatewaySystemMarker(message)) {
      continue
    }

    const ordinal = previousRoleCounts.get(message.role) ?? 0
    previousRoleCounts.set(message.role, ordinal + 1)

    const isOptimisticUser = message.role === 'user' && message.id.startsWith('user-')

    const isPendingAssistant =
      message.role === 'assistant' && (message.pending === true || message.id.startsWith('assistant-stream-'))

    if (!isOptimisticUser && !isPendingAssistant) {
      continue
    }

    // Same id already present: still prefer a strictly more complete local
    // pending body over an empty/stale shell that reused the stream id.
    if (nextIds.has(message.id)) {
      if (isPendingAssistant) {
        const existing = nextMessages.find(candidate => candidate.id === message.id)

        if (existing && localPendingSupersedes(message, existing)) {
          replacements.set(message.id, withAuthoritativeTurnState(message, existing))
        }
      }

      continue
    }

    if (isOptimisticUser && !liveOptimisticUsers.has(message)) {
      continue
    }

    if (
      isOptimisticUser &&
      latestAuthoritativeUser &&
      textWithoutReferenceLines(chatMessageText(latestAuthoritativeUser)) ===
        textWithoutReferenceLines(chatMessageText(message))
    ) {
      continue
    }

    const authoritative = nextByRoleOrdinal.get(`${message.role}:${ordinal}`)

    // A settled stream row (`pending: false` after message.complete) whose reply
    // the authoritative transcript already carries under its committed id is
    // stale: ordinal pairing can't see it, because the commit shifted the row
    // one ordinal earlier, and re-appending it renders the same answer twice
    // (#70209). Only text-identical rows are dropped — a settled row the backend
    // has NOT committed yet is the only copy of that reply and must survive.
    if (
      isPendingAssistant &&
      message.pending !== true &&
      nextMessages.some(
        candidate =>
          candidate.role === 'assistant' &&
          textWithoutReferenceLines(chatMessageText(candidate)) === textWithoutReferenceLines(chatMessageText(message))
      )
    ) {
      continue
    }

    if (authoritative) {
      if (isPendingAssistant) {
        // Keep the local pending row when it is the same reply further along
        // and the authoritative row is an empty projection shell or a prefix.
        // #75825
        if (!localPendingSupersedes(message, authoritative)) {
          continue
        }

        replacements.set(authoritative.id, withAuthoritativeTurnState(message, authoritative))

        continue
      }

      if (
        textWithoutReferenceLines(chatMessageText(authoritative)) ===
        textWithoutReferenceLines(chatMessageText(message))
      ) {
        continue
      }
    }

    // Ordinal pairing missed (the committed row shifted ordinal when history
    // was compacted / the authoritative list is shorter), yet the
    // authoritative transcript already carries this same reply under its
    // committed id. The #70209 guard above only covers SETTLED local rows
    // (`pending !== true`); a still-pending stream row that slips past
    // pairing falls through to `preserved.push` and renders the answer
    // twice — the reported A B C D E C D tail duplication.
    //
    // Three-way same-turn check against SETTLED authoritative rows only
    // (a live projection shell must not swallow the richer local row, see
    // the traces-only replacement test):
    //  1. identical answer text            -> authoritative already has it
    //  2. authoritative extends local text -> authoritative is the settled
    //     final version of the still-streaming local copy
    //  3. local extends authoritative text -> local is further along; replace
    //     the committed row with the richer body instead of appending
    if (isPendingAssistant) {
      const nextText = textWithoutReferenceLines(chatMessageText(message))

      const committedMatch = nextMessages.find(
        candidate =>
          candidate.role === 'assistant' &&
          !isLiveTailRow(candidate) &&
          (textWithoutReferenceLines(chatMessageText(candidate)) === nextText ||
            isStrictAnswerTextExtension(textWithoutReferenceLines(chatMessageText(candidate)), nextText))
      )

      if (committedMatch) {
        continue
      }

      const committedPrefix = nextMessages.find(
        candidate =>
          candidate.role === 'assistant' &&
          !isLiveTailRow(candidate) &&
          isStrictAnswerTextExtension(nextText, textWithoutReferenceLines(chatMessageText(candidate)))
      )

      if (committedPrefix) {
        // Keep the COMMITTED id (not the local stream id): the turn is
        // already in the authoritative transcript, so the merged row must
        // stay addressable as that durable row — a stream id would read as a
        // live row again next reconcile and re-enter this same path.
        replacements.set(committedPrefix.id, {
          ...withAuthoritativeTurnState(message, committedPrefix),
          id: committedPrefix.id
        })

        continue
      }
    }

    preserved.push(message)
  }

  const withReplacements =
    replacements.size > 0 ? nextMessages.map(message => replacements.get(message.id) ?? message) : nextMessages

  return preserved.length ? [...withReplacements, ...preserved] : withReplacements
}

/**
 * The busy value a resume/activate response should land with (#70449).
 *
 * `running` in a `session.activate` / `session.resume` payload is a snapshot
 * taken when the RPC was issued. A turn that started — or streamed — after
 * that snapshot has already marked the runtime busy in the live cache, so a
 * stale `running: false` must never rewind it: that is exactly how opening an
 * in-progress chat cleared its working indicator while the agent was still
 * going. Preserving the newer live busy is safe, because the turn's own
 * terminal signal (running:false via session.info / the settle path) remains
 * the only authority that ends it, and the background-sync reaper clears
 * truly lost turns.
 *
 * A snapshot that says `running: true` always wins — adopting a live turn is
 * never stale.
 */
export function resolveResumedBusy(snapshotRunning: boolean | null | undefined, liveBusy: boolean): boolean {
  return Boolean(snapshotRunning) || liveBusy
}
