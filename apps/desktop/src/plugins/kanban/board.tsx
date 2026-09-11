import {
  Button,
  cn,
  Codicon,
  Contribute,
  ErrorState,
  host,
  Loader,
  SearchField,
  Tip,
  TITLEBAR_AREAS,
  useGrabScroll,
  useMutation,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  $boardSlug,
  $collapsedLanes,
  $introDismissed,
  boardKey,
  deleteTask,
  fetchBoard,
  patchTask
} from './api'
import {
  Column,
  FilterMenu,
  NewTaskDialog,
  SelectionBar,
} from './board-parts'
import { moveCard, removeCard } from './board-state'
import { BoardSwitcher } from './board-switcher'
import { TaskDrawer } from './drawer'
import { OrchestrationPanel } from './orchestration'
import { type KanbanBoard, type KanbanTask } from './types'
import {
  $newTaskLane,
  errText,
  isLockedTarget,
  lockedReason,
  useKanban
} from './ui'

function Intro() {
  const k = useKanban()
  const dismissed = useValue($introDismissed)

  if (dismissed) {
    return null
  }

  return (
    <div
      className="mx-4 mb-2 flex flex-col items-start gap-1.5 rounded-lg bg-(--ui-bg-quinary) px-3 py-2.5 text-[0.75rem] leading-relaxed text-(--ui-text-secondary)"
      data-selectable-text="true"
    >
      <p className="min-w-0">{k.introBody}</p>
      <Button onClick={() => $introDismissed.set(true)} size="inline" variant="textStrong">
        {k.introGotIt}
      </Button>
    </div>
  )
}

export function KanbanBoardPage() {
  const k = useKanban()
  const qc = useQueryClient()
  const slug = useValue($boardSlug)
  const [archived, setArchived] = useState(false)

  // Live updates ride the events socket (bindApi); this interval is only the
  // slow heartbeat for socketless paths (OAuth remotes, dropped connections).
  const { data: board, error } = useQuery({
    queryFn: () => fetchBoard(archived),
    queryKey: boardKey(slug, archived),
    refetchInterval: 60_000
  })

  const [openId, setOpenId] = useState<null | string>(null)
  const [addStatus, setAddStatus] = useState<null | string>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tenant, setTenant] = useState('')
  const [assignee, setAssignee] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  // A new-task request raised from outside the page (⌘⌥N, the palette row).
  // The command navigates here and parks the lane; the page picks it up on
  // arrival — whether it was already mounted or is mounting for the first
  // time — then clears it so a later remount can't reopen the dialog.
  const requestedLane = useValue($newTaskLane)

  useEffect(() => {
    if (requestedLane === null) {
      return
    }

    setAddStatus(requestedLane)
    $newTaskLane.set(null)
  }, [requestedLane])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)

      if (!next.delete(id)) {
        next.add(id)
      }

      return next
    })
  }

  // Prune ids that left the board (completed elsewhere, deleted, filtered by
  // a board switch) so the bar's count never lies about what a bulk op hits.
  useEffect(() => {
    if (!board) {
      return
    }

    const alive = new Set(board.columns.flatMap(col => col.tasks.map(task => task.id)))

    setSelected(prev => {
      const kept = [...prev].filter(id => alive.has(id))

      return kept.length === prev.size ? prev : new Set(kept)
    })
  }, [board])

  useEffect(() => {
    if (selected.size === 0) {
      return
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(new Set())
      }
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  const columnNames = board?.columns.map(col => col.name) ?? []

  const parentOptions = useMemo(
    () => board?.columns.flatMap(col => col.tasks).map(task => ({ id: task.id, title: task.title })) ?? [],
    [board]
  )

  // Client-side filters, mirroring the dashboard (search over title/body/id).
  const filtered = useMemo(() => {
    if (!board) {
      return null
    }

    const q = search.trim().toLowerCase()

    const keep = (task: KanbanTask) =>
      (!q || `${task.title} ${task.body ?? ''} ${task.id}`.toLowerCase().includes(q)) &&
      (!tenant || task.tenant === tenant) &&
      (!assignee || task.assignee === assignee)

    return { ...board, columns: board.columns.map(col => ({ ...col, tasks: col.tasks.filter(keep) })) }
  }, [board, search, tenant, assignee])

  const total = filtered?.columns.reduce((sum, col) => sum + col.tasks.length, 0) ?? 0

  const moveMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => patchTask(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: boardKey(slug, archived) })
      const previous = qc.getQueryData<KanbanBoard>(boardKey(slug, archived))

      if (previous) {
        qc.setQueryData(boardKey(slug, archived), moveCard(previous, id, status))
      }

      return { previous }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(boardKey(slug, archived), context.previous)
      }

      host.notify({ kind: 'error', message: errText(err) })
    },
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: ['kanban', 'board'] })
      void qc.invalidateQueries({ queryKey: ['kanban', 'task', slug, vars.id] })
    }
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: boardKey(slug, archived) })
      const previous = qc.getQueryData<KanbanBoard>(boardKey(slug, archived))

      if (previous) {
        qc.setQueryData(boardKey(slug, archived), removeCard(previous, id))
      }

      return { previous }
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        qc.setQueryData(boardKey(slug, archived), context.previous)
      }

      host.notify({ kind: 'error', message: errText(err) })
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['kanban', 'board'] })
  })

  const onMove = (id: string, status: string) => {
    const task = board?.columns.flatMap(col => col.tasks).find(candidate => candidate.id === id)

    if (!task || task.status === status) {
      return
    }

    if (isLockedTarget(status)) {
      host.notify({ kind: 'info', message: lockedReason(k, status) })

      return
    }

    moveMut.mutate({ id, status })
  }

  const errorMessage = error ? errText(error) : null

  // Grab-to-scrub the lane strip (shared primitive, same as the dashboard's pan).
  const lanesRef = useRef<HTMLDivElement>(null)
  const { grabbing, onMouseDown } = useGrabScroll(lanesRef)

  // Lane collapse: auto (empty → rail) unless the user overrode it. The map
  // stores only deviations from auto, so it stays tiny and self-heals. On a
  // board with no work at all, auto is disabled — a wall of rails teaches
  // nothing, so a fresh board shows its full structure instead.
  const laneOverrides = useValue($collapsedLanes)
  const boardHasWork = (board?.columns.reduce((sum, col) => sum + col.tasks.length, 0) ?? 0) > 0

  // An override only lives for the lane's current empty/non-empty phase: when
  // emptiness flips (last card dragged out, first card dropped in) the stale
  // override is dropped and auto takes over — so a drained lane collapses even
  // if it was manually expanded ages ago, while expanding an empty lane still
  // sticks for as long as it stays empty.
  //
  // The phase is a string signature held in state, not a ref: React bails out
  // when it's unchanged, so the common case (a poll where no lane's emptiness
  // moved) costs no extra render, and nothing lags a render behind the value
  // it mirrors.
  const lanePhase = filtered
    ? filtered.columns.map(col => `${col.name}:${col.tasks.length === 0 ? 'empty' : 'full'}`).join('|')
    : null

  const [prevLanePhase, setPrevLanePhase] = useState<null | string>(null)

  useEffect(() => {
    if (lanePhase === null || lanePhase === prevLanePhase) {
      return
    }

    setPrevLanePhase(lanePhase)

    if (prevLanePhase === null) {
      return
    }

    const before = new Map(prevLanePhase.split('|').map(entry => entry.split(':') as [string, string]))
    const overrides = { ...$collapsedLanes.get() }
    let changed = false

    for (const entry of lanePhase.split('|')) {
      const [name, phase] = entry.split(':')
      const was = before.get(name)

      if (was !== undefined && was !== phase && name in overrides) {
        delete overrides[name]
        changed = true
      }
    }

    if (changed) {
      $collapsedLanes.set(overrides)
    }
  }, [lanePhase, prevLanePhase])

  const toggleLane = (name: string, auto: boolean) => {
    const overrides = { ...laneOverrides }
    const next = !(overrides[name] ?? auto)

    if (next === auto) {
      delete overrides[name]
    } else {
      overrides[name] = next
    }

    $collapsedLanes.set(overrides)
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-(--ui-surface-background)">
      {/* Page-owned titlebar chrome: exists exactly while this page is mounted. */}
      <Contribute area={TITLEBAR_AREAS.center} id="kanban:board-switcher">
        <BoardSwitcher />
      </Contribute>

      <header className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2">
        <h1 className="text-sm font-semibold text-foreground">{k.title}</h1>
        <span className="rounded-full bg-(--ui-bg-quaternary) px-1.5 py-px text-[0.625rem] tabular-nums text-(--ui-text-tertiary)">
          {total}
        </span>
        {board && (
          <FilterMenu
            archived={archived}
            assignee={assignee}
            board={board}
            onArchived={setArchived}
            onAssignee={setAssignee}
            onTenant={setTenant}
            tenant={tenant}
          />
        )}
        <SearchField aria-label={k.filterCards} onChange={setSearch} placeholder={k.filterCards} value={search} />
        <div className="ml-auto flex items-center gap-1">
          <Tip label={k.orchestrationSettings}>
            <Button
              aria-label={k.orchestrationSettings}
              className={cn(settingsOpen && 'bg-(--ui-control-active-background) text-foreground')}
              onClick={() => setSettingsOpen(!settingsOpen)}
              size="icon-xs"
              variant="ghost"
            >
              <Codicon name="organization" size="0.85rem" />
            </Button>
          </Tip>
          <Button onClick={() => setAddStatus('triage')} size="sm">
            <Codicon name="add" size="0.8rem" />
            {k.newTask}
          </Button>
        </div>
      </header>

      {settingsOpen && <OrchestrationPanel />}

      {board && <Intro />}

      {errorMessage && !board ? (
        <div className="grid flex-1 place-items-center">
          <ErrorState title={errorMessage} />
        </div>
      ) : !filtered ? (
        <div className="grid flex-1 place-items-center">
          <Loader type="lemniscate-bloom" />
        </div>
      ) : total === 0 ? (
        <div className="grid flex-1 place-items-center px-4 text-center">
          <div className="flex flex-col items-center gap-2">
            <Codicon className="text-(--ui-text-quaternary)" name="project" size="1.25rem" />
            <p className="text-xs text-(--ui-text-tertiary)">{search || tenant || assignee ? k.noMatch : k.noTasks}</p>
            <Button className="mt-0.5" onClick={() => setAddStatus('triage')} size="sm" variant="outline">
              <Codicon name="add" size="0.75rem" />
              {k.newTask}
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn('flex flex-1 gap-2 overflow-x-auto px-4 pt-1 pb-3', grabbing && 'cursor-grabbing')}
          onMouseDown={onMouseDown}
          ref={lanesRef}
        >
          {filtered.columns.map(col => {
            const auto = boardHasWork && col.tasks.length === 0

            return (
              <Column
                collapsed={laneOverrides[col.name] ?? auto}
                column={col}
                columns={columnNames}
                key={col.name}
                onAdd={setAddStatus}
                onDelete={id => deleteMut.mutate(id)}
                onDropTask={onMove}
                onMove={onMove}
                onOpen={setOpenId}
                onToggle={() => toggleLane(col.name, auto)}
                onToggleSelect={toggleSelect}
                selected={selected}
              />
            )
          })}
        </div>
      )}

      {selected.size > 0 && (
        <SelectionBar
          columns={columnNames}
          onClear={() => setSelected(new Set())}
          onDone={failed => setSelected(new Set(failed))}
          selected={selected}
        />
      )}

      <NewTaskDialog onClose={() => setAddStatus(null)} parents={parentOptions} target={addStatus} />
      <TaskDrawer columns={columnNames} id={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />
    </div>
  )
}
