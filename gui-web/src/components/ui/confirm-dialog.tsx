/**
 * ConfirmDialog — Destructive-action confirmation modal.
 *
 * For dangerous actions (delete provider, delete MCP server, ...), a single
 * click is too easy to trigger by accident. This modal asks the user to
 * explicitly confirm before the action runs. Esc and backdrop click cancel;
 * the destructive button is auto-focused so Enter confirms.
 *
 * @example
 *   <ConfirmDialog
 *     open={pendingDelete != null}
 *     title="Delete provider?"
 *     description="This will remove 'DeepSeek' from the library."
 *     confirmLabel="Delete"
 *     onConfirm={async () => { await deleteProvider(...); setPendingDelete(null) }}
 *     onCancel={() => setPendingDelete(null)}
 *   />
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui'

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Autofocus the destructive button so Enter confirms.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 0)
      return () => clearTimeout(t)
    }
  }, [open])

  // Esc closes (unless busy).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        // Backdrop click closes (only if not busy).
        if (e.target === e.currentTarget && !busy) onCancel()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-card shadow-2xl ring-1 ring-border p-5"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="mt-0.5 h-8 w-8 shrink-0 rounded-full bg-destructive/15 text-destructive flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={[
              'inline-flex items-center justify-center gap-2',
              'rounded-md font-medium tracking-tight cursor-pointer select-none',
              'h-8 px-3 text-sm',
              'bg-destructive text-destructive-foreground',
              'hover:bg-destructive-hover hover:shadow-md hover:-translate-y-px',
              'focus-visible:outline-none transition-[color,background-color,box-shadow,transform] duration-normal',
              'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {busy && (
              <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}