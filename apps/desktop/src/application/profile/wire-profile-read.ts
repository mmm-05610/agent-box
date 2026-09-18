import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  type AssetBinding,
  asWireId,
  type ProfileMemory,
  type RequestId
} from '@/types/wire/wire-v1'

export interface ProfileReadOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * Order 63: the role's declared memory files, read-only. `available:false` is
 * a real answer (a family that declares no memory paths, a home that is not
 * there, a remote home we cannot read) — the caller hides the section instead
 * of drawing an empty one. A file refused by the credential rule arrives
 * without its content; nothing here can restore it.
 */
export async function loadProfileMemory(
  client: WireV1Client,
  profileId: string,
  options: ProfileReadOptions = {}
): Promise<ProfileMemory> {
  const result = await client.call('profiles.memory', {
    profileId: asWireId(profileId),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })

  return result.memory
}

/**
 * Order 58: the assets bound to this role, with revision/digest/enabled. A
 * disabled binding is still a binding — it is reported, not filtered out.
 */
export async function loadProfileAssetBindings(
  client: WireV1Client,
  profileId: string,
  options: ProfileReadOptions = {}
): Promise<AssetBinding[]> {
  const result = await client.call('assets.bindings', { profileId: asWireId(profileId) })

  return result.bindings
}
