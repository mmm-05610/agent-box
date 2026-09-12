// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { getAutomationBlueprints, getCronDeliveryTargets, getCronJobRuns } from '@/api/cron'
import {
  PanelAction,
  PanelBlock,
  PanelDetail,
  PanelListRow,
  type PanelMenuItem,
  PanelMeta,
  PanelPill,
  PanelSectionLabel
} from '@/app/shell/layers/overlays/panel'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Field, FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type Translations, useI18n } from '@/i18n'
import { AlertTriangle } from '@/lib/icons'
import { requestModelOptions } from '@/lib/model-options'
import { $changeEventsAvailable, $cronChangeTick } from '@/store/live-sync'
import { type AutomationBlueprint, type CronDeliveryTarget, type CronJob, type SessionInfo } from '@/types/hermes'

import { BlueprintSlotControl, blueprintSlotHelp, cleanBlueprintFieldError, initialBlueprintValues } from './blueprints'
import {
  jobIsScriptOnly,
  parseCronDeliveryTargets,
  toggleCronDeliveryTarget,
  validateCronEditor
} from './cron-job-model'
import { jobState, jobTitle, STATE_DOT } from './job-state'
import {
  DEFAULT_DELIVER,
  formatTime,
  jobDeliver,
  jobModel,
  jobName,
  jobPrompt,
  jobProvider,
  jobScheduleDisplay,
  jobScheduleExpr,
  SCHEDULE_OPTIONS,
  scheduleOptionForExpr,
  scheduleSummary,
  STATE_TONE,
} from './view-model'

export const MODEL_DEFAULT_VALUE = '__default__'

export const CUSTOM_TEMPLATE = 'custom'

export function CronJobListRow({
  active,
  job,
  menuItems,
  menuLabel,
  onSelect
}: {
  active: boolean
  job: CronJob
  menuItems?: PanelMenuItem[]
  menuLabel?: string
  onSelect: () => void
}) {
  const state = jobState(job)

  return (
    <PanelListRow
      active={active}
      dotClassName={STATE_DOT[state] ?? 'bg-muted-foreground'}
      menuItems={menuItems}
      menuLabel={menuLabel}
      onSelect={onSelect}
      rowKey={job.id}
      title={jobTitle(job)}
    />
  )
}

export function CronJobDetail({
  busy,
  c,
  job,
  onOpenSession,
  onPauseResume,
  onTrigger
}: {
  busy: boolean
  c: Translations['cron']
  job: CronJob
  onOpenSession?: (sessionId: string) => void
  onPauseResume: () => void
  onTrigger: () => void
}) {
  const state = jobState(job)
  const isPaused = state === 'paused'
  const deliver = jobDeliver(job)
  const prompt = jobPrompt(job)
  const modelOverride = jobModel(job)

  return (
    <PanelDetail>
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-[0.95rem] font-semibold tracking-tight text-foreground">{jobTitle(job)}</h3>
            <PanelPill tone={STATE_TONE[state] ?? 'muted'}>{c.states[state] ?? state}</PanelPill>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <PanelAction disabled={busy} icon={isPaused ? 'play' : 'debug-pause'} onClick={onPauseResume}>
              {isPaused ? c.resumeTitle : c.pauseTitle}
            </PanelAction>
            <PanelAction disabled={busy} icon="zap" onClick={onTrigger} primary>
              {c.triggerNow}
            </PanelAction>
          </div>
        </div>

        <PanelMeta
          rows={[
            { label: c.frequencyLabel, value: jobScheduleDisplay(job) },
            { label: c.last.replace(/:$/, ''), value: formatTime(job.last_run_at) },
            { label: c.next.replace(/:$/, ''), value: formatTime(job.next_run_at) },
            { label: c.deliverLabel, value: c.deliveryLabels[deliver] ?? deliver },
            ...(modelOverride ? [{ label: c.modelLabel, value: modelOverride }] : [])
          ]}
        />

        {job.last_error ? (
          <div className="flex items-start gap-1.5 rounded bg-destructive/10 p-2 text-[0.7rem] text-destructive">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span className="min-w-0 break-words">{job.last_error}</span>
          </div>
        ) : null}
      </header>

      {prompt ? (
        <section className="space-y-1.5">
          <PanelSectionLabel>{c.promptLabel}</PanelSectionLabel>
          <PanelBlock>{prompt}</PanelBlock>
        </section>
      ) : null}

      <CronJobRuns c={c} jobId={job.id} onOpenSession={onOpenSession} />
    </PanelDetail>
  )
}

export function formatRunTime(seconds?: null | number): string {
  if (!seconds) {
    return '—'
  }

  const date = new Date(seconds * 1000)

  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString()
}

export const RUNS_POLL_INTERVAL_MS = 8000

export const RUNS_BACKSTOP_INTERVAL_MS = 60_000

export function CronJobRuns({
  c,
  jobId,
  onOpenSession
}: {
  c: Translations['cron']
  jobId: string
  onOpenSession?: (sessionId: string) => void
}) {
  const [runs, setRuns] = useState<null | SessionInfo[]>(null)
  const changeEventsAvailable = useStore($changeEventsAvailable)
  const cronChangeTick = useStore($cronChangeTick)

  useEffect(() => {
    let cancelled = false

    const load = () =>
      getCronJobRuns(jobId)
        .then(result => {
          if (!cancelled) {
            setRuns(result)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setRuns(prev => prev ?? [])
          }
        })

    void load()

    const intervalId = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') {
          void load()
        }
      },
      changeEventsAvailable ? RUNS_BACKSTOP_INTERVAL_MS : RUNS_POLL_INTERVAL_MS
    )

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load()
      }
    }

    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // cronChangeTick: a fired run moves jobs.json bookkeeping → reload now.
  }, [changeEventsAvailable, cronChangeTick, jobId])

  return (
    <div>
      <PanelSectionLabel className="mb-1.5">
        {c.runHistory}
        {runs && runs.length > 0 ? ` · ${runs.length}` : ''}
      </PanelSectionLabel>
      {runs === null ? (
        <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
          <Codicon name="loading" size="0.75rem" spinning />
        </div>
      ) : runs.length === 0 ? (
        <div className="py-1 text-xs text-muted-foreground">{c.noRuns}</div>
      ) : (
        <div className="flex flex-col gap-px">
          {runs.map(run => (
            <button
              className="row-hover flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              key={run.id}
              onClick={() => onOpenSession?.(run.id)}
              type="button"
            >
              <span className="truncate text-foreground/85">{run.title?.trim() || run.preview?.trim() || run.id}</span>
              <span className="shrink-0 text-[0.62rem] text-muted-foreground/55 tabular-nums">
                {formatRunTime(run.last_active || run.started_at)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function deliverTargetLabel(target: CronDeliveryTarget, c: Translations['cron']): string {
  const base = target.id === 'local' ? c.deliveryLabels.local : (c.deliveryLabels[target.id] ?? target.name)

  return target.id !== 'local' && !target.home_target_set ? `${base} — ${c.deliverNeedsHomeChannel}` : base
}

export function DeliverCheckboxes({
  c,
  id,
  onChange,
  targets,
  value
}: {
  c: Translations['cron']
  id: string
  onChange: (next: string) => void
  targets: CronDeliveryTarget[]
  value: string
}) {
  const selected = parseCronDeliveryTargets(value)
  const knownIds = new Set(targets.map(target => target.id))

  const options = [
    ...targets,
    ...selected
      .filter(target => !knownIds.has(target))
      .map(target => ({ home_env_var: null, home_target_set: true, id: target, name: target }))
  ]

  return (
    <div
      aria-labelledby={`${id}-label`}
      className="grid gap-2 rounded-md border border-input px-3 py-2.5"
      id={id}
      role="group"
    >
      {options.map((target, index) => {
        const checked = selected.includes(target.id)
        const checkboxId = `${id}-${index}`

        return (
          <label className="flex items-center gap-2 text-sm" htmlFor={checkboxId} key={target.id}>
            <Checkbox
              checked={checked}
              id={checkboxId}
              onCheckedChange={next => onChange(toggleCronDeliveryTarget(value, target.id, next === true))}
            />
            <span>{deliverTargetLabel(target, c)}</span>
          </label>
        )
      })}
    </div>
  )
}

export function CronEditorDialog({
  editor,
  onBlueprintCreate,
  onClose,
  onSave
}: {
  editor: EditorState
  onBlueprintCreate: (blueprint: AutomationBlueprint, values: Record<string, string>) => Promise<void>
  onClose: () => void
  onSave: (values: EditorValues) => Promise<void>
}) {
  const { t } = useI18n()
  const c = t.cron
  const open = editor.mode !== 'closed'
  const isEdit = editor.mode === 'edit'
  const initial = isEdit ? editor.job : null
  const scriptOnlyJob = initial ? jobIsScriptOnly(initial) : false

  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState('')
  const [schedulePreset, setSchedulePreset] = useState('daily')
  const [deliver, setDeliver] = useState(DEFAULT_DELIVER)
  // Per-job model override, encoded as `${providerSlug}:${model}` (split on the
  // first ':' when saving). MODEL_DEFAULT_VALUE = follow the global default.
  const [modelChoice, setModelChoice] = useState(MODEL_DEFAULT_VALUE)
  // Blueprint fills typed slots (time/enum/weekdays/text) instead of the raw
  // cron fields; the backend renders the prompt + schedule from them.
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  // Create mode can start from a ready-made blueprint instead of a blank cron.
  // CUSTOM_TEMPLATE (default) = the manual editor; any other value is a
  // blueprint key that swaps the form for that blueprint's typed slots.
  const [templateChoice, setTemplateChoice] = useState(CUSTOM_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)

  // The blueprint catalog powers the create dialog's "Start from" dropdown; it's
  // meaningless when editing an existing job, so skip the fetch there.
  const blueprintsQuery = useQuery({
    queryKey: ['cron-blueprints'],
    queryFn: async () => (await getAutomationBlueprints()).blueprints,
    enabled: open && !isEdit
  })

  const blueprintList = blueprintsQuery.data ?? []

  const blueprint =
    templateChoice === CUSTOM_TEMPLATE ? null : (blueprintList.find(item => item.key === templateChoice) ?? null)

  const isBlueprint = blueprint !== null

  // Same catalog the chat model picker uses: configured providers and their
  // actually-available models only. Script-only + blueprint forms never pick a
  // model here, so skip the fetch entirely for them.
  const modelOptions = useQuery({
    queryKey: ['model-options', 'global'],
    queryFn: () => requestModelOptions({}),
    enabled: open && !scriptOnlyJob && !isBlueprint
  })

  // Single source of truth for where a cron can deliver (local + configured
  // gateways) — same endpoint the dashboard uses, so no dialog offers a platform
  // that isn't connected. Shared by the manual editor and the blueprint form.
  const deliveryTargets = useQuery({
    queryKey: ['cron-delivery-targets'],
    queryFn: getCronDeliveryTargets,
    enabled: open
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setName(initial ? jobName(initial) : '')
    setPrompt(initial ? jobPrompt(initial) : '')
    setSchedule(initial ? jobScheduleExpr(initial) : (SCHEDULE_OPTIONS[0].expr ?? ''))
    setSchedulePreset(initial ? scheduleOptionForExpr(jobScheduleExpr(initial)).value : 'daily')
    setDeliver(initial ? jobDeliver(initial) : DEFAULT_DELIVER)
    setModelChoice(initial && jobModel(initial) ? `${jobProvider(initial)}:${jobModel(initial)}` : MODEL_DEFAULT_VALUE)
    setSlotValues({})
    setTemplateChoice(editor.mode === 'create' ? (editor.blueprintKey ?? CUSTOM_TEMPLATE) : CUSTOM_TEMPLATE)
    setError(null)
    setSaving(false)
  }, [editor, initial, open])

  // Seed the typed slots with the blueprint's defaults whenever a blueprint is
  // picked from "Start from" (and reset them when switching back to Custom).
  useEffect(() => {
    setSlotValues(blueprint ? initialBlueprintValues(blueprint) : {})
    setError(null)
  }, [blueprint])

  const selectedScheduleOption =
    SCHEDULE_OPTIONS.find(candidate => candidate.value === schedulePreset) ?? SCHEDULE_OPTIONS[0]

  function handleSchedulePresetChange(nextPreset: string) {
    setSchedulePreset(nextPreset)
    setError(null)

    const option = SCHEDULE_OPTIONS.find(candidate => candidate.value === nextPreset)

    if (option?.expr) {
      setSchedule(option.expr)
    } else if (scheduleOptionForExpr(schedule).value !== 'custom') {
      setSchedule('')
    }
  }

  const scheduleHint = scheduleSummary(selectedScheduleOption, schedule, c)

  // Configured providers with at least one available model — mirrors the chat
  // model picker's gate so only actually-selectable models are offered.
  const modelProviders = (modelOptions.data?.providers ?? []).filter(
    provider => provider.authenticated !== false && (provider.models ?? []).length > 0
  )

  // A previously pinned model that has since left the catalog (provider
  // removed / model retired) would render Radix's blank trigger. Keep the
  // stored pin visible and re-selectable rather than silently dropping it.
  const modelChoiceKnown =
    modelChoice === MODEL_DEFAULT_VALUE ||
    modelProviders.some(provider => (provider.models ?? []).some(model => `${provider.slug}:${model}` === modelChoice))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const validationError = validateCronEditor({
      prompt,
      schedule,
      scriptOnlyJob
    })

    if (validationError) {
      setError(
        validationError === 'schedule'
          ? c.scheduleRequired
          : validationError === 'prompt'
            ? c.promptRequired
            : c.promptScheduleRequired
      )

      return
    }

    // Decode `${providerSlug}:${model}` — the model half may itself contain
    // ':' (e.g. openrouter 'anthropic/claude-sonnet-4:beta'), so split once.
    const overrideIndex = modelChoice === MODEL_DEFAULT_VALUE ? -1 : modelChoice.indexOf(':')
    const overrideProvider = overrideIndex >= 0 ? modelChoice.slice(0, overrideIndex) : ''
    const overrideModel = overrideIndex >= 0 ? modelChoice.slice(overrideIndex + 1) : ''

    setSaving(true)
    setError(null)

    try {
      await onSave({
        deliver,
        model: overrideModel,
        name: name.trim(),
        prompt: prompt.trim(),
        provider: overrideProvider,
        schedule: schedule.trim()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : c.failedSave)
    } finally {
      setSaving(false)
    }
  }

  async function handleBlueprintSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!blueprint) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onBlueprintCreate(blueprint, slotValues)
    } catch (err) {
      // 422 carries the slot-level validation message; surface it inline.
      setError(cleanBlueprintFieldError(err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={value => !value && !saving && onClose()} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? c.editTitle : c.createTitle}</DialogTitle>
          <DialogDescription>{isEdit ? c.editDesc : c.createDesc}</DialogDescription>
        </DialogHeader>

        {!isEdit && blueprintList.length > 0 && (
          <Field htmlFor="cron-template" label={c.blueprints.startFrom}>
            <Select onValueChange={setTemplateChoice} value={templateChoice}>
              <SelectTrigger className="h-9 rounded-md" id="cron-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CUSTOM_TEMPLATE}>{c.blueprints.custom}</SelectItem>
                {blueprintList.map(item => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {blueprint?.description && <FieldHint>{blueprint.description}</FieldHint>}
          </Field>
        )}

        {isBlueprint && blueprint ? (
          <form className="grid gap-4" onSubmit={handleBlueprintSubmit}>
            {blueprint.fields.map(field => {
              const fieldId = `blueprint-${blueprint.key}-${field.name}`
              const help = blueprintSlotHelp(field)

              return (
                <Field htmlFor={fieldId} key={field.name} label={field.label}>
                  {field.name === 'deliver' ? (
                    // Use the shared, backend-sourced delivery targets (same as the
                    // manual editor) rather than the blueprint's static field.options,
                    // so both dialogs offer exactly the connected platforms.
                    <DeliverCheckboxes
                      c={c}
                      id={fieldId}
                      onChange={next => setSlotValues(prev => ({ ...prev, [field.name]: next }))}
                      targets={deliveryTargets.data ?? []}
                      value={slotValues[field.name] ?? DEFAULT_DELIVER}
                    />
                  ) : (
                    <BlueprintSlotControl
                      field={field}
                      id={fieldId}
                      onChange={next => setSlotValues(prev => ({ ...prev, [field.name]: next }))}
                      value={slotValues[field.name] ?? ''}
                    />
                  )}
                  {help && <FieldHint>{help}</FieldHint>}
                </Field>
              )
            })}

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button disabled={saving} onClick={onClose} type="button" variant="outline">
                {t.common.cancel}
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? c.blueprints.scheduling : c.blueprints.scheduleIt}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            {scriptOnlyJob && initial && (
              <FieldHint>
                {c.scriptOnlyEditHint} <span className="font-mono">{initial.id}</span>
              </FieldHint>
            )}

            <Field htmlFor="cron-name" label={c.nameLabel} optional optionalLabel={c.optional}>
              <Input
                autoFocus
                id="cron-name"
                onChange={event => setName(event.target.value)}
                placeholder={c.namePlaceholder}
                value={name}
              />
            </Field>

            <Field htmlFor="cron-prompt" label={c.promptLabel} optional={scriptOnlyJob} optionalLabel={c.optional}>
              <Textarea
                className="min-h-24 font-mono"
                id="cron-prompt"
                onChange={event => setPrompt(event.target.value)}
                placeholder={c.promptPlaceholder}
                value={prompt}
              />
            </Field>

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field htmlFor="cron-frequency" label={c.frequencyLabel}>
                <Select onValueChange={handleSchedulePresetChange} value={schedulePreset}>
                  <SelectTrigger className="h-9 rounded-md" id="cron-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHEDULE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {c.scheduleLabels[option.value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field htmlFor="cron-deliver" label={c.deliverLabel}>
                <DeliverCheckboxes
                  c={c}
                  id="cron-deliver"
                  onChange={setDeliver}
                  targets={deliveryTargets.data ?? []}
                  value={deliver}
                />
              </Field>
            </div>

            {!scriptOnlyJob && (
              <Field htmlFor="cron-model" label={c.modelLabel} optional optionalLabel={c.optional}>
                <Select onValueChange={setModelChoice} value={modelChoice}>
                  <SelectTrigger className="h-9 rounded-md" id="cron-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MODEL_DEFAULT_VALUE}>{c.modelDefault}</SelectItem>
                    {!modelChoiceKnown && (
                      <SelectItem className="font-mono" value={modelChoice}>
                        {modelChoice.slice(modelChoice.indexOf(':') + 1)}
                      </SelectItem>
                    )}
                    {modelProviders.map(provider => (
                      <SelectGroup key={provider.slug}>
                        <SelectLabel>{provider.name}</SelectLabel>
                        {(provider.models ?? []).map(model => (
                          <SelectItem
                            className="font-mono"
                            key={`${provider.slug}:${model}`}
                            value={`${provider.slug}:${model}`}
                          >
                            {model}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {schedulePreset === 'custom' ? (
              <Field htmlFor="cron-schedule" label={c.customScheduleLabel}>
                <Input
                  className="font-mono"
                  id="cron-schedule"
                  onChange={event => setSchedule(event.target.value)}
                  placeholder={c.customPlaceholder}
                  value={schedule}
                />
                <FieldHint>{c.customHint}</FieldHint>
              </Field>
            ) : (
              <div className="rounded-md bg-(--ui-bg-quinary) px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">{scheduleHint}</span>
                  <span className="font-mono text-muted-foreground">{schedule}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <DialogFooter>
              <Button disabled={saving} onClick={onClose} type="button" variant="outline">
                {t.common.cancel}
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? t.common.saving : isEdit ? c.saveChanges : c.createAction}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export type EditorState =
  | { job: CronJob; mode: 'edit' }
  | { mode: 'closed' }
  // `blueprintKey` pre-selects a blueprint in the create dialog's "Start from"
  // dropdown (set when a recipe row in the list rail is clicked).
  | { blueprintKey?: string; mode: 'create' }

export interface EditorValues {
  deliver: string
  /** Per-job model override ('' = follow the global default). */
  model: string
  name: string
  prompt: string
  /** Provider slug for the model override ('' = none). */
  provider: string
  schedule: string
}
