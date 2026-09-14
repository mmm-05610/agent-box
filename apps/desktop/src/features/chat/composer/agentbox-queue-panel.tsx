import { useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { withdrawAgentBoxQueueItem } from '@/application/session/wire-session-control'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { QueueItem, WireId } from '@/types/wire/wire-v1'

export function AgentBoxQueuePanel({ items, sessionId }: { items: QueueItem[]; sessionId: WireId }) {
  const { t } = useI18n()
  const [withdrawing, setWithdrawing] = useState<null | string>(null)

  if (items.length === 0) {
    return null
  }

  return (
    <section
      aria-label={t.composer.queued(items.length)}
      className="rounded-xl border border-(--ui-border) bg-(--ui-panel-background)/90 p-2 shadow-sm"
      data-agentbox-server-queue=""
    >
      <div className="px-1 pb-1 text-[0.6875rem] font-medium text-(--ui-text-tertiary)">
        {t.composer.queued(items.length)}
      </div>
      <div className="grid gap-1">
        {items.map(item => (
          <div className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-xs" key={item.itemId}>
            <span className="min-w-0 flex-1 truncate">{item.message.text || t.composer.attachmentOnly}</span>
            {item.state === 'pending' || item.state === 'paused' ? (
              <Button
                aria-label={t.common.remove}
                disabled={withdrawing === item.itemId}
                onClick={() => {
                  setWithdrawing(item.itemId)
                  void withdrawAgentBoxQueueItem(agentBoxRuntimeClient(), {
                    expectedVersion: item.version,
                    itemId: item.itemId,
                    sessionId
                  }).finally(() => setWithdrawing(current => (current === item.itemId ? null : current)))
                }}
                size="xs"
                type="button"
                variant="ghost"
              >
                {t.common.remove}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
