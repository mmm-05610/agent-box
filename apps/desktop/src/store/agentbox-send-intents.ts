import { Codecs, persistentAtom } from '@/lib/persisted'
import type { RequestId } from '@/types/wire/wire-v1'

export interface PendingAgentBoxSend {
  intentKey: string
  requestId: RequestId
}

type PendingSendMap = Record<string, PendingAgentBoxSend>

interface PendingSendEnvelope {
  items: PendingSendMap
  version: 1
}

const STORAGE_KEY = 'agentbox.desktop.pending-sends.v1'

function sanitizeEnvelope(value: unknown): PendingSendEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { items: {}, version: 1 }
  }

  const candidate = value as Partial<PendingSendEnvelope>

  if (candidate.version !== 1 || !candidate.items || typeof candidate.items !== 'object' || Array.isArray(candidate.items)) {
    return { items: {}, version: 1 }
  }

  const items = Object.fromEntries(
    Object.entries(candidate.items).filter(
      (entry): entry is [string, PendingAgentBoxSend] =>
        Boolean(entry[1]) &&
        typeof entry[1] === 'object' &&
        typeof entry[1].intentKey === 'string' &&
        typeof entry[1].requestId === 'string' &&
        entry[1].requestId.length >= 8
    )
  )

  return { items, version: 1 }
}

export const $pendingAgentBoxSends = persistentAtom<PendingSendEnvelope>(
  STORAGE_KEY,
  { items: {}, version: 1 },
  Codecs.json(sanitizeEnvelope)
)

export function pendingAgentBoxSend(scopeKey: string): PendingAgentBoxSend | null {
  return $pendingAgentBoxSends.get().items[scopeKey] ?? null
}

export function rememberPendingAgentBoxSend(scopeKey: string, pending: PendingAgentBoxSend): void {
  const envelope = $pendingAgentBoxSends.get()
  $pendingAgentBoxSends.set({ ...envelope, items: { ...envelope.items, [scopeKey]: pending } })
}

export function forgetPendingAgentBoxSend(scopeKey: string, intentKey: string): void {
  const envelope = $pendingAgentBoxSends.get()

  if (envelope.items[scopeKey]?.intentKey !== intentKey) {
    return
  }

  const items = { ...envelope.items }
  delete items[scopeKey]
  $pendingAgentBoxSends.set({ ...envelope, items })
}
