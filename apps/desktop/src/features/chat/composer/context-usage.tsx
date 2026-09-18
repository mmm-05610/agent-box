import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const PILL = cn(
  'h-(--composer-control-size) min-w-0 max-w-32 shrink items-center gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary)'
)

/**
 * Context-usage display slot for the composer control row.
 *
 * The wire carries no usage fact today (`usage` / `tokenCount` / `percent`
 * have zero hits across the locked wire-v1 schema and the Server), so there is
 * nothing this client may compute: without data the pill reads "unknown", and
 * a number is only ever shown when the backend hands one over. It is never
 * estimated from transcript length or any other local signal.
 */
export function ContextUsagePill({ percent }: { percent: null | number }) {
  const { t } = useI18n()
  const copy = t.composer
  // Non-finite input is no data, not zero and not a percentage.
  const known = typeof percent === 'number' && Number.isFinite(percent)

  return (
    <Tip
      label={known ? `${copy.contextUsage}: ${percent}%` : `${copy.contextUsage}: ${copy.contextUsageUnknown}`}
      side="top"
    >
      <div
        aria-label={known ? `${copy.contextUsage}: ${percent}%` : `${copy.contextUsage}: ${copy.contextUsageUnknown}`}
        className={cn(PILL, 'flex')}
        data-context-usage={known ? 'known' : 'unknown'}
        data-slot="composer-context-usage"
      >
        <span className="truncate">{known ? `${percent}%` : copy.contextUsageUnknown}</span>
      </div>
    </Tip>
  )
}
