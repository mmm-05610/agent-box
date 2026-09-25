/**
 * Harness discovery — the access layer's only per-brand read point.
 *
 * One brand, one directory, one `launch.mjs`. This aggregator holds no brand data and contains no
 * branch on a brand id: it maps the id to the module that describes that brand and asks the reused
 * upstream resolver (`resolveAcpLaunch`) to turn the brand's own profile into a concrete
 * `{command, args, source}`. A brand with no directory here is not discoverable, and the caller
 * gets `HARNESS_UNDISCOVERED` rather than a guess.
 *
 * `source` says how much the resolver had to assume, and the entry reports it unchanged:
 *   · `path`    — an adapter the machine already has, found on `PATH`;
 *   · `harness` — the brand's own command carries the ACP server (no separate adapter), e.g. `dsh`;
 *   · `npx`     — nothing installed, so the default would fetch the pinned package over the
 *                 network. A managed offline deployment must inject `launch` instead of accepting
 *                 this value, which is why it is reported rather than silently used.
 */
import { resolveAcpLaunch } from "../third_party/harness_remote/bridge/src/harness-profiles.js"
import * as claude from "./claude/launch.mjs"
import * as claudeCode from "./claude-code/launch.mjs"
import * as codex from "./codex/launch.mjs"
import * as dsh from "./dsh/launch.mjs"
import * as hermes from "./hermes/launch.mjs"
import * as kilo from "./kilo/launch.mjs"
import * as omp from "./omp/launch.mjs"
import * as pi from "./pi/launch.mjs"
import * as qwen from "./qwen/launch.mjs"

const BRANDS = new Map([claude, claudeCode, codex, dsh, hermes, kilo, omp, pi, qwen].map(
  (brand) => [brand.id, brand],
))

/** Every brand this plugin can connect to, sorted for a stable wire order. */
export function listHarnesses() {
  return [...BRANDS.keys()].sort()
}

export function isKnownHarness(id) {
  return BRANDS.has(id)
}

/**
 * The launch context for one brand: what to run, with what arguments, and how much of that the
 * machine actually confirmed.
 *
 * `find` is injectable only so a test can observe the PATH lookup; production passes nothing and
 * gets the same `findExecutable` the reused resolver has always used.
 */
export function harnessLaunchContext(id, { find } = {}) {
  const brand = BRANDS.get(id)
  if (!brand) throw new Error(`HARNESS_UNDISCOVERED: ${id}`)
  const profile = brand.profile()
  return {
    harness: id,
    origin: brand.origin,
    label: profile.label ?? id,
    ...resolveAcpLaunch(profile, find ? { find } : {}),
  }
}
