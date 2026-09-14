import { choicesFromModels } from '@/application/provider-model/wire-provider-model-catalog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import type { Translations } from '@/i18n'
import type { ComposerProviderModelChoice } from '@/lib/composer/types'
import type {
  ConfigControl,
  ConfigDescriptor,
  ConfigOverride,
  ProviderModelConfigRecord,
  ProviderModelRef
} from '@/types/wire/wire-v1'

/** Selecting this in a dropdown means "no value": the control is omitted from
 *  the saved configuration and the service decides its default. */
const UNSET_VALUE = '__agentbox_profile_config_default__'

export interface ProfileModelRefValue {
  modelId: string
  providerId: string
}

/** The user's pending edit to a Profile's replacement configuration. Only
 *  explicit intent lives here; everything else is read from the descriptor so
 *  the saved values stay anchored to what the service actually declared. */
export interface ProfileConfigDraft {
  /** Controls the user explicitly restored to the service default. */
  clearedIds: string[]
  /** Explicit value edits, in wire override form. */
  edits: ConfigOverride[]
}

export const emptyProfileConfigDraft = (): ProfileConfigDraft => ({ clearedIds: [], edits: [] })

const controlLabel = (controlId: string): string =>
  controlId
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, head => head.toUpperCase())

const modelRefValue = (ref: ProviderModelRef | null): ProfileModelRefValue | undefined =>
  ref ? { modelId: ref.modelId, providerId: ref.providerId } : undefined

const asModelRefValue = (value: unknown): ProfileModelRefValue | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { modelId?: unknown; providerId?: unknown }

  return typeof candidate.modelId === 'string' && typeof candidate.providerId === 'string'
    ? { modelId: candidate.modelId, providerId: candidate.providerId }
    : null
}

/** The service-declared value of a control, in the same shape an edit uses.
 *  `undefined` means the service declared no value at all. */
export function controlServiceValue(control: ConfigControl): unknown {
  if (control.kind !== 'model_slot') {
    return control.currentValue
  }

  const slot =
    control.slots.find(candidate => candidate.name === control.currentValue) ??
    control.slots.find(candidate => candidate.model)

  return modelRefValue(slot?.model ?? null)
}

/** The value a control currently shows: an explicit edit, otherwise the
 *  service-declared value — and nothing at all once it is restored. */
const draftValue = (control: ConfigControl, draft: ProfileConfigDraft): unknown => {
  if (draft.clearedIds.includes(control.controlId)) {
    return undefined
  }

  return draft.edits.find(edit => edit.controlId === control.controlId)?.value ?? controlServiceValue(control)
}

const withEdit = (draft: ProfileConfigDraft, controlId: string, value: unknown): ProfileConfigDraft => ({
  clearedIds: draft.clearedIds.filter(candidate => candidate !== controlId),
  edits: [...draft.edits.filter(edit => edit.controlId !== controlId), { controlId, value }]
})

const withCleared = (draft: ProfileConfigDraft, controlId: string): ProfileConfigDraft => ({
  clearedIds: draft.clearedIds.includes(controlId) ? draft.clearedIds : [...draft.clearedIds, controlId],
  edits: draft.edits.filter(edit => edit.controlId !== controlId)
})

/** The complete `values` payload for `profiles.updateConfig`, which replaces
 *  the whole Profile configuration: untouched and locked controls carry their
 *  service-declared value forward, restored controls are omitted (never
 *  replaced by a guessed default), and unset controls are left out entirely. */
export function buildProfileConfigValues(descriptor: ConfigDescriptor, draft: ProfileConfigDraft): ConfigOverride[] {
  const values: ConfigOverride[] = []

  for (const control of descriptor.controls) {
    if (draft.clearedIds.includes(control.controlId)) {
      continue
    }

    const value = draftValue(control, draft)

    if (value !== undefined) {
      values.push({ controlId: control.controlId, value })
    }
  }

  return values
}

const sameConfigValues = (left: ConfigOverride[], right: ConfigOverride[]): boolean => {
  const key = (override: ConfigOverride): string => JSON.stringify([override.controlId, override.value])
  const leftKeys = left.map(key).sort()
  const rightKeys = right.map(key).sort()

  return leftKeys.length === rightKeys.length && leftKeys.every((entry, index) => entry === rightKeys[index])
}

export function isProfileConfigDirty(descriptor: ConfigDescriptor, draft: ProfileConfigDraft): boolean {
  return !sameConfigValues(
    buildProfileConfigValues(descriptor, draft),
    buildProfileConfigValues(descriptor, emptyProfileConfigDraft())
  )
}

/** Provider models usable by a Profile: the service's own harness value is
 *  compared as opaque data, never parsed into a brand. */
export function profileConfigModelChoices(
  models: readonly ProviderModelConfigRecord[],
  harness: string
): ComposerProviderModelChoice[] {
  return choicesFromModels(models.filter(model => model.harness === harness))
}

export interface ProfileConfigEditorProps {
  descriptor: ConfigDescriptor
  disabled?: boolean
  draft: ProfileConfigDraft
  harness: string
  models: readonly ProviderModelConfigRecord[]
  onChange: (draft: ProfileConfigDraft) => void
}

export function ProfileConfigEditor({
  descriptor,
  disabled,
  draft,
  harness,
  models,
  onChange
}: ProfileConfigEditorProps) {
  const copy = useI18n().t.profiles

  if (descriptor.controls.length === 0) {
    return <div className="text-xs text-muted-foreground">{copy.notSet}</div>
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border" data-slot="profile-config-editor">
      {descriptor.controls.map(control => (
        <ProfileConfigField
          control={control}
          draft={draft}
          editable={!disabled && control.editable && !descriptor.securityLockedIds.includes(control.controlId)}
          harness={harness}
          key={control.controlId}
          locked={descriptor.securityLockedIds.includes(control.controlId)}
          models={models}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

interface ProfileConfigFieldProps {
  control: ConfigControl
  draft: ProfileConfigDraft
  editable: boolean
  harness: string
  locked: boolean
  models: readonly ProviderModelConfigRecord[]
  onChange: (draft: ProfileConfigDraft) => void
}

function ProfileConfigField({ control, draft, editable, harness, locked, models, onChange }: ProfileConfigFieldProps) {
  const copy = useI18n().t.profiles
  const label = controlLabel(control.controlId)
  const edited = draft.edits.some(edit => edit.controlId === control.controlId)
  const cleared = draft.clearedIds.includes(control.controlId)
  const serviceValue = controlServiceValue(control)
  // A locked control cannot be reset: dropping its value would change it just
  // as surely as editing it.
  const canReset = editable && (edited || (!cleared && serviceValue !== undefined))

  return (
    <div className="space-y-1 px-3 py-2" data-control-id={control.controlId}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[0.7rem] font-medium text-foreground">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {locked ? <span className="text-[0.62rem] text-muted-foreground">{copy.agentBoxConfigLocked}</span> : null}
          {canReset ? (
            <button
              className="text-[0.62rem] text-muted-foreground hover:text-foreground"
              onClick={() => onChange(withCleared(draft, control.controlId))}
              type="button"
            >
              {copy.agentBoxConfigRestoreDefault}
            </button>
          ) : null}
        </span>
      </div>
      <ProfileConfigInput
        control={control}
        draft={draft}
        editable={editable}
        harness={harness}
        label={label}
        models={models}
        onChange={onChange}
      />
    </div>
  )
}

interface ProfileConfigInputProps {
  control: ConfigControl
  draft: ProfileConfigDraft
  editable: boolean
  harness: string
  label: string
  models: readonly ProviderModelConfigRecord[]
  onChange: (draft: ProfileConfigDraft) => void
}

/** One service-described control kind → one of the app's existing limited
 *  controls. An unknown kind renders nothing rather than an invented field. */
function ProfileConfigInput({ control, draft, editable, harness, label, models, onChange }: ProfileConfigInputProps) {
  const copy = useI18n().t.profiles
  const value = draftValue(control, draft)

  if (control.kind === 'boolean') {
    return (
      <div className="flex h-7 items-center justify-end">
        <Switch
          aria-label={label}
          checked={Boolean(value)}
          disabled={!editable}
          onCheckedChange={checked => onChange(withEdit(draft, control.controlId, checked))}
          size="xs"
        />
      </div>
    )
  }

  if (control.kind === 'string') {
    const text = typeof value === 'string' ? value : ''

    return control.multiline ? (
      <Textarea
        aria-label={label}
        disabled={!editable}
        onChange={event => onChange(withEdit(draft, control.controlId, event.currentTarget.value))}
        rows={3}
        size="sm"
        value={text}
      />
    ) : (
      <Input
        aria-label={label}
        disabled={!editable}
        onChange={event => onChange(withEdit(draft, control.controlId, event.currentTarget.value))}
        size="sm"
        value={text}
      />
    )
  }

  if (control.kind === 'model_slot') {
    return (
      <ModelSlotSelect
        control={control}
        draft={draft}
        editable={editable}
        harness={harness}
        label={label}
        models={models}
        onChange={onChange}
      />
    )
  }

  if (control.kind === 'enum') {
    return (
      <Select
        disabled={!editable}
        onValueChange={next =>
          onChange(
            next === UNSET_VALUE ? withCleared(draft, control.controlId) : withEdit(draft, control.controlId, next)
          )
        }
        value={typeof value === 'string' && value ? value : UNSET_VALUE}
      >
        <SelectTrigger aria-label={label} className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET_VALUE}>{copy.notSet}</SelectItem>
          {control.values.map(candidate => (
            <SelectItem key={candidate} value={candidate}>
              {candidate}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return null
}

interface ModelSlotSelectProps {
  control: Extract<ConfigControl, { kind: 'model_slot' }>
  draft: ProfileConfigDraft
  editable: boolean
  harness: string
  label: string
  models: readonly ProviderModelConfigRecord[]
  onChange: (draft: ProfileConfigDraft) => void
}

function ModelSlotSelect({ control, draft, editable, harness, label, models, onChange }: ModelSlotSelectProps) {
  const copy = useI18n().t.profiles
  const value = asModelRefValue(draftValue(control, draft))
  const catalog = profileConfigModelChoices(models, harness)

  const known =
    value !== null && catalog.some(choice => choice.providerId === value.providerId && choice.modelId === value.modelId)

  // The service's current reference stays selectable and visible even when the
  // directory no longer offers it — the client displays data, it never decides
  // that a model stopped existing.
  const current = value !== null && !known ? modelChoiceFromRef(control, value) : null
  const choices = current ? [...catalog, current] : catalog

  const selected =
    value === null
      ? null
      : (choices.find(choice => choice.providerId === value.providerId && choice.modelId === value.modelId) ?? null)

  return (
    <Select
      disabled={!editable}
      onValueChange={next => {
        if (next === UNSET_VALUE) {
          onChange(withCleared(draft, control.controlId))

          return
        }

        const choice = choices.find(candidate => modelChoiceKey(candidate) === next)

        if (choice && choice.availability !== 'unavailable') {
          onChange(withEdit(draft, control.controlId, { modelId: choice.modelId, providerId: choice.providerId }))
        }
      }}
      value={selected ? modelChoiceKey(selected) : UNSET_VALUE}
    >
      <SelectTrigger aria-label={label} className="w-full" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET_VALUE}>{copy.notSet}</SelectItem>
        {choices.map(choice => (
          <SelectItem
            disabled={choice.availability === 'unavailable'}
            key={modelChoiceKey(choice)}
            title={choice.unavailableReason || undefined}
            value={modelChoiceKey(choice)}
          >
            {modelChoiceLabel(choice, copy)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const modelChoiceKey = (choice: Pick<ComposerProviderModelChoice, 'modelId' | 'providerId'>): string =>
  JSON.stringify([choice.providerId, choice.modelId])

const modelChoiceFromRef = (
  control: Extract<ConfigControl, { kind: 'model_slot' }>,
  value: ProfileModelRefValue
): ComposerProviderModelChoice => {
  const declared = control.slots
    .flatMap(slot => (slot.model ? [slot.model] : []))
    .find(model => model.providerId === value.providerId && model.modelId === value.modelId)

  return {
    availability: declared?.availability ?? 'unknown',
    displayName: value.modelId,
    modelId: value.modelId,
    providerDisplayName: value.providerId,
    providerId: value.providerId,
    unavailableReason: declared?.unavailableReason ?? null
  }
}

const modelChoiceLabel = (choice: ComposerProviderModelChoice, copy: ProfileConfigCopy): string => {
  const base = `${choice.providerDisplayName}: ${choice.displayName}`

  if (choice.availability === 'unavailable') {
    return choice.unavailableReason ? `${base} — ${choice.unavailableReason}` : `${base} — ${copy.agentBoxUnavailable}`
  }

  return choice.availability === 'unknown' ? `${base} — ${copy.agentBoxConfigModelUnverified}` : base
}

type ProfileConfigCopy = Translations['profiles']
