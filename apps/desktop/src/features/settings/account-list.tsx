import type { DesktopCredentialRecord } from '@/application/provider-model/desktop-credentials'
import { ListRow, Pill, SettingsSection } from '@/components/settings/primitives'
import { type Translations, useI18n } from '@/i18n'
import { KeyRound } from '@/lib/icons'

type AccountCopy = Translations['settings']['product']['accounts']

/** Subscription (an official login) and API key are two kinds of the SAME
 *  thing — a credential record a profile can reference. Neither is inlined and
 *  neither is material: the record holds an opaque id, a kind and a label. */
export const SUBSCRIPTION_KIND = 'subscription'

/** Kind labels are data: an unknown kind is shown as the service's own string
 *  rather than forced into one of the two known families. */
export function accountKindLabel(kind: string, copy: AccountCopy): string {
  if (kind === SUBSCRIPTION_KIND) {
    return copy.kindSubscription
  }

  return kind === 'api-key' ? copy.kindApiKey : kind
}

export interface AccountListProps {
  records: DesktopCredentialRecord[]
}

/**
 * The credential records this Desktop holds, as accounts.
 *
 * What is NOT here matters as much as what is: there is no status, no account
 * identifier beyond the record's own label and id, and no "last verified"
 * time, because no service surface declares them yet (backend 56 owns the
 * probe). Status therefore reads as unknown — never as a placeholder "valid".
 * Nothing on this surface shows, stores or asks for credential material; the
 * add flow is the only door material travels through, and it goes one way.
 */
export function AccountList({ records }: AccountListProps) {
  const copy = useI18n().t.settings.product.accounts

  return (
    <SettingsSection icon={KeyRound} title={copy.title}>
      <p className="mb-3 text-sm text-muted-foreground">{copy.description}</p>
      {records.length === 0 ? (
        <ListRow description={copy.emptyDescription} title={copy.empty} wide />
      ) : (
        records.map(record => (
          <ListRow
            action={<Pill tone="muted">{copy.statusUnknown}</Pill>}
            description={
              <div className="space-y-1 text-xs text-muted-foreground">
                <div data-account-kind={record.kind}>
                  {accountKindLabel(record.kind, copy)} · {record.label || record.credentialId}
                </div>
                {/* The two facts a probe would fill, named as missing rather
                    than guessed: an account that has never been checked must
                    not read as one that checked out. */}
                <div data-account-verified="unknown" title={copy.statusUnknownTitle}>
                  {copy.lastVerified}: {copy.unknown}
                </div>
              </div>
            }
            key={record.credentialId}
            title={record.label || record.credentialId}
            wide
          />
        ))
      )}
      {/* Login is the user's to perform, on the execution side, with the
          harness's own flow. This app never fills a login form, never reads a
          native login state, and never scrapes a token — and it says the same
          about when a switch becomes real: the next turn, because each turn
          materializes its own process. */}
      <div className="mt-3 space-y-1 text-xs text-muted-foreground" data-account-guidance="">
        <div>{copy.loginGuidance}</div>
        <div>{copy.hotSwitchNote}</div>
      </div>
    </SettingsSection>
  )
}
