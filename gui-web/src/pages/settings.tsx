/**
 * Settings Page — Theme preferences and app info
 */

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

type Theme = 'system' | 'light' | 'dark'

// ── Helpers ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'agent-box-theme'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function readStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

// ── Theme option definitions ───────────────────────────────────────────

const themeOptions: { value: Theme; icon: string; label: string }[] = [
  { value: 'system', icon: '◐', label: 'System' },
  { value: 'light',  icon: '☀', label: 'Light' },
  { value: 'dark',   icon: '☾', label: 'Dark' },
]

// ── Component ──────────────────────────────────────────────────────────

export function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Appearance ────────────────────────────────────────────────── */}
      <h1 className="mb-6 text-xl font-bold text-foreground">Settings</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Appearance
        </h2>

        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, icon, label }) => {
            const isActive = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  'relative flex flex-col items-center gap-2 rounded-lg border p-4',
                  'transition-all duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-card-border bg-card hover:bg-card-hover',
                )}
              >
                <span className="text-2xl">{icon}</span>
                <span
                  className={cn(
                    'text-sm font-medium',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {label}
                </span>

                {/* Active checkmark */}
                {isActive && (
                  <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* ── About ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          About
        </h2>

        <Card>
          <div className="flex items-start gap-4 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold">
              AB
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Agent Box
              </h3>
              <p className="text-sm text-muted-foreground">
                v0.5.0
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Multi-agent configuration and session management. Isolate,
                launch, and switch between agent profiles with ease.
              </p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  )
}
