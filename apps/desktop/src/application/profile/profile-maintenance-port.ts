import type { WireV1Client } from '@/api/wire-v1-client'
import { asWireId, type ConfigDescriptor, type ProfileRecord } from '@/types/wire/wire-v1'

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

/**
 * INTERNAL_NOT_WIRE. P02 can finish and test the role-management interaction
 * without guessing an HTTP method. Production leaves this absent until the
 * peripheral contract is approved and implemented.
 */
export interface ProfileMaintenancePort {
  archive(intent: ArchiveProfileIntent): Promise<ProfileRecord>
  create(intent: CreateProfileIntent): Promise<ProfileRecord>
  harnessChoices: ProfileHarnessChoice[]
  update(intent: UpdateProfileIntent): Promise<ProfileRecord>
}

export async function loadProfileRuntimeDescriptor(
  client: WireV1Client,
  profileId: string
): Promise<ConfigDescriptor> {
  const result = await client.call('config.describe', { profileId: asWireId(profileId), workspaceId: null })

  return result.descriptor
}
