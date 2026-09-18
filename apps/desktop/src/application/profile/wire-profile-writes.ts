import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  asWireId,
  type PermissionRule,
  type ProfileRecord,
  type ProfilesCloneResult,
  type RequestId
} from '@/types/wire/wire-v1'

export interface CloneProfileIntent {
  displayName: string
  /** Omitted = the clone stays in the source role's family. */
  harness?: string
  profileId: string
}

export interface ProfileWriteOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * Order 60: clone one role. The answer carries the migration report the caller
 * must show — what traveled, what did not, and why — so the surface and the
 * rows cannot disagree: the report is computed before anything is written.
 */
export async function cloneAgentBoxProfile(
  client: WireV1Client,
  intent: CloneProfileIntent,
  options: ProfileWriteOptions = {}
): Promise<ProfilesCloneResult> {
  return client.call('profiles.clone', {
    displayName: intent.displayName,
    ...(intent.harness === undefined ? {} : { harness: intent.harness }),
    profileId: asWireId(intent.profileId),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })
}

export interface SetProfilePermissionsIntent {
  expectedVersion: number
  preset: string
  profileId: string
  rules: PermissionRule[]
}

/**
 * Order 60: write the role's permission posture. Versioned like every other
 * profile write, so a concurrent edit answers CONFLICT_VERSION instead of
 * silently winning; the rules travel in order because the LAST match is the
 * one that decides at execution time.
 */
export async function setAgentBoxProfilePermissions(
  client: WireV1Client,
  intent: SetProfilePermissionsIntent,
  options: ProfileWriteOptions = {}
): Promise<ProfileRecord> {
  const result = await client.call('profiles.setPermissions', {
    expectedVersion: intent.expectedVersion,
    preset: intent.preset,
    profileId: asWireId(intent.profileId),
    requestId: (options.createRequestId ?? defaultRequestId)(),
    rules: intent.rules
  })

  return result.profile
}
