/**
 * The single loopback judgement for both main-process wire transports.
 *
 * The HTTP dispatcher and the event stream must agree on which endpoint the
 * host may talk to. A rule written twice is a rule that drifts, and the drift
 * is only visible to whoever is attacking the seam — so the decision lives
 * here, and the two transports differ only in what they do with it (one
 * throws, one reports), never in how they decide.
 *
 * The endpoint is a main-only fact: it arrives from the lifecycle closure and
 * is never handed to the renderer. Every failure below therefore carries a
 * stable reason and nothing else — no host, no credentials, no token.
 */

export type AgentBoxWireEndpointRejection = 'invalid' | 'non_loopback'

export interface AgentBoxWireEndpoint {
  /** `http(s)://host[:port]`, credentials and path discarded. */
  origin: string
  protocol: 'http:' | 'https:'
}

/** Exactly one of the two is ever set. Two nullable fields rather than a
 *  discriminated union because the Electron project compiles without
 *  `strictNullChecks`, where a boolean discriminant does not narrow. */
export interface AgentBoxWireEndpointDecision {
  /** The loopback origin to talk to, or null when the endpoint was rejected. */
  endpoint: AgentBoxWireEndpoint | null
  /** Why it was rejected, or null when it was accepted. */
  reason: AgentBoxWireEndpointRejection | null
}

/** Four decimal octets starting with 127. Deliberately not a general IP
 *  parser: the only addresses this seam ever accepts are loopback literals. */
const LOOPBACK_IPV4 = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/

/**
 * Loopback only: `localhost`, `::1`, and any valid `127/8` literal.
 *
 * A hostname that merely reads as adjacent (`127.0.0.1.evil.test`) fails the
 * anchored match, and a 127-prefixed literal with an out-of-range octet
 * (`127.0.0.999`) is not an address at all.
 */
export function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') {
    return true
  }

  if (!LOOPBACK_IPV4.test(hostname)) {
    return false
  }

  return hostname
    .split('.')
    .slice(1)
    .every(part => Number(part) <= 255)
}

/**
 * Decide whether `endpoint` may be used at all.
 *
 * Never throws: a caller that has to catch a parse error in order to stay alive
 * is a caller that will eventually forget to. Rejections name the category of
 * the problem and never echo the endpoint back.
 */
export function resolveAgentBoxWireEndpoint(endpoint: string): AgentBoxWireEndpointDecision {
  let base: URL

  try {
    base = new URL(endpoint)
  } catch {
    return { endpoint: null, reason: 'invalid' }
  }

  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    return { endpoint: null, reason: 'invalid' }
  }

  if (!isLoopbackHost(base.hostname)) {
    return { endpoint: null, reason: 'non_loopback' }
  }

  return {
    endpoint: { origin: base.origin, protocol: base.protocol as 'http:' | 'https:' },
    reason: null
  }
}
