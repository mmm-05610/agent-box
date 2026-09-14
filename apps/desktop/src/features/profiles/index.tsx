import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import {
  Panel,
  PanelAddButton,
  PanelBody,
  PanelDetail,
  PanelEmpty,
  PanelHeader,
  PanelList,
  PanelListRow,
  PanelMeta,
  PanelPill,
  PanelSectionLabel
} from '@/app/shell/layers/overlays/panel'
import {
  harnessChoicesFromProfiles,
  loadProfileRuntimeDescriptor,
  type ProfileMaintenancePort,
  wireProfileMaintenancePort
} from '@/application/profile/profile-maintenance-port'
import { ensureAgentBoxProfileCatalog } from '@/application/profile/wire-composer-profile'
import { ensureAgentBoxProviderModelCatalog } from '@/application/provider-model/wire-provider-model-catalog'
import { useRefreshHotkey } from '@/components/hooks/use-refresh-hotkey'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ProfileGlyph } from '@/components/ui/profile-glyph'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { normalize } from '@/lib/text'
import {
  $agentBoxHello,
  $agentBoxProfiles,
  $agentBoxProviderModels,
  $agentBoxService,
  agentBoxCapabilitySupported,
  upsertAgentBoxProfile
} from '@/store/agentbox-service'
import type { ConfigControl, ConfigDescriptor, ProfileRecord, ProfilesUpdateConfigResult } from '@/types/wire/wire-v1'

import {
  buildProfileConfigValues,
  emptyProfileConfigDraft,
  isProfileConfigDirty,
  type ProfileConfigDraft,
  ProfileConfigEditor
} from './profile-config-editor'

export interface ProfilesViewProps {
  /** Explicit adapter override for isolated component tests. */
  maintenance?: ProfileMaintenancePort
  onClose: () => void
}

type DescriptorState =
  | { descriptor: ConfigDescriptor; status: 'ready' }
  | { detail: string; status: 'unavailable' }
  | { status: 'loading' }

export function ProfilesView({ maintenance, onClose }: ProfilesViewProps) {
  const { t } = useI18n()
  const copy = t.profiles
  const profiles = useStore($agentBoxProfiles)
  const hello = useStore($agentBoxHello)
  const service = useStore($agentBoxService)
  const [selectedId, setSelectedId] = useState<null | string>(null)
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ProfileRecord | null>(null)

  const productionMaintenance = useMemo(() => {
    // Config editing is only offered when the service declares every method the
    // save path uses — a partial set would render controls that cannot save.
    const methods = ['profiles.create', 'profiles.update', 'profiles.updateConfig', 'profiles.archive']

    if (service.phase !== 'ready' || !methods.every(method => agentBoxCapabilitySupported(hello, method))) {
      return undefined
    }

    const harnessChoices = harnessChoicesFromProfiles(profiles)

    return harnessChoices.length > 0
      ? wireProfileMaintenancePort(agentBoxRuntimeClient(), { harnessChoices })
      : undefined
  }, [hello, profiles, service.phase])

  const activeMaintenance = maintenance ?? productionMaintenance

  const refresh = useCallback(async () => {
    await ensureAgentBoxProfileCatalog(agentBoxRuntimeClient()).catch(() => undefined)
  }, [])

  useRefreshHotkey(refresh)

  useEffect(() => {
    if (service.phase === 'idle') {
      void refresh()
    }
  }, [refresh, service.phase])

  useEffect(() => {
    if (selectedId && profiles.some(profile => profile.id === selectedId)) {
      return
    }

    setSelectedId(profiles[0]?.id ?? null)
  }, [profiles, selectedId])

  const selected = profiles.find(profile => profile.id === selectedId) ?? null

  const visibleProfiles = useMemo(() => {
    const normalized = normalize(query)

    if (!normalized) {
      return profiles
    }

    return profiles.filter(profile =>
      [profile.displayName, profile.harness].some(value => value.toLowerCase().includes(normalized))
    )
  }, [profiles, query])

  const loading = profiles.length === 0 && (service.phase === 'idle' || service.phase === 'loading')

  return (
    <Panel closeLabel={copy.close} onClose={onClose}>
      {loading ? (
        <PageLoader label={copy.loading} />
      ) : profiles.length === 0 ? (
        <PanelEmpty
          action={
            activeMaintenance ? (
              <Button onClick={() => setCreateOpen(true)} size="sm">
                {copy.newProfile}
              </Button>
            ) : undefined
          }
          description={
            service.detail || (activeMaintenance ? copy.agentBoxCreateDesc : copy.agentBoxMaintenanceUnavailableDesc)
          }
          icon="organization"
          title={activeMaintenance ? copy.noProfiles : copy.agentBoxMaintenanceUnavailable}
        />
      ) : (
        <>
          <PanelHeader subtitle={copy.count(profiles.length)} title={copy.title} />
          <PanelBody>
            <PanelList
              onSearchChange={setQuery}
              searchLabel={copy.search}
              searchPlaceholder={copy.search}
              searchValue={query}
            >
              {visibleProfiles.map(profile => (
                <ProfileRow
                  active={profile.id === selectedId}
                  key={profile.id}
                  onArchive={activeMaintenance ? () => setArchiveTarget(profile) : undefined}
                  onSelect={() => setSelectedId(profile.id)}
                  profile={profile}
                />
              ))}
              {activeMaintenance ? <PanelAddButton label={copy.newProfile} onClick={() => setCreateOpen(true)} /> : null}
            </PanelList>

            {selected ? (
              <ProfileDetail
                key={selected.id}
                maintenance={activeMaintenance}
                profile={selected}
                serviceOffline={service.phase === 'unavailable'}
              />
            ) : (
              <PanelEmpty description={copy.selectPrompt} icon="account" />
            )}
          </PanelBody>
        </>
      )}

      <CreateAgentBoxProfileDialog
        maintenance={activeMaintenance}
        onClose={() => setCreateOpen(false)}
        onCreated={profile => {
          upsertAgentBoxProfile(profile)
          setSelectedId(profile.id)
        }}
        open={createOpen}
      />

      <ConfirmDialog
        confirmLabel={copy.agentBoxArchive}
        description={archiveTarget ? copy.agentBoxArchiveDesc(archiveTarget.displayName) : ''}
        destructive
        dismissOnConfirm
        onClose={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget || !activeMaintenance) {
            return
          }

          upsertAgentBoxProfile(
            await activeMaintenance.archive({ expectedVersion: archiveTarget.version, profileId: archiveTarget.id })
          )
        }}
        open={archiveTarget !== null}
        title={copy.agentBoxArchiveTitle}
      />
    </Panel>
  )
}

function ProfileRow({ active, onArchive, onSelect, profile }: ProfileRowProps) {
  const copy = useI18n().t.profiles

  return (
    <PanelListRow
      active={active}
      lead={<ProfileGlyph aria-hidden="true" color={null} isDefault={false} name={profile.displayName} />}
      menuItems={onArchive ? [{ icon: 'archive', label: copy.agentBoxArchive, onSelect: onArchive }] : []}
      menuLabel={profile.displayName}
      meta={profile.harness}
      onSelect={onSelect}
      rowKey={profile.id}
      title={profile.displayName}
    />
  )
}

interface ProfileRowProps {
  active: boolean
  onArchive?: () => void
  onSelect: () => void
  profile: ProfileRecord
}

function ProfileDetail({ maintenance, profile, serviceOffline }: ProfileDetailProps) {
  const { t } = useI18n()
  const copy = t.profiles
  const providerModels = useStore($agentBoxProviderModels)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)
  const [savedFor, setSavedFor] = useState<null | ProfilesUpdateConfigResult['effectiveFor']>(null)
  const [descriptor, setDescriptor] = useState<DescriptorState>({ status: 'loading' })
  const [draft, setDraft] = useState<ProfileConfigDraft>(emptyProfileConfigDraft)

  const readDescriptor = useCallback(async (): Promise<DescriptorState> => {
    try {
      return {
        descriptor: await loadProfileRuntimeDescriptor(agentBoxRuntimeClient(), profile.id),
        status: 'ready'
      }
    } catch (reason) {
      return { detail: reason instanceof Error ? reason.message : copy.agentBoxUnavailable, status: 'unavailable' }
    }
  }, [copy.agentBoxUnavailable, profile.id])

  useEffect(() => {
    let current = true

    setDescriptor({ status: 'loading' })

    void readDescriptor().then(state => current && setDescriptor(state))

    return () => {
      current = false
    }
  }, [readDescriptor])

  const editableDescriptor = descriptor.status === 'ready' ? descriptor.descriptor : null
  const hasModelSlot = editableDescriptor?.controls.some(control => control.kind === 'model_slot') ?? false
  const configDirty = editableDescriptor ? isProfileConfigDirty(editableDescriptor, draft) : false
  const dirty = displayName.trim() !== profile.displayName || configDirty

  useEffect(() => {
    if (hasModelSlot && maintenance) {
      void ensureAgentBoxProviderModelCatalog(agentBoxRuntimeClient())
    }
  }, [hasModelSlot, maintenance])

  const save = async () => {
    if (!maintenance || saving || !dirty || !displayName.trim()) {
      return
    }

    setSaving(true)
    setError(null)
    setSavedFor(null)

    try {
      let current = profile
      const nextName = displayName.trim()

      // Rename first and reuse the version it returns: updateConfig replaces the
      // whole configuration, so it must CAS against the version the rename just
      // produced rather than the one this render started with.
      if (nextName !== current.displayName) {
        current = await maintenance.update({
          displayName: nextName,
          expectedVersion: current.version,
          profileId: current.id
        })

        upsertAgentBoxProfile(current)
      }

      if (configDirty && editableDescriptor) {
        const result = await maintenance.updateConfig({
          expectedVersion: current.version,
          profileId: current.id,
          values: buildProfileConfigValues(editableDescriptor, draft)
        })

        upsertAgentBoxProfile(result.profile)
        setDraft(emptyProfileConfigDraft())
        setSavedFor(result.effectiveFor)
        setDescriptor(await readDescriptor())
      }
    } catch (reason) {
      // The failed step keeps the service's projection and the draft: a retry
      // resumes from the version the successful step returned.
      setError(reason instanceof Error ? reason.message : copy.agentBoxConfigSaveFailed)
    } finally {
      setSaving(false)
    }
  }

  const savedNotice: Record<ProfilesUpdateConfigResult['effectiveFor'], string> = {
    next_send: copy.agentBoxConfigSavedNextSend
  }

  return (
    <PanelDetail className="space-y-5">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          {maintenance ? (
            <Input
              aria-label={copy.nameLabel}
              className="max-w-sm text-sm font-semibold"
              onChange={event => setDisplayName(event.currentTarget.value)}
              value={displayName}
            />
          ) : (
            <h3 className="text-[0.95rem] font-semibold tracking-tight text-foreground">{profile.displayName}</h3>
          )}
          {maintenance && dirty ? (
            <Button disabled={saving || !displayName.trim()} onClick={() => void save()} size="sm">
              {saving ? t.common.saving : copy.agentBoxSaveProfile}
            </Button>
          ) : null}
        </div>

        <PanelMeta
          rows={[
            { label: copy.agentBoxHarness, value: <PanelPill tone="muted">{profile.harness}</PanelPill> },
            { label: copy.agentBoxVersion, value: profile.version },
            {
              label: copy.agentBoxCapabilities,
              value: <ProfileCapabilities capabilities={profile.capabilities} />
            }
          ]}
        />
      </header>

      {error ? <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}

      {savedFor ? (
        <div
          className="rounded bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"
          data-effective-for={savedFor}
        >
          {savedNotice[savedFor]}
        </div>
      ) : null}

      {!maintenance ? (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <div className="text-xs font-medium text-foreground">{copy.agentBoxMaintenanceUnavailable}</div>
          <p className="mt-1 text-xs text-muted-foreground">{copy.agentBoxMaintenanceUnavailableDesc}</p>
        </div>
      ) : null}

      {serviceOffline ? (
        <div className="rounded bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {copy.agentBoxUnavailable}
        </div>
      ) : null}

      <section className="space-y-2">
        <div>
          <PanelSectionLabel>{copy.agentBoxRuntimeConfig}</PanelSectionLabel>
          <p className="text-xs text-muted-foreground">{copy.agentBoxRuntimeConfigDesc}</p>
        </div>
        {descriptor.status === 'loading' ? (
          <PageLoader className="min-h-24" label={copy.loading} />
        ) : descriptor.status === 'unavailable' ? (
          <div className="text-xs text-muted-foreground">{descriptor.detail}</div>
        ) : maintenance ? (
          <ProfileConfigEditor
            descriptor={descriptor.descriptor}
            disabled={saving}
            draft={draft}
            harness={profile.harness}
            models={providerModels}
            onChange={setDraft}
          />
        ) : (
          <RuntimeConfigSummary controls={descriptor.descriptor.controls} />
        )}
      </section>
    </PanelDetail>
  )
}

interface ProfileDetailProps {
  maintenance?: ProfileMaintenancePort
  profile: ProfileRecord
  serviceOffline: boolean
}

function ProfileCapabilities({ capabilities }: { capabilities: Record<string, boolean> }) {
  const copy = useI18n().t.profiles
  const entries = Object.entries(capabilities)

  if (entries.length === 0) {
    return <span className="text-muted-foreground">{copy.agentBoxUnavailable}</span>
  }

  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([id, available]) => (
        <PanelPill key={id} tone={available ? 'good' : 'muted'}>
          {id} · {available ? copy.agentBoxAvailable : copy.agentBoxUnavailable}
        </PanelPill>
      ))}
    </span>
  )
}

function RuntimeConfigSummary({ controls }: { controls: ConfigControl[] }) {
  const copy = useI18n().t.profiles

  if (controls.length === 0) {
    return <div className="text-xs text-muted-foreground">{copy.notSet}</div>
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {controls.map(control => (
        <div className="flex items-start justify-between gap-4 px-3 py-2 text-xs" key={control.controlId}>
          <span className="font-medium text-foreground">{control.controlId}</span>
          <span className="max-w-[65%] text-right text-muted-foreground">
            {control.kind === 'model_slot'
              ? control.slots
                  .map(slot =>
                    slot.model ? `${slot.name}: ${slot.model.providerId}/${slot.model.modelId}` : `${slot.name}: —`
                  )
                  .join(' · ')
              : String(control.currentValue ?? copy.notSet)}
          </span>
        </div>
      ))}
    </div>
  )
}

function CreateAgentBoxProfileDialog({ maintenance, onClose, onCreated, open }: CreateProfileDialogProps) {
  const { t } = useI18n()
  const copy = t.profiles
  const [displayName, setDisplayName] = useState('')
  const [harness, setHarness] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    if (!open) {
      setDisplayName('')
      setHarness('')
      setError(null)
    }
  }, [open])

  const create = async () => {
    if (!maintenance || !displayName.trim() || !harness) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const created = await maintenance.create({ displayName: displayName.trim(), harness })
      onCreated(created)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.failedCreate)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog onOpenChange={value => !value && !saving && onClose()} open={open && Boolean(maintenance)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.newProfile}</DialogTitle>
          <DialogDescription>{copy.agentBoxCreateDesc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-foreground">{copy.nameLabel}</span>
            <Input onChange={event => setDisplayName(event.currentTarget.value)} value={displayName} />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-foreground">{copy.agentBoxHarnessChoice}</span>
            <Select onValueChange={setHarness} value={harness}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t.common.choose} />
              </SelectTrigger>
              <SelectContent>
                {maintenance?.harnessChoices.map(choice => (
                  <SelectItem key={choice.id} value={choice.id}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {error ? <div className="rounded bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div> : null}
        </div>
        <DialogFooter>
          <Button disabled={saving} onClick={onClose} variant="ghost">
            {t.common.cancel}
          </Button>
          <Button disabled={saving || !displayName.trim() || !harness} onClick={() => void create()}>
            {saving ? t.common.saving : copy.createAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface CreateProfileDialogProps {
  maintenance?: ProfileMaintenancePort
  onClose: () => void
  onCreated: (profile: ProfileRecord) => void
  open: boolean
}
