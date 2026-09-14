import { useStore } from '@nanostores/react'
import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import {
  type ProviderModelMaintenancePort,
  wireProviderModelMaintenancePort
} from '@/application/provider-model/provider-model-maintenance-port'
import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
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

interface AgentBoxModelSettingsProps {
  maintenance?: ProviderModelMaintenancePort
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

export function AgentBoxModelSettings({ maintenance }: AgentBoxModelSettingsProps) {
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

  useEffect(() => {
    void load()
  }, [load])

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

  const create = async (displayName: string, harness: string, provider: string, models: ProviderModelConfigRecord['models']) => {
    const created = await port.create({
      displayName,
      harness,
      provider,
      credentialId: null,
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
          <Button disabled={creating} onClick={() => setCreating(true)} size="sm">
            <Plus />
            {copy.add}
          </Button>
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
      {creating && (
        <CreateForm
          copy={copy}
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
          credentialId: record.credentialId,
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
  onCancel,
  onCreate
}: {
  copy: ModelsCopy
  onCancel: () => void
  onCreate: (displayName: string, harness: string, provider: string, models: ProviderModelConfigRecord['models']) => Promise<void>
}) {
  const [values, setValues] = useState(['', '', '', ''])
  const [models, setModels] = useState([newModel()])
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
                await onCreate(values[0].trim(), values[1].trim(), values[2].trim(), models)
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
