import { useEffect, useState } from 'react'

import { ActionStatus } from '@/components/ui/action-status'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { SanitizedInput } from '@/components/ui/sanitized-input'
import type { Translations } from '@/i18n'
import { AlertTriangle } from '@/lib/icons'
import { wireErrorText } from '@/lib/wire-error-text'
import type { ProfileMigration, ProfileRecord, ProfilesCloneResult } from '@/types/wire/wire-v1'

export type CloneProfileCopy = Translations['profiles']['clone']

export interface CloneProfileDialogProps {
  copy: CloneProfileCopy
  harnessChoices: { id: string; label: string }[]
  onClose: () => void
  /** Owned by the caller: the dialog reports what the service answered and
   *  nothing else — no local record is invented while the call is in flight. */
  onClone: (intent: { displayName: string; harness?: string }) => Promise<ProfilesCloneResult>
  /** Optional reaction to a successful clone (selection, a toast). The clone
   *  itself already reached the catalog through `onClone`. */
  onCloned?: (profile: ProfileRecord) => void
  open: boolean
  profile: ProfileRecord
}

/**
 * Order 60's clone, as a product surface: name it, optionally change family,
 * and then SHOW the migration report the service computed before it wrote
 * anything. The report is the point — "what traveled, what did not, why" — and
 * a refusal (an unregistered family, a version conflict) is shown by its typed
 * code with nothing written and no local record added.
 *
 * The dialog stays open on success so the report can be read; the clone is
 * already in the catalog behind it (the caller upserts), and closing is the
 * user's own act.
 */
export function CloneProfileDialog({
  copy,
  harnessChoices,
  onClone,
  onClose,
  onCloned,
  open,
  profile
}: CloneProfileDialogProps) {
  const [displayName, setDisplayName] = useState('')
  const [harness, setHarness] = useState(profile.harness)
  const [status, setStatus] = useState<'done' | 'idle' | 'saving'>('idle')
  const [error, setError] = useState<null | string>(null)
  const [report, setReport] = useState<null | { migration: ProfileMigration; profile: ProfileRecord }>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setDisplayName(`${profile.displayName} copy`)
    setHarness(profile.harness)
    setError(null)
    setReport(null)
    setStatus('idle')
  }, [open, profile.displayName, profile.harness])

  const trimmed = displayName.trim()
  const busy = status === 'saving'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!trimmed || busy) {
      setError(trimmed ? null : copy.nameRequired)

      return
    }

    setStatus('saving')
    setError(null)

    try {
      const result = await onClone({
        displayName: trimmed,
        ...(harness === profile.harness ? {} : { harness })
      })

      onCloned?.(result.profile)
      setReport(result)
      setStatus('done')
    } catch (reason) {
      // Nothing was written, so nothing local changes: the refusal is the
      // whole answer and it is shown by its typed code.
      setStatus('idle')
      setError(wireErrorText(reason))
    }
  }

  return (
    <Dialog onOpenChange={value => !value && !busy && onClose()} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title(profile.displayName)}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {report ? (
          <div className="space-y-3" data-clone-report="">
            <div className="text-xs font-medium text-foreground">{copy.reportTitle}</div>
            <div className="text-xs text-muted-foreground">
              {copy.reportCounts(report.migration.migratedCount, report.migration.refusedCount)}
              {report.migration.sameFamily ? null : ` · ${copy.familyChanged(report.migration.sourceFamily, report.migration.targetFamily)}`}
            </div>
            <ul className="max-h-64 space-y-1 overflow-auto" data-clone-report-items="">
              {report.migration.items.map((item, index) => (
                <li className="text-xs" key={`${item.item}:${index}`}>
                  <span className={item.migrated ? 'text-foreground' : 'text-muted-foreground line-through'}>
                    {item.item}
                  </span>
                  <span className="ml-1 text-muted-foreground">— {item.reason}</span>
                </li>
              ))}
            </ul>
            {report.migration.reboundAssets.length > 0 ? (
              <div className="text-xs text-muted-foreground" data-clone-rebound-assets="">
                {copy.rebound(report.migration.reboundAssets.length)}
              </div>
            ) : null}
            <DialogFooter>
              <Button onClick={onClose} type="button">
                {copy.done}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <Field htmlFor="clone-profile-name" label={copy.nameLabel}>
              <SanitizedInput
                autoFocus
                id="clone-profile-name"
                onValueChange={setDisplayName}
                sanitize={raw => raw}
                value={displayName}
              />
            </Field>
            <Field htmlFor="clone-profile-harness" label={copy.harnessLabel}>
              <select
                className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs"
                id="clone-profile-harness"
                onChange={event => setHarness(event.target.value)}
                value={harness}
              >
                {(harnessChoices.some(choice => choice.id === profile.harness)
                  ? harnessChoices
                  : [{ id: profile.harness, label: profile.harness }, ...harnessChoices]
                ).map(choice => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-muted-foreground">{copy.familyNote}</p>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span data-clone-error="">{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button disabled={busy} onClick={onClose} type="button" variant="ghost">
                {copy.cancel}
              </Button>
              <Button disabled={busy || trimmed === ''} type="submit">
                <ActionStatus busy={copy.cloning} done={copy.cloned} idle={copy.submit} state={status} />
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
