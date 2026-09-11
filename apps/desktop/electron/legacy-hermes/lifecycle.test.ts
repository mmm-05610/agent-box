/**
 * Pins the narrow Legacy-Hermes lifecycle boundary: the producers the
 * composition root calls instead of assembling Hermes argv/env/descriptors
 * itself, and the six-verb interface those producers fill.
 *
 * These are contract assertions, not snapshots: each one states a property the
 * Desktop's agreement with an EXTERNAL runtime depends on. Changing the value
 * means the Desktop and the runtime have stopped agreeing.
 */
import assert from 'node:assert/strict'

import { test } from 'vitest'

import { dashboardFallbackArgs } from './backend-command'
import {
  hermesBackendEnv,
  type HermesBackendLifecycle,
  type HermesLaunchPlan,
  hermesLocalWsUrl,
  hermesPrimaryConnectionDescriptor,
  hermesProfiledConnectionDescriptor,
  hermesRuntimeArgs,
  hermesServeArgs
} from './lifecycle'

// --- launch: argv ------------------------------------------------------------

test('serve argv is headless and asks the OS for an ephemeral port', () => {
  assert.deepEqual(hermesServeArgs(), ['serve', '--host', '127.0.0.1', '--port', '0'])
})

test('a profile is pinned before the subcommand, so it wins over the sticky active_profile file', () => {
  assert.deepEqual(hermesServeArgs('worker'), ['--profile', 'worker', 'serve', '--host', '127.0.0.1', '--port', '0'])
})

test('an unset profile keeps the legacy launch shape (no stray --profile flag)', () => {
  for (const absent of [null, undefined, '']) {
    assert.equal(hermesServeArgs(absent).includes('--profile'), false)
  }
})

test('argv is routed to the runtime that was resolved, not to the app version', () => {
  const backend = { args: hermesServeArgs('worker') }

  // A runtime that understands `serve` keeps it verbatim.
  assert.deepEqual(hermesRuntimeArgs(backend, () => true, dashboardFallbackArgs), backend.args)

  // An un-upgraded runtime gets the legacy subcommand, with every other
  // argument (including --profile) preserved.
  assert.deepEqual(hermesRuntimeArgs(backend, () => false, dashboardFallbackArgs), [
    '--profile',
    'worker',
    'dashboard',
    '--no-open',
    '--host',
    '127.0.0.1',
    '--port',
    '0'
  ])
})

// --- launch: env -------------------------------------------------------------

const baseEnvInput = {
  cwd: '/home/u/project',
  hermesHome: '/home/u/.hermes',
  inherited: { PATH: '/usr/bin', HERMES_HOME: '/wrong/place' } as NodeJS.ProcessEnv,
  parentIdentityEnv: { HERMES_PARENT_PID: '4242' },
  sessionToken: 'tok-abc',
  webDist: '/app/dist/web'
}

test('HERMES_HOME is pinned over the inherited value so config, sessions and logs cannot split', () => {
  const env = hermesBackendEnv(baseEnvInput)

  assert.equal(env.HERMES_HOME, '/home/u/.hermes')
  assert.equal(env.PATH, '/usr/bin', 'the inherited environment is still the base')
})

test('the child learns the token, the terminal cwd and that it is desktop-spawned', () => {
  const env = hermesBackendEnv(baseEnvInput)

  assert.equal(env.HERMES_DASHBOARD_SESSION_TOKEN, 'tok-abc')
  assert.equal(env.TERMINAL_CWD, '/home/u/project')
  assert.equal(env.HERMES_DESKTOP, '1')
  assert.equal(env.HERMES_WEB_DIST, '/app/dist/web')
  assert.equal(env.HERMES_PARENT_PID, '4242')
})

test('the ready file is forwarded only when one exists', () => {
  assert.equal('HERMES_DESKTOP_READY_FILE' in hermesBackendEnv(baseEnvInput), false)
  assert.equal(
    hermesBackendEnv({ ...baseEnvInput, readyFile: '/tmp/ready.json' }).HERMES_DESKTOP_READY_FILE,
    '/tmp/ready.json'
  )
})

test('a backend-resolved env (its PATH) layers over the inherited one', () => {
  const env = hermesBackendEnv({
    ...baseEnvInput,
    backendEnv: { PATH: '/managed/node/bin' }
  })

  assert.equal(env.PATH, '/managed/node/bin')

  // The pin is what the backend does NOT override: a backend env that omits
  // HERMES_HOME still gets the Desktop's choice, which is the case that matters
  // (resolveHermesBackend's own env carries PATH and node entries, not a home).
  assert.equal(env.HERMES_HOME, '/home/u/.hermes')
})

// --- descriptor --------------------------------------------------------------

test('the ws url carries the token URL-encoded', () => {
  assert.equal(hermesLocalWsUrl(53150, 'a+b/c='), 'ws://127.0.0.1:53150/api/ws?token=a%2Bb%2Fc%3D')
})

test('the primary descriptor carries no profile key: the backend serves the active profile', () => {
  const descriptor = hermesPrimaryConnectionDescriptor({
    baseUrl: 'http://127.0.0.1:53150',
    logs: ['line'],
    token: 'tok',
    windowState: { width: 1280 },
    wsUrl: 'ws://127.0.0.1:53150/api/ws?token=tok'
  })

  assert.equal('profile' in descriptor, false)
  assert.equal(descriptor.mode, 'local')
  assert.equal(descriptor.authMode, 'token')
  assert.equal(descriptor.width, 1280, 'window state is merged into the descriptor')
})

test('the pooled descriptor always names the profile it serves, even when null', () => {
  const withProfile = hermesProfiledConnectionDescriptor({
    baseUrl: 'http://127.0.0.1:53150',
    profile: 'worker',
    token: 'tok',
    wsUrl: 'ws://127.0.0.1:53150/api/ws?token=tok'
  })

  assert.equal(withProfile.profile, 'worker')

  const withoutProfile = hermesProfiledConnectionDescriptor({
    baseUrl: 'http://127.0.0.1:53150',
    profile: null,
    token: 'tok',
    wsUrl: 'ws://127.0.0.1:53150/api/ws?token=tok'
  })

  // Present-and-null is a different statement from absent: this backend is
  // scoped, and the router must ask for a profile rather than assume the active one.
  assert.equal('profile' in withoutProfile, true)
  assert.equal(withoutProfile.profile, null)
})

// --- the six-verb seam -------------------------------------------------------

/**
 * The interface is a description of a shape the composition root already
 * implements across `legacy-hermes/*` and `composition/bootstrap-env-composition.ts`.
 * This fixture proves the seam is expressible with the real producers and does
 * not require a new orchestrator: every verb is a single narrow function.
 */
test('the lifecycle interface is satisfiable from narrow functions, without a god object', () => {
  const lifecycle: HermesBackendLifecycle = {
    descriptor: () =>
      hermesPrimaryConnectionDescriptor({
        baseUrl: 'http://127.0.0.1:1',
        token: 'tok',
        wsUrl: hermesLocalWsUrl(1, 'tok')
      }),
    launch: (plan: HermesLaunchPlan) => plan,
    readiness: async () => 53150,
    resolve: (args: string[]) => ({ args }),
    restart: (plan: HermesLaunchPlan) => plan,
    shutdown: async () => undefined
  }

  assert.deepEqual(Object.keys(lifecycle).sort(), [
    'descriptor',
    'launch',
    'readiness',
    'resolve',
    'restart',
    'shutdown'
  ])
})
