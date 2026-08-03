/**
 * Settings Page — Theme, projects directory, app info
 *
 * Three sections with clear visual separators. Theme picker uses
 * preview swatches instead of just glyphs.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { cn } from '@/lib/utils'
import { browseDir } from '@/api'
import { readSettings, writeSettings, type Theme } from '@/lib/settings'
import { LANG_KEY, readStoredLanguage, type UILanguage } from '@/i18n'
import { useDefaultProjectsDir, useVersion } from '@/hooks'

// ── Helpers ────────────────────────────────────────────────────────────

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

// ── Theme preview definitions ────────────────────────────────────────────

const themeOptions: {
  value: Theme
  labelKey: string
  swatch: { bg: string; fg: string; accent: string; card: string }
}[] = [
  {
    value: 'system',
    labelKey: 'settings.theme.system',
    swatch: {
      bg: 'bg-gradient-to-br from-white to-stone-100',
      fg: 'bg-stone-900',
      accent: 'bg-accent',
      card: 'bg-white',
    },
  },
  {
    value: 'light',
    labelKey: 'settings.theme.light',
    swatch: {
      bg: 'bg-stone-50',
      fg: 'bg-stone-900',
      accent: 'bg-accent',
      card: 'bg-white',
    },
  },
  {
    value: 'dark',
    labelKey: 'settings.theme.dark',
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
  const { t, i18n } = useTranslation()
  const version = useVersion()
  const { toast } = useToast()
  const [theme, setTheme] = useState<Theme>(() => readSettings().theme)
  const [language, setLanguage] = useState<UILanguage>(() => readStoredLanguage())
  const [projectsDir, setProjectsDir] = useState(() => readSettings().projects_dir)
  // Backend-served default (config.default_projects_dir) — fills in only
  // when the user has no saved path.
  const defaultProjectsDir = useDefaultProjectsDir()
  useEffect(() => {
    if (!projectsDir && defaultProjectsDir) setProjectsDir(defaultProjectsDir)
  }, [projectsDir, defaultProjectsDir])

  useEffect(() => {
    applyTheme(theme)
    writeSettings({ theme })
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const handleLanguageChange = (next: UILanguage) => {
    setLanguage(next)
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      // localStorage unavailable — the change still applies for this session.
    }
    if (next === 'en') void i18n.changeLanguage('en')
    else void i18n.changeLanguage('zh')
  }

  const handleBrowse = async () => {
    try {
      const dir = await browseDir(projectsDir)
      if (dir) {
        setProjectsDir(dir)
        writeSettings({ projects_dir: dir })
        toast({ type: 'success', message: t('settings.toast.dirUpdated') })
      }
    } catch {
      toast({ type: 'error', message: t('settings.toast.dirFailed') })
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      {/* Header */}
      <PageHeader
        title={t('settings.title')}
        stats={
          <>
            {version && (
              <>
                <span className="font-mono">{`v${version}`}</span>
                <span className="mx-2 text-border">·</span>
              </>
            )}
            <span>{t('settings.stats.pathSaved')}</span>
            <span className="mx-2 text-border">·</span>
            <span>{t('settings.stats.lastBuild')}</span>
          </>
        }
        className="mb-8"
      />

      {/* ── Projects Directory ─────────────────────────────────────── */}
      <Section title={t('settings.section.projects')}>
        <Card>
          <div className="p-5">
            <p className="mb-3 text-sm text-muted-foreground">
              {t('settings.projectsDesc')}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 rounded-lg bg-muted/40 px-3.5 py-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-muted-foreground shrink-0">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                <span className="text-sm font-mono text-foreground truncate">
                  {projectsDir || t('settings.noDir')}
                </span>
              </div>
              <Button
                variant="outline"
                size="md"
                onClick={handleBrowse}
              >
                {t('settings.changeFolder')}
              </Button>
            </div>
          </div>
        </Card>
      </Section>

      {/* ── Appearance ──────────────────────────────────────────────── */}
      <Section title={t('settings.section.appearance')} description={t('settings.appearanceDesc')}>
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(({ value, labelKey, swatch }) => {
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
                    {t(labelKey)}
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

      {/* ── Language ────────────────────────────────────────────────── */}
      <Section title={t('settings.section.language')} description={t('settings.languageDesc')}>
        <Card>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'zh', labelKey: 'settings.language.zh' },
                { value: 'en', labelKey: 'settings.language.en' },
                { value: 'system', labelKey: 'settings.language.system' },
              ] as { value: UILanguage; labelKey: string }[]).map(({ value, labelKey }) => {
                const isActive = language === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleLanguageChange(value)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all',
                      isActive
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                    )}
                  >
                    {t(labelKey)}
                    {isActive && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-2.5 w-2.5">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </Card>
      </Section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <Section title={t('settings.section.about')}>
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
              <p className="text-xs text-muted-foreground">{version ? `v${version}` : ''}</p>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {t('settings.aboutDesc')}
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
