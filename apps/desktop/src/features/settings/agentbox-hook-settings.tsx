import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { type HooksPort, wireHooksPort } from '@/application/hooks/wire-hooks-port'
import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { type Translations, useI18n } from '@/i18n'
import { Zap } from '@/lib/icons'
import { wireErrorText } from '@/lib/wire-error-text'
import { $agentBoxService } from '@/store/agentbox-service'
import type { HookTriggerView, HookView } from '@/types/wire/wire-v1'

export type HookSettingsCopy = Translations['settings']['product']['hookSettings']

export interface AgentBoxHookSettingsProps {
  port?: HooksPort
}

/**
 * Order 59's hooks, as a surface that can actually act.
 *
 * Three honest rules are visible in the markup: a hook shows the EXACT commands
 * it would run before it can be enabled (the service derives them, so the list
 * cannot drift from what would execute); a hook the service calls not
 * executable gets a disabled switch that says why rather than a control that
 * fails on click; and deletion asks first and then reports how many trigger
 * rows went with it, because that cascade is real.
 */
export function AgentBoxHookSettings({ port }: AgentBoxHookSettingsProps = {}) {
  const copy = useI18n().t.settings.product.hookSettings
  const service = useStore($agentBoxService)
  const [hooks] = useState<HooksPort>(() => port ?? wireHooksPort(agentBoxRuntimeClient()))
  const [rows, setRows] = useState<HookView[]>([])
  const [triggers, setTriggers] = useState<HookTriggerView[]>([])
  const [triggersFor, setTriggersFor] = useState<null | string>(null)
  const [failure, setFailure] = useState<null | string>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const [pendingDelete, setPendingDelete] = useState<HookView | null>(null)
  const [draft, setDraft] = useState({ command: '', event: '', family: '', name: '' })

  const serviceReady = service.phase === 'ready'

  const load = useCallback(async () => {
    try {
      setRows(await hooks.list())
      setFailure(null)
    } catch (reason) {
      setRows([])
      setFailure(wireErrorText(reason))
    }
  }, [hooks])

  useEffect(() => {
    void load()
  }, [load])

  /** One write, one refresh. `done` is the default notice; an action that has
   *  a more specific thing to say (how many trigger rows a delete took) sets it
   *  itself and passes no `done`, so the message is never overwritten. */
  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      await action()

      if (done !== undefined) {
        setNotice(done)
      }

      await load()
    } catch (reason) {
      setError(wireErrorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const readable = failure === null && serviceReady
  const disabled = !readable || busy

  const openTriggers = async (hookId: string) => {
    setTriggersFor(hookId)
    setError(null)

    try {
      setTriggers(await hooks.triggers({ hookId, limit: 20 }))
    } catch (reason) {
      setTriggers([])
      setError(wireErrorText(reason))
    }
  }

  return (
    <SettingsContent>
      <SettingsSection
        aside={readable ? undefined : <Pill tone="warn">{copy.unavailableBadge}</Pill>}
        icon={Zap}
        title={copy.title}
      >
        <p className="mb-2 text-sm text-muted-foreground">{copy.description}</p>

        {!serviceReady ? (
          <div className="mb-2 text-xs text-amber-700 dark:text-amber-300" data-hooks-offline="">
            {copy.serviceOffline}
          </div>
        ) : null}
        {failure ? (
          <div className="mb-2 text-xs text-destructive" data-hooks-failure="">
            {copy.unavailable(failure)}
          </div>
        ) : null}

        {readable && rows.length === 0 ? (
          <ListRow description={copy.emptyDescription} title={copy.empty} wide />
        ) : (
          rows.map(hook => {
            const executable = hook.commands.length > 0

            return (
              <ListRow
                action={
                  <span className="flex items-center gap-1">
                    <Button
                      disabled={disabled || !executable}
                      onClick={() => void run(() => hooks.setEnabled({ enabled: !hook.enabled, hookId: hook.hookId }), hook.enabled ? copy.disabled : copy.enabled)}
                      size="sm"
                      title={executable ? undefined : copy.notExecutable}
                      type="button"
                      variant="ghost"
                    >
                      {hook.enabled ? copy.disable : copy.enable}
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() => void openTriggers(hook.hookId)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {copy.triggers}
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() => setPendingDelete(hook)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {copy.remove}
                    </Button>
                  </span>
                }
                description={
                  <div className="space-y-0.5 text-xs text-muted-foreground" data-hook-row={hook.hookId}>
                    <div className="font-mono" data-hook-event={hook.model.event}>
                      {hook.model.event}
                      {hook.model.matcher ? ` · ${hook.model.matcher}` : ''}
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4" data-hook-commands="">
                      {hook.commands.map(command => (
                        <li className="font-mono" key={command}>
                          {command}
                        </li>
                      ))}
                    </ul>
                    {executable ? null : (
                      <div className="italic" data-hook-not-executable="">
                        {copy.notExecutable}
                      </div>
                    )}
                  </div>
                }
                key={hook.hookId}
                title={
                  <span className="flex items-center gap-2">
                    {hook.name}
                    <Pill tone={hook.enabled ? 'success' : 'muted'}>{hook.enabled ? copy.enabledState : copy.disabledState}</Pill>
                    <Pill tone="muted">{hook.family}</Pill>
                  </span>
                }
                wide
              />
            )
          })
        )}
      </SettingsSection>

      <SettingsSection icon={Zap} title={copy.createTitle}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={copy.createFamily}
            className="h-8 w-28 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setDraft(current => ({ ...current, family: value }))
            }}
            placeholder={copy.createFamily}
            value={draft.family}
          />
          <Input
            aria-label={copy.createName}
            className="h-8 w-32 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setDraft(current => ({ ...current, name: value }))
            }}
            placeholder={copy.createName}
            value={draft.name}
          />
          <Input
            aria-label={copy.createEvent}
            className="h-8 w-32 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setDraft(current => ({ ...current, event: value }))
            }}
            placeholder={copy.createEvent}
            value={draft.event}
          />
          <Input
            aria-label={copy.createCommand}
            className="h-8 min-w-56 flex-1 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setDraft(current => ({ ...current, command: value }))
            }}
            placeholder={copy.createCommand}
            value={draft.command}
          />
          <Button
            disabled={
              disabled ||
              draft.family.trim() === '' ||
              draft.name.trim() === '' ||
              draft.event.trim() === '' ||
              draft.command.trim() === ''
            }
            onClick={() =>
              void run(
                () =>
                  hooks.create({
                    family: draft.family.trim(),
                    model: {
                      event: draft.event.trim(),
                      handlers: [{ async: false, command: draft.command.trim(), timeout: 30, type: 'command' }]
                    },
                    name: draft.name.trim()
                  }),
                copy.created
              )
            }
            size="sm"
            type="button"
          >
            {copy.create}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.createNote}</p>
      </SettingsSection>

      {triggersFor ? (
        <SettingsSection icon={Zap} title={copy.triggersTitle}>
          {triggers.length === 0 ? (
            <ListRow description={copy.triggersEmptyDescription} title={copy.triggersEmpty} wide />
          ) : (
            triggers.map(trigger => (
              <ListRow
                action={
                  trigger.blocking ? (
                    <Pill data-trigger-blocking="" tone="destructive">
                      {copy.blocking}
                    </Pill>
                  ) : (
                    <Pill tone="muted">{trigger.effect}</Pill>
                  )
                }
                description={
                  <div className="space-y-0.5 font-mono text-xs text-muted-foreground" data-trigger-row={trigger.triggerId}>
                    <div>
                      {trigger.event} · exit {trigger.exitCode}
                    </div>
                    <div>{trigger.at}</div>
                    {trigger.outputSummary ? (
                      <div className="truncate">
                        {trigger.outputSummary}
                        {trigger.truncated ? ` (${copy.truncated})` : ''}
                      </div>
                    ) : null}
                  </div>
                }
                key={trigger.triggerId}
                title={trigger.hookId}
                wide
              />
            ))
          )}
        </SettingsSection>
      ) : null}

      {notice ? (
        <div className="text-xs text-emerald-700 dark:text-emerald-300" data-hooks-notice="">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" data-hooks-error="">
          {copy.refused(error)}
        </div>
      ) : null}

      <ConfirmDialog
        confirmLabel={copy.remove}
        description={copy.removeDescription(pendingDelete?.name ?? '')}
        destructive
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          const hook = pendingDelete

          setPendingDelete(null)

          if (hook) {
            void run(async () => {
              const result = await hooks.remove(hook.hookId)

              setNotice(copy.removed(result.triggersRemoved))
            })
          }
        }}
        open={pendingDelete !== null}
        title={copy.removeTitle}
      />
    </SettingsContent>
  )
}
