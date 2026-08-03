/**
 * Permissions — block-driven config editor.
 *
 * Reads/writes the agent's permission config for the given profile. The
 * editing surface is driven entirely by the backend registry's
 * `resources.permissions.blocks` (rule_groups / select / toggle_list /
 * tool_matrix / raw_editor) and `config_key` — nothing about any specific
 * agent's permission schema is hardcoded here.
 *
 * Parsing/serialization use open-source libraries: yaml for .yaml/.yml,
 * smol-toml for .toml, JSON (with a JSONC-tolerant read) for .json/.jsonc.
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
  CodeEditor,
  Input,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { readFile, saveFile } from '@/api/files'
import type { AgentType } from '@/api'
import { useAgentConfigs, useProfileConfigDir } from '@/hooks'
import {
  blockFieldPath,
  editorLanguage,
  getFieldAt,
  inferFormat,
  joinRule,
  parseConfig,
  setFieldAt,
  splitRule,
  stringifyConfig,
  type PermissionBlock,
  type PermissionsResource,
} from './codec'

// ── Block editors ──────────────────────────────────────────────────────

function CountChip({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
      {count}
    </span>
  )
}

function RuleGroupsBlock({
  block,
  doc,
  configKey,
  configKeyIsField,
  onFieldChange,
}: {
  block: PermissionBlock
  doc: Record<string, unknown>
  configKey: string
  configKeyIsField: boolean
  onFieldChange: (path: string, value: unknown) => void
}) {
  const { t } = useTranslation()
  const [pendingRemove, setPendingRemove] = useState<{ group: string; rule: string } | null>(null)
  const ruleFormat = block.rule_format ?? ''
  const suggestedTools = block.suggested_tools ?? []

  const confirmRemove = useCallback(() => {
    if (!pendingRemove) return
    const path = blockFieldPath(doc, configKey, pendingRemove.group, configKeyIsField)
    const rules = getFieldAt(doc, path)
    if (Array.isArray(rules)) {
      onFieldChange(path, rules.filter((rule) => rule !== pendingRemove.rule))
    }
    setPendingRemove(null)
  }, [pendingRemove, doc, configKey, configKeyIsField, onFieldChange])

  return (
    <>
      <div className="space-y-4">
        {(block.groups ?? []).map((group) => {
          const path = blockFieldPath(doc, configKey, group, configKeyIsField)
          const rules = Array.isArray(getFieldAt(doc, path)) ? (getFieldAt(doc, path) as string[]) : []
          return (
            <RuleGroupCard
              key={group}
              group={group}
              ruleFormat={ruleFormat}
              suggestedTools={suggestedTools}
              rules={rules}
              onAdd={(tool, pattern) => onFieldChange(path, [...rules, joinRule(tool, pattern, ruleFormat)])}
              onRemove={(rule) => setPendingRemove({ group, rule })}
            />
          )
        })}
      </div>
      <ConfirmDialog
        open={pendingRemove != null}
        title={t('permissions.confirmRemoveTitle')}
        description={pendingRemove
          ? t('permissions.confirmRemoveDesc', { rule: pendingRemove.rule, group: pendingRemove.group })
          : undefined}
        confirmLabel={t('common.remove')}
        onConfirm={confirmRemove}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  )
}

function RuleGroupCard({
  group,
  ruleFormat,
  suggestedTools,
  rules,
  onAdd,
  onRemove,
}: {
  group: string
  ruleFormat: string
  suggestedTools: string[]
  rules: string[]
  onAdd: (tool: string, pattern: string) => void
  onRemove: (rule: string) => void
}) {
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
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-mono text-sm font-semibold uppercase text-primary"
          aria-hidden="true"
        >
          {group.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-mono font-medium text-foreground">{group}</h4>
            <CountChip count={rules.length} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('permissions.groupRulesHint')}
          </p>
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
            <RuleRow key={rule} rule={rule} ruleFormat={ruleFormat} onRemove={() => onRemove(rule)} />
          ))}
        </ul>
      )}

      {rules.length === 0 && !adding && (
        <p className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
          {t('permissions.noGroupRules', { group })}
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
              {suggestedTools.map((suggested) => <option key={suggested} value={suggested} />)}
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

function RuleRow({ rule, ruleFormat, onRemove }: { rule: string; ruleFormat: string; onRemove: () => void }) {
  const { t } = useTranslation()
  const { tool, pattern } = splitRule(rule, ruleFormat)
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

function SelectBlock({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: unknown
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const current = typeof value === 'string' ? value : ''
  const isKnown = options.includes(current)
  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-mono font-medium text-foreground">{label}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('permissions.selectFieldDesc')}
          </p>
        </div>
        <select
          aria-label={label}
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground focus:outline-none focus:border-foreground/30 hover:border-foreground/20"
        >
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          {!isKnown && current !== '' && (
            <option value={current}>{t('permissions.customValue', { value: current })}</option>
          )}
        </select>
      </div>
    </Card>
  )
}

function ToggleListBlock({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: string[]
  value: unknown
  onChange: (value: string[]) => void
}) {
  const { t } = useTranslation()
  const enabled = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  const toggle = (item: string) => {
    onChange(enabled.includes(item) ? enabled.filter((entry) => entry !== item) : [...enabled, item])
  }
  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <rect x="2" y="6" width="14" height="12" rx="6" />
            <circle cx="16" cy="12" r="6" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-mono font-medium text-foreground">{label}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('permissions.toggleListDesc')}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border/40 border-t border-border/60">
        {items.map((item) => {
          const checked = enabled.includes(item)
          return (
            <li key={item}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground/90">{item}</code>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                    checked
                      ? 'bg-success-subtle text-success ring-success/20'
                      : 'bg-muted text-muted-foreground ring-border'
                  }`}
                >
                  {checked ? t('common.enabled') : t('common.disabled')}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function ToolMatrixBlock({
  label,
  tools,
  values,
  value,
  onChange,
}: {
  label: string
  tools: string[]
  values: string[]
  value: unknown
  onChange: (value: Record<string, string>) => void
}) {
  const { t } = useTranslation()
  const matrix = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {}
  return (
    <Card elevation="flat" className="ring-1 ring-border/60">
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-mono font-medium text-foreground">{label}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('permissions.toolMatrixDesc')}
          </p>
        </div>
      </div>
      <div className="overflow-x-auto border-t border-border/60">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-semibold">{t('permissions.toolColumn')}</th>
              {values.map((entry) => (
                <th key={entry} className="px-4 py-2 text-center font-semibold">{entry}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {tools.map((tool) => {
              const current = matrix[tool]
              return (
                <tr key={tool} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs text-foreground/90">{tool}</td>
                  {values.map((entry) => {
                    const active = current === entry
                    return (
                      <td key={entry} className="px-4 py-2 text-center">
                        <button
                          type="button"
                          aria-label={`${tool}: ${entry}`}
                          aria-pressed={active}
                          onClick={() => onChange({ ...matrix, [tool]: entry })}
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {active ? '✓' : ''}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function RawEditorBlock({
  label,
  language,
  open,
  text,
  onToggle,
  onTextChange,
}: {
  label: string
  language: 'json' | 'yaml' | 'toml'
  open: boolean
  text: string
  onToggle: () => void
  onTextChange: (value: string) => void
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
            <h4 className="text-sm font-medium text-foreground">{label}</h4>
            <p className="text-xs text-muted-foreground">
              {t('permissions.editRawDescFull')}
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
        <div className="border-t border-border/60 px-4 py-3">
          <div className="overflow-hidden rounded-md ring-1 ring-border/60">
            <CodeEditor
              language={language}
              value={text}
              onChange={onTextChange}
              height={320}
              ariaLabel={label}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export function PermissionsList({ profileName, agentType }: { profileName: string; agentType?: AgentType }) {
  const { t } = useTranslation()
  const configDir = useProfileConfigDir(profileName)
  // Resource metadata (config_file / config_key / blocks) from the backend
  // registry — the frontend hardcodes no agent permission schema.
  const { agentConfigs } = useAgentConfigs()
  const permRes = agentType
    ? (agentConfigs?.[agentType]?.resources?.permissions as PermissionsResource | undefined)
    : undefined
  const configFile = permRes?.config_file
  const configKey = permRes?.config_key ?? ''
  const blocks = permRes?.blocks ?? []
  const format = inferFormat(configFile)
  const language = editorLanguage(format)
  const configKeyIsField = blocks.some((block) => block.field !== undefined && block.field === configKey)
  const hasRawEditor = blocks.some((block) => block.type === 'raw_editor')
  const path = configDir === null || !configFile ? null : `${configDir}/${configFile}`

  const [rawText, setRawText] = useState('')
  const [doc, setDoc] = useState<Record<string, unknown>>({})
  const [parseFailed, setParseFailed] = useState(false)
  const [rawDirty, setRawDirty] = useState(false)
  const [rawOpen, setRawOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useToast()

  // Self-fetch the permission config for the profile.
  useEffect(() => {
    if (!path) return
    let cancelled = false
    readFile(path)
      .then((raw) => {
        if (cancelled) return
        const parsed = parseConfig(raw, format)
        setRawText(raw)
        setRawDirty(false)
        setRawOpen(false)
        setParseFailed(parsed === null)
        setDoc(parsed ?? {})
      })
      .catch(() => {
        if (cancelled) return
        setRawText('')
        setRawDirty(false)
        setRawOpen(false)
        setParseFailed(false)
        setDoc({})
      })
    return () => { cancelled = true }
  }, [path, format, refreshKey])

  const updateField = useCallback((fieldPath: string, value: unknown) => {
    setDoc((current) => {
      const next = structuredClone(current)
      setFieldAt(next, fieldPath, value)
      return next
    })
  }, [])

  const toggleRaw = useCallback(() => {
    if (rawOpen) {
      // Commit raw text back into the structured doc; invalid text stays
      // in the editor so nothing is lost.
      const parsed = parseConfig(rawText, format)
      if (parsed === null) {
        toast({ type: 'error', message: t('permissions.toast.invalidRaw') })
        return
      }
      setDoc(parsed)
      setParseFailed(false)
      setRawDirty(false)
      setRawOpen(false)
    } else {
      // Keep the original text when parsing failed — never overwrite it
      // with an empty structured draft.
      if (!rawDirty && !parseFailed) setRawText(stringifyConfig(doc, format))
      setRawOpen(true)
    }
  }, [rawOpen, rawText, format, doc, rawDirty, parseFailed, toast])

  const handleSave = useCallback(async () => {
    if (!path) return
    setSaving(true)
    try {
      const next = rawDirty ? rawText : stringifyConfig(doc, format)
      const ok = await saveFile(path, next)
      if (!ok) throw new Error(t('permissions.toast.failed'))
      setRefreshKey((k) => k + 1)
      toast({ type: 'success', message: t('permissions.toast.saved') })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('permissions.toast.failed') })
    } finally {
      setSaving(false)
    }
  }, [path, rawDirty, rawText, doc, format, toast])

  // Rule count for the header — only meaningful when a rule_groups block exists.
  const ruleCount = useMemo(() => {
    let total = 0
    for (const block of blocks) {
      if (block.type !== 'rule_groups') continue
      for (const group of block.groups ?? []) {
        const rules = getFieldAt(doc, blockFieldPath(doc, configKey, group, configKeyIsField))
        if (Array.isArray(rules)) total += rules.length
      }
    }
    return total
  }, [blocks, doc, configKey, configKeyIsField])
  const showRulesCount = blocks.some((block) => block.type === 'rule_groups')

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('permissions.title')}
          {showRulesCount && (
            <span className="text-muted-foreground font-normal">
              {' '}{t('permissions.rulesCount', { count: ruleCount })}
            </span>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('permissions.subtitle')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!path ? (
          <p className="text-sm text-muted-foreground">
            {t('permissions.noConfig')}
          </p>
        ) : parseFailed ? (
          <>
            <div className="rounded-lg bg-warning-subtle p-4 text-sm text-foreground ring-1 ring-warning/20">
              {t('permissions.parseError', { file: configFile ?? '', format })}
            </div>
            {hasRawEditor && (
              <RawEditorBlock
                label={blocks.find((block) => block.type === 'raw_editor')?.label ?? t('permissions.editRaw')}
                language={language}
                open={rawOpen}
                text={rawText}
                onToggle={toggleRaw}
                onTextChange={(value) => { setRawText(value); setRawDirty(true) }}
              />
            )}
          </>
        ) : blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('permissions.noBlocks')}
          </p>
        ) : (
          blocks.map((block, index) => {
            if (block.type === 'rule_groups') {
              return (
                <RuleGroupsBlock
                  key={index}
                  block={block}
                  doc={doc}
                  configKey={configKey}
                  configKeyIsField={configKeyIsField}
                  onFieldChange={updateField}
                />
              )
            }
            if (block.type === 'select') {
              const fieldPath = blockFieldPath(doc, configKey, block.field, configKeyIsField)
              return (
                <SelectBlock
                  key={index}
                  label={block.field ?? configKey}
                  options={block.options ?? []}
                  value={getFieldAt(doc, fieldPath)}
                  onChange={(value) => updateField(fieldPath, value)}
                />
              )
            }
            if (block.type === 'toggle_list') {
              const fieldPath = blockFieldPath(doc, configKey, block.field, configKeyIsField)
              return (
                <ToggleListBlock
                  key={index}
                  label={block.field ?? configKey}
                  items={block.items ?? []}
                  value={getFieldAt(doc, fieldPath)}
                  onChange={(value) => updateField(fieldPath, value)}
                />
              )
            }
            if (block.type === 'tool_matrix') {
              return (
                <ToolMatrixBlock
                  key={index}
                  label={configKey}
                  tools={block.tools ?? []}
                  values={block.values ?? []}
                  value={getFieldAt(doc, configKey)}
                  onChange={(value) => updateField(configKey, value)}
                />
              )
            }
            // raw_editor — whole-file Monaco editor
            return (
              <RawEditorBlock
                key={index}
                label={block.label ?? t('permissions.editRaw')}
                language={language}
                open={rawOpen}
                text={rawText}
                onToggle={toggleRaw}
                onTextChange={(value) => { setRawText(value); setRawDirty(true) }}
              />
            )
          })
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving || !path || (parseFailed && !rawDirty)}>
            {saving ? t('common.saving') : t('permissions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
