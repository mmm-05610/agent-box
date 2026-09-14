// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import {
  ipcMain
} from 'electron'

import {
  DATA_URL_READ_DEFAULT_MAX_MB,
  dataUrlReadMaxBytesFromMb
} from '../host-capabilities/filesystem/hardening'
import {
  apiRequestRegistryConnectionId
} from '../legacy-hermes/connection-config'
import {
  dispatchConnectionScopedProfileDelete,
  profileNameFromDeleteRequest
} from '../legacy-hermes/profile-delete-routing'
import { profileRenameFromRequest } from '../legacy-hermes/profile-rename-routing'

/** Stable refusal code for a legacy REST call arriving in the AgentBox product
 *  runtime. The renderer only ever sees the IPC error's message, so the code is
 *  the prefix of the message and the `code` property as well. */
export const LEGACY_RUNTIME_DISABLED_FOR_PRODUCT = 'LEGACY_RUNTIME_DISABLED_FOR_PRODUCT'

function legacyRuntimeDisabledError(): Error & { code: string } {
  const error = new Error(
    `${LEGACY_RUNTIME_DISABLED_FOR_PRODUCT}: the AgentBox product runtime does not serve the legacy Hermes REST API`
  ) as Error & { code: string }

  error.code = LEGACY_RUNTIME_DISABLED_FOR_PRODUCT

  return error
}

export interface RegisterApiProxyIpcDeps {
  HERMES_HOME: any
  PROFILE_NAME_RE: any
  profileDeletionGate: any
  ensureBackend: any
  prepareProfileDeleteRequest: any
  dispatchRegistryApiRequest: any
  registryConnectionKind: any
  teardownConnectionScopedProfileBackend: any
  handleHermesApiRequest: any
  getDataUrlReadMaxMb: () => any
  persistDataUrlReadMaxMb: any
  /** The one policy decision `hermes:api` is gated on, decided at the
   *  composition root from the desktop product runtime — NOT from renderer
   *  state, the request's shape, or whether a backend happens to be up. */
  legacyApiAllowed: boolean
}

export function registerApiProxyIpc({ HERMES_HOME, PROFILE_NAME_RE, profileDeletionGate, ensureBackend, prepareProfileDeleteRequest, dispatchRegistryApiRequest, registryConnectionKind, teardownConnectionScopedProfileBackend, handleHermesApiRequest, getDataUrlReadMaxMb, persistDataUrlReadMaxMb, legacyApiAllowed }: RegisterApiProxyIpcDeps) {
ipcMain.handle('hermes:api', async (_event, request) => {
  // The runtime gate comes FIRST — before the request is parsed, before the
  // profile-deletion gate, before registry or profile routing, and therefore
  // long before ensureBackend() can lazily spawn a Hermes backend. In the
  // AgentBox product runtime the legacy REST surface is not a product feature:
  // it is refused with a stable code rather than silently started or answered
  // with an empty success.
  if (!legacyApiAllowed) {
    throw legacyRuntimeDisabledError()
  }

  // Hold the deletion gate for BOTH profile deletes and renames: a concurrent
  // renderer reconnect entering ensureBackend() mid-mutation would otherwise
  // respawn the old-name backend and recreate its HERMES_HOME (#45474).
  const deletingProfile = profileNameFromDeleteRequest(request)
  const mutatingProfile = deletingProfile || profileRenameFromRequest(request)?.oldName || null
  const registryConnectionId = apiRequestRegistryConnectionId(request)

  if (deletingProfile && registryConnectionId) {
    return dispatchConnectionScopedProfileDelete(request, {
      acquire: profile => profileDeletionGate.acquire(profile),
      connectionKind: connectionId => registryConnectionKind(connectionId),
      dispatch: routeProfile =>
        dispatchRegistryApiRequest(request, registryConnectionId, routeProfile, deletingProfile),
      isDefaultProfile: profile => profile === 'default',
      isValidProfileName: profile => PROFILE_NAME_RE.test(profile),
      prepareLocal: localRequest => prepareProfileDeleteRequest(localRequest).then(() => undefined),
      teardownConnection: (connectionId, profile) => teardownConnectionScopedProfileBackend(connectionId, profile)
    })
  }

  if (!mutatingProfile) {
    return handleHermesApiRequest(request)
  }

  const releaseProfileDeletion = profileDeletionGate.acquire(mutatingProfile)

  return handleHermesApiRequest(request).finally(releaseProfileDeletion)
})

ipcMain.handle('hermes:data-url-read-max:get', () => ({
  maxMb: getDataUrlReadMaxMb(),
  // Keep the default bytes constant visible for tests / diagnostics.
  defaultMaxMb: DATA_URL_READ_DEFAULT_MAX_MB,
  maxBytes: dataUrlReadMaxBytesFromMb(getDataUrlReadMaxMb())
}))

ipcMain.handle('hermes:data-url-read-max:set', (_event, maxMb) => {
  const next = persistDataUrlReadMaxMb(maxMb)

  return {
    maxMb: next,
    defaultMaxMb: DATA_URL_READ_DEFAULT_MAX_MB,
    maxBytes: dataUrlReadMaxBytesFromMb(next)
  }
})
}
