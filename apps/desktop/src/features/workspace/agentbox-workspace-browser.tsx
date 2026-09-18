import { useCallback, useEffect, useRef, useState } from 'react'

import { createLatestWins } from '@/application/workspace/latest-wins'
import type { AgentBoxWorkspaceBrowserPort } from '@/application/workspace/wire-workspace-browser'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Codicon } from '@/components/ui/codicon'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { EnvironmentIdentity, WorkspacesBrowseResult } from '@/types/wire/wire-v1'

type BrowseEntries = WorkspacesBrowseResult['entries']

type BrowserState =
  | { status: 'loading' }
  /** A listing the user can see; `listing` says another one is in flight, and
   *  `error` says the newest attempt failed without discarding what we have. */
  | { entries: BrowseEntries; error: null | string; listing: boolean; path: string; status: 'ready' }
  | { detail: string; status: 'unavailable' }

export interface AgentBoxWorkspaceBrowserProps {
  environment: EnvironmentIdentity
  initialPath: string
  onBack: () => void
  onChoose: (path: string) => Promise<{ message: string; ok: false } | { ok: true }>
  port: AgentBoxWorkspaceBrowserPort
}

/** POSIX parents only: the environments this browser serves are Linux trees, so
 *  a WSL path is never handed to Windows/UNC normalisation. */
const parentOf = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  const parent = trimmed.replace(/\/[^/]*$/, '')

  return parent === '' ? '/' : parent
}

const childOf = (path: string, name: string): string => `${path === '/' ? '' : path.replace(/\/+$/, '')}/${name}`

/**
 * One directory tree inside an environment the SERVICE can reach. The host
 * discovers and connects to WSL; listing a directory, and every readability /
 * writability / reason fact about an entry, comes from `workspaces.browse`.
 * Nothing here opens a Workspace, creates a Session or guesses permissions.
 */
export function AgentBoxWorkspaceBrowser({
  environment,
  initialPath,
  onBack,
  onChoose,
  port
}: AgentBoxWorkspaceBrowserProps) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const [state, setState] = useState<BrowserState>({ status: 'loading' })
  const [input, setInput] = useState(initialPath)
  const [showHidden, setShowHidden] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [chooseMessage, setChooseMessage] = useState<null | string>(null)
  // Read-only is a service fact about the directory the user just entered; it
  // is only ever set from the listing that offered that entry.
  const [readOnly, setReadOnly] = useState(false)
  // Latest-wins: a slow listing for A must never land on top of a newer B, and
  // an answer that arrives after the dialog closed must not write state.
  const turns = useRef(createLatestWins())
  const alive = useRef(true)
  // One request per UI intent: pressing Go twice, or re-clicking the row that is
  // already loading, must not fan out into a second browse.
  const inFlight = useRef<null | string>(null)

  // Mount flag: handlers, not effects, read it, so it cannot go stale against
  // an atom — the documented exception to the ref-mirror rule.
  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    alive.current = true

    return () => {
      alive.current = false
    }
  }, [])

  const browse = useCallback(
    async (target: string, entered?: { canWrite: boolean }) => {
      if (inFlight.current === target) {
        return
      }

      const turn = turns.current.begin()

      inFlight.current = target
      setState(previous =>
        previous.status === 'ready' ? { ...previous, error: null, listing: true } : { status: 'loading' }
      )
      setInput(target)

      try {
        const result = await port.browse({ environment, path: target })

        if (!alive.current || !turns.current.isCurrent(turn)) {
          return
        }

        // The service's answer is authoritative for the path it listed: its own
        // normalization is what the next request and the save must carry.
        setState({ entries: result.entries, error: null, listing: false, path: result.path, status: 'ready' })
        setInput(previous => (previous === target ? result.path : previous))
        setReadOnly(entered ? !entered.canWrite : false)
      } catch (error) {
        if (!alive.current || !turns.current.isCurrent(turn)) {
          return
        }

        // A failed listing keeps whatever was last successfully listed (never
        // an empty list pretending the directory is empty), and the typed path
        // stays editable for the retry.
        const detail = error instanceof Error ? error.message : String(error)

        setState(previous =>
          previous.status === 'ready'
            ? { ...previous, error: detail, listing: false }
            : { detail, status: 'unavailable' }
        )
      } finally {
        if (inFlight.current === target) {
          inFlight.current = null
        }
      }
    },
    [environment, port]
  )

  useEffect(() => {
    void browse(initialPath)
    // The initial listing runs once per mounted browser; navigation re-browses
    // explicitly through the handlers below.
  }, [browse, initialPath])

  const visibleEntries =
    state.status === 'ready' ? state.entries.filter(entry => showHidden || !entry.name.startsWith('.')) : []

  const listing = state.status === 'loading' || (state.status === 'ready' && state.listing)
  const currentPath = state.status === 'ready' ? state.path : input
  // While a save is in flight the directory on screen is the one being saved:
  // every way of moving away from it would fork the target from the UI.
  const locked = choosing

  const choose = async () => {
    if (choosing || state.status !== 'ready' || state.listing) {
      return
    }

    setChoosing(true)
    setChooseMessage(null)

    try {
      const outcome = await onChoose(state.path)

      // A save that answers after the surface is gone writes nothing: the
      // caller may already have abandoned this wizard.
      if (!alive.current) {
        return
      }

      setChoosing(false)

      if (!outcome.ok) {
        // The browser stays exactly where it is; the caller shows the typed
        // failure and the user can retry or navigate on.
        setChooseMessage(outcome.message)
      }
    } catch (error) {
      if (!alive.current) {
        return
      }

      setChoosing(false)
      setChooseMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-2" data-agentbox-browser="">
      <div className="flex items-center gap-1.5">
        <Button
          aria-label={t.common.back}
          disabled={listing || locked}
          onClick={onBack}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Codicon name="arrow-left" size="0.875rem" />
        </Button>
        <Button
          aria-label={w.upOneLevel}
          disabled={listing || locked || (state.status === 'ready' && state.path === '/')}
          onClick={() => void browse(parentOf(currentPath))}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Codicon name="arrow-up" size="0.875rem" />
        </Button>
        <Input
          aria-label={w.pathLabel}
          className="h-7 flex-1 text-[0.75rem]"
          disabled={locked}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') {
              return
            }

            event.preventDefault()

            // Disabled inputs do not reach a real user, but the guard is here
            // too: a save in flight owns the directory it is saving.
            if (!locked) {
              void browse(input)
            }
          }}
          placeholder={w.pathLabel}
          value={input}
        />
        <Button disabled={listing || locked} onClick={() => void browse(input)} size="sm" type="button" variant="ghost">
          {w.goTo}
        </Button>
      </div>

      <label className="flex w-fit items-center gap-1.5 text-[0.6875rem] text-(--ui-text-tertiary)">
        <Checkbox checked={showHidden} disabled={locked} onCheckedChange={checked => setShowHidden(checked === true)} />
        {w.showHidden}
      </label>

      <div className="h-64 overflow-y-auto rounded-md border border-(--ui-stroke-tertiary)">
        {state.status === 'unavailable' && (
          <div className="p-3 text-[0.75rem] text-(--ui-red)" data-browser-unavailable="">
            {w.browseUnavailable}
            {state.detail ? ` · ${state.detail}` : ''}
          </div>
        )}

        {state.status === 'ready' && state.error && (
          <div className="p-3 text-[0.75rem] text-(--ui-red)" data-browser-list-error="">
            {state.error}
          </div>
        )}

        {state.status === 'ready' && visibleEntries.length === 0 && !listing && (
          <div className="p-3 text-[0.75rem] text-(--ui-text-quaternary)">{w.emptyDirectory}</div>
        )}

        {state.status === 'ready' &&
          visibleEntries.map(entry => {
            const directory = entry.kind === 'directory'
            const enterable = directory && entry.canOpen

            return (
              <button
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.75rem] transition-colors',
                  enterable ? 'hover:bg-(--ui-control-hover-background)' : 'cursor-default opacity-70'
                )}
                data-entry-can-open={String(entry.canOpen)}
                data-entry-can-write={String(entry.canWrite)}
                data-entry-kind={entry.kind}
                disabled={!enterable || locked}
                key={entry.name}
                onClick={() =>
                  enterable && !locked && void browse(childOf(currentPath, entry.name), { canWrite: entry.canWrite })
                }
                type="button"
              >
                <Codicon
                  className="shrink-0 text-(--ui-text-tertiary)"
                  name={directory ? 'folder' : 'file'}
                  size="0.75rem"
                />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                {directory && !entry.canWrite && (
                  <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)">{w.readOnly}</span>
                )}
                {directory && !entry.canOpen && (
                  <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)" data-entry-reason="">
                    {w.cannotOpen}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </span>
                )}
                {!directory && (
                  <span className="shrink-0 text-[0.625rem] text-(--ui-text-quaternary)">
                    {entry.kind === 'file' ? w.kindFile : w.kindOther}
                  </span>
                )}
              </button>
            )
          })}

        {listing && (
          <div className="flex items-center gap-2 p-3 text-[0.75rem] text-(--ui-text-tertiary)">
            <Codicon name="loading" size="0.75rem" spinning />
            {t.common.loading}
          </div>
        )}
      </div>

      {chooseMessage && (
        <div className="text-[0.75rem] text-(--ui-red)" data-browser-choose-error="">
          {chooseMessage}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {/* A read-only directory is still readable, so choosing it stays
            available — this only says writes will not work there. */}
        {state.status === 'ready' && readOnly && (
          <span className="text-[0.625rem] text-(--ui-text-quaternary)" data-browser-read-only-current="">
            {w.readOnly}
          </span>
        )}
        <Button disabled={choosing || listing || state.status !== 'ready'} onClick={() => void choose()} type="button">
          <Codicon name="check" size="0.75rem" />
          {choosing ? t.common.saving : w.chooseDirectory}
        </Button>
      </div>
    </div>
  )
}
