/**
 * Brand launch context for `claude` (the upstream registration id, i.e. the official
 * `claude-agent-acp` adapter fetched over `npx`) — see `harnesses/codex/launch.mjs`.
 *
 * The product's `claude-code` id is a **separate** brand directory (`harnesses/claude-code/`)
 * pointing at the same adapter through an offline, absolute entry. Both ids exist because the
 * managed chain must never run `npx`; which one a deployment names is its own choice, and nothing
 * here merges them.
 */
import { harnessProfile } from "../../third_party/harness_remote/bridge/src/harness-profiles.js"

export const id = "claude"
export const origin = "upstream"
export const profile = () => harnessProfile("claude")
