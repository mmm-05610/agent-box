/**
 * Meta Editor — editable display_name + description, with read-only identity
 * (name, agent type, provider, preset) and a collapsible Paths panel.
 *
 * State sync note: this component is mounted with `key={refreshKey}` in
 * detail.tsx's TabContent, so a refresh fully remounts it and re-initializes
 * internal state from the latest `detail` prop.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui'
import { Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { editProfile } from '@/api'
import type { ProfileDetail } from '../detail'

export function MetaEditor({ detail, onRefresh }: { detail: ProfileDetail; onRefresh: () => void }) {
  const { t } = useTranslation()
  const { meta } = detail
  const [displayName, setDisplayName] = useState(meta.display_name ?? '')
  const [description, setDescription] = useState(meta.description ?? '')
  const [saving, setSaving] = useState(false)
  const [pathsOpen, setPathsOpen] = useState(false)
  const { toast } = useToast()

  // Belt-and-braces sync: re-sync state if `detail` updates under us
  // (e.g. parent passed a new detail object without remounting via key).
  useEffect(() => {
    setDisplayName(meta.display_name ?? '')
    setDescription(meta.description ?? '')
  }, [meta.display_name, meta.description])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await editProfile(meta.name, { displayName, description })
      onRefresh()
      toast({ type: 'success', message: t('meta.toast.saved') })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('meta.toast.failed') })
    } finally {
      setSaving(false)
    }
  }, [meta.name, displayName, description, onRefresh, toast])

  const isDirty =
    displayName !== (meta.display_name ?? '') ||
    description !== (meta.description ?? '')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('meta.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('meta.subtitle')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Identity — read-only */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label={t('meta.name')} value={meta.name} mono />
            <ReadOnlyField label={t('meta.agentType')} value={meta.agent_type} />
          </div>

          {/* Editable friendly fields */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('meta.displayName')}
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('meta.displayNamePlaceholder')}
                className="text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('meta.description')}
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('meta.descriptionPlaceholder')}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>

          {/* Library references */}
          {(meta.provider || meta.preset) && (
            <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
              {meta.provider && <ReadOnlyField label={t('meta.provider')} value={meta.provider} mono />}
              {meta.preset && <ReadOnlyField label={t('meta.preset')} value={meta.preset} mono />}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? t('common.saving') : t('meta.saveChanges')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PathsCard
        profilePath={detail.path}
        configDir={detail.config_dir}
        open={pathsOpen}
        onToggle={() => setPathsOpen((v) => !v)}
      />
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <div className={`text-sm text-foreground ${mono ? 'font-mono' : ''} truncate`} title={value}>
        {value}
      </div>
    </div>
  )
}

function PathsCard({
  profilePath, configDir, open, onToggle,
}: {
  profilePath: string
  configDir: string
  open: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-medium text-foreground">{t('meta.paths')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('meta.pathsDesc')}
            </p>
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          <PathRow label={t('meta.pathProfile')} path={profilePath} />
          <PathRow label={t('meta.pathConfig')} path={configDir} />
        </div>
      )}
    </Card>
  )
}

function PathRow({ label, path }: { label: string; path: string }) {
  const { t } = useTranslation()
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Clipboard unavailable (e.g. insecure context); silently ignore.
    }
  }
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
      <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90" title={path}>
        {path}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t('meta.copyPath', { label })}
        title={t('meta.copyToClipboard')}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      </button>
    </div>
  )
}
