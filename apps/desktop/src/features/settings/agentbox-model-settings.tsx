import { useStore } from '@nanostores/react'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import {
  addDesktopCredential,
  type DesktopCredentialRecord,
  listDesktopCredentials
} from '@/application/provider-model/desktop-credentials'
import {
  type ProviderModelMaintenancePort,
  wireProviderModelMaintenancePort
} from '@/application/provider-model/provider-model-maintenance-port'
import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { controlVariants } from '@/components/ui/control'
import { Input } from '@/components/ui/input'
import { type Translations, useI18n } from '@/i18n'
import { Check, Cpu, Loader2, Pencil, Plus, Trash2, X } from '@/lib/icons'
import {
  $agentBoxHello,
  $agentBoxService,
  agentBoxCapabilitySupported,
  setAgentBoxProviderModels,
  upsertAgentBoxProviderModel
} from '@/store/agentbox-service'
import type { ProviderModelConfigRecord } from '@/types/wire/wire-v1'

type ModelsCopy = Translations['settings']['product']['models']

export interface DesktopCredentialsPort {
  add: typeof addDesktopCredential
  list: typeof listDesktopCredentials
}

interface AgentBoxModelSettingsProps {
  credentials?: DesktopCredentialsPort
  maintenance?: ProviderModelMaintenancePort
}

/** The sentinel a `Select` needs: Radix refuses an empty item value, so "no
 *  credential" travels as a value that cannot collide with an id. */
const NO_CREDENTIAL = '__none__'

function credentialChoice(value: string): string | null {
  return value === NO_CREDENTIAL ? null : value
}

function CredentialPicker({
  copy,
  disabled,
  onChange,
  records,
  value
}: {
  copy: ModelsCopy
  disabled: boolean
  onChange: (next: string | null) => void
  records: DesktopCredentialRecord[]
  value: string | null
}) {
  return (
    <select
      aria-label={copy.credential}
      className={controlVariants({ size: 'sm' })}
      disabled={disabled}
      onChange={event => onChange(credentialChoice(event.target.value))}
      value={value ?? NO_CREDENTIAL}
    >
      <option value={NO_CREDENTIAL}>{copy.credentialNone}</option>
      {records.map(record => (
        <option key={record.credentialId} value={record.credentialId}>
          {record.label || record.credentialId}
        </option>
      ))}
    </select>
  )
}

const REQUIRED_CAPABILITIES = [
  'providerModels.list',
  'providerModels.create',
  'providerModels.update',
  'providerModels.archive'
]

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function AgentBoxModelSettings({ credentials, maintenance }: AgentBoxModelSettingsProps) {
  const productCopy = useI18n().t.settings.product
  const copy = productCopy.models
  const service = useStore($agentBoxService)
  const hello = useStore($agentBoxHello)
  const supported = REQUIRED_CAPABILITIES.every(capability => agentBoxCapabilitySupported(hello, capability))

  const port = useMemo(
    () =>
      maintenance ??
      (supported && service.phase === 'ready' ? wireProviderModelMaintenancePort(agentBoxRuntimeClient()) : null),
    [maintenance, service.phase, supported]
  )

  const [records, setRecords] = useState<ProviderModelConfigRecord[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ProviderModelConfigRecord | null>(null)

  // Memoised: a fresh object here would make `loadCredentials` a new function on
  // every render, and the effect that calls it would then loop.
  const credentialPort: DesktopCredentialsPort = useMemo(
    () => credentials ?? { add: addDesktopCredential, list: listDesktopCredentials },
    [credentials]
  )

  const [credentialRecords, setCredentialRecords] = useState<DesktopCredentialRecord[]>([])
  const [adding, setAdding] = useState(false)
  const [addingLabel, setAddingLabel] = useState('')
  const [addingSecret, setAddingSecret] = useState('')
  const [addingBusy, setAddingBusy] = useState(false)

  const load = useCallback(async () => {
    if (!port) {
      return
    }

    setState('loading')
    setError(null)

    try {
      const listed = (await port.list()).items.filter(record => !record.archivedAt)
      setRecords(listed)
      setAgentBoxProviderModels(listed)
      setState('idle')
    } catch (cause) {
      setState('error')
      setError(errorMessage(cause))
    }
  }, [port])

  const loadCredentials = useCallback(async () => {
    setCredentialRecords(await credentialPort.list())
  }, [credentialPort])

  useEffect(() => {
    void load()
    void loadCredentials()
  }, [load, loadCredentials])

  const addCredential = async () => {
    if (addingBusy) {
      return
    }

    setAddingBusy(true)
    setError(null)

    try {
      const outcome = await credentialPort.add({
        kind: 'api-key',
        label: addingLabel.trim(),
        secret: addingSecret
      })

      if (outcome.ok) {
        setAddingSecret('')
        setAddingLabel('')
        setAdding(false)
        await loadCredentials()
      } else {
        // The Server's own code is what explains a refusal; the interface shows
        // it rather than a generic failure.
        setError(`${copy.credentialFailed}: ${outcome.code}`)
      }
    } finally {
      setAddingBusy(false)
    }
  }

  if (!port) {
    return (
      <SettingsContent>
        <SettingsSection aside={<Pill tone="warn">{productCopy.unavailable}</Pill>} icon={Cpu} title={copy.title}>
          <ListRow description={copy.unavailableDescription} title={copy.serviceBoundary} wide />
        </SettingsSection>
      </SettingsContent>
    )
  }

  const replace = (record: ProviderModelConfigRecord) =>
    setRecords(current =>
      current.some(item => item.id === record.id)
        ? current.map(item => (item.id === record.id ? record : item))
        : [...current, record]
    )

  const archive = async (record: ProviderModelConfigRecord) => {
    setError(null)

    try {
      const archived = await port.archive({ providerModelId: record.id, expectedVersion: record.version })

      if (archived.archivedAt) {
        setRecords(current => current.filter(item => item.id !== archived.id))
        upsertAgentBoxProviderModel(archived)
      } else {
        replace(archived)
        upsertAgentBoxProviderModel(archived)
      }
    } catch (cause) {
      setError(errorMessage(cause))
      throw cause
    }
  }

  const create = async (
    displayName: string,
    harness: string,
    provider: string,
    models: ProviderModelConfigRecord['models'],
    credentialId: string | null
  ) => {
    const created = await port.create({
      displayName,
      harness,
      provider,
      credentialId,
      configuration: [],
      models: models.map(model => ({ ...model, modelId: model.modelId.trim(), displayName: model.displayName.trim() }))
    })

    replace(created)
    upsertAgentBoxProviderModel(created)
    setError(null)
    setCreating(false)
  }

  return (
    <SettingsContent>
      <SettingsSection
        aside={
          <div className="flex gap-2">
            <Button
              disabled={adding || addingBusy}
              onClick={() => setAdding(true)}
              size="sm"
              variant="outline"
            >
              {copy.credentialAdd}
            </Button>
            <Button disabled={creating} onClick={() => setCreating(true)} size="sm">
              <Plus />
              {copy.add}
            </Button>
          </div>
        }
        icon={Cpu}
        title={copy.title}
      >
        <p className="mb-3 text-sm text-muted-foreground">{copy.description}</p>
        {state === 'loading' && (
          <ListRow description={<Loader2 className="size-4 animate-spin" />} title={copy.loading} wide />
        )}
        {state === 'error' && (
          <ListRow
            action={
              <Button onClick={() => void load()} size="sm" variant="outline">
                {copy.retry}
              </Button>
            }
            description={error}
            title={copy.error}
            wide
          />
        )}
        {state !== 'loading' && state !== 'error' && records.length === 0 && (
          <ListRow description={copy.emptyDescription} title={copy.empty} wide />
        )}
        {records.map(record => (
          <ModelRow
            copy={copy}
            credentials={credentialRecords}
            editing={editing === record.id}
            key={`${record.id}:${record.version}`}
            onArchive={() => setArchiveTarget(record)}
            onCancel={() => setEditing(null)}
            onEdit={() => {
              setError(null)
              setEditing(record.id)
            }}
            onError={cause => setError(errorMessage(cause))}
            onSaved={next => {
              replace(next)
              upsertAgentBoxProviderModel(next)
              setError(null)
              setEditing(null)
            }}
            port={port}
            record={record}
          />
        ))}
      </SettingsSection>
      {adding && (
        <SettingsSection icon={Plus} title={copy.credentialAdd}>
          <div className="grid gap-2">
            <Input
              aria-label={copy.credentialLabel}
              disabled={addingBusy}
              onChange={event => setAddingLabel(event.target.value)}
              placeholder={copy.credentialLabel}
              value={addingLabel}
            />
            <Input
              aria-label={copy.credentialSecret}
              disabled={addingBusy}
              onChange={event => setAddingSecret(event.target.value)}
              placeholder={copy.credentialSecret}
              type="password"
              value={addingSecret}
            />
            <div className="flex gap-2">
              <Button
                disabled={addingBusy || !addingLabel.trim() || !addingSecret}
                onClick={() => void addCredential()}
              >
                {copy.credentialSave}
              </Button>
              <Button
                disabled={addingBusy}
                onClick={() => {
                  setAdding(false)
                  setAddingSecret('')
                }}
                variant="ghost"
              >
                {copy.credentialCancel}
              </Button>
            </div>
          </div>
        </SettingsSection>
      )}
      {creating && (
        <CreateForm
          copy={copy}
          credentials={credentialRecords}
          onCancel={() => setCreating(false)}
          onCreate={async (...args) => {
            try {
              await create(...args)
            } catch (cause) {
              setError(errorMessage(cause))
            }
          }}
        />
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        cancelLabel={copy.cancel}
        confirmLabel={copy.archive}
        description={`${copy.archive}: ${archiveTarget?.displayName ?? ''}`}
        destructive
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (archiveTarget) {
            await archive(archiveTarget)
          }
        }}
        open={archiveTarget !== null}
        title={copy.archive}
      />
    </SettingsContent>
  )
}

function ModelRow({
  record,
  copy,
  credentials,
  editing,
  onEdit,
  onCancel,
  onSaved,
  onArchive,
  onError,
  port
}: {
  record: ProviderModelConfigRecord
  copy: ModelsCopy
  credentials: DesktopCredentialRecord[]
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSaved: (record: ProviderModelConfigRecord) => void
  onArchive: () => void
  onError: (cause: unknown) => void
  port: ProviderModelMaintenancePort
}) {
  const [name, setName] = useState(record.displayName)
  const [models, setModels] = useState(record.models.length > 0 ? record.models : [newModel()])
  const [credentialId, setCredentialId] = useState<string | null>(record.credentialId)
  const [saving, setSaving] = useState(false)

  const valid = Boolean(
    name.trim() &&
      record.harness.trim() &&
      record.provider.trim() &&
      models.length > 0 &&
      models.every(model => model.modelId.trim() && model.displayName.trim())
  )

  const save = async () => {
    if (saving) {
      return
    }

    const displayName = name.trim()

    const nextModels = models.map(model => ({
      ...model,
      modelId: model.modelId.trim(),
      displayName: model.displayName.trim()
    }))

    if (!valid) {
      return
    }

    setSaving(true)

    try {
      onSaved(
        await port.update({
          providerModelId: record.id,
          expectedVersion: record.version,
          displayName,
          credentialId,
          configuration: record.configuration,
          models: nextModels
        })
      )
    } catch (cause) {
      onError(cause)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ListRow
      action={
        editing ? (
          <div className="flex gap-1">
            <Button aria-label={copy.save} disabled={saving || !valid} onClick={() => void save()} size="icon-xs">
              <Check />
            </Button>
            <Button aria-label={copy.cancel} disabled={saving} onClick={onCancel} size="icon-xs" variant="ghost">
              <X />
            </Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button aria-label={copy.edit} disabled={saving} onClick={onEdit} size="icon-xs" variant="ghost">
              <Pencil />
            </Button>
            <Button aria-label={copy.archive} disabled={saving} onClick={onArchive} size="icon-xs" variant="ghost">
              <Trash2 />
            </Button>
          </div>
        )
      }
      description={
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {record.harness} · {record.provider} · {copy.credential}: {record.credentialId ? copy.present : copy.absent}
          </div>
          {models.map((model, index) => (
            <div className="flex items-center gap-2 text-xs" key={`${record.id}-${index}`}>
              {editing ? (
                <>
                  <Input
                    aria-label={copy.modelId}
                    disabled={saving}
                    onChange={event =>
                      setModels(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, modelId: event.target.value } : item
                        )
                      )
                    }
                    value={model.modelId}
                  />
                  <Input
                    aria-label={copy.modelDisplayName}
                    disabled={saving}
                    onChange={event =>
                      setModels(current =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, displayName: event.target.value } : item
                        )
                      )
                    }
                    value={model.displayName}
                  />
                </>
              ) : (
                <span>
                  {model.displayName} ({model.modelId})
                </span>
              )}
              {editing && models.length > 1 && (
                <Button
                  aria-label={copy.removeModel}
                  disabled={saving}
                  onClick={() => setModels(current => current.filter((_, itemIndex) => itemIndex !== index))}
                  size="icon-xs"
                  variant="ghost"
                >
                  <Trash2 />
                </Button>
              )}
              <Pill
                tone={
                  model.availability === 'available'
                    ? 'success'
                    : model.availability === 'unavailable'
                      ? 'warn'
                      : 'muted'
                }
              >
                {copy.availability[model.availability]}
              </Pill>
              {model.unavailableReason && <span className="text-muted-foreground">{model.unavailableReason}</span>}
            </div>
          ))}
          {editing && (
            <CredentialPicker
              copy={copy}
              disabled={saving}
              onChange={setCredentialId}
              records={credentials}
              value={credentialId}
            />
          )}
          {editing && (
            <Button
              aria-label={copy.addModel}
              disabled={saving}
              onClick={() => setModels(current => [...current, newModel()])}
              size="sm"
              variant="outline"
            >
              <Plus />
              {copy.addModel}
            </Button>
          )}
        </div>
      }
      title={
        editing ? (
          <Input aria-label={copy.displayName} disabled={saving} onChange={event => setName(event.target.value)} value={name} />
        ) : (
          record.displayName
        )
      }
      wide
    />
  )
}

function CreateForm({
  copy,
  credentials,
  onCancel,
  onCreate
}: {
  copy: ModelsCopy
  credentials: DesktopCredentialRecord[]
  onCancel: () => void
  onCreate: (
    displayName: string,
    harness: string,
    provider: string,
    models: ProviderModelConfigRecord['models'],
    credentialId: string | null
  ) => Promise<void>
}) {
  const [values, setValues] = useState(['', '', '', ''])
  const [models, setModels] = useState([newModel()])
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const valid = Boolean(
    values.slice(0, 3).every(value => value.trim()) &&
      models.length > 0 &&
      models.every(model => model.modelId.trim() && model.displayName.trim())
  )

  const set = (index: number) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues(current => current.map((value, item) => (item === index ? event.target.value : value)))

  return (
    <SettingsSection icon={Plus} title={copy.add}>
      <div className="grid gap-2">
        <Input aria-label={copy.displayName} disabled={saving} onChange={set(0)} placeholder={copy.displayName} value={values[0]} />
        <Input aria-label={copy.harness} disabled={saving} onChange={set(1)} placeholder={copy.harness} value={values[1]} />
        <Input aria-label={copy.provider} disabled={saving} onChange={set(2)} placeholder={copy.provider} value={values[2]} />
        <CredentialPicker
          copy={copy}
          disabled={saving}
          onChange={setCredentialId}
          records={credentials}
          value={credentialId}
        />
        {models.map((model, index) => (
          <div className="flex items-center gap-2" key={index}>
            <Input
              aria-label={copy.modelId}
              disabled={saving}
              onChange={event =>
                setModels(current =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, modelId: event.target.value } : item
                  )
                )
              }
              placeholder={copy.modelId}
              value={model.modelId}
            />
            <Input
              aria-label={copy.modelDisplayName}
              disabled={saving}
              onChange={event =>
                setModels(current =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? { ...item, displayName: event.target.value } : item
                  )
                )
              }
              placeholder={copy.modelDisplayName}
              value={model.displayName}
            />
            {models.length > 1 && (
              <Button
                aria-label={copy.removeModel}
                disabled={saving}
                onClick={() => setModels(current => current.filter((_, itemIndex) => itemIndex !== index))}
                size="icon-xs"
                variant="ghost"
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        <Button
          aria-label={copy.addModel}
          disabled={saving}
          onClick={() => setModels(current => [...current, newModel()])}
          size="sm"
          variant="outline"
        >
          <Plus />
          {copy.addModel}
        </Button>
        <div className="flex gap-2">
          <Button
            disabled={saving || !valid}
            onClick={async () => {
              if (saving) {
                return
              }

              setSaving(true)

              try {
                await onCreate(values[0].trim(), values[1].trim(), values[2].trim(), models, credentialId)
              } finally {
                setSaving(false)
              }
            }}
          >
            {copy.save}
          </Button>
          <Button disabled={saving} onClick={onCancel} variant="ghost">
            {copy.cancel}
          </Button>
        </div>
      </div>
    </SettingsSection>
  )
}

function newModel(): ProviderModelConfigRecord['models'][number] {
  return { modelId: '', displayName: '', availability: 'unknown', unavailableReason: null }
}
