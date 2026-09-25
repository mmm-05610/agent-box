/**
 * Brand launch context for `hermes`.
 *
 * Hermes Agent ships its own ACP server (`hermes acp`) and has no upstream profile, so the
 * command shape is AgentBox registration data. It is read from the single profile table rather
 * than copied here, so the table stays the only source of "how this brand starts".
 */
import { AGENTBOX_HARNESS_PROFILES } from "../../runtime/profile_extensions.mjs"

export const id = "hermes"
export const origin = "agentbox"
export const profile = () => AGENTBOX_HARNESS_PROFILES.hermes
