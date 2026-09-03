"use client"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import {
  getWorkspaceSnapshot,
  startWorkspaceStateStream,
  stopWorkspaceStateStream,
} from "@/lib/api"
import { subscribe } from "@/lib/platform"
import type {
  FileTreeNode,
  WorkspaceDelta,
  WorkspaceDeltaEnvelope,
  WorkspaceGitEntry,
  WorkspaceSnapshotResponse,
  WorkspaceStateEvent,
} from "@/lib/types"

type WorkspaceHealth = "healthy" | "resyncing" | "degraded"

// What a subscription consumes from the stream:
//   "full"  — tree + git snapshots + changed_paths (aux file tree, git
//             panels). The backend runs tree/git scans per watch batch
//             while at least one full subscriber exists on the root.
//   "paths" — changed_paths only (open-file-tab watching). A root with
//             only paths subscribers costs nothing per batch beyond the
//             debounced FS events.
export type WorkspaceWatchMode = "full" | "paths"

// Opaque handle returned by acquire(). Release is BY TOKEN and idempotent:
// releasing the same token twice is a no-op, so double-invoked effect
// cleanups (StrictMode) cannot corrupt the refcount, and the full/paths
// tally is derived from set sizes — never from an error-prone counter.
export interface WorkspaceWatchToken {
  readonly mode: WorkspaceWatchMode
}

export interface WorkspaceStateView {
  rootPath: string
  seq: number
  version: number
  health: WorkspaceHealth
  tree: FileTreeNode[]
  git: WorkspaceGitEntry[]
  error: string | null
  degraded: boolean
  isGitRepo: boolean
}

export type WorkspaceEnvelopeListener = (envelope: {
  seq: number
  kind: string
  changed_paths: string[]
}) => void

export interface WorkspaceStateResult extends WorkspaceStateView {
  requestResync: (reason?: string) => Promise<void>
  restart: () => Promise<void>
  subscribeEnvelopes: (listener: WorkspaceEnvelopeListener) => () => void
}

const WORKSPACE_PROTOCOL_VERSION = 1
const STORE_EVICT_DELAY_MS = 120_000
const STORE_SHUTDOWN_GRACE_MS = 600

const EMPTY_STATE: WorkspaceStateView = {
  rootPath: "",
  seq: 0,
  version: WORKSPACE_PROTOCOL_VERSION,
  health: "healthy",
  tree: [],
  git: [],
  error: null,
  degraded: false,
  isGitRepo: true,
}

function normalizeComparePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "")
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function applyDeltaToState(
  state: WorkspaceStateView,
  delta: WorkspaceDelta
): WorkspaceStateView {
  switch (delta.kind) {
    case "tree_replace":
      return { ...state, tree: delta.nodes }
    case "git_replace":
      return { ...state, git: delta.entries }
    case "meta":
      return state
  }
}

function applyDeltaEnvelope(
  state: WorkspaceStateView,
  envelope: WorkspaceDeltaEnvelope
): WorkspaceStateView {
  let next = state
  for (const delta of envelope.payload) {
    next = applyDeltaToState(next, delta)
  }
  return {
    ...next,
    seq: envelope.seq,
    version: WORKSPACE_PROTOCOL_VERSION,
    health: envelope.requires_resync ? "resyncing" : "healthy",
    error: envelope.requires_resync ? "resync requested" : null,
  }
}

function applySnapshot(
  state: WorkspaceStateView,
  snapshot: WorkspaceSnapshotResponse
): WorkspaceStateView {
  if (snapshot.full) {
    if (snapshot.seq < state.seq) {
      return state
    }
    return {
      rootPath: snapshot.root_path,
      seq: snapshot.seq,
      version: snapshot.version,
      health: "healthy",
      tree: snapshot.tree_snapshot ?? [],
      git: snapshot.git_snapshot ?? [],
      error: null,
      degraded: snapshot.degraded,
      isGitRepo: snapshot.is_git_repo,
    }
  }

  let next = state
  const ordered = [...snapshot.deltas].sort(
    (left, right) => left.seq - right.seq
  )

  for (const envelope of ordered) {
    if (envelope.seq <= next.seq) continue
    if (envelope.seq !== next.seq + 1) {
      throw new Error("workspace state delta gap")
    }
    next = applyDeltaEnvelope(next, envelope)
  }

  return {
    ...next,
    seq: Math.max(next.seq, snapshot.seq),
    version: snapshot.version,
    health: "healthy",
    error: null,
    degraded: snapshot.degraded,
    isGitRepo: snapshot.is_git_repo,
  }
}

class WorkspaceStateStore {
  private readonly rootPath: string
  private readonly normalizedRootPath: string
  private listeners = new Set<() => void>()
  private envelopeListeners = new Set<WorkspaceEnvelopeListener>()
  private state: WorkspaceStateView
  private fullTokens = new Set<WorkspaceWatchToken>()
  private pathsTokens = new Set<WorkspaceWatchToken>()
  // Scan mode our CURRENT backend subscription was registered with. Only
  // syncBackendMode transitions it (start new mode → adopt → stop old),
  // so the backend's per-root full-subscriber count stays balanced.
  private backendWantsTreeGit = true
  private modeSync: Promise<void> | null = null
  private modeSyncQueued = false
  private started = false
  private starting: Promise<void> | null = null
  private stopping: Promise<void> | null = null
  private unlisten: (() => void) | null = null
  private resyncInFlight: Promise<void> | null = null
  private restarting: Promise<void> | null = null
  private lifecycleId = 0
  private evictionTimer: ReturnType<typeof setTimeout> | null = null
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null
  private hasBaselineSnapshot = false

  constructor(rootPath: string) {
    this.rootPath = rootPath
    this.normalizedRootPath = normalizeComparePath(rootPath)
    this.state = {
      ...EMPTY_STATE,
      rootPath,
    }
  }

  getSnapshot = (): WorkspaceStateView => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeEnvelopes = (listener: WorkspaceEnvelopeListener): (() => void) => {
    this.envelopeListeners.add(listener)
    return () => {
      this.envelopeListeners.delete(listener)
    }
  }

  private get tokenCount(): number {
    return this.fullTokens.size + this.pathsTokens.size
  }

  // The aggregate scan mode this store needs from the backend right now.
  private get wantsTreeGit(): boolean {
    return this.fullTokens.size > 0
  }

  acquire = (mode: WorkspaceWatchMode = "full"): WorkspaceWatchToken => {
    const token: WorkspaceWatchToken = { mode }
    const wasShutdownPending = this.shutdownTimer !== null
    this.cancelPendingShutdown()
    this.cancelEviction()
    const isFirstToken = this.tokenCount === 0
    const fullBefore = this.fullTokens.size
    if (mode === "full") {
      this.fullTokens.add(token)
    } else {
      this.pathsTokens.add(token)
    }
    if (isFirstToken) {
      const canReuseLifecycle =
        this.lifecycleId > 0 &&
        (this.started || this.starting !== null || this.stopping !== null)
      if (!canReuseLifecycle) {
        this.lifecycleId += 1
      }
      const lifecycleId = this.lifecycleId
      void this.ensureStarted(lifecycleId)

      // Re-acquired within the shutdown grace window: ensureStarted is a
      // no-op because `started` is still true, but events fired while
      // the token count was 0 may have been silently dropped (broadcaster
      // has no receivers during a brief SSE reconnect, or the event landed
      // during the grace and got coalesced). Pull a delta-replay snapshot
      // so we don't keep showing pre-event state — typical symptom is git
      // status / file tree not updating after the user switched away while
      // an agent commit was in flight.
      //
      // Gated on `started` so we don't race a resync against a still-in-
      // flight initial start: in that window the backend stream may not
      // be registered yet and getWorkspaceSnapshot would return not_found,
      // bouncing us into a needless degraded state.
      if (wasShutdownPending && this.started) {
        void this.requestResync("reacquired_within_grace")
        // The surviving backend subscription still carries the mode from
        // before the grace window — reconcile if the aggregate changed.
        this.syncBackendMode()
      }
    } else if (mode === "full" && fullBefore === 0) {
      // paths → full upgrade: the backend must start scanning tree/git
      // and backfill a fresh full snapshot.
      this.syncBackendMode()
    }
    return token
  }

  release = (token: WorkspaceWatchToken) => {
    const removed =
      token.mode === "full"
        ? this.fullTokens.delete(token)
        : this.pathsTokens.delete(token)
    // Unknown or already-released token — idempotent no-op by design.
    if (!removed) return
    if (this.tokenCount === 0) {
      const lifecycleId = this.lifecycleId
      this.scheduleShutdown(lifecycleId)
      return
    }
    if (token.mode === "full" && this.fullTokens.size === 0) {
      // full → paths downgrade: the stream stays up (paths tokens remain),
      // the backend just stops scanning tree/git per batch.
      this.syncBackendMode()
    }
  }

  // Reconcile the backend subscription's scan mode with the local token
  // aggregate. Transitions are serialized; a change arriving mid-transition
  // queues exactly one more reconciliation pass. Ordering invariant: the
  // new-mode backend ref is added BEFORE the old one is released, so the
  // backend's total refcount never touches zero mid-transition (which
  // would tear down the watcher and drop events).
  private syncBackendMode = () => {
    if (this.modeSync) {
      this.modeSyncQueued = true
      return
    }
    const run = async () => {
      do {
        this.modeSyncQueued = false
        if (!this.started) return
        const desired = this.wantsTreeGit
        if (desired === this.backendWantsTreeGit) return
        const previous = this.backendWantsTreeGit
        try {
          const snapshot = await startWorkspaceStateStream(
            this.rootPath,
            desired
          )
          this.backendWantsTreeGit = desired
          // An upgrade returns a freshly-scanned full snapshot (the
          // backend refreshes tree/git for the first full subscriber);
          // a downgrade returns the cached one — applying is harmless.
          this.patchState((prev) => applySnapshot(prev, snapshot))
          if (snapshot.full) {
            this.hasBaselineSnapshot = true
          }
          await stopWorkspaceStateStream(this.rootPath, previous).catch(
            () => {}
          )
        } catch {
          // Transition failed (backend unreachable). Keep the previous
          // subscription; the next token change retries.
          return
        }
      } while (this.modeSyncQueued)
    }
    this.modeSync = run().finally(() => {
      this.modeSync = null
    })
  }

  requestResync = async (reason?: string) => {
    void reason
    if (this.resyncInFlight) return this.resyncInFlight

    const run = async () => {
      this.patchState((prev) => ({
        ...prev,
        health: "resyncing",
      }))

      try {
        const sinceSeq = this.hasBaselineSnapshot ? this.state.seq : undefined
        const snapshot = await getWorkspaceSnapshot(this.rootPath, sinceSeq)
        this.patchState((prev) => applySnapshot(prev, snapshot))
        if (snapshot.full) {
          this.hasBaselineSnapshot = true
        } else {
          // Forward replayed envelopes so downstream cache-invalidation
          // hooks catch up on FS activity that happened while disconnected.
          for (const envelope of snapshot.deltas) {
            this.notifyEnvelope({
              seq: envelope.seq,
              kind: envelope.kind,
              changed_paths: envelope.changed_paths ?? [],
            })
          }
        }
      } catch (error) {
        this.patchState((prev) => ({
          ...prev,
          health: "degraded",
          error: toErrorMessage(error),
        }))
      }
    }

    this.resyncInFlight = run().finally(() => {
      this.resyncInFlight = null
    })

    return this.resyncInFlight
  }

  restart = async (): Promise<void> => {
    if (this.restarting) return this.restarting

    const run = async () => {
      const prevLifecycleId = this.lifecycleId
      this.cancelPendingShutdown()
      this.cancelEviction()

      this.patchState((prev) => ({
        ...prev,
        health: "resyncing",
      }))

      await this.shutdown(prevLifecycleId)

      this.lifecycleId += 1
      const nextLifecycleId = this.lifecycleId
      this.hasBaselineSnapshot = false
      this.resyncInFlight = null

      if (this.tokenCount > 0) {
        await this.ensureStarted(nextLifecycleId)
      }
    }

    this.restarting = run().finally(() => {
      this.restarting = null
    })

    return this.restarting
  }

  private ensureStarted = async (lifecycleId: number) => {
    if (this.started) return
    if (this.starting) {
      await this.starting
      if (!this.isLifecycleActive(lifecycleId) || this.started) {
        return
      }
      await this.ensureStarted(lifecycleId)
      return
    }

    const start = async () => {
      if (this.stopping) {
        await this.stopping
      }
      if (!this.isLifecycleActive(lifecycleId)) {
        return
      }

      try {
        // Register with the aggregate mode at THIS moment; tokens acquired
        // while the call is in flight are reconciled by the syncBackendMode
        // pass at the end of the start sequence.
        const wantsTreeGit = this.wantsTreeGit
        const initialSnapshot = await startWorkspaceStateStream(
          this.rootPath,
          wantsTreeGit
        )
        this.backendWantsTreeGit = wantsTreeGit
        if (!this.isLifecycleActive(lifecycleId)) {
          await stopWorkspaceStateStream(this.rootPath, wantsTreeGit).catch(
            () => {}
          )
          return
        }
        // Reset our seq baseline before applying. The backend stream is
        // brand new (or re-created after stop), so its WorkspaceStateCore
        // starts at seq=0. If the user previously visited this folder, the
        // store still holds the prior lifecycle's `state.seq` (e.g. 10),
        // and applySnapshot's `snapshot.seq < state.seq` guard would drop
        // the cold-scan payload entirely — leaving git/file tree frozen on
        // pre-restart cached data even though the disk view is fresh.
        // Symptom: after switching away while the agent commits and
        // switching back, changes still render as uncommitted forever.
        this.patchState((prev) =>
          applySnapshot({ ...prev, seq: 0 }, initialSnapshot)
        )
        this.hasBaselineSnapshot = true

        const unlisten = await subscribe<WorkspaceStateEvent>(
          "folder://workspace-state-event",
          (event) => {
            if (
              normalizeComparePath(event.root_path) !== this.normalizedRootPath
            ) {
              return
            }
            this.handleEvent(event)
          }
        )

        if (!this.isLifecycleActive(lifecycleId)) {
          unlisten()
          await stopWorkspaceStateStream(this.rootPath, wantsTreeGit).catch(
            () => {}
          )
          return
        }

        this.unlisten = unlisten
        this.started = true
        const catchUpSnapshot = await getWorkspaceSnapshot(
          this.rootPath,
          this.state.seq
        )
        if (!this.isLifecycleActive(lifecycleId)) return
        this.patchState((prev) => applySnapshot(prev, catchUpSnapshot))
        if (!catchUpSnapshot.full) {
          for (const envelope of catchUpSnapshot.deltas) {
            this.notifyEnvelope({
              seq: envelope.seq,
              kind: envelope.kind,
              changed_paths: envelope.changed_paths ?? [],
            })
          }
        }
        // Tokens may have shifted the aggregate mode while the start
        // sequence was in flight — reconcile now that we're started.
        this.syncBackendMode()
      } catch (error) {
        this.patchState((prev) => ({
          ...prev,
          health: "degraded",
          error: toErrorMessage(error),
        }))
      }
    }

    this.starting = start().finally(() => {
      this.starting = null
    })

    await this.starting
  }

  private shutdown = async (lifecycleId: number) => {
    void lifecycleId
    this.started = false
    // Serialize with a possibly-in-flight mode transition so the final
    // stop releases the mode the backend actually holds.
    if (this.modeSync) {
      await this.modeSync.catch(() => {})
    }
    const unlisten = this.unlisten
    this.unlisten = null
    if (unlisten) {
      unlisten()
    }
    await stopWorkspaceStateStream(
      this.rootPath,
      this.backendWantsTreeGit
    ).catch(() => {})
  }

  private cancelPendingShutdown = () => {
    if (!this.shutdownTimer) return
    clearTimeout(this.shutdownTimer)
    this.shutdownTimer = null
  }

  private scheduleShutdown = (lifecycleId: number) => {
    this.cancelPendingShutdown()
    this.shutdownTimer = setTimeout(() => {
      this.shutdownTimer = null
      if (this.tokenCount !== 0) return
      const dispose = async () => {
        await this.shutdown(lifecycleId)
      }
      const stopping = dispose().finally(() => {
        if (this.stopping === stopping) {
          this.stopping = null
        }
        if (this.tokenCount === 0) {
          this.scheduleEviction()
        }
      })
      this.stopping = stopping
      void stopping
    }, STORE_SHUTDOWN_GRACE_MS)
  }

  private cancelEviction = () => {
    if (!this.evictionTimer) return
    clearTimeout(this.evictionTimer)
    this.evictionTimer = null
  }

  private scheduleEviction = () => {
    this.cancelEviction()
    this.evictionTimer = setTimeout(() => {
      this.evictionTimer = null
      if (this.tokenCount !== 0) return
      if (this.started || this.starting || this.stopping || this.unlisten)
        return
      deleteStore(this.normalizedRootPath, this)
    }, STORE_EVICT_DELAY_MS)
  }

  private isLifecycleCurrent = (lifecycleId: number) => {
    return this.lifecycleId === lifecycleId
  }

  private isLifecycleActive = (lifecycleId: number) => {
    return this.isLifecycleCurrent(lifecycleId) && this.tokenCount > 0
  }

  private handleEvent = (event: WorkspaceStateEvent) => {
    if (event.version !== WORKSPACE_PROTOCOL_VERSION) {
      void this.requestResync("version_mismatch")
      return
    }

    if (event.requires_resync || event.seq !== this.state.seq + 1) {
      void this.requestResync("seq_gap_or_hint")
      return
    }

    let next = this.state
    for (const delta of event.payload) {
      next = applyDeltaToState(next, delta)
    }

    this.patchState(() => ({
      ...next,
      rootPath: event.root_path,
      seq: event.seq,
      version: event.version,
      health: "healthy",
      error: null,
    }))

    this.notifyEnvelope({
      seq: event.seq,
      kind: event.kind,
      changed_paths: event.changed_paths ?? [],
    })
  }

  private notifyEnvelope = (envelope: {
    seq: number
    kind: string
    changed_paths: string[]
  }) => {
    for (const listener of this.envelopeListeners) {
      try {
        listener(envelope)
      } catch (error) {
        console.error("[workspace-state] envelope listener failed", error)
      }
    }
  }

  private patchState = (
    updater:
      | WorkspaceStateView
      | ((prev: WorkspaceStateView) => WorkspaceStateView)
  ) => {
    this.state =
      typeof updater === "function"
        ? (updater as (prev: WorkspaceStateView) => WorkspaceStateView)(
            this.state
          )
        : updater
    this.emit()
  }

  private emit = () => {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

const stores = new Map<string, WorkspaceStateStore>()

function deleteStore(normalizedRootPath: string, store: WorkspaceStateStore) {
  const current = stores.get(normalizedRootPath)
  if (current === store) {
    stores.delete(normalizedRootPath)
  }
}

function getStore(rootPath: string): WorkspaceStateStore {
  const normalized = normalizeComparePath(rootPath)
  const existing = stores.get(normalized)
  if (existing) return existing

  const created = new WorkspaceStateStore(rootPath)
  stores.set(normalized, created)
  return created
}

export type { WorkspaceStateStore }

// Imperative access to the per-root refcounted store singleton, for callers
// that manage several roots at once (the open-file-tabs watcher subscribes
// to every folder that has open tabs). Callers MUST pair acquire()/release()
// — the same refcount that keeps the aux panel's backend stream alive.
// Client-only: never call during SSR/prerender (stores start backend
// streams); call from effects.
export function getWorkspaceStateStore(rootPath: string): WorkspaceStateStore {
  return getStore(rootPath)
}

export function useWorkspaceStateStore(
  rootPath: string | null,
  mode: WorkspaceWatchMode = "full"
): WorkspaceStateResult {
  const store = useMemo(() => {
    if (!rootPath) return null
    return getStore(rootPath)
  }, [rootPath])

  useEffect(() => {
    if (!store || !rootPath) return
    const token = store.acquire(mode)

    return () => {
      store.release(token)
    }
  }, [rootPath, store, mode])

  const subscribeToStore = useCallback(
    (onStoreChange: () => void) => {
      if (!store) return () => {}
      return store.subscribe(onStoreChange)
    },
    [store]
  )

  const getSnapshot = useCallback(() => {
    if (!store) return EMPTY_STATE
    return store.getSnapshot()
  }, [store])

  const snapshot = useSyncExternalStore(
    subscribeToStore,
    getSnapshot,
    getSnapshot
  )

  const requestResync = useCallback(
    async (reason?: string) => {
      if (!store) return
      await store.requestResync(reason)
    },
    [store]
  )

  const restart = useCallback(async () => {
    if (!store) return
    await store.restart()
  }, [store])

  const subscribeEnvelopes = useCallback(
    (listener: WorkspaceEnvelopeListener) => {
      if (!store) return () => {}
      return store.subscribeEnvelopes(listener)
    },
    [store]
  )

  if (!rootPath) {
    return {
      ...EMPTY_STATE,
      requestResync,
      restart,
      subscribeEnvelopes,
    }
  }

  return {
    ...snapshot,
    requestResync,
    restart,
    subscribeEnvelopes,
  }
}
