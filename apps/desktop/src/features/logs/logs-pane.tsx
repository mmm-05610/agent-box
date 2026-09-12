/**
 * Logs — live agent-log tail. ⌘K-only chrome: the pane contribution exists
 * only while the "Toggle logs" palette command has it summoned ($logsOpen in
 * the controller) — never in a default layout, never a standing tab.
 */

import { useQuery } from '@tanstack/react-query'

import { getLogs } from '@/api/config'
import { DecodeText } from '@/components/ui/decode-text'

export function LogsPane() {
  const { data, error } = useQuery({
    queryKey: ['contrib-logs-tail'],
    queryFn: () => getLogs({ lines: 300 }),
    refetchInterval: 5000
  })

  if (error) {
    return <div className="p-3 text-xs text-(--ui-text-quaternary)">log unavailable: {String(error)}</div>
  }

  if (!data) {
    return (
      <div className="grid h-full place-items-center">
        <DecodeText className="text-(--ui-text-quaternary)" cursor prefix={1} text="LOGS" />
      </div>
    )
  }

  // No chrome of its own — the zone header (when the user summons it) is the
  // pane's only label. Just the tail.
  return (
    <pre className="h-full min-h-0 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[0.66rem] leading-relaxed text-(--ui-text-secondary)">
      {data.lines.join('\n')}
    </pre>
  )
}
