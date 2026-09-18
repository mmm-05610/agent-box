import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

/**
 * The product draft screen: the brand, one greeting, and — only when the
 * composer can actually send — a few starter chips.
 *
 * The composer itself is the SAME one below (P08); this surface adds no second
 * input. A chip is a real door: pressing it walks the ordinary submit seam with
 * a real sentence, so it creates the session and runs the round exactly as
 * typing would — which is also why a chip is never rendered when sending is
 * blocked. No capability, no chips: a starter the product cannot run would be
 * decoration pretending to be a path.
 */
export interface AgentBoxEmptyStateProps {
  /** The same submit seam the composer uses. */
  onPick: (text: string) => void
  /** Whether a send is possible right now (service + workspace + profile). */
  canSend: boolean
  /** While true, the chips wait: the service has not answered yet. */
  waiting?: boolean
}

export function AgentBoxEmptyState({ canSend, onPick, waiting = false }: AgentBoxEmptyStateProps) {
  const copy = useI18n().t.composer.emptyState

  return (
    <div className="flex w-full max-w-[min(36rem,100%)] flex-col items-center gap-4 px-6 text-center" data-agentbox-empty-state="">
      <div className="text-[1.05rem] font-medium tracking-tight text-foreground">{copy.greeting}</div>
      <div className="max-w-[34rem] text-xs leading-5 text-(--ui-text-tertiary)">{copy.subtitle}</div>
      {canSend ? (
        <div className="flex flex-wrap items-center justify-center gap-1.5" data-agentbox-empty-chips="">
          {copy.starters.map(starter => (
            <Button
              className="h-7 rounded-full px-3 text-xs font-normal"
              key={starter}
              onClick={() => onPick(starter)}
              type="button"
              variant="outline"
            >
              {starter}
            </Button>
          ))}
        </div>
      ) : (
        <div className="text-xs text-(--ui-text-quaternary)" data-agentbox-empty-blocked="">
          {waiting ? copy.waiting : copy.blocked}
        </div>
      )}
    </div>
  )
}
