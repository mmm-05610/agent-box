/**
 * Brand launch context for `codex`.
 *
 * The command, the pinned adapter package and the "prefer an adapter already on PATH" rule all
 * live in the reused upstream profile table (`third_party/harness_remote/bridge/src/harness-profiles.js`),
 * which `resolveAcpLaunch()` reads. This file's only job is to name that table as **this brand's**
 * entry point, so the access layer has one place per brand to ask and never branches on a brand id.
 */
import { harnessProfile } from "../../third_party/harness_remote/bridge/src/harness-profiles.js"

export const id = "codex"
export const origin = "upstream"
export const profile = () => harnessProfile("codex")
