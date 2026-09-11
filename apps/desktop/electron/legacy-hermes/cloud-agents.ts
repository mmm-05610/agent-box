/**
 * legacy-hermes/cloud-agents.ts
 *
 * The silent sign-in cascade for Hermes Cloud: reuse the portal session the user
 * already has to authorize a gateway, without showing a chooser.
 *
 * Moved verbatim out of `main.ts` (E5c). It fails loudly rather than quietly when
 * the portal session has lapsed — a silent cascade that surfaces an interactive
 * prompt is worse than an error the UI can act on.
 */

import {
  hasLivePortalSession,
  hasOauthSessionCookie,
  hasPortalAccessToken,
  openOauthLoginWindow,
  renewPortalAccessSilently
} from '../host-capabilities/credentials/cloud-oauth'

import { normalizeRemoteBaseUrl } from './connection-config'

export async function cloudAgentSilentSignIn(dashboardUrl) {
  const baseUrl = normalizeRemoteBaseUrl(dashboardUrl)

  // Pre-req: a live portal session must exist, or this would surface an
  // interactive prompt rather than a silent cascade. Discovery already gates on
  // this, but a selection can arrive after the session lapsed.
  if (!(await hasLivePortalSession())) {
    const err = new Error('Your Hermes Cloud session has expired. Sign in to Hermes Cloud again.') as any
    err.needsCloudLogin = true
    throw err
  }

  // The cascade rides the portal's auto-approve, which needs the short-lived
  // access state just like discovery. If only renewal material survived the
  // restart, mint a fresh access token first so the hidden cascade window
  // auto-SSOs instead of stalling on an interactive chooser (#73495).
  if (!(await hasPortalAccessToken())) {
    await renewPortalAccessSilently()
  }

  await openOauthLoginWindow(baseUrl, { silent: true })

  return { baseUrl, connected: await hasOauthSessionCookie(baseUrl) }
}
