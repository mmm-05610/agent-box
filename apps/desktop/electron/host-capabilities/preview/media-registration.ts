/**
 * host-capabilities/preview/media-registration.ts
 *
 * Register the `hermes-media://` protocol handler: the door the renderer uses to
 * stream local files and remote media without holding an absolute path or a
 * bearer token itself.
 *
 * Extracted from `main.ts` (E5b). Every dependency is named and supplied by the
 * caller, so the capability owns the handler wiring and none of the connection,
 * credential or routing policy behind it.
 *
 * The claim-guarded remote dial (#90812) is the subtle part: a media stream load
 * can race a renderer's own reconnect for the same `(connectionId, profile)`
 * scope, and coalescing here avoids bootstrapping a second SSH tunnel or remote
 * dashboard for one image.
 */

import { pathToFileURL } from 'node:url'

import { net as electronNet, protocol } from 'electron'

import { createMediaProtocolHandler, MEDIA_PROTOCOL } from './media-protocol'

export interface MediaRegistrationDeps {
  /** Coalesce a dial for a scope key. */
  runDedupedBackendDial: (scopeKey: string, dial: () => any) => Promise<any>
  /** The scope key for a (connectionId, profile) pair. */
  backendScopeKey: (connectionId: null | string, profile: null | string) => string
  /** Resolve a connection to an already-registered remote backend. */
  ensureRegistryBackend: (connectionId: string, profile: null | string) => Promise<any>
  /** Resolve (or start) the backend for a profile. */
  ensureBackend: (profile: null | string) => Promise<any>
  /** A bearer token for a remote base URL, or null. */
  ensureRemoteBearer: (baseUrl: string) => Promise<null | string>
  /** The OAuth session used for credentialed remote fetches. */
  getOauthSession: () => null | { fetch: typeof electronNet.fetch }
  /** The OAuth session whose cookie jar covers a URL, or null. */
  getOauthSessionForUrl: (url: string) => null | { fetch: typeof electronNet.fetch }
  /** Resolve a renderer-supplied path to a readable absolute path, or throw. */
  resolveReadablePath: (filePath: string) => Promise<string>
}

export function registerMediaProtocol(deps: MediaRegistrationDeps): void {
  const handler = createMediaProtocolHandler({
    ensureRemoteBearer: baseUrl => deps.ensureRemoteBearer(baseUrl).catch(() => null),
    fetchLocal: (resolvedPath, headers, method) =>
      electronNet.fetch(pathToFileURL(resolvedPath).toString(), {
        bypassCustomProtocolHandlers: true,
        credentials: 'omit',
        headers,
        method
      }),
    fetchRemote: (url, headers, method) =>
      electronNet.fetch(url, {
        bypassCustomProtocolHandlers: true,
        credentials: 'omit',
        headers,
        method
      }),
    fetchRemoteWithCookies: (url, headers, method) => {
      const oauthSession = deps.getOauthSessionForUrl(url)

      if (!deps.getOauthSession()) {
        throw new Error('OAuth session partition is unavailable.')
      }

      return (deps.getOauthSession() as any).fetch(url, {
        bypassCustomProtocolHandlers: true,
        credentials: 'include',
        headers,
        method
      })
    },
    resolveLocalFile: async filePath => {
      return await deps.resolveReadablePath(filePath)
    },
    resolveRemoteConnection: ({ connectionId, profile }) =>
      deps.runDedupedBackendDial(deps.backendScopeKey(connectionId, profile), () =>
        connectionId ? deps.ensureRegistryBackend(connectionId, profile) : deps.ensureBackend(profile)
      )
  })

  protocol.handle(MEDIA_PROTOCOL, handler)
}
