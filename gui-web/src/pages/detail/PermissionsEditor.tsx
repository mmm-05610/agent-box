/**
 * Permissions Editor — structured allow/deny/ask rule editor.
 *
 * Reads/writes settings.json → permissions key.
 *
 * Two modes:
 *   - Visual (default): three rule groups (allow/deny/ask) with per-group cards,
 *     a defaultMode selector, and an inline add-rule form per group.
 *   - Raw (collapsed): line-based textarea accepting `allow: Bash(npm run *)`.
 *
 * Both modes stay in sync — raw edits are parsed back into visual cards on close.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { patchJsonFile } from '@/api/files'

type RuleGroup = 'allow' | 'deny' | 'ask'

interface Permissions {
  allow?: string[]
  deny?: string[]
  ask?: string[]
  defaultMode?: string
}

const RULE_GROUPS: { key: RuleGroup; labelKey: string; descriptionKey: string; accent: string }[] = [
  {
    key: 'allow',
    labelKey: 'permissions.group.allow',
    descriptionKey: 'permissions.group.allowDesc',
    accent: 'text-success bg-success-subtle ring-success/20',
  },
  {
    key: 'deny',
    labelKey: 'permissions.group.deny',
    descriptionKey: 'permissions.group.denyDesc',
    accent: 'text-destructive bg-destructive-subtle ring-destructive/20',
  },
  {
    key: 'ask',
    labelKey: 'permissions.group.ask',
    descriptionKey: 'permissions.group.askDesc',
    accent: 'text-warning bg-warning-subtle ring-warning/20',
  },
]

const DEFAULT_MODES = ['default', 'accept-edits', 'bypass-permissions', 'plan'] as const
const COMMON_TOOLS = [
  'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'Skill', 'Agent', 'NotebookEdit',
] as const

const RULE_REGEX = /^(\w+)\((.+)\)$/

function parse(content: string): Permissions {
  try { return JSON.parse(content)?.permissions ?? {} } catch { return {} }
}

function splitRule(rule: string): { tool: string | null; pattern: string } {
  const match = rule.match(RULE_REGEX)
  if (match) return { tool: match[1], pattern: match[2] }
  return { tool: null, pattern: rule }
}

function joinRule(tool: string, pattern: string): string {
  if (!tool) return pattern
  return `${tool}(${pattern})`
}

function parseRawRules(text: string): Pick<Permissions, 'allow' | 'deny' | 'ask'> {
  const out: Record<RuleGroup, string[]> = { allow: [], deny: [], ask: [] }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(allow|deny|ask):\s*(.+)$/i)
    if (!match) continue
    const group = match[1].toLowerCase() as RuleGroup
    const rule = match[2].trim()
    if (rule) out[group].push(rule)
  }
  return out
}

function rulesToRawText(rules: Record<RuleGroup, string[]>): string {
  return RULE_GROUPS
    .flatMap(({ key }) => rules[key].map((r) => `${key}: ${r}`))
    .join('\n')
}

// ── Visual primitives ──────────────────────────────────────────────────

function CountChip({ count, accent }: { count: number; accent: string }) {
  return (
    <span
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ring-1 ring-inset ${accent}`}
    >
      {count}
    </span>
  )
}

function GroupIcon({ group }: { group: RuleGroup }) {
  const stroke = group === 'allow'
    ? 'text-success'
    : group === 'deny'
      ? 'text-destructive'
      : 'text-warning'
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ${stroke}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        {group === 'allow' && <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />}
        {group === 'deny' && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M5.5 5.5l13 13" strokeLinecap="round" />
          </>
        )}
        {group === 'ask' && (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5" strokeLinecap="round" />
            <circle cx="12" cy="17" r="0.5" fill="currentColor" />
          </>
        )}
      </svg>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export function PermissionsEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const { t } = useTranslation()
  const initial = useMemo(() => parse(content), [content])

  const [allow, setAllow] = useState<string[]>(initial.allow ?? [])
  const [deny, setDeny] = useState<string[]>(initial.deny ?? [])
  const [ask, setAsk] = useState<string[]>(initial.ask ?? [])
  const [defaultMode, setDefaultMode] = useState<string>(initial.defaultMode ?? 'default')

  const [rawOpen, setRawOpen] = useState(false)
  const [rawText, setRawText] = useState(() => rulesToRawText({ allow, deny, ask }))

  const [saving, setSaving] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ group: RuleGroup; rule: string } | null>(null)
  const { toast } = useToast()

  // Re-sync from content when it changes externally (e.g. onRefresh invalidation).
  useEffect(() => {
    setAllow(initial.allow ?? [])
    setDeny(initial.deny ?? [])
    setAsk(initial.ask ?? [])
    setDefaultMode(initial.defaultMode ?? 'default')
  }, [initial.allow, initial.deny, initial.ask, initial.defaultMode])

  // Keep raw text mirrored with structured state on initial load and structural changes.
  useEffect(() => {
    setRawText(rulesToRawText({ allow, deny, ask }))
  }, [allow, deny, ask])

  const ruleGroups = useMemo<Record<RuleGroup, string[]>>(
    () => ({ allow, deny, ask }),
    [allow, deny, ask],
  )

  const setRuleGroup = useCallback((group: RuleGroup, next: string[]) => {
    if (group === 'allow') setAllow(next)
    else if (group === 'deny') setDeny(next)
    else setAsk(next)
  }, [])

  const confirmRemove = useCallback(() => {
    if (!pendingRemove) return
    const { group, rule } = pendingRemove
    setRuleGroup(group, ruleGroups[group].filter((r) => r !== rule))
    setPendingRemove(null)
  }, [pendingRemove, ruleGroups, setRuleGroup])

  const closeRawPanel = useCallback(() => {
    const parsed = parseRawRules(rawText)
    setAllow(parsed.allow ?? [])
    setDeny(parsed.deny ?? [])
    setAsk(parsed.ask ?? [])
    setRawOpen(false)
  }, [rawText])

  const toggleRaw = useCallback(() => {
    if (rawOpen) closeRawPanel()
    else setRawOpen(true)
  }, [rawOpen, closeRawPanel])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await patchJsonFile(path, 'permissions', { allow, deny, ask, defaultMode })
      onRefresh()
      toast({ type: 'success', message: t('permissions.toast.saved') })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('permissions.toast.failed') })
    } finally {
      setSaving(false)
    }
  }, [path, allow, deny, ask, defaultMode, onRefresh, toast])

  const totalRules = allow.length + deny.length + ask.length

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('permissions.title')}{' '}
          <span className="text-muted-foreground font-normal">{t('permissions.rulesCount', { count: totalRules })}</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('permissions.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalRules === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('permissions.noRules')}
          </p>
        )}

        {RULE_GROUPS.map(({ key, labelKey, descriptionKey, accent }) => (
          <RuleGroupCard
            key={key}
            group={key}
            label={t(labelKey)}
            description={t(descriptionKey)}
            accent={accent}
            rules={ruleGroups[key]}
            onAdd={(tool, pattern) => {
              const next = [...ruleGroups[key], joinRule(tool, pattern)]
              setRuleGroup(key, next)
            }}
            onRemove={(rule) => setPendingRemove({ group: key, rule })}
          />
        ))}

        <DefaultModeCard value={defaultMode} onChange={setDefaultMode} />

        <RawEditorPanel
          open={rawOpen}
          text={rawText}
          onTextChange={setRawText}
          onToggle={toggleRaw}
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('common.saving') : t('permissions.save')}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={pendingRemove != null}
        title={t('permissions.confirmRemoveTitle')}
        description={pendingRemove ? t('permissions.confirmRemoveDesc', {
          rule: pendingRemove.rule,
          group: t(RULE_GROUPS.find((g) => g.key === pendingRemove.group)?.labelKey ?? 'permissions.group.allow'),
        }) : undefined}
        confirmLabel={t('common.remove')}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </Card>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

interface RuleGroupCardProps {
  group: RuleGroup
  label: string
  description: string
  accent: string
  rules: string[]
  onAdd: (tool: string, pattern: string) => void
  onRemove: (rule: string) => void
}

function RuleGroupCard({ group, label, description, accent, rules, onAdd, onRemove }: RuleGroupCardProps) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [tool, setTool] = useState('')
  const [pattern, setPattern] = useState('')

  const submit = () => {
    if (!pattern.trim()) return
    onAdd(tool, pattern)
    setTool('')
    setPattern('')
    setAdding(false)
  }

  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4">
        <GroupIcon group={group} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-medium text-foreground">{label}</h4>
            <CountChip count={rules.length} accent={accent} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {!adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            {t('permissions.addRule')}
          </Button>
        )}
      </div>

      {rules.length > 0 && (
        <ul className="divide-y divide-border/40 border-t border-border/60">
          {rules.map((rule) => (
            <RuleRow key={rule} rule={rule} onRemove={() => onRemove(rule)} />
          ))}
        </ul>
      )}

      {rules.length === 0 && !adding && (
        <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
          {t('permissions.noGroupRules', { group: label })}
        </p>
      )}

      {adding && (
        <div className="border-t border-border/60 bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              size="sm"
              list={`${group}-tools`}
              placeholder={t('permissions.toolOptional')}
              value={tool}
              onChange={(e) => setTool(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              className="w-40 font-mono"
            />
            <datalist id={`${group}-tools`}>
              {COMMON_TOOLS.map((t) => <option key={t} value={t} />)}
            </datalist>
            <span className="font-mono text-sm text-muted-foreground">(</span>
            <Input
              size="sm"
              placeholder={t('permissions.patternExample')}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              className="min-w-[200px] flex-1 font-mono"
              autoFocus
            />
            <span className="font-mono text-sm text-muted-foreground">)</span>
            <Button size="sm" onClick={submit} disabled={!pattern.trim()}>
              {t('common.add')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setTool(''); setPattern('') }}>
              {t('common.cancel')}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('permissions.enterHintPrefix')}{' '}
            <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px]">Enter</kbd>{' '}
            {t('permissions.enterHintSuffix')}
          </p>
        </div>
      )}
    </Card>
  )
}

function RuleRow({ rule, onRemove }: { rule: string; onRemove: () => void }) {
  const { t } = useTranslation()
  const { tool, pattern } = splitRule(rule)
  return (
    <li className="group flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/40">
      <div className="min-w-0 flex-1">
        {tool ? (
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-medium text-primary">
              {tool}
            </span>
            <code className="truncate font-mono text-xs text-foreground/90" title={pattern}>
              {pattern}
            </code>
          </div>
        ) : (
          <code className="font-mono text-xs text-foreground/90" title={rule}>
            {rule}
          </code>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('permissions.removeRule', { rule })}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}

function DefaultModeCard({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  const isKnown = DEFAULT_MODES.includes(value as typeof DEFAULT_MODES[number])
  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-foreground">defaultMode</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('permissions.defaultModeDesc')}
          </p>
        </div>
        <select
          aria-label="defaultMode"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:border-foreground/30 hover:border-foreground/20"
        >
          {DEFAULT_MODES.map((mode) => (
            <option key={mode} value={mode}>{mode}</option>
          ))}
          {!isKnown && <option value={value}>{t('permissions.customMode', { value })}</option>}
        </select>
      </div>
    </Card>
  )
}

function RawEditorPanel({
  open,
  text,
  onTextChange,
  onToggle,
}: {
  open: boolean
  text: string
  onTextChange: (next: string) => void
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
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-medium text-foreground">{t('permissions.editRaw')}</h4>
            <p className="text-xs text-muted-foreground">
              {t('permissions.editRawDescPrefix')}{' '}
              <code className="font-mono">group: tool(pattern)</code>{' '}
              {t('permissions.editRawDescSuffix')}
            </p>
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border/60 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            {t('permissions.editRawHint')}
          </p>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border bg-input p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30"
            placeholder={t('permissions.rawPlaceholder')}
          />
        </div>
      )}
    </Card>
  )
}
