import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useState } from 'react'

import { agentBoxRuntimeClient } from '@/api/agentbox-runtime-client'
import { type AccountsPort, wireAccountsPort } from '@/application/accounts/wire-accounts-port'
import { ListRow, Pill, SettingsContent, SettingsSection } from '@/components/settings/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { type Translations, useI18n } from '@/i18n'
import { KeyRound } from '@/lib/icons'
import { wireErrorText } from '@/lib/wire-error-text'
import { $agentBoxProfiles, $agentBoxService } from '@/store/agentbox-service'
import type { AccountView } from '@/types/wire/wire-v1'

export type AccountsServiceCopy = Translations['settings']['product']['accountsService']

export interface AgentBoxAccountsProps {
  port?: AccountsPort
}

/**
 * Order 56's managed subscription accounts.
 *
 * What the service says is the whole record: id, family, identifier, whether a
 * login state exists, and when it was last verified — no token, no locator, no
 * digest. A deployment without a platform secret store answers `UNAVAILABLE`,
 * and that is exactly what this surface renders: the reason, with every write
 * control disabled. It never falls back to the Desktop's own credential file,
 * because those are a different thing wearing a similar name.
 */
export function AgentBoxAccounts({ port }: AgentBoxAccountsProps = {}) {
  const copy = useI18n().t.settings.product.accountsService
  const profiles = useStore($agentBoxProfiles)
  const service = useStore($agentBoxService)
  const [accounts] = useState<AccountsPort>(() => port ?? wireAccountsPort(agentBoxRuntimeClient()))
  const [rows, setRows] = useState<AccountView[]>([])
  const [failure, setFailure] = useState<null | string>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<null | string>(null)
  const [error, setError] = useState<null | string>(null)
  const [harness, setHarness] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [assetPath, setAssetPath] = useState('')
  const [target, setTarget] = useState<null | string>(null)

  const profileId = target ?? profiles[0]?.id ?? null
  const serviceReady = service.phase === 'ready'

  const load = useCallback(async () => {
    try {
      setRows(await accounts.list())
      setFailure(null)
    } catch (reason) {
      setRows([])
      setFailure(wireErrorText(reason))
    }
  }, [accounts])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setError(null)
    setNotice(null)

    try {
      await action()
      setNotice(done)
      await load()
    } catch (reason) {
      setError(wireErrorText(reason))
    } finally {
      setBusy(false)
    }
  }

  const readable = failure === null && serviceReady
  const disabled = !readable || busy

  return (
    <SettingsContent>
      <SettingsSection
        aside={readable ? undefined : <Pill tone="warn">{copy.unavailableBadge}</Pill>}
        icon={KeyRound}
        title={copy.title}
      >
        <p className="mb-2 text-sm text-muted-foreground">{copy.description}</p>

        {!serviceReady ? (
          <div className="mb-2 text-xs text-amber-700 dark:text-amber-300" data-accounts-offline="">
            {copy.serviceOffline}
          </div>
        ) : null}
        {failure ? (
          <div className="mb-2 text-xs text-destructive" data-accounts-failure="">
            {copy.unavailable(failure)}
          </div>
        ) : null}

        {readable && rows.length === 0 ? (
          <ListRow description={copy.emptyDescription} title={copy.empty} wide />
        ) : (
          rows.map(account => (
            <ListRow
              action={
                <Button
                  disabled={disabled || profileId === null}
                  onClick={() =>
                    void run(
                      () =>
                        accounts.bind({
                          accountId: account.accountId,
                          expectedVersion: profiles.find(profile => profile.id === profileId)?.version ?? 1,
                          profileId: profileId!
                        }),
                      copy.bound
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {copy.bind}
                </Button>
              }
              description={
                <div className="space-y-0.5 text-xs text-muted-foreground" data-account-row={account.accountId}>
                  <div className="font-mono">{account.accountIdentifier}</div>
                  <div data-account-asset={String(account.hasAsset)}>
                    {account.hasAsset ? copy.hasAsset : copy.noAsset}
                  </div>
                  <div data-account-verified={account.lastVerifiedAt ?? 'never'}>
                    {copy.lastVerified}: {account.lastVerifiedAt ?? copy.unknown}
                  </div>
                  <div data-account-state={account.state}>{account.state}</div>
                </div>
              }
              key={account.accountId}
              title={
                <span className="flex items-center gap-2">
                  {account.harnessType}
                  {profileId && profiles.find(profile => profile.id === profileId)?.accountId === account.accountId ? (
                    <Pill data-account-bound="" tone="primary">
                      {copy.boundHere}
                    </Pill>
                  ) : null}
                </span>
              }
              wide
            />
          ))
        )}
      </SettingsSection>

      <SettingsSection icon={KeyRound} title={copy.writeTitle}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="accounts-target">
            {copy.targetRole}
          </label>
          <select
            className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
            disabled={disabled || profiles.length === 0}
            id="accounts-target"
            onChange={event => setTarget(event.target.value)}
            value={profileId ?? ''}
          >
            {profiles.length === 0 ? <option value="">{copy.noRole}</option> : null}
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.displayName}
              </option>
            ))}
          </select>
          <Input
            aria-label={copy.harnessLabel}
            className="h-8 w-32 text-xs"
            disabled={disabled}
            onChange={event => setHarness(event.currentTarget.value)}
            placeholder={copy.harnessLabel}
            value={harness}
          />
          <Input
            aria-label={copy.identifierLabel}
            className="h-8 w-56 text-xs"
            disabled={disabled}
            onChange={event => setIdentifier(event.currentTarget.value)}
            placeholder={copy.identifierLabel}
            value={identifier}
          />
          <Button
            disabled={disabled || harness.trim() === '' || identifier.trim() === ''}
            onClick={() =>
              void run(
                () => accounts.create({ accountIdentifier: identifier.trim(), harness: harness.trim() }),
                copy.created
              )
            }
            size="sm"
            type="button"
          >
            {copy.create}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            aria-label={copy.importPathLabel}
            className="h-8 min-w-64 flex-1 text-xs"
            disabled={disabled}
            onChange={event => setAssetPath(event.currentTarget.value)}
            placeholder={copy.importPathLabel}
            value={assetPath}
          />
          <Button
            disabled={disabled || rows.length === 0 || assetPath.trim() === ''}
            onClick={() =>
              void run(
                () => accounts.importAsset({ accountId: rows[0]!.accountId, sourcePath: assetPath.trim() }),
                copy.imported
              )
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            {copy.importAsset}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{copy.importPathNote}</p>
      </SettingsSection>

      {notice ? (
        <div className="text-xs text-emerald-700 dark:text-emerald-300" data-accounts-notice="">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="text-xs text-destructive" data-accounts-error="">
          {copy.refused(error)}
        </div>
      ) : null}
    </SettingsContent>
  )
}
