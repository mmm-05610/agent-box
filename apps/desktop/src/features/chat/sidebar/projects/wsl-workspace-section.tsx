import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { reconnectWslWorkspaceProjection, refreshWslWorkspaces, removeWslWorkspaceProjection, renameWslWorkspaceProjection } from '@/application/workspace/wsl-workspace-usecases'
import { Pill } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tip } from '@/components/ui/tooltip'
import { wslFailureText } from '@/features/workspace/wsl-failure-text'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $workspaceViewSelectedId, selectWorkspaceView } from '@/store/workspace-view'
import { $wslWorkspaceInfoId, $wslWorkspaces, $wslWorkspaceValidation, openWslWorkspaceInfo } from '@/store/wsl-workspace'
import type { WslWorkspaceValidationState } from '@/store/wsl-workspace'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { useWorkspaceNodeOpen } from './model'

/**
 * The sidebar's remote-workspace rows (work order 35, extended by 36): one row
 * per WSL Workspace saved in the Electron host, peer to the local project rows
 * INSIDE the one workspace list — same row language (name first, expand,
 * kebab menu), the small WSL badge as the only marking, never a fake online
 * state. Row entries: expand (honest "no sessions yet" prompt), connection
 * info (this workspace's private connection), reconnect (re-verify), and the
 * row menu (rename / remove — record-only surgery: files, sessions and
 * history stay).
 */
export function WslWorkspaceSection({ className }: { className?: string }) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const workspaces = useStore($wslWorkspaces)
  const validation = useStore($wslWorkspaceValidation)
  const infoId = useStore($wslWorkspaceInfoId)
  // One rename dialog + one remove confirm for the whole section, aimed at the
  // row whose menu action fired.
  const [renameTarget, setRenameTarget] = useState<null | { id: string; name: string }>(null)
  const [removeTarget, setRemoveTarget] = useState<null | { id: string; name: string }>(null)

  // The projection is a cache of the host's store: refresh on mount so a
  // reopen shows the saved rows, each starting as "not verified". A failed
  // refresh is never rendered as an empty list — the rows stay and the user
  // gets the typed reason.
  useEffect(() => {
    // One warning per mount (the effect runs once): the store does not fix
    // itself between renders.
    let failureNotified = false

    void refreshWslWorkspaces().then(outcome => {
      if (!outcome.ok && !failureNotified) {
        failureNotified = true
        notify({ kind: 'warning', message: wslFailureText(t, outcome.code ?? null) })
      }
    })
    // `t` rides the deps so a locale switch re-translates; the refresh itself
    // is an idempotent read, and failureNotified resets with the effect.
  }, [t])

  if (workspaces.length === 0) {
    return null
  }

  return (
    // No section header of its own (round 36): these rows render INSIDE the
    // unified workspace list, peer to the local folders — the WSL badge on
    // each row is the only marking they need.
    <div className={cn('shrink-0 px-1.5 pb-1', className)} data-wsl-workspace-section>
      <div className="flex flex-col gap-px">
        {workspaces.map(workspace => (
          <WslWorkspaceRow
            infoOpen={infoId === workspace.id}
            key={workspace.id}
            onRemove={setRemoveTarget}
            onRename={setRenameTarget}
            state={validation[workspace.id]}
            workspace={workspace}
          />
        ))}
      </div>

      {renameTarget && (
        <WslWorkspaceRenameDialog
          name={renameTarget.name}
          onClose={() => setRenameTarget(null)}
          workspaceId={renameTarget.id}
        />
      )}

      <ConfirmDialog
        confirmLabel={w.menuRemove}
        description={w.removeDesc}
        destructive
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) {
            return
          }

          const outcome = await removeWslWorkspaceProjection(removeTarget.id)

          if (!outcome.ok) {
            notifyError(outcome, w.removeFailed)
          }
        }}
        open={removeTarget !== null}
        title={w.removeTitle(removeTarget?.name ?? '')}
      />
    </div>
  )
}

// One WSL workspace row, peer to a local project row: name first, WSL badge,
// expand toggle revealing the honest no-sessions prompt, and the same kebab
// menu shape (rename / remove / connection info) plus reconnect.
function WslWorkspaceRow({
  infoOpen,
  onRemove,
  onRename,
  state,
  workspace
}: {
  infoOpen: boolean
  onRemove: (target: { id: string; name: string }) => void
  onRename: (target: { id: string; name: string }) => void
  state: WslWorkspaceValidationState | undefined
  workspace: WslWorkspaceRecord
}) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const validating = state?.status === 'validating'
  const selected = useStore($workspaceViewSelectedId) === workspace.id
  // WSL rows start collapsed — unlike local projects (whose previews read
  // better expanded), the no-sessions prompt is a detail the user opens.
  const [open, toggleOpen] = useWorkspaceNodeOpen(workspace.id, false)

  return (
    <div
      className={cn(
        'group/remote-row grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md',
        infoOpen && 'bg-(--ui-control-hover-background)'
      )}
      data-wsl-workspace-row={workspace.id}
    >
      <button
        className={cn(
          'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-(--ui-control-hover-background)',
          selected && 'bg-(--ui-row-active-background)'
        )}
        // Round 36R: the main row's meaning is SELECT (the same intent the
        // local rows carry) — never "open connection info". Connection info
        // stays on its dedicated button and menu entry.
        data-workspace-row-selected={selected ? workspace.id : undefined}
        onClick={() => selectWorkspaceView(workspace.id)}
        type="button"
      >
        <span className="grid size-4 shrink-0 place-items-center text-(--ui-text-tertiary)">
          <Codicon name="vm-connect" size="0.875rem" />
        </span>
        {/* Two stacked lines, name first: the name must stay readable even
            when the badges squeeze the row — a name collapsed to zero width
            reads as a distribution, not a project. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs leading-4">{workspace.name}</span>
          <span className="block truncate text-[0.625rem] leading-3.5 text-(--ui-text-quaternary)">
            {workspace.distribution} · {workspace.rootPath}
          </span>
        </span>
        {/* No standing Verified/Not-verified badges (round 36): an unverified
            reopen is not a fault. Validation shows a spinner only while it
            runs, and a real failure shows one quiet actionable marker — never
            a faked online state. */}
        <Pill tone="muted">{w.wslBadge}</Pill>
        {validating && (
          <Tip label={w.statusValidating}>
            <span className="grid shrink-0 place-items-center text-(--ui-text-tertiary)">
              <Codicon name="loading" size="0.75rem" spinning />
            </span>
          </Tip>
        )}
        {state?.status === 'failed' && (
          <Tip label={state.message}>
            <span className="grid shrink-0 place-items-center text-(--ui-red)">
              <Codicon name="error" size="0.75rem" />
            </span>
          </Tip>
        )}
      </button>

      <div className="flex shrink-0 items-center self-stretch pr-1" data-row-actions>
        <Tip label={w.toggleExpand(workspace.name, open)}>
          <Button
            aria-label={w.toggleExpand(workspace.name, open)}
            className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100"
            data-wsl-workspace-expand={workspace.id}
            onClick={toggleOpen}
            size="icon-xs"
            variant="ghost"
          >
            <Codicon name={open ? 'chevron-down' : 'chevron-right'} size="0.75rem" />
          </Button>
        </Tip>
        <Tip label={w.reconnect}>
          <Button
            aria-label={w.reconnect}
            className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100"
            disabled={validating}
            onClick={() => void reconnectWslWorkspaceProjection(workspace.id)}
            size="icon-xs"
            variant="ghost"
          >
            <Codicon name="refresh" size="0.75rem" />
          </Button>
        </Tip>
        <Tip label={w.connectionInfo}>
          <Button
            aria-label={w.connectionInfo}
            className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100"
            onClick={() => openWslWorkspaceInfo(workspace.id)}
            size="icon-xs"
            variant="ghost"
          >
            <Codicon name="info" size="0.75rem" />
          </Button>
        </Tip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={w.connectionInfo}
              className="text-(--ui-text-quaternary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/remote-row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              size="icon-xs"
              variant="ghost"
            >
              <Codicon name="kebab-vertical" size="0.75rem" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48" sideOffset={6}>
            <DropdownMenuItem onSelect={() => onRename({ id: workspace.id, name: workspace.name })}>
              <Codicon name="edit" size="0.875rem" />
              <span>{w.menuRename}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onRemove({ id: workspace.id, name: workspace.name })}
            >
              <Codicon name="trash" size="0.875rem" />
              <span>{w.menuRemove}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openWslWorkspaceInfo(workspace.id)}>
              <Codicon name="info" size="0.875rem" />
              <span>{w.connectionInfo}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="col-span-2 px-8 pb-1.5" data-wsl-workspace-empty={workspace.id}>
          <div className="rounded-md px-2 py-1.5 text-[0.6875rem] leading-4 text-(--ui-text-tertiary)">
            {w.sessionUnavailable}
          </div>
        </div>
      )}
    </div>
  )
}

// Record-only rename: the host persists the new display name; the projection
// updates from its answer. A typed failure surfaces as a toast and keeps the
// dialog open for retry.
function WslWorkspaceRenameDialog({
  name,
  onClose,
  workspaceId
}: {
  name: string
  onClose: () => void
  workspaceId: string
}) {
  const { t } = useI18n()
  const w = t.wslWorkspace
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const trimmed = value.trim()

  const submit = async () => {
    if (busy || !trimmed || trimmed === name) {
      onClose()

      return
    }

    setBusy(true)

    const outcome = await renameWslWorkspaceProjection(workspaceId, trimmed)

    setBusy(false)

    if (!outcome.ok) {
      notifyError(outcome, w.renameFailed)

      return
    }

    onClose()
  }

  return (
    <Dialog onOpenChange={next => !next && !busy && onClose()} open>
      <DialogContent className="max-w-sm" onInteractOutside={event => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{w.renameTitle(name)}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          disabled={busy}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void submit()
            }
          }}
          value={value}
        />
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} type="button" variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={busy || !trimmed} onClick={() => void submit()} type="button">
            {busy ? t.common.saving : t.common.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
