import { useMemo, useState } from 'react'

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorTrigger
} from '@/components/assistant-ui/model-selector'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import {
  modelChoiceKey,
  modelSlotChoices,
  type ModelSlotControl,
  modelSlotCurrentValue,
  removeOverride,
  replaceOverride
} from '@/features/profiles/model-slot'
import { useI18n } from '@/i18n'
import type { ComposerProfileState, ComposerProviderModelChoice } from '@/lib/composer/types'
import { releaseTypingFocus } from '@/lib/typing-focus'
import { cn } from '@/lib/utils'

import { effectiveValueText } from './profile-controls'

// Same display contract as the profile pill: the one control that can give
// width back continuously absorbs the squeeze instead of pushing Send out.
const SELECTOR_PILL = cn(
  'h-(--composer-control-size) min-w-0 max-w-44 shrink gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

/**
 * Composer provider/model selector (AI Elements copy-in shape over the app's
 * own popover/command primitives). Options come from `provider_models.list`
 * via the profile state; a selection is written as the model slot's temporary
 * override for this draft, and the trigger displays the service's effective
 * value from `config.resolve` once it has answered.
 *
 * Renders nothing unless the service's descriptor declares a model_slot
 * control — an undeclared control is never shown (core v1 §5).
 */
export function ComposerModelSelector({ profile }: { profile: ComposerProfileState }) {
  const { t } = useI18n()
  const copy = t.composer
  const [open, setOpen] = useState(false)

  const control = useMemo<ModelSlotControl | null>(
    () => profile.configDescriptor?.controls.find((candidate): candidate is ModelSlotControl => candidate.kind === 'model_slot') ?? null,
    [profile.configDescriptor]
  )

  if (!control) {
    return null
  }

  const modelChoices = profile.modelChoices ?? []
  const choices = modelSlotChoices(control, modelChoices, profile.overrides)
  const current = modelSlotCurrentValue(control, modelChoices, profile.overrides)
  const resolution = profile.configResolution

  const effectiveValue =
    resolution?.status === 'resolved'
      ? (resolution.effective.find(entry => entry.controlId === control.controlId)?.value ?? null)
      : null

  const disabled = Boolean(profile.unavailableReason || profile.switching)
  const hasOverride = profile.overrides.some(override => override.controlId === control.controlId)

  // Effective value first: the service's answer is the truth about what a run
  // would use. The draft's pending choice only paints until it answers.
  const display =
    effectiveValue !== null
      ? effectiveValueText(effectiveValue, copy)
      : current
        ? `${current.providerDisplayName}: ${current.displayName}`
        : copy.modelSelectorDefault

  const groups = new Map<string, ComposerProviderModelChoice[]>()

  for (const choice of choices) {
    groups.set(choice.providerDisplayName, [...(groups.get(choice.providerDisplayName) ?? []), choice])
  }

  // Closing the menu ends its claim on the keyboard: without the release the
  // Enter that committed a model is swallowed instead of reaching the draft.
  const setMenuOpen = (next: boolean) => {
    setOpen(next)

    if (!next) {
      releaseTypingFocus()
    }
  }

  const pick = (choice: ComposerProviderModelChoice) => {
    if (choice.availability === 'unavailable') {
      return
    }

    profile.onOverrideChange(
      replaceOverride(profile.overrides, control.controlId, {
        modelId: choice.modelId,
        providerId: choice.providerId
      })
    )
    setMenuOpen(false)
  }

  const clearOverride = () => {
    profile.onOverrideChange(removeOverride(profile.overrides, control.controlId))
    setMenuOpen(false)
  }

  return (
    <ModelSelector onOpenChange={setMenuOpen} open={open}>
      <Tip label={disabled && profile.unavailableReason ? profile.unavailableReason : display} side="top">
        <ModelSelectorTrigger asChild>
          <Button
            aria-label={`${copy.modelSelector}: ${display}`}
            className={SELECTOR_PILL}
            data-slot="composer-model-selector-trigger"
            disabled={disabled}
            type="button"
            variant="ghost"
          >
            <span className="truncate">{display}</span>
            <Codicon aria-hidden className="shrink-0 opacity-50" name="chevron-down" size="0.75rem" />
          </Button>
        </ModelSelectorTrigger>
      </Tip>
      <ModelSelectorContent align="end" side="top" sideOffset={8} title={copy.modelSelector}>
        <ModelSelectorInput placeholder={copy.modelSelectorSearch} />
        <ModelSelectorList>
          <ModelSelectorEmpty>{copy.modelSelectorEmpty}</ModelSelectorEmpty>
          {[...groups].map(([provider, providerChoices]) => (
            <ModelSelectorGroup heading={provider} key={provider}>
              {providerChoices.map(choice => (
                <ModelSelectorItem
                  disabled={choice.availability === 'unavailable'}
                  key={modelChoiceKey(choice)}
                  onSelect={() => pick(choice)}
                  title={choice.unavailableReason || undefined}
                  value={`${choice.providerDisplayName} ${choice.displayName}`}
                >
                  <ModelSelectorName>
                    {choice.displayName}
                    {choice.availability === 'unavailable' && choice.unavailableReason
                      ? ` — ${choice.unavailableReason}`
                      : ''}
                  </ModelSelectorName>
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
          {hasOverride ? (
            <>
              <ModelSelectorSeparator />
              <ModelSelectorItem onSelect={clearOverride} value={copy.clearTemporaryValue}>
                <ModelSelectorName>{copy.clearTemporaryValue}</ModelSelectorName>
              </ModelSelectorItem>
            </>
          ) : null}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  )
}
