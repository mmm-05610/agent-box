import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { type AssetHubPort, wireAssetHubPort } from '@/application/assets/wire-asset-hub-port'
import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Translations, useI18n } from '@/i18n'
import { Archive, Package } from '@/lib/icons'
import { wireErrorText } from '@/lib/wire-error-text'
import { $agentBoxProfiles, $agentBoxService } from '@/store/agentbox-service'
import type { AssetBinding, AssetView } from '@/types/wire/wire-v1'

export type AssetHubCopy = Translations['settings']['product']['assetHub']

export interface AgentBoxAssetHubProps {
  port?: AssetHubPort
}

interface Loaded {
  assets: AssetView[]
  bindings: AssetBinding[]
  /** The reading failure that makes this surface read-only, if any. */
  failure: null | string
}

const KIND_TONE = { mcp: 'muted', plugin: 'warn', skill: 'muted' } as const

/**
 * Orders 58/59 as a product surface: the catalogue, its per-role bindings, and
 * the three publish paths.
 *
 * The availability rule is the load's own answer. If `assets.list` (or the
 * bindings read) fails — an uncomposed store, a service that is not there —
 * the surface says why and every write control is disabled: a greyed control
 * with a reason is honest, a control that clicks into silence is not.
 */
export function AgentBoxAssetHub({ port }: AgentBoxAssetHubProps = {}) {
  const copy = useI18n().t.settings.product.assetHub
  const profiles = useStore($agentBoxProfiles)
  const service = useStore($agentBoxService)
  const [hub] = useState<AssetHubPort>(() => port ?? wireAssetHubPort(agentBoxRuntimeClient()))
  const [profileId, setProfileId] = useState<null | string>(null)
  const [state, setState] = useState<Loaded>({ assets: [], bindings: [], failure: null })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)

  const [publish, setPublish] = useState<{ assetId: string; kind: 'mcp' | 'plugin' | 'skill'; path: string; revision: string }>(
    { assetId: '', kind: 'skill', path: '', revision: '1' }
  )

  const selected = profileId ?? profiles[0]?.id ?? null
  const serviceReady = service.phase === 'ready'

  const load = useCallback(async () => {
    try {
      const assets = await hub.list()
      const bindings = selected ? await hub.bindings(selected) : []
      setState({ assets, bindings, failure: null })
    } catch (reason) {
      setState({ assets: [], bindings: [], failure: wireErrorText(reason) })
    }
  }, [hub, selected])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      await action()
      setNotice(done ?? null)
      await load()
    } catch (reason) {
      setError(wireErrorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const readable = state.failure === null && serviceReady
  const boundIds = new Set(state.bindings.map(binding => binding.assetId))
  const disabled = !readable || busy

  return (
    <SettingsContent>
      <SettingsSection icon={Package} title={copy.title}>
        <p className="mb-2 text-sm text-muted-foreground">{copy.description}</p>

        {!serviceReady ? (
          <div className="mb-2 text-xs text-amber-700 dark:text-amber-300" data-asset-hub-offline="">
            {copy.serviceOffline}
          </div>
        ) : null}
        {state.failure ? (
          <div className="mb-2 text-xs text-destructive" data-asset-hub-failure="">
            {copy.unavailable(state.failure)}
          </div>
        ) : null}

        <div className="mb-2 flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="asset-hub-role">
            {copy.targetRole}
          </label>
          <select
            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
            disabled={disabled || profiles.length === 0}
            id="asset-hub-role"
            onChange={event => setProfileId(event.target.value)}
            value={selected ?? ''}
          >
            {profiles.length === 0 ? <option value="">{copy.noRole}</option> : null}
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
              </option>
            ))}
          </select>
        </div>

        {state.assets.length === 0 ? (
          <ListRow description={copy.emptyDescription} title={copy.empty} wide />
        ) : (
          state.assets.map(asset => (
            <ListRow
              action={
                <Button
                  disabled={disabled || selected === null}
                  onClick={() =>
                    void run(
                      () => (boundIds.has(asset.assetId) ? hub.unbind({ assetId: asset.assetId, profileId: selected! }) : hub.bind({ assetId: asset.assetId, profileId: selected! })),
                      boundIds.has(asset.assetId) ? copy.unbound : copy.bound
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {boundIds.has(asset.assetId) ? copy.unbind : copy.bind}
                </Button>
              }
              description={
                <div className="space-y-0.5 text-xs text-muted-foreground" data-asset-row={asset.assetId}>
                  <div className="font-mono">
                    {copy.revision(asset.latestRevision)} · {asset.digest}
                  </div>
                  <div>{asset.source ?? copy.sourceUnknown}</div>
                  {state.bindings
                    .filter(binding => binding.assetId === asset.assetId && !binding.enabled)
                    .map(binding => (
                      <div className="italic" data-asset-binding-disabled="" key={binding.assetId}>
                        {copy.disabledBinding}
                      </div>
                    ))}
                </div>
              }
              key={asset.assetId}
              title={
                <span className="flex items-center gap-2">
                  {asset.name}
                  <Pill tone={KIND_TONE[asset.kind]}>{asset.kind}</Pill>
                </span>
              }
              wide
            />
          ))
        )}
      </SettingsSection>

      <SettingsSection icon={Archive} title={copy.publishTitle}>
        <p className="mb-2 text-sm text-muted-foreground">{copy.publishDescription}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={copy.publishKind}
            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
            disabled={disabled}
            onChange={event => setPublish(current => ({ ...current, kind: event.target.value as typeof current.kind }))}
            value={publish.kind}
          >
            <option value="skill">skill</option>
            <option value="plugin">plugin</option>
            <option value="mcp">mcp</option>
          </select>
          <Input
            aria-label={copy.publishAssetId}
            className="h-8 w-40 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setPublish(current => ({ ...current, assetId: value }))
            }}
            placeholder={copy.publishAssetId}
            value={publish.assetId}
          />
          <Input
            aria-label={copy.publishRevision}
            className="h-8 w-20 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setPublish(current => ({ ...current, revision: value }))
            }}
            value={publish.revision}
          />
          <Input
            aria-label={publish.kind === 'mcp' ? copy.publishDefinition : copy.publishPath}
            className="h-8 min-w-64 flex-1 text-xs"
            disabled={disabled}
            onChange={event => {
              const value = event.currentTarget.value

              setPublish(current => ({ ...current, path: value }))
            }}
            placeholder={publish.kind === 'mcp' ? copy.publishDefinition : copy.publishPath}
            value={publish.path}
          />
          <Button
            disabled={disabled || publish.assetId.trim() === '' || publish.path.trim() === ''}
            onClick={() =>
              void run(async () => {
                const revision = Number(publish.revision)

                if (publish.kind === 'mcp') {
                  await hub.publishMcp({
                    assetId: publish.assetId.trim(),
                    definition: JSON.parse(publish.path) as Record<string, unknown>,
                    revision
                  })
                } else if (publish.kind === 'plugin') {
                  await hub.publishPlugin({ assetId: publish.assetId.trim(), revision, sourcePath: publish.path.trim() })
                } else {
                  await hub.publishSkill({ assetId: publish.assetId.trim(), revision, sourcePath: publish.path.trim() })
                }
              }, copy.published)
            }
            size="sm"
            type="button"
          >
            {copy.publishSubmit}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.publishProvenanceNote}</p>
      </SettingsSection>

      {notice ? (
        <div className="text-xs text-emerald-700 dark:text-emerald-300" data-asset-hub-notice="">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" data-asset-hub-error="">
          {copy.refused(error)}
        </div>
      ) : null}
    </SettingsContent>
  )
}
