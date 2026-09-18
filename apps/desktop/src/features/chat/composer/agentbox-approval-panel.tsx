import { useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { decideAgentBoxApproval } from '@/application/session/wire-session-control'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import type { ApprovalRequest } from '@/types/wire/wire-v1'

export function AgentBoxApprovalPanel({ approvals }: { approvals: ApprovalRequest[] }) {
  const { t } = useI18n()
  const [deciding, setDeciding] = useState<null | string>(null)

  if (approvals.length === 0) {
    return null
  }

  return (
    <div className="grid gap-1.5" data-agentbox-approvals="">
      {approvals.map(approval => (
        <section
          className="rounded-xl border border-(--ui-border) bg-(--ui-panel-background)/90 p-2.5 shadow-sm"
          key={approval.approvalId}
        >
          <div className="text-xs font-medium text-foreground">{approval.operation.title}</div>
          {approval.operation.detail.map(detail => (
            <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-[0.6875rem]" key={detail.label}>
              <span className="text-(--ui-text-tertiary)">{detail.label}</span>
              <span className="min-w-0 break-words text-(--ui-text-secondary)">{detail.value}</span>
            </div>
          ))}
          <div className="mt-2 flex justify-end gap-1.5">
            <Button
              disabled={deciding === approval.approvalId}
              onClick={() => {
                setDeciding(approval.approvalId)
                void decideAgentBoxApproval(agentBoxRuntimeClient(), {
                  approvalId: approval.approvalId,
                  decision: 'deny',
                  expectedVersion: approval.version,
                  scope: { kind: 'once' }
                }).finally(() => setDeciding(current => (current === approval.approvalId ? null : current)))
              }}
              size="xs"
              type="button"
              variant="ghost"
            >
              {t.notifications.native.rejectAction}
            </Button>
            <Button
              disabled={deciding === approval.approvalId}
              onClick={() => {
                setDeciding(approval.approvalId)
                void decideAgentBoxApproval(agentBoxRuntimeClient(), {
                  approvalId: approval.approvalId,
                  decision: 'allow',
                  expectedVersion: approval.version,
                  scope: { kind: 'once' }
                }).finally(() => setDeciding(current => (current === approval.approvalId ? null : current)))
              }}
              size="xs"
              type="button"
            >
              {t.notifications.native.approveAction}
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}
