import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Tip, TipKeybindLabel } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import type { ChatBarState } from '@/lib/composer/types'
import { iconSize, Layers3 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $hudMode, closeHud, resetHudLayout } from '@/store/hud'

import { GHOST_ICON_BTN, PRIMARY_ICON_BTN } from './control-classes'
import { ModelPill } from './model-pill'
import { ComposerProfileControls } from './profile-controls'

// Re-exported: `context-menu.tsx` and other row neighbours have always reached
// for these here, and the row is where they read as belonging.
export { ACTIVE_ICON_BTN, GHOST_ICON_BTN, ICON_BTN, PRIMARY_ICON_BTN } from './control-classes'

export function ComposerControls({
  busy,
  busyAction,
  canSubmit,
  compactModelPill = false,
  disabled,
  hasComposerPayload,
  minimal = false,
  state,
  onQueue
}: {
  busy: boolean
  busyAction: 'steer' | 'queue' | 'stop'
  canSubmit: boolean
  compactModelPill?: boolean
  disabled: boolean
  hasComposerPayload: boolean
  minimal?: boolean
  state: ChatBarState
  onQueue: () => void
}) {
  const { t } = useI18n()
  const c = t.composer
  const hudMode = useStore($hudMode)

  // Steer is just send: a payload keeps the Send affordance mid-turn. Stop
  // only when the composer is empty and a turn is running.
  const showStop = busy && !hasComposerPayload
  const showQueueButton = busyAction !== 'stop' && hasComposerPayload

  return (
    <div className="ml-auto flex min-w-0 shrink items-center gap-(--composer-control-gap)">
      {!hudMode && state.profile ? <ComposerProfileControls profile={state.profile} /> : null}
      {minimal || state.model.hidden ? null : (
        <ModelPill compact={compactModelPill} disabled={disabled} model={state.model} />
      )}
      {showQueueButton ? (
        <Tip label={<TipKeybindLabel actionId="composer.queue" text={c.queueMessage} />}>
          <Button
            aria-label={c.queueMessage}
            className={GHOST_ICON_BTN}
            disabled={disabled}
            onClick={onQueue}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Layers3 className={iconSize.sm} />
          </Button>
        </Tip>
      ) : null}
      <Tip
        label={
          showStop ? (
            <TipKeybindLabel actionId="composer.send" text={c.stop} />
          ) : (
            <TipKeybindLabel actionId="composer.send" text={c.send} />
          )
        }
      >
        <Button
          aria-label={showStop ? c.stop : c.send}
          className={PRIMARY_ICON_BTN}
          disabled={disabled || !canSubmit}
          type="submit"
        >
          {showStop ? (
            <span className="block size-2.5 rounded-[0.1875rem] bg-current" />
          ) : (
            <Codicon name="arrow-up" size="0.875rem" />
          )}
        </Button>
      </Tip>
      {/* The way out of HUD mode, riding the controls row rather than floating
          above the bar. The old chip lived in a 26px transparent strip reserved
          over the composer (--hud-chip-strip), which under glass is bare
          untinted material with a hidden button in it — a band of chrome above
          the surface, paid for in every state, for a control that is invisible
          until hovered. Here it costs no reserved space and sits with the other
          things you can press. */}
      {hudMode ? <HudWindowButtons /> : null}
    </div>
  )
}

function HudWindowButtons() {
  const { t } = useI18n()

  return (
    <>
      <Tip label={t.titlebar.resetHudLayout}>
        <Button
          aria-label={t.titlebar.resetHudLayout}
          className={cn(GHOST_ICON_BTN, 'p-0')}
          onClick={resetHudLayout}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Codicon name="discard" size="0.875rem" />
        </Button>
      </Tip>
      <Tip label={t.titlebar.exitHud}>
        <Button
          aria-label={t.titlebar.exitHud}
          className={cn(GHOST_ICON_BTN, 'p-0')}
          onClick={closeHud}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Codicon name="screen-normal" size="0.875rem" />
        </Button>
      </Tip>
    </>
  )
}
