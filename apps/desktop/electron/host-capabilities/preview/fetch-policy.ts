/**
 * host-capabilities/preview/fetch-policy.ts
 *
 * The browser-shaped identity every preview/link fetch uses, and the byte budget
 * that bounds a document read.
 *
 * A plain Electron user agent gets a challenge page from anything behind a bot
 * wall, so the fetchers present a normal desktop Chrome identity. That identity
 * and the budget are shared, so they live here rather than in whichever fetcher
 * happened to declare them first — moving them out of the API-proxy composition
 * is what lets the favicon cache be a capability instead of a composition guest.
 */

export const TITLE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

/** Never read more than this much of a document while looking for a title. */
export const TITLE_BYTE_BUDGET = 96 * 1024
