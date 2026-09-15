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

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

/** Write a secret to a 0600 file this process owns, for the Server to read.
 *
 * The import route takes a *path*, never the material, so the secret has to
 * exist as a file for as long as the import takes. It goes in the OS temp
 * directory with a random name, is created 0600 before anything is written, and
 * the caller deletes it in a `finally` - a failure path that leaves a readable
 * secret file behind would be worse than the failure itself.
 */
export function writeAgentBoxCredentialSource(
  secret: string,
  io: SourceIo = defaultSourceIo
): string {
  const path = io.tempPath()

  io.writeFile(path, secret, 0o600)

  return path
}

interface SourceIo {
  removeFile: (filePath: string) => void
  tempPath: () => string
  writeFile: (filePath: string, content: string, mode: number) => void
}

const defaultSourceIo: SourceIo = {
  removeFile: filePath => fs.rmSync(filePath, { force: true }),
  tempPath: () => path.join(os.tmpdir(), `agentbox-credential-${randomUUID()}`),
  writeFile: (filePath, content, mode) => {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode })
  }
}

/** Remove a source written by `writeAgentBoxCredentialSource`, never throwing:
 *  it runs on the way out of a failure too, and must not replace it. */
export function removeAgentBoxCredentialSource(
  filePath: string,
  io: SourceIo = defaultSourceIo
): void {
  try {
    io.removeFile(filePath)
  } catch {
    // the caller's outcome is what matters; a temp file it could not remove is
    // reported by whatever it does next, not by masking the real result
  }
}

/** Append one record to the Desktop's records file, keeping the rest intact.
 *  A file that does not parse is treated as empty: the alternative - refusing to
 *  record a credential the Server just accepted - would be worse. */
export function appendAgentBoxCredentialRecord(
  filePath: string,
  record: AgentBoxCredentialRecord,
  io: RecordsIo = defaultRecordsIo
): void {
  const existing = (() => {
    try {
      return parseAgentBoxCredentials(io.readFile(filePath))
    } catch {
      return []
    }
  })()

  const records = [...existing.filter(item => item.credentialId !== record.credentialId), record]

  io.writeFile(filePath, `${JSON.stringify({ credentials: records }, null, 2)}\n`)
}

interface RecordsIo {
  readFile: (filePath: string) => string
  writeFile: (filePath: string, content: string) => void
}

const defaultRecordsIo: RecordsIo = {
  readFile: filePath => fs.readFileSync(filePath, 'utf8'),
  writeFile: (filePath, content) => {
    fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 })
  }
}
