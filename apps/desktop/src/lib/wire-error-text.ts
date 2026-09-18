import { WireRemoteError } from '@/api/wire-v1-client'

/**
 * What the user reads when a wire call fails.
 *
 * The service's error family is the headline (the contract's closed set), and
 * the precise internal code — which the service keeps in
 * `details.internalCode` when the refusal came from its own typed error —
 * rides along in brackets. That way a screenshot of the message is enough to
 * name the exact rule that refused, without a second lookup and without the
 * client guessing a code from the text.
 */
export function wireErrorText(error: unknown): string {
  if (error instanceof WireRemoteError) {
    const internal = error.details?.internalCode
    const suffixed = typeof internal === 'string' && internal.length > 0 ? ` [${internal}]` : ''

    return `${error.code}: ${error.message}${suffixed}`
  }

  return error instanceof Error ? error.message : String(error)
}
