import { useEffect, useState } from 'react'

import { AlertTriangle } from '@/lib/icons'
import { wireErrorText } from '@/lib/wire-error-text'
import type { PermissionRule, ProfileRecord } from '@/types/wire/wire-v1'

import { Button } from '@/components/ui/button'
import type { Translations } from '@/i18n'

export type PermissionEditorCopy = Translations['profiles']['roleSettings']

export interface ProfilePermissionEditorProps {
  copy: PermissionEditorCopy
  /** True while the surface itself is unavailable (offline, or the catalog
   *  read failed): nothing here may be submitted in that state. */
  disabled: boolean
  /** The service owns the verdict; the editor only reports it. */
  onSave: (intent: { preset: string; rules: PermissionRule[] }) => Promise<void>
  profile: ProfileRecord
}

const TOOL_KEYS: PermissionRule['key'][] = ['read', 'edit', 'bash', 'task', 'external_directory', 'webfetch', 'skill']
const ACTIONS: PermissionRule['action'][] = ['allow', 'ask', 'deny']

const emptyRule = (): PermissionRule => ({ action: 'ask', key: 'bash', pattern: null })

/**
 * Order 60's permission posture, as an editor.
 *
 * Two honest choices worth naming: the rule ORDER is the semantics (the LAST
 * match wins, which is why the service re-expands the set on a clone), so rows
 * are never sorted or deduplicated behind the user's back; and the preset is a
 * free field with the known names as suggestions rather than a closed dropdown,
 * because the declared preset list lives in the service — an unsupported one
 * comes back as `PERMISSION_PRESET_UNSUPPORTED` and is shown as such instead of
 * being pre-filtered by a client-side copy of the server's vocabulary.
 */
export function ProfilePermissionEditor({ copy, disabled, onSave, profile }: ProfilePermissionEditorProps) {
  const [preset, setPreset] = useState(profile.permissionPreset ?? '')
  const [rules, setRules] = useState<PermissionRule[]>(profile.permissionRules ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setPreset(profile.permissionPreset ?? '')
    setRules(profile.permissionRules ?? [])
    setError(null)
    setSaved(false)
  }, [profile.id, profile.permissionPreset, profile.permissionRules, profile.version])

  const update = (index: number, next: Partial<PermissionRule>) =>
    setRules(current => current.map((rule, position) => (position === index ? { ...rule, ...next } : rule)))

  const save = async () => {
    if (disabled || saving || preset.trim() === '') {
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await onSave({ preset: preset.trim(), rules })
      setSaved(true)
    } catch (reason) {
      setError(wireErrorText(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2" data-permission-editor="">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground" htmlFor="permission-preset">
          {copy.permissionsPresetLabel}
        </label>
        <input
          className="w-40 rounded-md border border-input bg-transparent px-2 py-1 font-mono text-xs"
          disabled={disabled || saving}
          id="permission-preset"
          list="permission-preset-options"
          onChange={event => setPreset(event.target.value)}
          value={preset}
        />
        <datalist id="permission-preset-options">
          {['default', 'plan', 'full-access'].map(name => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Button disabled={disabled || saving || preset.trim() === ''} onClick={() => void save()} size="sm" type="button">
          {saving ? copy.permissionsSaving : copy.permissionsSave}
        </Button>
        {saved ? <span className="text-xs text-muted-foreground" data-permission-saved="">{copy.permissionsSaved}</span> : null}
      </div>

      <ul className="space-y-1" data-permission-rules="">
        {rules.map((rule, index) => (
          <li className="flex items-center gap-1.5" key={index}>
            <select
              aria-label={copy.permissionsKey}
              className="rounded-md border border-input bg-transparent px-1.5 py-1 font-mono text-[0.6875rem]"
              disabled={disabled || saving}
              onChange={event => update(index, { key: event.target.value as PermissionRule['key'] })}
              value={rule.key}
            >
              {TOOL_KEYS.map(key => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
            <input
              aria-label={copy.permissionsPattern}
              className="w-40 rounded-md border border-input bg-transparent px-1.5 py-1 font-mono text-[0.6875rem]"
              disabled={disabled || saving}
              onChange={event => update(index, { pattern: event.target.value === '' ? null : event.target.value })}
              placeholder={copy.permissionsAnyTarget}
              value={rule.pattern ?? ''}
            />
            <select
              aria-label={copy.permissionsAction}
              className="rounded-md border border-input bg-transparent px-1.5 py-1 font-mono text-[0.6875rem]"
              disabled={disabled || saving}
              onChange={event => update(index, { action: event.target.value as PermissionRule['action'] })}
              value={rule.action}
            >
              {ACTIONS.map(action => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <Button
              disabled={disabled || saving}
              onClick={() => setRules(current => current.filter((_rule, position) => position !== index))}
              size="sm"
              type="button"
              variant="ghost"
            >
              {copy.permissionsRemove}
            </Button>
          </li>
        ))}
      </ul>

      <Button
        disabled={disabled || saving}
        onClick={() => setRules(current => [...current, emptyRule()])}
        size="sm"
        type="button"
        variant="ghost"
      >
        {copy.permissionsAdd}
      </Button>

      <p className="text-xs text-muted-foreground">{copy.permissionsOrderNote}</p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span data-permission-error="">{error}</span>
        </div>
      )}
    </div>
  )
}
