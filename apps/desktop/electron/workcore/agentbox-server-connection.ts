/**
 * The AgentBox Work Core's lifecycle connection.
 *
 * ## What this is
 *
 * The one place that turns "the Desktop's Work Core is reachable" into the pair
 * the wire transports consume: `{ endpoint, sessionToken }`, installed at the
 * single composition slot. Nothing else in the main process may mint it, and
 * nothing hands it to the renderer.
 *
 * ## Division of authority, stated once
 *
 * Windows owns the persistent AgentBox data root — Profile, Session, checkpoint
 * and credential records live there — so the Desktop is the side that knows
 * *where* that root is. The Server owns the token file inside it and writes it
 * 0600 on first start; the Desktop only reads it. Neither side invents the
 * other's fact: the Desktop does not generate tokens, and the Server does not
 * decide where its own data lives.
 *
 * ## No fallback, on purpose
 *
 * An unset root, an unreadable or too-short token, a port outside 1–65535, or an
 * endpoint the loopback policy rejects all resolve to "no service". The caller
 * then installs nothing, wire calls answer the typed `UNAVAILABLE`, and the UI
 * shows its honest no-service state — never a half-connected shell, and never a
 * service the Desktop cannot actually reach.
 *
 * ## Where the two inputs come from
 *
 * `AGENTBOX_SERVER_ROOT` and `AGENTBOX_SERVER_PORT` are read by the process that
 * starts the Desktop (the integration driver, or an operator running the app
 * against a Server they started). They are deliberately not user settings: a
 * user setting that pointed the Desktop's wire at an arbitrary endpoint would be
 * exactly the injection this seam exists to prevent.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface AgentBoxServerConnection {
  endpoint: string
  sessionToken: string
}

/** The token file the Server writes inside its own data root. */
const TOKEN_RELATIVE_PATH = 'secrets/http-token'

/** The shortest token the Server itself accepts; a shorter one is not a token. */
const MINIMUM_TOKEN_LENGTH = 32

export const DEFAULT_AGENTBOX_SERVER_PORT = 8732

interface ConnectionIo {
  readFile: (filePath: string) => string
}

const defaultIo: ConnectionIo = {
  readFile: filePath => fs.readFileSync(filePath, 'utf8')
}

/**
 * The Work Core data root this Desktop should talk to, or null when none is
 * configured. A path that is set but does not exist is *not* created here: the
 * Server creates its own root, and a Desktop that silently made one would hide a
 * mistyped path behind an empty service.
 */
export function resolveAgentBoxServerRoot(
  env: Record<string, string | undefined> = process.env
): null | string {
  const configured = env.AGENTBOX_SERVER_ROOT

  if (typeof configured !== 'string' || configured.length === 0) {
    return null
  }

  return path.resolve(configured)
}

/** The configured loopback port, or null when it is absent or not a port. */
export function resolveAgentBoxServerPort(
  env: Record<string, string | undefined> = process.env
): null | number {
  const configured = env.AGENTBOX_SERVER_PORT

  if (configured === undefined || configured === '') {
    return DEFAULT_AGENTBOX_SERVER_PORT
  }

  if (!/^\d{1,5}$/.test(configured)) {
    return null
  }

  const port = Number(configured)

  return port >= 1 && port <= 65535 ? port : null
}

/**
 * Read the Server's token from its own data root.
 *
 * The read is a plain read: the file is 0600 and owned by the same user, so no
 * privilege is escalated here. A missing, empty or short file is "no service" —
 * the Desktop must never substitute a token of its own, because a token the
 * Server did not mint authorizes nothing and would only turn a clear
 * unavailability into a confusing 401.
 */
export function readAgentBoxServerToken(
  root: string,
  io: ConnectionIo = defaultIo
): null | string {
  let token: string

  try {
    token = io.readFile(path.join(root, TOKEN_RELATIVE_PATH)).trim()
  } catch {
    return null
  }

  return token.length >= MINIMUM_TOKEN_LENGTH ? token : null
}

/** The loopback endpoint for a port, judged by the same policy the transports use. */
export function agentBoxServerEndpoint(port: number): null | string {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null
  }

  return `http://127.0.0.1:${port}`
}

export interface AgentBoxServerConnectionSlot {
  install(next: AgentBoxServerConnection | null): AgentBoxServerConnection | null
}

export interface AgentBoxServerConnectionOptions {
  env?: Record<string, string | undefined>
  io?: ConnectionIo
  port?: null | number
  root?: null | string
  slot: AgentBoxServerConnectionSlot
}

export type AgentBoxServerConnectionReason = 'port_invalid' | 'root_unset' | 'token_unavailable'

/** Two nullable fields rather than a discriminated union, because this project
 *  compiles without `strictNullChecks` and a boolean discriminant does not
 *  narrow there. Exactly one of the two is ever set. */
export interface AgentBoxServerConnectionResult {
  /** The installed loopback origin, or null when nothing was installed. */
  endpoint: null | string
  /** Why nothing was installed, or null when the connection went in. */
  reason: null | AgentBoxServerConnectionReason
}

/**
 * Install the connection, or leave the slot empty and say why not.
 *
 * Returns the reason rather than throwing: a boot path that had to catch to stay
 * alive would eventually swallow the difference between "no Server configured"
 * and "the Server is there but its token is unreadable", and those two need
 * different answers from whoever is running the app.
 */
export function installAgentBoxServerConnection(
  options: AgentBoxServerConnectionOptions
): AgentBoxServerConnectionResult {
  const root = options.root === undefined ? resolveAgentBoxServerRoot(options.env) : options.root
  const port = options.port === undefined ? resolveAgentBoxServerPort(options.env) : options.port

  if (root === null) {
    return { endpoint: null, reason: 'root_unset' }
  }

  const endpoint = port === null ? null : agentBoxServerEndpoint(port)

  if (endpoint === null) {
    return { endpoint: null, reason: 'port_invalid' }
  }

  const sessionToken = readAgentBoxServerToken(root, options.io)

  if (sessionToken === null) {
    return { endpoint: null, reason: 'token_unavailable' }
  }

  options.slot.install({ endpoint, sessionToken })

  return { endpoint, reason: null }
}
