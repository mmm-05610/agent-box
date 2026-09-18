import { useMemo } from 'react'

import { choicesFromModels } from '@/application/provider-model/wire-provider-model-catalog'
import { choiceFromRef, type ModelSlotControl } from '@/features/profiles/model-slot'
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

import { ConfigControlInput, controlLabel } from './config-control-input'

/** Selecting "no value" in a dropdown omits the control from the saved
 *  configuration, and the service decides its default. */
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

/** The Profiles page's declared controls, painted by the same shared control
 *  renderer the composer's temporary-config popover uses — one set of kinds
 *  and constraints, two value semantics (whole-Profile replacement here,
 *  per-turn overrides in the composer). */
function ProfileConfigInput({ control, draft, editable, harness, label, models, onChange }: ProfileConfigInputProps) {
  const copy = useI18n().t.profiles
  const value = draftValue(control, draft)

  const choices = useMemo(() => {
    if (control.kind !== 'model_slot') {
      return []
    }

    const catalog = profileConfigModelChoices(models, harness)
    const ref = asModelRefValue(value)
    const known = ref !== null && catalog.some(choice => sameRef(choice, ref))

    return ref === null || known ? catalog : [...catalog, declaredChoiceFromRef(control, ref)]
  }, [control, harness, models, value])

  const ref = control.kind === 'model_slot' ? asModelRefValue(value) : null
  const modelValue = ref ? (choices.find(choice => sameRef(choice, ref)) ?? null) : null

  return (
    <ConfigControlInput
      choices={control.kind === 'model_slot' ? choices : undefined}
      control={control}
      disabled={!editable}
      label={label}
      modelValue={control.kind === 'model_slot' ? modelValue : undefined}
      onValueChange={next =>
        onChange(next === undefined ? withCleared(draft, control.controlId) : withEdit(draft, control.controlId, next))
      }
      renderModelItemLabel={choice => modelChoiceLabel(choice, copy)}
      unsetLabel={copy.notSet}
      value={value}
    />
  )
}

const sameRef = (choice: Pick<ComposerProviderModelChoice, 'modelId' | 'providerId'>, ref: ProfileModelRefValue) =>
  choice.providerId === ref.providerId && choice.modelId === ref.modelId

/** A current reference the directory no longer lists keeps the availability
 *  its declared slot carries, so the row still shows the service's reason. */
const declaredChoiceFromRef = (
  control: ModelSlotControl,
  ref: ProfileModelRefValue
): ComposerProviderModelChoice => {
  const declared = control.slots
    .flatMap(slot => (slot.model ? [slot.model] : []))
    .find(model => model.providerId === ref.providerId && model.modelId === ref.modelId)

  return declared
    ? choiceFromRef(declared)
    : choiceFromRef({ availability: 'unknown', modelId: ref.modelId, providerId: ref.providerId, unavailableReason: null })
}

const modelChoiceLabel = (choice: ComposerProviderModelChoice, copy: Translations['profiles']): string => {
  const base = `${choice.providerDisplayName}: ${choice.displayName}`

  if (choice.availability === 'unavailable') {
    return choice.unavailableReason ? `${base} — ${choice.unavailableReason}` : `${base} — ${copy.agentBoxServiceNoReason}`
  }

  return choice.availability === 'unknown' ? `${base} — ${copy.agentBoxConfigModelUnverified}` : base
}
