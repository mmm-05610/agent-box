/**
 * AgentBox Lab page — the Phase 0 synthetic loop.
 *
 * connect → readiness + remoteProjects → create synthetic session →
 * launch-preview → submit turn → live stream into the EXISTING transcript
 * (`Thread`) → cancel → honest disconnect errors. Everything on this page is
 * a lab fixture: the only production-grade parts are the `src/agentbox/`
 * adapter and the transcript components it feeds.
 */

import { AssistantRuntimeProvider, type ThreadMessage } from '@assistant-ui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Thread } from '@/components/assistant-ui/thread'
import { useRuntimeMessageRepository } from '@/app/chat/runtime-repository'
import {
  AgentBoxClient,
  AgentBoxError,
  AgentBoxEventStream,
  foldAgentBoxEvent,
  type AgentBoxTurnProjection
} from '@/agentbox'
import type { AgentBoxEvent, AgentBoxReadiness, AgentBoxRemoteProject, AgentBoxSession } from '@/agentbox'
import { useIncrementalExternalStoreRuntime } from '@/lib/incremental-external-store-runtime'

const DEFAULT_BASE_URL = 'http://127.0.0.1:30818'
const SYNTHETIC_WORKSPACE = '/tmp/agentbox-phase0-sandbox'
const FAKE_PROVIDER_ID = 'fake-harness'

type ConnectionPhase = 'idle' | 'connecting' | 'ready' | 'error'

function Banner({ kind, children }: { kind: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={
        kind === 'error'
          ? 'rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400'
          : 'rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-300'
      }
    >
      {children}
    </div>
  )
}

function ReadinessPanel({ readiness }: { readiness: AgentBoxReadiness }) {
  return (
    <div className="grid grid-cols-2 gap-1 text-xs">
      <span className="text-(--ui-text-tertiary)">session_store</span>
      <span>{readiness.session_store?.state ?? '—'}</span>
      <span className="text-(--ui-text-tertiary)">workspace</span>
      <span>{readiness.workspace?.state ?? '—'}</span>
      <span className="text-(--ui-text-tertiary)">execution</span>
      <span>
        {readiness.execution?.state ?? '—'} · {(readiness.execution?.providers ?? []).length} providers
      </span>
    </div>
  )
}

export function AgentBoxLabPage() {
  // Connection config lives in component state ONLY — never localStorage,
  // never logs (credentials discipline; the token here is synthetic).
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [token, setToken] = useState('')
  const [client, setClient] = useState<AgentBoxClient | null>(null)
  const [phase, setPhase] = useState<ConnectionPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [readiness, setReadiness] = useState<AgentBoxReadiness | null>(null)
  const [remoteProjects, setRemoteProjects] = useState<AgentBoxRemoteProject[]>([])
  const [session, setSession] = useState<AgentBoxSession | null>(null)
  const [previewSummary, setPreviewSummary] = useState('')
  const [input, setInput] = useState('hello from Hermes Desktop via AgentBox adapter')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [projection, setProjection] = useState<AgentBoxTurnProjection>({ messages: [], watermark: 0, turnRunning: false })

  const streamRef = useRef<AgentBoxEventStream | null>(null)
  const sessionRef = useRef<AgentBoxSession | null>(null)
  const idempotencyCounter = useRef(0)

  sessionRef.current = session

  const cancelActiveTurn = useCallback(async () => {
    const active = sessionRef.current

    if (!client || !active) {
      return
    }

    try {
      const transcript = await client.transcript(active.session_id)
      const openTurn = [...transcript.turns].reverse().find(turn => turn.status === 'running')

      if (openTurn) {
        await client.cancelTurn(active.session_id, openTurn.turn_id)
      }
    } catch (cancelError: unknown) {
      setStreamError(cancelError instanceof Error ? cancelError.message : String(cancelError))
    }
  }, [client])

  const handleStreamEvent = useCallback((event: AgentBoxEvent) => {
    setProjection(previous => foldAgentBoxEvent(previous, event))
  }, [])

  const connect = useCallback(async () => {
    setPhase('connecting')
    setError(null)
    setStreamError(null)

    const nextClient = new AgentBoxClient({ baseUrl, token })

    try {
      await nextClient.health()
      const nextReadiness = await nextClient.readiness()
      const projects = await nextClient.remoteProjects()

      setClient(nextClient)
      setReadiness(nextReadiness)
      setRemoteProjects(projects)
      setPhase('ready')
    } catch (connectError: unknown) {
      setPhase('error')
      setReadiness(null)
      setClient(null)
      setError(
        connectError instanceof AgentBoxError
          ? `${connectError.code}: ${connectError.message}${connectError.correlationId ? ` (correlation ${connectError.correlationId})` : ''}`
          : connectError instanceof Error
            ? connectError.message
            : String(connectError)
      )
    }
  }, [baseUrl, token])

  const createSyntheticSession = useCallback(async () => {
    if (!client) {
      return
    }

    setError(null)
    setStreamError(null)

    try {
      const project = await client.registerProject(SYNTHETIC_WORKSPACE)
      const nextSession = await client.createSession({
        idempotencyKey: `hermes-lab-${Date.now()}`,
        title: 'Hermes Desktop synthetic',
        projectId: project.project_id
      })
      const preview = (await client.launchPreview(nextSession.session_id)) as {
        resolved_binding?: unknown
        typed_blockers?: Array<{ code: string; message: string }>
        resolution_digest?: string
      }

      setSession(nextSession)
      setProjection({ messages: [], watermark: 0, turnRunning: false })
      setPreviewSummary(
        [
          `digest ${preview.resolution_digest?.slice(0, 12) ?? '—'}`,
          ...(preview.typed_blockers ?? []).map(blocker => `blocker: ${blocker.code}`)
        ].join(' · ')
      )

      const stream = client.openEventStream(
        nextSession.session_id,
        {
          onEvent: handleStreamEvent,
          onState: (state, detail) => {
            if (state === 'error') {
              // Real errors only — the lab NEVER fakes success or silently
              // reconnects; the owner (this page) decides any retry.
              setStreamError(`event stream ${state}${detail ? `: ${detail}` : ''}`)
            } else if (state === 'closed') {
              setStreamError(previous => previous ?? `event stream closed (${detail ?? 'unknown code'})`)
            } else {
              setStreamError(null)
            }
          }
        },
        0
      )

      streamRef.current = stream
      await stream.connect()
    } catch (createError: unknown) {
      setError(createError instanceof Error ? createError.message : String(createError))
    }
  }, [client, handleStreamEvent])

  const submitTurn = useCallback(async () => {
    const active = sessionRef.current

    if (!client || !active || !input.trim()) {
      return
    }

    setStreamError(null)

    try {
      idempotencyCounter.current += 1

      await client.submitTurn(active.session_id, {
        idempotencyKey: `hermes-lab-turn-${Date.now()}-${idempotencyCounter.current}`,
        input: input.trim(),
        executionProviderId: FAKE_PROVIDER_ID
      })
    } catch (submitError: unknown) {
      // Honest failure surface: no optimistic fake turn is added.
      setStreamError(submitError instanceof Error ? submitError.message : String(submitError))
    }
  }, [client, input])

  const disconnectStream = useCallback(() => {
    streamRef.current?.close()
    streamRef.current = null
  }, [])

  useEffect(() => disconnectStream, [disconnectStream])

  // The external-store runtime is fed by the adapter projection; submission
  // goes through the adapter's submitTurn, so `onNew` stays a no-op exactly
  // like the main chat boundary (no duplicate prompt path).
  const setMessages = useCallback((_next: readonly ThreadMessage[]) => {
    // The runtime never mutates our list; edits are not offered in the lab.
  }, [])

  const runtimeMessageRepository = useRuntimeMessageRepository(projection.messages)

  const runtime = useIncrementalExternalStoreRuntime<ThreadMessage>({
    messageRepository: runtimeMessageRepository,
    isRunning: projection.turnRunning,
    setMessages,
    onNew: async () => {},
    onCancel: async () => {
      await cancelActiveTurn()
    }
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4 text-sm">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold">AgentBox Lab (Phase 0)</h1>
        <span className="text-xs text-(--ui-text-tertiary)">
          frozen /api/v1 · sidecar {phase === 'ready' ? 'connected' : phase}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="w-64 rounded-md border px-2 py-1 text-xs"
          value={baseUrl}
          onChange={event => setBaseUrl(event.target.value)}
          placeholder="sidecar base URL"
          aria-label="AgentBox sidecar base URL"
        />
        <input
          className="w-48 rounded-md border px-2 py-1 text-xs"
          type="password"
          value={token}
          onChange={event => setToken(event.target.value)}
          placeholder="synthetic dev token"
          aria-label="AgentBox synthetic token"
        />
        <button
          className="rounded-md border px-3 py-1 text-xs hover:bg-(--chrome-action-hover)"
          onClick={() => void connect()}
          type="button"
        >
          Connect
        </button>
        {client && (
          <button
            className="rounded-md border px-3 py-1 text-xs hover:bg-(--chrome-action-hover)"
            onClick={() => void createSyntheticSession()}
            type="button"
          >
            New synthetic session
          </button>
        )}
        {session && (
          <button
            className="rounded-md border px-3 py-1 text-xs hover:bg-(--chrome-action-hover)"
            onClick={disconnectStream}
            type="button"
          >
            Drop stream
          </button>
        )}
      </div>

      {error && <Banner kind="error">Sidecar error: {error}</Banner>}
      {streamError && <Banner kind="error">Stream: {streamError}</Banner>}

      {readiness && (
        <div className="flex flex-col gap-1">
          <ReadinessPanel readiness={readiness} />
          <div className="text-xs text-(--ui-text-tertiary)">
            remote projects:{' '}
            {remoteProjects.length === 0
              ? '(none registered)'
              : remoteProjects.map(project => project.project_id).join(', ')}
          </div>
        </div>
      )}

      {session && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="text-xs text-(--ui-text-tertiary)">
            session <code>{session.session_id}</code> · watermark {projection.watermark} · {previewSummary}
          </div>

          <div className="min-h-64 flex-1 overflow-hidden rounded-md border p-2">
            <AssistantRuntimeProvider runtime={runtime}>
              <Thread onCancel={() => void cancelActiveTurn()} />
            </AssistantRuntimeProvider>
          </div>

          <div className="flex items-center gap-2">
            <textarea
              className="min-h-[2.5rem] flex-1 rounded-md border px-2 py-1 text-xs"
              value={input}
              onChange={event => setInput(event.target.value)}
              rows={2}
              aria-label="Synthetic turn input"
            />
            {projection.turnRunning ? (
              <button className="rounded-md border px-3 py-2 text-xs" onClick={() => void cancelActiveTurn()} type="button">
                Stop
              </button>
            ) : (
              <button
                className="rounded-md border px-3 py-2 text-xs hover:bg-(--chrome-action-hover)"
                onClick={() => void submitTurn()}
                type="button"
              >
                Submit turn
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
