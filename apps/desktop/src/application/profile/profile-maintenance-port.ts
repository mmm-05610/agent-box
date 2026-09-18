import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  asWireId,
  type ConfigDescriptor,
  type ConfigOverride,
  type ProfileRecord,
  type ProfilesUpdateConfigResult,
  type ProviderModelConfigRecord,
  type RequestId
} from '@/types/wire/wire-v1'

export interface ProfileHarnessChoice {
  id: string
  label: string
}

export interface CreateProfileIntent {
  displayName: string
  harness: string
}

export interface UpdateProfileIntent {
  displayName: string
  expectedVersion: number
  profileId: string
}

export interface ArchiveProfileIntent {
  expectedVersion: number
  profileId: string
}

export interface UpdateProfileConfigIntent {
  expectedVersion: number
  profileId: string
  values: ConfigOverride[]
}

export interface ProfileMaintenancePort {
  archive(intent: ArchiveProfileIntent): Promise<ProfileRecord>
  create(intent: CreateProfileIntent): Promise<ProfileRecord>
  harnessChoices: ProfileHarnessChoice[]
  update(intent: UpdateProfileIntent): Promise<ProfileRecord>
  /** Replaces the whole Profile configuration; the service validates and
   *  normalizes. Returns the authoritative record for the next CAS step. */
  updateConfig(intent: UpdateProfileConfigIntent): Promise<ProfilesUpdateConfigResult>
}

export interface WireProfileMaintenanceOptions {
  createRequestId?: () => RequestId
  harnessChoices: ProfileHarnessChoice[]
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/** Production maintenance adapter for the single wire-v1 authority. */
export function wireProfileMaintenancePort(
  client: WireV1Client,
  options: WireProfileMaintenanceOptions
): ProfileMaintenancePort {
  const requestId = options.createRequestId ?? defaultRequestId

  return {
    harnessChoices: options.harnessChoices,
    async create(intent) {
      const result = await client.call('profiles.create', { ...intent, requestId: requestId() })

      return result.profile
    },
    async update(intent) {
      const result = await client.call('profiles.update', {
        ...intent,
        profileId: asWireId(intent.profileId),
        requestId: requestId()
      })

      return result.profile
    },
    async updateConfig(intent) {
      return client.call('profiles.updateConfig', {
        ...intent,
        profileId: asWireId(intent.profileId),
        requestId: requestId()
      })
    },
    async archive(intent) {
      const result = await client.call('profiles.archive', {
        ...intent,
        profileId: asWireId(intent.profileId),
        requestId: requestId()
      })

      return result.profile
    }
  }
}

/** Harness choices remain opaque service data; never manufacture brand rows.
 *
 *  The source is the service's provider/model catalog, not the Profile list: a
 *  Profile is built on a provider/model record, so deriving the choices from
 *  Profiles required one to already exist and an empty service could never
 *  create its first Profile. The records are still the service's own, and a
 *  service with no provider/model configuration offers no choice rather than a
 *  guessed one. */
export function harnessChoicesFromProviderModels(
  models: readonly ProviderModelConfigRecord[]
): ProfileHarnessChoice[] {
  return [
    ...new Set(models.filter(model => !model.archivedAt).map(model => model.harness))
  ]
    .sort((left, right) => left.localeCompare(right))
    .map(harness => ({ id: harness, label: harness }))
}

export async function loadProfileRuntimeDescriptor(
  client: WireV1Client,
  profileId: string
): Promise<ConfigDescriptor> {
  const result = await client.call('config.describe', { profileId: asWireId(profileId), workspaceId: null })

  return result.descriptor
}
