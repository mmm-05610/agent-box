/**
 * Toast — Transient notification system
 *
 * Types: success, error, warning, info
 *
 * @example
 *   // Inside a component:
 *   const { toast } = useToast()
 *   toast({ type: 'success', message: 'Saved!' })
 *   toast({ type: 'error', message: 'Failed to save' })
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastOptions {
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
  toasts: Toast[]
  dismiss: (id: string) => void
}

// ── Context ────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    ({ type, message, duration = 4000 }: ToastOptions) => {
      const id = Math.random().toString(36).slice(2, 9)
      setToasts((prev) => [...prev, { id, type, message, duration }])

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast, toasts, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

// ── Container ──────────────────────────────────────────────────────────

function ToastContainer({
  toasts,
  dismiss,
}: {
  toasts: Toast[]
  dismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[400] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  )
}

// ── Item ───────────────────────────────────────────────────────────────

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast
  onDismiss: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3',
        'shadow-lg backdrop-blur-sm',
        'animate-slide-up',
        typeStyles[toast.type],
      )}
    >
      <span className="text-sm">{typeIcons[toast.type]}</span>
      <p className="text-sm font-medium">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="ml-auto text-current opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const typeStyles = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
} as const

const typeIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
} as const
