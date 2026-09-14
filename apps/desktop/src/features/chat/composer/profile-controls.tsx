import { useMemo } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import type { ComposerProfileState, ComposerProviderModelChoice } from '@/lib/composer/types'
import { cn } from '@/lib/utils'
import type { ConfigControl, ConfigOverride } from '@/types/wire/wire-v1'

const PROFILE_PILL = cn(
  'h-(--composer-control-size) min-w-0 max-w-44 shrink gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

const UNSET_VALUE = '__agentbox_profile_default__'

const controlLabel = (controlId: string): string =>
  controlId
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, head => head.toUpperCase())

const overrideValue = (control: ConfigControl, overrides: ConfigOverride[]): unknown =>
  overrides.find(override => override.controlId === control.controlId)?.value ?? control.currentValue

const replaceOverride = (overrides: ConfigOverride[], controlId: string, value: unknown): ConfigOverride[] => [
  ...overrides.filter(override => override.controlId !== controlId),
  { controlId, value }
]

const removeOverride = (overrides: ConfigOverride[], controlId: string): ConfigOverride[] =>
  overrides.filter(override => override.controlId !== controlId)

const modelChoiceKey = (choice: Pick<ComposerProviderModelChoice, 'modelId' | 'providerId'>): string =>
  JSON.stringify([choice.providerId, choice.modelId])

const modelChoiceFromRef = (ref: {
  availability: ComposerProviderModelChoice['availability']
  modelId: string
  providerId: string
  unavailableReason: string | null
}): ComposerProviderModelChoice => ({
  availability: ref.availability,
  displayName: ref.modelId,
  modelId: ref.modelId,
  providerDisplayName: ref.providerId,
  providerId: ref.providerId,
  unavailableReason: ref.unavailableReason
})

const modelChoiceFromValue = (
  value: unknown,
  choices: ComposerProviderModelChoice[],
  fallback?: ComposerProviderModelChoice | null
): ComposerProviderModelChoice | null => {
  if (!value || typeof value !== 'object') {
    return fallback ?? null
  }

  const candidate = value as { modelId?: unknown; providerId?: unknown }

  return typeof candidate.providerId === 'string' && typeof candidate.modelId === 'string'
    ? (choices.find(choice => choice.providerId === candidate.providerId && choice.modelId === candidate.modelId) ?? {
        availability: 'unknown',
        displayName: candidate.modelId,
        modelId: candidate.modelId,
        providerDisplayName: candidate.providerId,
        providerId: candidate.providerId,
        unavailableReason: null
      })
    : (fallback ?? null)
}

export function ComposerProfileControls({ profile }: { profile: ComposerProfileState }) {
  const { t } = useI18n()
  const copy = t.composer
  const selected = profile.options.find(option => option.id === profile.selectedId) ?? null
  const disabled = Boolean(profile.unavailableReason || profile.switching)

  return (
    <div className="flex min-w-0 items-center gap-(--composer-control-gap)" data-slot="composer-profile-controls">
      <DropdownMenu>
        <Tip label={profile.unavailableReason || copy.profile} side="top">
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={selected ? `${copy.profile}: ${selected.displayName}` : copy.chooseProfile}
              className={PROFILE_PILL}
              data-slot="composer-profile-trigger"
              disabled={disabled}
              type="button"
              variant="ghost"
            >
              <Codicon aria-hidden name="account" size="0.875rem" />
              <span className="truncate">{profile.switching ? copy.switchingProfile : selected?.displayName || copy.chooseProfile}</span>
              {selected ? (
                <span className="max-w-20 truncate rounded bg-muted/70 px-1 py-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
                  {selected.harness}
                </span>
              ) : null}
              <Codicon aria-hidden className="shrink-0 opacity-50" name="chevron-down" size="0.75rem" />
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="min-w-60 max-w-80" side="top" sideOffset={8}>
          <DropdownMenuLabel>{copy.chooseProfile}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup
            onValueChange={profileId => {
              if (profileId && profileId !== profile.selectedId) {
                void Promise.resolve(profile.onSelect(profileId))
              }
            }}
            value={profile.selectedId ?? ''}
          >
            {profile.options.map(option => (
              <DropdownMenuRadioItem
                disabled={!option.selectable}
                key={option.id}
                title={option.unavailableReason || undefined}
                value={option.id}
              >
                <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="truncate">{option.displayName}</span>
                  <span className="max-w-28 truncate text-[0.65rem] text-muted-foreground">
                    {copy.harness(option.harness)}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <TemporaryConfigPopover profile={profile} />
    </div>
  )
}

function TemporaryConfigPopover({ profile }: { profile: ComposerProfileState }) {
  const { t } = useI18n()
  const copy = t.composer
  const descriptor = profile.configDescriptor
  const disabled = !profile.selectedId || !descriptor
  const overrideCount = profile.overrides.length

  return (
    <Popover>
      <Tip label={descriptor === null ? copy.configUnavailable : copy.temporaryConfig} side="top">
        <PopoverTrigger asChild>
          <Button
            aria-label={copy.temporaryConfig}
            className="relative size-(--composer-control-size) shrink-0 rounded-md p-0"
            data-slot="composer-temporary-config-trigger"
            disabled={disabled}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Codicon aria-hidden name="settings-gear" size="0.875rem" />
            {overrideCount > 0 ? (
              <span
                aria-label={`${overrideCount}`}
                className="absolute top-0 right-0 size-1.5 rounded-full bg-(--ui-accent)"
                data-slot="composer-override-indicator"
              />
            ) : null}
          </Button>
        </PopoverTrigger>
      </Tip>
      <PopoverContent align="end" className="w-80 space-y-3" side="top" sideOffset={8}>
        <div>
          <div className="text-xs font-medium text-foreground">{copy.temporaryConfig}</div>
          <div className="mt-0.5 text-[0.68rem] text-muted-foreground">
            {descriptor?.effectTiming === 'immediate_declared'
              ? copy.takesEffectImmediately
              : copy.takesEffectNextSend}
          </div>
        </div>
        {!descriptor || descriptor.controls.length === 0 ? (
          <div className="text-xs text-muted-foreground">{copy.temporaryConfigEmpty}</div>
        ) : (
          <div className="space-y-2.5">
            {descriptor.controls.map(control => (
              <ConfigControlField
                control={control}
                key={control.controlId}
                locked={descriptor.securityLockedIds.includes(control.controlId)}
                modelChoices={profile.modelChoices ?? []}
                onChange={value =>
                  profile.onOverrideChange(
                    value === undefined
                      ? removeOverride(profile.overrides, control.controlId)
                      : replaceOverride(profile.overrides, control.controlId, value)
                  )
                }
                overridden={profile.overrides.some(override => override.controlId === control.controlId)}
                overrides={profile.overrides}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ConfigControlField({
  control,
  locked,
  onChange,
  overridden,
  overrides,
  modelChoices
}: {
  control: ConfigControl
  locked: boolean
  onChange: (value: unknown | undefined) => void
  overridden: boolean
  overrides: ConfigOverride[]
  modelChoices: ComposerProviderModelChoice[]
}) {
  const { t } = useI18n()
  const copy = t.composer
  const editable = control.editable && !locked
  const current = overrideValue(control, overrides)
  const label = controlLabel(control.controlId)
  const title = locked ? copy.securityLocked : !control.editable ? copy.configUnavailable : undefined

  const choices = useMemo(() => {
    if (control.kind === 'enum') {
      return control.values
    }

    if (control.kind !== 'model_slot') {
      return []
    }

    const currentSlot =
      control.slots.find(slot => slot.name === control.currentValue)?.model ??
      control.slots.find(slot => slot.model)?.model

    const currentChoice = currentSlot
      ? (modelChoices.find(
          choice => choice.providerId === currentSlot.providerId && choice.modelId === currentSlot.modelId
        ) ?? modelChoiceFromRef(currentSlot))
      : null

    const override = overrides.find(candidate => candidate.controlId === control.controlId)?.value
    const overrideChoice = modelChoiceFromValue(override, modelChoices)
    const extraChoice = overrideChoice ?? currentChoice

    return extraChoice && !modelChoices.some(choice => modelChoiceKey(choice) === modelChoiceKey(extraChoice))
      ? [...modelChoices, extraChoice]
      : modelChoices
  }, [control, modelChoices, overrides])

  const modelChoicesForControl = control.kind === 'model_slot' ? (choices as ComposerProviderModelChoice[]) : []

  const descriptorRef =
    control.kind === 'model_slot'
      ? (control.slots.find(slot => slot.name === control.currentValue)?.model ??
        control.slots.find(slot => slot.model)?.model)
      : null

  const hasOverride = overrides.some(override => override.controlId === control.controlId)

  const modelValue =
    control.kind === 'model_slot'
      ? modelChoiceFromValue(
          current,
          modelChoicesForControl,
          hasOverride ? null : descriptorRef && modelChoiceFromRef(descriptorRef)
        )
      : null

  return (
    <div className="space-y-1" data-control-id={control.controlId} title={title}>
      <div className="flex items-center justify-between gap-2">
        <label className="truncate text-[0.7rem] font-medium text-foreground">{label}</label>
        {overridden ? (
          <button
            className="text-[0.62rem] text-muted-foreground hover:text-foreground"
            onClick={() => onChange(undefined)}
            type="button"
          >
            {copy.clearTemporaryValue}
          </button>
        ) : null}
      </div>
      {control.kind === 'boolean' ? (
        <div className="flex h-7 items-center justify-end">
          <Switch
            aria-label={label}
            checked={Boolean(current)}
            disabled={!editable}
            onCheckedChange={onChange}
            size="xs"
          />
        </div>
      ) : control.kind === 'string' ? (
        <Input
          aria-label={label}
          disabled={!editable}
          onChange={event => onChange(event.currentTarget.value)}
          size="sm"
          value={typeof current === 'string' ? current : ''}
        />
      ) : control.kind === 'model_slot' ? (
        <Select
          disabled={!editable}
          onValueChange={value => {
            if (value === UNSET_VALUE) {
              return onChange(undefined)
            }

            const choice = modelChoicesForControl.find(candidate => modelChoiceKey(candidate) === value)

            if (choice?.availability !== 'unavailable') {
              onChange(choice ? { providerId: choice.providerId, modelId: choice.modelId } : undefined)
            }
          }}
          value={modelValue ? modelChoiceKey(modelValue) : UNSET_VALUE}
        >
          <SelectTrigger aria-label={label} className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_VALUE}>{copy.clearTemporaryValue}</SelectItem>
            {modelChoicesForControl.map(choice => (
              <SelectItem
                disabled={choice.availability === 'unavailable'}
                key={modelChoiceKey(choice)}
                title={choice.unavailableReason || undefined}
                value={modelChoiceKey(choice)}
              >
                {choice.providerDisplayName}: {choice.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Select
          disabled={!editable}
          onValueChange={value => onChange(value === UNSET_VALUE ? undefined : value)}
          value={typeof current === 'string' && current ? current : UNSET_VALUE}
        >
          <SelectTrigger aria-label={label} className="w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNSET_VALUE}>{copy.clearTemporaryValue}</SelectItem>
            {(choices as string[]).map(value => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
