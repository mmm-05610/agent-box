/**
 * Brand launch context for `pi` — see `harnesses/codex/launch.mjs` for why this file exists.
 */
import { harnessProfile } from "../../third_party/harness_remote/bridge/src/harness-profiles.js"

export const id = "pi"
export const origin = "upstream"
export const profile = () => harnessProfile("pi")
