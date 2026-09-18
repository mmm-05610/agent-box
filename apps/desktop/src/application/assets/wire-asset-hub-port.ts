import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  type AssetBinding,
  type AssetView,
  asWireId,
  type McpServerDefinition,
  type RequestId
} from '@/types/wire/wire-v1'

export interface BindAssetIntent {
  assetId: string
  enabled?: boolean
  profileId: string
  revision?: number
}

export interface PublishAssetIntent {
  assetId: string
  revision: number
}

export interface PublishMcpIntent extends PublishAssetIntent {
  definition: McpServerDefinition
}

export interface PublishSkillIntent extends PublishAssetIntent {
  /** A host path the service reads; the client never copies bytes itself. */
  sourcePath: string
}

export interface AssetHubPort {
  bind(intent: BindAssetIntent): Promise<AssetBinding>
  bindings(profileId: string): Promise<AssetBinding[]>
  list(): Promise<AssetView[]>
  publishMcp(intent: PublishMcpIntent): Promise<AssetView>
  publishPlugin(intent: PublishSkillIntent): Promise<{ asset: AssetView; preview: string }>
  publishSkill(intent: PublishSkillIntent): Promise<AssetView>
  unbind(intent: { assetId: string; profileId: string }): Promise<void>
}

export interface WireAssetHubOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * Orders 58/59: the asset catalogue, its bindings and the three publish paths.
 *
 * Every write answers with the service's own projection (or its typed refusal);
 * nothing here derives a record locally, so a published revision's digest and
 * provenance are the service's facts, never the caller's guess.
 */
export function wireAssetHubPort(client: WireV1Client, options: WireAssetHubOptions = {}): AssetHubPort {
  const requestId = options.createRequestId ?? defaultRequestId

  return {
    async bind(intent) {
      const result = await client.call('assets.bind', {
        assetId: intent.assetId,
        ...(intent.enabled === undefined ? {} : { enabled: intent.enabled }),
        profileId: asWireId(intent.profileId),
        requestId: requestId(),
        ...(intent.revision === undefined ? {} : { revision: intent.revision })
      })

      return result.binding
    },
    async bindings(profileId) {
      const result = await client.call('assets.bindings', { profileId: asWireId(profileId) })

      return result.bindings
    },
    async list() {
      const result = await client.call('assets.list', {})

      return result.assets
    },
    async publishMcp(intent) {
      const result = await client.call('assets.publishMcp', {
        assetId: intent.assetId,
        definition: intent.definition,
        requestId: requestId(),
        revision: intent.revision
      })

      return result.asset
    },
    async publishPlugin(intent) {
      const result = await client.call('assets.publishPlugin', {
        assetId: intent.assetId,
        requestId: requestId(),
        revision: intent.revision,
        sourcePath: intent.sourcePath
      })

      return { asset: result.asset, preview: result.preview }
    },
    async publishSkill(intent) {
      const result = await client.call('assets.publishSkill', {
        assetId: intent.assetId,
        requestId: requestId(),
        revision: intent.revision,
        sourcePath: intent.sourcePath
      })

      return result.asset
    },
    async unbind(intent) {
      await client.call('assets.unbind', {
        assetId: intent.assetId,
        profileId: asWireId(intent.profileId),
        requestId: requestId()
      })
    }
  }
}
