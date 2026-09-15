/**
 * The Desktop's own credential records.
 *
 * ## Why the Desktop keeps them
 *
 * Windows is the authority for Profile, Session, checkpoint and credential
 * records, so the *record* - which credential exists, what the user calls it,
 * which kind it is - lives here. The Server is told where to read the secret
 * (its deployment names a source path) and keeps only the opaque id, so this
 * module and the Server agree on an identity without either one handing the
 * other a secret.
 *
 * ## What the renderer may see
 *
 * Exactly `{ credentialId, label, kind }`: an id to attach to a Provider/Model,
 * a name to show, and the kind. Never the secret, never its path - the path is
 * a main-only fact like the endpoint and the session token.
 *
 * ## Where the records come from
 *
 * `AGENTBOX_CREDENTIALS` names a JSON file this Desktop owns (the operator, or
 * the Desktop's own settings writer, maintains it). A missing, unreadable or
 * malformed file is "no credentials" rather than an error: the product then
 * shows an empty picker, which is the truth - inventing an entry, or failing the
 * whole settings page because a file is absent, would both be worse.
 *
 * Shape:
 *
 * ```json
 * {"credentials": [{"credentialId": "credential_<32 hex>", "label": "DeepSeek official", "kind": "api-key"}]}
 * ```
 */

import fs from 'node:fs'

export interface AgentBoxCredentialRecord {
  credentialId: string
  kind: string
  label: string
}

const CREDENTIAL_ID = /^credential_[0-9a-f]{32}$/
const MAXIMUM_RECORDS = 16

interface CredentialsIo {
  readFile: (filePath: string) => string
}

const defaultIo: CredentialsIo = {
  readFile: filePath => fs.readFileSync(filePath, 'utf8')
}

/** Parse a records document. Anything that is not a well-formed record is
 *  dropped rather than repaired, and a document that is not an object at all
 *  yields no records. */
export function parseAgentBoxCredentials(text: string): AgentBoxCredentialRecord[] {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  const entries = (parsed as { credentials?: unknown } | null)?.credentials

  if (!Array.isArray(entries)) {
    return []
  }

  const records: AgentBoxCredentialRecord[] = []
  const seen = new Set<string>()

  for (const entry of entries.slice(0, MAXIMUM_RECORDS)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const candidate = entry as Record<string, unknown>
    const credentialId = candidate.credentialId
    const kind = candidate.kind
    const label = candidate.label ?? ''

    if (typeof credentialId !== 'string' || !CREDENTIAL_ID.test(credentialId)) {
      continue
    }

    if (seen.has(credentialId) || typeof kind !== 'string' || kind.length === 0) {
      continue
    }

    if (typeof label !== 'string' || label.length > 64) {
      continue
    }

    seen.add(credentialId)
    records.push({ credentialId, kind, label })
  }

  return records
}

/** The records this Desktop knows, from the file it owns. */
export function listAgentBoxCredentials(
  env: Record<string, string | undefined> = process.env,
  io: CredentialsIo = defaultIo
): AgentBoxCredentialRecord[] {
  const configured = env.AGENTBOX_CREDENTIALS

  if (typeof configured !== 'string' || configured.length === 0) {
    return []
  }

  try {
    return parseAgentBoxCredentials(io.readFile(configured))
  } catch {
    return []
  }
}

/** The ids that may be attached to a Provider/Model, for validating a request
 *  from the renderer: the UI can only choose what this Desktop recorded. */
export function agentBoxCredentialIds(records: AgentBoxCredentialRecord[]): Set<string> {
  return new Set(records.map(record => record.credentialId))
}
