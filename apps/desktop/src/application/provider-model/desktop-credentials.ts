/**
 * The renderer's view of the Desktop's credential records.
 *
 * Two calls, both answered by the main process: list the records it holds, and
 * add one. The secret only travels one way - into `add` - and what comes back is
 * always the record, so nothing here stores or echoes credential material.
 */
export interface DesktopCredentialRecord {
  credentialId: string
  kind: string
  label: string
}

export interface DesktopCredentialAddRequest {
  kind: string
  label: string
  secret: string
}

export type DesktopCredentialAddResult =
  | { ok: true; record: DesktopCredentialRecord }
  | { code: string; message: string; ok: false }

interface DesktopCredentialsBridge {
  add: (request: DesktopCredentialAddRequest) => Promise<DesktopCredentialAddResult>
  list: () => Promise<DesktopCredentialRecord[]>
}

function bridge(): DesktopCredentialsBridge | null {
  return (window.agentBoxDesktop as { credentials?: DesktopCredentialsBridge } | undefined)?.credentials ?? null
}

/** The records this Desktop holds. A missing bridge is no records, not an
 *  error: the surface that shows them is also reachable without one. */
export async function listDesktopCredentials(): Promise<DesktopCredentialRecord[]> {
  const credentials = bridge()

  if (!credentials) {
    return []
  }

  try {
    const records = await credentials.list()

    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}

/** Add one credential. The main process writes the secret where the Server can
 *  read it and records the id it gets back; a refusal carries the Server's own
 *  code so the interface can say what happened. */
export async function addDesktopCredential(
  request: DesktopCredentialAddRequest
): Promise<DesktopCredentialAddResult> {
  const credentials = bridge()

  if (!credentials) {
    return { code: 'UNAVAILABLE', message: 'AgentBox Desktop host transport is unavailable', ok: false }
  }

  try {
    return await credentials.add(request)
  } catch {
    return { code: 'CREDENTIAL_IMPORT_FAILED', message: 'the credential could not be added', ok: false }
  }
}
