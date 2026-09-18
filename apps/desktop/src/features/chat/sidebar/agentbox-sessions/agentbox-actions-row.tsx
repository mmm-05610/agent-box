import { Button } from '@/components/ui/button'
import { SearchIcon } from '@/lib/icons'
import { Codicon } from '@/components/ui/codicon'

export interface AgentBoxActionsRowLabels {
  newTask: string
  search: string
}

export interface AgentBoxActionsRowProps {
  labels: AgentBoxActionsRowLabels
  /** The existing new-session path, with the workspace the sidebar is in. */
  onNewTask: () => void
  /** Opens the existing command palette — the one global search surface. */
  onSearch: () => void
}

/**
 * The product sidebar's action area: two doors, both of them existing paths —
 * New task walks the same new-session route the workspace "+" uses, Search
 * opens the command palette (no new keybinding, no second search
 * implementation; the field below stays the session filter it already was).
 */
export function AgentBoxActionsRow({ labels, onNewTask, onSearch }: AgentBoxActionsRowProps) {
  return (
    <div className="flex items-center gap-1 px-2 pb-0.5 pt-1.5" data-agentbox-actions="">
      <Button
        className="h-7 min-w-0 flex-1 justify-start gap-1.5 rounded-lg px-2 text-xs font-normal"
        onClick={onNewTask}
        type="button"
        variant="secondary"
      >
        <Codicon name="edit" size="0.875rem" />
        <span className="truncate">{labels.newTask}</span>
      </Button>
      <Button
        aria-label={labels.search}
        className="size-7 shrink-0 rounded-lg p-0"
        onClick={onSearch}
        size="icon"
        type="button"
        variant="ghost"
      >
        <SearchIcon className="size-3.5" />
      </Button>
    </div>
  )
}
