/**
 * Brand launch context for `kilo` (`kilo acp`) — see `harnesses/hermes/launch.mjs`.
 */
import { AGENTBOX_HARNESS_PROFILES } from "../../runtime/profile_extensions.mjs"

export const id = "kilo"
export const origin = "agentbox"
export const profile = () => AGENTBOX_HARNESS_PROFILES.kilo
