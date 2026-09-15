/**
 * The renderer's credential entry point: add one, list them.
 *
 * ## What crosses this boundary
 *
 * `add` receives the secret the user typed. It does not keep it: the value is
 * written to a 0600 file this process owns, the Server reads that file through
 * its own import route, and the file is removed in a `finally`. What the
 * renderer gets back is the record - id, label, kind - and what is stored is the
 * record. Nothing logs the secret, and the source path never leaves the main
 * process.
 *
 * ## Why the Server is asked at all
 *
 * The secret has to live where the Server can resolve it, and the one-shot CLI
 * cannot put it there while the product is running: the data root is held by an
 * exclusive lock. So the running Server imports it, and this module only carries
 * the path across.
 *
 * ## Loopback only, same policy as the wire
 *
 * The endpoint is judged by the same policy the wire transports use, and only
 * `/api/v1/credentials` is ever addressed with it: a credential request must not
 * become a general-purpose fetch to whatever the connection happens to name.
 */
import { randomUUID } from 'node:crypto'

import { app, ipcMain } from 'electron'

import { resolveAgentBoxWireEndpoint } from '../security/agentbox-wire-endpoint-policy'
import type { AgentBoxWireHostConnection } from '../security/agentbox-wire-transport'
import {
  type AgentBoxCredentialRecord,
  appendAgentBoxCredentialRecord,
  listAgentBoxCredentials,
  removeAgentBoxCredentialSource,
  writeAgentBoxCredentialSource
} from '../workcore/agentbox-credentials'

export interface RegisterAgentBoxCredentialsIpcDeps {
  /** The installed lifecycle connection, or null when there is no service. */
  connection: () => AgentBoxWireHostConnection | null
  /** The Desktop's own records file; defaults under the app's user data. */
  recordsPath?: string
  fetchImpl?: typeof fetch
}

export type AgentBoxCredentialAddOutcome =
  | { ok: true; record: AgentBoxCredentialRecord }
  | { ok: false; code: string; message: string }

const LIST_CHANNEL = 'agentbox:credentials:list'
const ADD_CHANNEL = 'agentbox:credentials:add'
const MAXIMUM_SECRET_LENGTH = 64 * 1024

function recordsFilePath(deps: RegisterAgentBoxCredentialsIpcDeps): string {
  if (deps.recordsPath) {
    return deps.recordsPath
  }

  return process.env.AGENTBOX_CREDENTIALS ?? `${app.getPath('userData')}/agentbox-credentials.json`
}

/** One add request, as the renderer sends it. */
function parseAddRequest(value: unknown): { kind: string; label: string; secret: string } | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  const { kind, label, secret } = candidate

  if (typeof kind !== 'string' || kind.length === 0 || kind.length > 32) {
    return null
  }

  if (typeof label !== 'string' || label.length === 0 || label.length > 64) {
    return null
  }

  if (typeof secret !== 'string' || secret.length === 0 || secret.length > MAXIMUM_SECRET_LENGTH) {
    return null
  }

  return { kind, label, secret }
}

export function registerAgentBoxCredentialsIpc(deps: RegisterAgentBoxCredentialsIpcDeps): () => void {
  ipcMain.handle(LIST_CHANNEL, () =>
    listAgentBoxCredentials({ AGENTBOX_CREDENTIALS: recordsFilePath(deps) })
  )

  ipcMain.handle(ADD_CHANNEL, async (_event, request: unknown): Promise<AgentBoxCredentialAddOutcome> => {
    const parsed = parseAddRequest(request)

    if (!parsed) {
      return { ok: false, code: 'CREDENTIAL_REQUEST_INVALID', message: 'the credential request is malformed' }
    }

    const connection = deps.connection()

    if (!connection) {
      return { ok: false, code: 'UNAVAILABLE', message: 'AgentBox service is unavailable' }
    }

    const decision = resolveAgentBoxWireEndpoint(connection.endpoint)

    if (!decision.endpoint) {
      return { ok: false, code: 'CREDENTIAL_ENDPOINT_REJECTED', message: 'the service endpoint is not usable' }
    }

    const sourcePath = writeAgentBoxCredentialSource(parsed.secret)

    try {
      const response = await (deps.fetchImpl ?? fetch)(
        `${decision.endpoint.origin}/api/v1/credentials`,
        {
          body: JSON.stringify({
            confirm_source_path: sourcePath,
            kind: parsed.kind,
            source_path: sourcePath
          }),
          headers: {
            Authorization: `Bearer ${connection.sessionToken}`,
            'Content-Type': 'application/json',
            // One click is one import: the key is fresh per attempt, so a user
            // who retries after a refusal imports again rather than replaying
            // the refusal's empty answer.
            'Idempotency-Key': randomUUID()
          },
          method: 'POST'
        }
      )

      const answer = (await response.json().catch(() => null)) as
        | { credentialId?: unknown; error?: { code?: unknown; message?: unknown } }
        | null

      if (!response.ok || typeof answer?.credentialId !== 'string') {
        // The Server's own code is what tells the user why: a refusal is not a
        // secret, so it may travel; the request body never does.
        return {
          ok: false,
          code: typeof answer?.error?.code === 'string' ? answer.error.code : `HTTP_${response.status}`,
          message: typeof answer?.error?.message === 'string'
            ? answer.error.message
            : 'the Server did not import the credential'
        }
      }

      const record: AgentBoxCredentialRecord = {
        credentialId: answer.credentialId,
        kind: parsed.kind,
        label: parsed.label
      }

      appendAgentBoxCredentialRecord(recordsFilePath(deps), record)

      return { ok: true, record }
    } catch {
      return { ok: false, code: 'CREDENTIAL_IMPORT_FAILED', message: 'the credential could not be imported' }
    } finally {
      removeAgentBoxCredentialSource(sourcePath)
    }
  })

  return () => {
    ipcMain.removeHandler(LIST_CHANNEL)
    ipcMain.removeHandler(ADD_CHANNEL)
  }
}
