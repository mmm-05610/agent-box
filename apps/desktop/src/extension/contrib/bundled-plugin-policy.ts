/**
 * Bundled-plugin product policy — the explicit authority the discovery seam
 * consults, and the set of bundled ids the product has RETIRED.
 *
 * RETIREMENT IS NOT A USER CHOICE. A retired id is dropped at the discovery
 * boundary, before any inventory record or activate/deactivate handle exists,
 * so Settings cannot toggle it, the contribution registry never sees it, and a
 * persisted `enabled: true` from when the feature still shipped can never
 * resurrect it. That is the point: the product stopped shipping the surface
 * (master plan §4 — Bots group chat / the old Agents entry are retired), and
 * hiding it in the palette or filtering it in the UI after activation would
 * leave the relay, clocks and sweeps running behind the curtain.
 *
 * The authority is an EXPLICIT input, passed from the composition root
 * (`DESKTOP_PRODUCT_RUNTIME`) — never inferred from gateway state, caches,
 * plugin decisions or whether a call would happen to succeed.
 */

/** The product authority the renderer was composed for. `'agentbox'` is the
 *  AgentBox product shell; `'hermes'` is the legacy Hermes shell, whose plugin
 *  behavior must stay exactly as it shipped. */
export type ProductAuthority = 'agentbox' | 'hermes'

/** Bundled plugin ids the AgentBox product has retired. Data, not a condition
 *  ladder: a future retirement is one entry plus a test. */
const RETIRED_BUNDLED_PLUGIN_IDS: ReadonlySet<string> = new Set(['hermes-bots'])

/**
 * Whether the product retires this bundled plugin id.
 *
 * `true` means "do not discover it": no inventory record, no activate/deactivate
 * handles, no `register()` — and therefore none of the machinery `register()`
 * starts. A user's persisted decision (in either direction) must not be
 * consulted at all: this is product scope, not preference.
 *
 * The legacy `'hermes'` authority keeps the historical behavior for every id
 * (`false`), so the same discovery code serves both shells.
 */
export function bundledPluginRetired(id: string, authority: ProductAuthority): boolean {
  return authority === 'agentbox' && RETIRED_BUNDLED_PLUGIN_IDS.has(id)
}
