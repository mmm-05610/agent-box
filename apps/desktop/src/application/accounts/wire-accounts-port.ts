import type { WireV1Client } from '@/api/wire-v1-client'
import { type AccountView, asRequestId, asWireId, type ProfileRecord, type RequestId } from '@/types/wire/wire-v1'

export interface AccountsPort {
  /** The service's accounts. `UNAVAILABLE` here means the deployment has no
   *  platform secret store — a real answer the surface must show, not hide. */
  list(): Promise<AccountView[]>
  create(intent: { accountIdentifier: string; harness: string }): Promise<AccountView>
  importAsset(intent: { accountId: string; sourcePath: string }): Promise<AccountView>
  /** Binds (or with null unbinds) an account to a role; versioned like every
   *  other profile write. */
  bind(intent: { accountId: null | string; expectedVersion: number; profileId: string }): Promise<ProfileRecord>
}

export interface WireAccountsOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/** Order 56: managed subscription accounts. Zero tokens, zero locators, zero
 *  digests cross this boundary — the material stays in the platform store. */
export function wireAccountsPort(client: WireV1Client, options: WireAccountsOptions = {}): AccountsPort {
  const requestId = options.createRequestId ?? defaultRequestId

  return {
    async bind(intent) {
      const result = await client.call('accounts.bind', {
        accountId: intent.accountId === null ? null : asWireId(intent.accountId),
        expectedVersion: intent.expectedVersion,
        profileId: asWireId(intent.profileId),
        requestId: requestId()
      })

      return result.profile
    },
    async create(intent) {
      const result = await client.call('accounts.create', {
        accountIdentifier: intent.accountIdentifier,
        harness: intent.harness,
        requestId: requestId()
      })

      return result.account
    },
    async importAsset(intent) {
      const result = await client.call('accounts.importAsset', {
        accountId: asWireId(intent.accountId),
        requestId: requestId(),
        sourcePath: intent.sourcePath
      })

      return result.account
    },
    async list() {
      const result = await client.call('accounts.list', {})

      return result.accounts
    }
  }
}
