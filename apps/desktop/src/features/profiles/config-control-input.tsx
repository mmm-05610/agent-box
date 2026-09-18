import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { modelChoiceKey } from '@/features/profiles/model-slot'
import type { ComposerProviderModelChoice } from '@/lib/composer/types'
import type { ConfigControl } from '@/types/wire/wire-v1'

/** Selecting this in a dropdown means "no value": the control is omitted and
 *  the service decides its default. */
const UNSET_VALUE = '__agentbox_control_unset__'

/** Human label for a service-declared control id. Control ids are service
 *  data; the client only splits camelCase/underscores for display. */
export const controlLabel = (controlId: string): string =>
  controlId
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, head => head.toUpperCase())

export interface ConfigControlInputProps {
  /** model_slot options, including any out-of-catalog value the service or
   *  the user currently holds. Ignored for the other kinds. */
  choices?: ComposerProviderModelChoice[]
  control: ConfigControl
  disabled?: boolean
  /** model_slot only: the choice the control shows right now. Callers own the
   *  semantics (override → declared slot → nothing); the widget only paints. */
  modelValue?: ComposerProviderModelChoice | null
  /** Extends a model item's text (e.g. availability wording) without changing
   *  the widget's structure or behaviour. */
  renderModelItemLabel?: (choice: ComposerProviderModelChoice) => ReactNode
  unsetLabel: string
  value: unknown
  onValueChange: (value: unknown | undefined) => void
}

/** One service-described control kind → the app's matching limited control.
 *  Shared by the Profiles page editor and the composer's temporary-config
 *  popover so both surfaces render the same kinds with the same constraints.
 *  An unknown kind renders nothing rather than an invented field. */
export function ConfigControlInput({
  choices = [],
  control,
  disabled = false,
  label,
  modelValue = null,
  onValueChange,
  renderModelItemLabel,
  unsetLabel,
  value
}: ConfigControlInputProps & { label: string }) {
  if (control.kind === 'boolean') {
    return (
      <div className="flex h-7 items-center justify-end">
        <Switch
          aria-label={label}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={onValueChange}
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
        disabled={disabled}
        onChange={event => onValueChange(event.currentTarget.value)}
        rows={3}
        size="sm"
        value={text}
      />
    ) : (
      <Input
        aria-label={label}
        disabled={disabled}
        onChange={event => onValueChange(event.currentTarget.value)}
        size="sm"
        value={text}
      />
    )
  }

  if (control.kind === 'model_slot') {
    return (
      <Select
        disabled={disabled}
        onValueChange={next => {
          if (next === UNSET_VALUE) {
            return onValueChange(undefined)
          }

          const choice = choices.find(candidate => modelChoiceKey(candidate) === next)

          if (choice?.availability !== 'unavailable') {
            onValueChange(choice ? { modelId: choice.modelId, providerId: choice.providerId } : undefined)
          }
        }}
        value={modelValue ? modelChoiceKey(modelValue) : UNSET_VALUE}
      >
        <SelectTrigger aria-label={label} className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET_VALUE}>{unsetLabel}</SelectItem>
          {choices.map(choice => (
            <SelectItem
              disabled={choice.availability === 'unavailable'}
              key={modelChoiceKey(choice)}
              title={choice.unavailableReason || undefined}
              value={modelChoiceKey(choice)}
            >
              {renderModelItemLabel ? renderModelItemLabel(choice) : modelItemText(choice)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (control.kind === 'enum') {
    return (
      <Select
        disabled={disabled}
        onValueChange={next => onValueChange(next === UNSET_VALUE ? undefined : next)}
        value={typeof value === 'string' && value ? value : UNSET_VALUE}
      >
        <SelectTrigger aria-label={label} className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSET_VALUE}>{unsetLabel}</SelectItem>
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

const modelItemText = (choice: ComposerProviderModelChoice): string =>
  `${choice.providerDisplayName}: ${choice.displayName}`
