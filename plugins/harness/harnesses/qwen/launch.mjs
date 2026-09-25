/**
 * Brand launch context for `qwen` (`qwen --acp`) — see `harnesses/hermes/launch.mjs`.
 */
import { AGENTBOX_HARNESS_PROFILES } from "../../runtime/profile_extensions.mjs"

export const id = "qwen"
export const origin = "agentbox"
export const profile = () => AGENTBOX_HARNESS_PROFILES.qwen
