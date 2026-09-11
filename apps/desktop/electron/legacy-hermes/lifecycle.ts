/**
 * legacy-hermes/lifecycle.ts
 *
 * The narrow boundary between the Desktop composition root and the Hermes-direct
 * runtime — the adapter that the future Work Core path replaces.
 *
 * ## The six verbs
 *
 * The boundary is defined by six verbs. This module owns the *pure* producers
 * behind them, so a caller never assembles Hermes argv, env or a connection
 * descriptor itself:
 *
 * | Verb | Producer here | Production implementation it feeds |
 * |---|---|---|
 * | `resolve` | — (unchanged, still `composition/bootstrap-env-composition.ts::resolveHermesBackend`) | walks the executable ladder using `legacy-hermes/backend-probes.ts`, `legacy-hermes/active-runtime-state.ts`, `legacy-hermes/windows-hermes-path.ts` |
 * | `launch` | `hermesServeArgs`, `hermesRuntimeArgs`, `hermesBackendEnv` | the composition's two `spawn()` sites (primary + pooled profile) |
 * | `readiness` | — (`legacy-hermes/backend-ready.ts`, `legacy-hermes/backend-health.ts`, `legacy-hermes/gateway-ws-probe.ts`) | `waitForDashboardPortAnnouncement` → `waitForHermesReady` → WS probe, over `process/readiness.ts` |
 * | `descriptor` | `hermesLocalWsUrl`, `hermesPrimaryConnectionDescriptor`, `hermesProfiledConnectionDescriptor` | the object the renderer receives as its gateway connection |
 * | `restart` | — (`legacy-hermes/backend-recycle.ts`, `legacy-hermes/pool-spawn-coordinator.ts`) | recycle/replace an owned backend through `process/child-stop.ts` |
 * | `shutdown` | — (`legacy-hermes/backend-ownership.ts`, `legacy-hermes/backend-release-gate.ts`) | ownership-recorded stop + release gate |
 *
 * `HermesBackendLifecycle` below states that seam as types. It is deliberately
 * a *description of an existing shape*, not a new orchestrator: the composition
 * root already implements these verbs across the modules named above, and
 * introducing a single object that owns all six would be exactly the
 * god-object this refactor exists to avoid. `lifecycle.test.ts` pins the
 * producers' contracts so the seam stays narrow.
 *
 * ## What this module must never contain
 *
 * Nothing here may be imported by `process/` or `host-capabilities/`: those
 * layers must not learn that Hermes exists. And nothing here may decide
 * Harness, Session or Execution — the legacy path transports them, it does not
 * own them.
 */

import { serveBackendArgs } from './backend-command'

export type HermesBackendMode = 'local' | 'remote'

/**
 * What a caller learns about a Hermes backend once it is ready. Deliberately
 * small: URL, mode, the token to authenticate with, and the profile it serves.
 */
export interface HermesConnectionDescriptor {
  authMode?: string
  baseUrl: string
  logs?: unknown
  mode: HermesBackendMode
  profile?: null | string
  source?: string
  token: null | string
  wsUrl: string
}

/**
 * A local descriptor is the protocol shape PLUS whatever window geometry the
 * composition merges in (`...getWindowState()`), so callers that need those
 * fields are not forced to cast.
 */
export type HermesLocalConnection = HermesConnectionDescriptor & Record<string, unknown>

/** A fully-formed launch instruction. No caller builds argv or env itself. */
export interface HermesLaunchPlan {
  args: string[]
  command: string
  cwd: string
  env: NodeJS.ProcessEnv
  label: string
  readyFile: null | string
  shell?: any
}

export interface HermesBackendLifecycle {
  descriptor: (
    input: HermesLocalDescriptorInput | HermesProfiledDescriptorInput
  ) => HermesConnectionDescriptor
  launch: (plan: HermesLaunchPlan) => unknown
  readiness: (child: unknown, options?: Record<string, unknown>) => Promise<number>
  resolve: (args: string[]) => unknown
  restart: (plan: HermesLaunchPlan) => unknown
  shutdown: (child: unknown) => Promise<void>
}

/**
 * Build the argv for a headless Hermes child. `--profile` comes first because
 * `hermes -p <name>` resolves HERMES_HOME the same way the CLI does, and it wins
 * over the sticky `~/.hermes/active_profile` file.
 */
export function hermesServeArgs(profile?: null | string): string[] {
  return serveBackendArgs(profile || undefined)
}

/**
 * Route argv for the runtime that was actually resolved. `serve` is newer than
 * the app; an un-upgraded runtime (an older managed install, or an older
 * `hermes` on PATH) only knows `dashboard --no-open`, and without this rewrite a
 * new app against an un-upgraded runtime dies on an unknown subcommand.
 */
export function hermesRuntimeArgs(
  backend: { args: string[] },
  supportsServe: (backend: { args: string[] }) => boolean,
  toDashboardArgs: (args: string[]) => string[]
): string[] {
  return supportsServe(backend) ? backend.args : toDashboardArgs(backend.args)
}

export interface HermesBackendEnvInput {
  /** The backend's own extra env (e.g. a PATH the resolver assembled). */
  backendEnv?: Record<string, string | undefined> | null
  /** The child's working directory, mirrored into TERMINAL_CWD. */
  cwd: string
  /** The resolved HERMES_HOME, pinned so Python agrees with the Desktop. */
  hermesHome: string
  /** The inherited environment; everything below layers over it. */
  inherited: NodeJS.ProcessEnv
  /** Parent-watchdog identity, so an unclean Desktop death self-terminates the child. */
  parentIdentityEnv: Record<string, string>
  /** Optional ready-file for the legacy `dashboard` backend. */
  readyFile?: null | string
  /** The session token the app will also use to probe readiness. */
  sessionToken: string
  /** The built renderer dist the backend serves. */
  webDist: string
}

/**
 * The environment a Hermes backend child needs.
 *
 * `HERMES_HOME` is pinned explicitly: Python's `get_hermes_home()` would
 * otherwise fall back to `~/.hermes` on every platform — fine on mac/linux
 * where the Desktop's default matches, but wrong on Windows, where the
 * Desktop's default is `%LOCALAPPDATA%\hermes`. A mismatch splits config,
 * sessions, `.env` and logs across two directories.
 *
 * A single producer for both spawn sites (primary and pooled profile) is the
 * point: two copies of this object had already drifted apart only by accident.
 */
export function hermesBackendEnv({
  backendEnv,
  cwd,
  hermesHome,
  inherited,
  parentIdentityEnv,
  readyFile,
  sessionToken,
  webDist
}: HermesBackendEnvInput): NodeJS.ProcessEnv {
  return {
    ...inherited,
    HERMES_HOME: hermesHome,
    ...(backendEnv || {}),
    // Pin the gateway's tool/terminal cwd to the directory chosen for the child.
    // Inherited TERMINAL_CWD (or a stale config bridge) can still point at the
    // install dir even when the spawn cwd is home.
    TERMINAL_CWD: cwd,
    HERMES_DASHBOARD_SESSION_TOKEN: sessionToken,
    // Marks this backend as desktop-spawned so it runs the cron scheduler tick
    // loop (the messaging gateway is not running under the app).
    HERMES_DESKTOP: '1',
    // Exact parent identity lets the backend self-exit after an unclean Desktop
    // death without mistaking a reused PID for its owner.
    ...parentIdentityEnv,
    HERMES_WEB_DIST: webDist,
    ...(readyFile ? { HERMES_DESKTOP_READY_FILE: readyFile } : {})
  }
}

/** The local WebSocket endpoint an in-process Hermes backend serves. */
export function hermesLocalWsUrl(port: unknown, token: string): string {
  return `ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(token)}`
}

export interface HermesLocalDescriptorInput {
  baseUrl: string
  logs?: unknown
  token: string
  windowState?: Record<string, unknown>
  wsUrl: string
}

export interface HermesProfiledDescriptorInput extends HermesLocalDescriptorInput {
  /** The profile this backend serves. Always present on the pooled descriptor. */
  profile: null | string
}

function localDescriptor(input: HermesLocalDescriptorInput, profile: { value: null | string } | null) {
  const descriptor: Record<string, unknown> = {
    baseUrl: input.baseUrl,
    mode: 'local',
    source: 'local',
    authMode: 'token',
    token: input.token
  }

  if (profile) {
    descriptor.profile = profile.value
  }

  descriptor.wsUrl = input.wsUrl
  descriptor.logs = input.logs

  return { ...descriptor, ...(input.windowState || {}) } as unknown as HermesLocalConnection
}

/**
 * The descriptor for the PRIMARY local backend, which serves whichever profile
 * is active — so it carries no `profile` key at all. Adding one would invite a
 * caller to scope a request to a profile the backend does not serve.
 */
export function hermesPrimaryConnectionDescriptor(input: HermesLocalDescriptorInput): HermesLocalConnection {
  return localDescriptor(input, null)
}

/**
 * The descriptor for a POOLED local backend, which serves exactly one profile.
 * The key is always present (even when null) so the router can distinguish
 * "serves the active profile" from "serves this named profile".
 */
export function hermesProfiledConnectionDescriptor(input: HermesProfiledDescriptorInput): HermesLocalConnection {
  return localDescriptor(input, { value: input.profile })
}
