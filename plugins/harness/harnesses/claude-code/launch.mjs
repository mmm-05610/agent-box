/**
 * Brand launch context for `claude-code` — see `harnesses/hermes/launch.mjs`.
 */
import { AGENTBOX_HARNESS_PROFILES } from "../../runtime/profile_extensions.mjs"

export const id = "claude-code"
export const origin = "agentbox"
export const profile = () => AGENTBOX_HARNESS_PROFILES["claude-code"]
