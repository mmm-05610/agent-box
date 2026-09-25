/**
 * Brand launch context for `dsh` (DeepSeek's official launcher, `dsh --profile acp`)
 * — see `harnesses/hermes/launch.mjs` for why the data stays in the profile table.
 */
import { AGENTBOX_HARNESS_PROFILES } from "../../runtime/profile_extensions.mjs"

export const id = "dsh"
export const origin = "agentbox"
export const profile = () => AGENTBOX_HARNESS_PROFILES.dsh
