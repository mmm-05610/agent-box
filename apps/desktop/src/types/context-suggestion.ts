/**
 * One row of the `complete.path` suggestion list (the composer's @-mention /
 * path completion menu).
 *
 * It lives in `types/` because both layers that carry it need it and neither
 * may import the other: the session store holds it in `$contextSuggestions`,
 * and the application/UI layer is what fills it from the RPC.
 */
export interface ContextSuggestion {
  text: string
  display: string
  meta?: string
}
