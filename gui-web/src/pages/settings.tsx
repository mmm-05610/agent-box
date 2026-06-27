/**
 * Settings Page — Theme, projects directory, app info
 *
 * Three sections with clear visual separators. Theme picker uses
 * preview swatches instead of just glyphs.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Button, Card } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { cn } from '@/lib/utils'
import { getSettings, saveSettings, browseDir } from '@/api'

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

// ── Theme preview definitions ────────────────────────────────────────────

const themeOptions: {
  value: Theme
  label: string
  swatch: { bg: string; fg: string; accent: string; card: string }
}[] = [
  {
    value: 'system',
    label: 'System',
    swatch: {
      bg: 'bg-gradient-to-br from-white to-stone-100',
      fg: 'bg-stone-900',
      accent: 'bg-accent',
      card: 'bg-white',
    },
  },
  {
    value: 'light',
    label: 'Light',
    swatch: {
      bg: 'bg-stone-50',
      fg: 'bg-stone-900',
      accent: 'bg-accent',
      card: 'bg-white',
    },
  },
  {
    value: 'dark',
    label: 'Dark',
    swatch: {
      bg: 'bg-stone-900',
      fg: 'bg-stone-200',
      accent: 'bg-accent',
      card: 'bg-stone-800',
    },
  },
]

// ── Component ──────────────────────────────────────────────────────────

export function SettingsPage() {
  const { toast } = useToast()
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const [projectsDir, setProjectsDir] = useState('~/projects')

  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s.projects_dir) setProjectsDir(s.projects_dir)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const handleBrowse = async () => {
    try {
      const dir = await browseDir(projectsDir)
      if (dir) {
        setProjectsDir(dir)
        await saveSettings({ projects_dir: dir })
        toast({ type: 'success', message: 'Projects directory updated' })
      }
    } catch {
      toast({ type: 'error', message: 'Failed to browse directory' })
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Header */}
      <PageHeader
        title="Settings"
        stats={
          <>
            <span className="font-mono">v0.5.0</span>
            <span className="mx-2 text-border">·</span>
            <span>1 profile path saved</span>
            <span className="mx-2 text-border">·</span>
            <span>last build 2 days ago</span>
          </>
        }
        className="mb-8"
      />

      {/* ── Projects Directory ─────────────────────────────────────── */}
      <Section title="Projects Directory">
        <Card>
          <div className="p-5">
            <p className="mb-3 text-sm text-muted-foreground">
              Default directory for browsing and launching projects. Used as
              the starting point for the folder picker.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 rounded-lg bg-muted/40 px-3.5 py-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground shrink-0">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                <span className="text-sm font-mono text-foreground truncate">
                  {projectsDir || 'No directory set'}
                </span>
              </div>
              <Button
                variant="outline"
                size="md"
                onClick={handleBrowse}
              >
                Change folder
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <Section title="Appearance" description="Choose how Agent Box looks.">
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, label, swatch }) => {
            const isActive = theme === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={isActive}
                className={cn(
                  'group relative flex flex-col gap-3 overflow-hidden rounded-xl bg-card p-3 text-left',
                  'transition-all duration-normal',
                  'hover:-translate-y-0.5 hover:shadow-md',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2',
                  isActive
                    ? 'shadow-md ring-2 ring-foreground/20'
                    : 'shadow-sm',
                )}
              >
                {/* Preview swatch */}
                <div
                  className={cn(
                    'relative h-24 w-full overflow-hidden rounded-lg ',
                    swatch.bg,
                  )}
                >
                  {/* fake content */}
                  <div className="absolute left-2 top-2 right-2 space-y-1.5">
                    <div className={cn('h-1.5 w-12 rounded-full', swatch.fg, 'opacity-80')} />
                    <div className={cn('h-1 w-20 rounded-full', swatch.fg, 'opacity-30')} />
                    <div className={cn('h-1 w-16 rounded-full', swatch.fg, 'opacity-30')} />
                  </div>
                  <div className={cn('absolute bottom-2 right-2 h-4 w-4 rounded-full', swatch.accent)} />
                  <div className={cn('absolute bottom-2 left-2 h-3 w-10 rounded', swatch.card, 'opacity-90')} />
                </div>
                {/* Label + check */}
                <div className="flex items-center justify-between px-1">
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                  {isActive && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <Section title="About">
        <Card>
          <div className="flex items-start gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M4 7l8-4 8 4-8 4-8-4z" />
                <path d="M4 12l8 4 8-4" />
                <path d="M4 17l8 4 8-4" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-foreground">
                Agent Box
              </h3>
              <p className="text-xs text-muted-foreground">v0.5.0</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Multi-agent configuration and session management. Isolate,
                launch, and switch between agent profiles with ease.
              </p>
            </div>
          </div>
        </Card>
      </Section>
    </div>
  )
}

// ── Section ────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}