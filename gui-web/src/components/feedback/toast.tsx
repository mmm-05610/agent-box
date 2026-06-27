/**
 * Toast — Transient notification system
 *
 * Types: success, error, warning, info
 *
 * Enter/exit animations:
 *  - enter: `animate-slide-up` (fade + 8px translate up, 200ms)
 *  - exit:  fade + 8px translate right + slight shrink, 200ms
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
  useEffect,
  useRef,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

type ToastStatus = 'visible' | 'exiting'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  status: ToastStatus
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

// ── Animation timing ───────────────────────────────────────────────────

const EXIT_ANIMATION_MS = 200

// ── Provider ───────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // Track pending auto-dismiss timers so we can cancel them on manual dismiss
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const finalizeRemove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const handle = timers.current.get(id)
    if (handle !== undefined) {
      clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: string) => {
      // Mark exiting so CSS animation runs, then remove after it completes
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'exiting' } : t)),
      )
      const autoTimer = timers.current.get(id)
      if (autoTimer !== undefined) {
        clearTimeout(autoTimer)
        timers.current.delete(id)
      }
      setTimeout(() => finalizeRemove(id), EXIT_ANIMATION_MS)
    },
    [finalizeRemove],
  )

  const toast = useCallback(
    ({ type, message, duration = 4000 }: ToastOptions) => {
      const id = Math.random().toString(36).slice(2, 9)
      setToasts((prev) => [
        ...prev,
        { id, type, message, duration, status: 'visible' },
      ])

      if (duration > 0) {
        const handle = setTimeout(() => dismiss(id), duration)
        timers.current.set(id, handle)
      }
    },
    [dismiss],
  )

  // Clean up all timers on unmount
  useEffect(() => {
    const refs = timers.current
    return () => {
      refs.forEach((handle) => clearTimeout(handle))
      refs.clear()
    }
  }, [])

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
        <ToastItem
          key={t.id}
          toast={t}
          onDismiss={() => dismiss(t.id)}
        />
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
  const isExiting = toast.status === 'exiting'

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-3 rounded-lg border px-4 py-3 min-w-[260px] max-w-sm',
        'shadow-lg backdrop-blur-sm',
        // Enter / exit animations
        isExiting
          ? 'animate-toast-out'
          : 'animate-toast-in',
        typeStyles[toast.type],
      )}
    >
      <span className="text-sm" aria-hidden="true">
        {typeIcons[toast.type]}
      </span>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={onDismiss}
        className="ml-auto text-current opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 rounded-sm"
        aria-label="Dismiss notification"
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