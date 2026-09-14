import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  asWireId,
  type ConfigDescriptor,
  type ProfileRecord,
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

export interface ProfileMaintenancePort {
  archive(intent: ArchiveProfileIntent): Promise<ProfileRecord>
  create(intent: CreateProfileIntent): Promise<ProfileRecord>
  harnessChoices: ProfileHarnessChoice[]
  update(intent: UpdateProfileIntent): Promise<ProfileRecord>
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

/** Harness choices remain opaque service data; never manufacture brand rows. */
export function harnessChoicesFromProfiles(profiles: ProfileRecord[]): ProfileHarnessChoice[] {
  return [...new Set(profiles.map(profile => profile.harness))]
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
