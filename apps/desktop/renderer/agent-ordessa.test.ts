import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  ServerConfigError, parseOrigin, resolveServerTarget, serverInstanceId,
} from '../../../plugins/connectors/ordessa/src/target'
import { readRestrictedTokenFile } from '../../../plugins/connectors/ordessa/src/token-file'
import { selectReadyProfile } from '../../../plugins/connectors/ordessa/src/native'

const SECRET = 'a'.repeat(64)
const LOCATOR = '/run/ordessa/data-root/secrets/http-token'
const env = { ORDESSA_SERVER_ORIGIN: 'http://127.0.0.1:41207', ORDESSA_SERVER_TOKEN_FILE: LOCATOR }
const reader = (token: string) => async () => token
// A real reader refuses with ServerConfigError, so the fake must fail the same way.
const unreadable = async () => { throw new ServerConfigError('Ordessa Server token file is unreadable; http-token') }

const refusedMessage = async (run: () => Promise<unknown>) => {
  const failure = await run().then(() => undefined, error => error)
  expect(failure, 'expected a refusal').toBeInstanceOf(ServerConfigError)
  return String((failure as Error).message)
}
const refusedOrigin = (origin: string | undefined) => refusedMessage(() => Promise.resolve().then(() => parseOrigin(origin)))
const refusedTarget = (input: Record<string, string | undefined>, read = reader(SECRET)) =>
  refusedMessage(() => resolveServerTarget(input, read))

it('resolves the two explicit host inputs into a same-origin target', async () => {
  // The privileged reader has already proven and parsed the file, so the target only ever carries a usable bearer.
  const target = await resolveServerTarget(env, reader(SECRET))
  expect(target).toEqual({ origin: 'http://127.0.0.1:41207', socket: 'ws://127.0.0.1:41207', token: SECRET })
  expect(parseOrigin('http://127.0.0.1:41207/')).toBe('http://127.0.0.1:41207')
  expect(parseOrigin('http://LOCALHOST:8080')).toBe('http://localhost:8080')
})

it('refuses when either input is absent instead of guessing a default port', async () => {
  expect(await refusedTarget({})).toContain('ORDESSA_SERVER_ORIGIN')
  expect(await refusedTarget({ ORDESSA_SERVER_ORIGIN: 'http://127.0.0.1:41207' })).toContain('ORDESSA_SERVER_TOKEN_FILE')
  expect(await refusedTarget({ ORDESSA_SERVER_TOKEN_FILE: LOCATOR })).toContain('ORDESSA_SERVER_ORIGIN')
  expect(await refusedOrigin(undefined)).toContain('is not set')
})

it('refuses anything that is not a bare loopback http origin with an explicit port', async () => {
  const rejected = ['http://127.0.0.1', 'http://localhost', 'https://127.0.0.1:41207', 'http://8732',
    'http://10.0.0.5:8732', 'http://ordessa.example:41207', 'http://[::ffff:127.0.0.1]:41207',
    'http://127.0.0.1:41207/api', 'http://127.0.0.1:41207/?token=x', 'http://127.0.0.1:41207#x',
    'http://user:pass@127.0.0.1:41207', 'ws://127.0.0.1:41207', 'not a url']
  for (const origin of rejected) expect(await refusedOrigin(origin), origin).toMatch(/omits the port|not loopback|must use http|origin only|not a URL|credentials/)
})

it('refuses an unusable token locator without echoing the secret or its path', async () => {
  expect(await refusedTarget({ ...env, ORDESSA_SERVER_TOKEN_FILE: 'secrets/http-token' })).toContain('not absolute')
  expect(await refusedTarget(env, unreadable)).toContain('unreadable')
  expect(await refusedTarget(env, reader(''))).toContain('empty')
})

it('scopes one instance identity per Server however its origin is spelled', async () => {
  const normalized = serverInstanceId(parseOrigin('http://LOCALHOST:41207/'), 'server_1')
  expect(normalized).toBe('http://localhost:41207|server_1')
  // A restart of the same data-root keeps the same scope, so a project selection survives it.
  expect(serverInstanceId(parseOrigin('http://localhost:41207'), 'server_1')).toBe(normalized)
  expect(serverInstanceId('http://localhost:41207', 'server_2')).not.toBe(normalized)
  expect(serverInstanceId('http://localhost:41208', 'server_1')).not.toBe(normalized)
})

// ---------------------------------------------------------------------------
// The restricted token file: FC-0036 requires the locator to be proven, not merely readable.

const roots: string[] = []
const dataRoot = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ordessa-token-'))
  roots.push(root)
  return root
}
const tokenFile = (token = `${SECRET}\n`, mode = 0o600, root = dataRoot(), name = 'http-token') => {
  const secrets = path.join(root, 'secrets')
  mkdirSync(secrets, { recursive: true })
  const file = path.join(secrets, name)
  writeFileSync(file, token, { mode })
  chmodSync(file, mode)
  return { file, root }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  process.getuid = originalGetuid
})
const originalGetuid = process.getuid

it('accepts only the same data-root secrets token file, at 0600', async () => {
  expect(await readRestrictedTokenFile(tokenFile().file)).toBe(SECRET)
  // Owner-read-only is equally private, so it is not refused for being narrower than 0600.
  expect(await readRestrictedTokenFile(tokenFile(SECRET, 0o400).file)).toBe(SECRET)
})

it('refuses a locator that is not the Server secrets token file', async () => {
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile(SECRET, 0o600, dataRoot(), 'token').file)))
    .toContain('not named http-token')
  const outside = path.join(dataRoot(), 'http-token')
  writeFileSync(outside, SECRET, { mode: 0o600 })
  expect(await refusedMessage(() => readRestrictedTokenFile(outside))).toContain('not inside the data-root secrets directory')
})

it('refuses a symlink and any other non-regular file', async () => {
  const { file } = tokenFile()
  const linked = path.join(path.dirname(file), 'real-token')
  writeFileSync(linked, SECRET, { mode: 0o600 })
  rmSync(file)
  symlinkSync(linked, file)
  expect(await refusedMessage(() => readRestrictedTokenFile(file))).toContain('is a symlink')
  const asDirectory = dataRoot()
  mkdirSync(path.join(asDirectory, 'secrets', 'http-token'), { recursive: true })
  expect(await refusedMessage(() => readRestrictedTokenFile(path.join(asDirectory, 'secrets', 'http-token')))).toContain('not a regular file')
})

it('refuses a token file that group, other or somebody else can see', async () => {
  for (const mode of [0o640, 0o604, 0o666]) {
    expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile(SECRET, mode).file)), `mode ${mode.toString(8)}`)
      .toContain('readable by group or other')
  }
  // A root run would open it and fail the owner-read test instead; both are refusals.
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile(SECRET, 0o000).file))).toContain('not readable')
  const foreign = tokenFile()
  process.getuid = () => 999_999
  try {
    expect(await refusedMessage(() => readRestrictedTokenFile(foreign.file))).toContain('owned by another user')
  } finally {
    process.getuid = originalGetuid
  }
})

it('refuses where ownership cannot be checked at all', async () => {
  const { file } = tokenFile()
  process.getuid = undefined as unknown as typeof process.getuid
  expect(await refusedMessage(() => readRestrictedTokenFile(file))).toContain('ownership cannot be checked')
})

it('refuses an unusable token body', async () => {
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile('').file))).toContain('empty')
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile('\n').file))).toContain('empty')
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile('first\nsecond\n').file))).toContain('control characters')
  expect(await refusedMessage(() => readRestrictedTokenFile(tokenFile('x'.repeat(8192)).file))).toContain('too large')
})

it('never writes the token or its full locator into a token-file refusal', async () => {
  const missingRoot = dataRoot()
  const missing = path.join(missingRoot, 'secrets', 'http-token')
  mkdirSync(path.join(missingRoot, 'secrets'))
  const linkedRoot = dataRoot()
  const linked = path.join(linkedRoot, 'real-token')
  writeFileSync(linked, SECRET, { mode: 0o600 })
  symlinkSync(linked, missing)
  const cases = [missing, tokenFile(SECRET, 0o644).file, tokenFile('x'.repeat(8192)).file]
  for (const candidate of cases) {
    const message = await refusedMessage(() => readRestrictedTokenFile(candidate))
    expect(message, candidate).not.toContain(SECRET)
    expect(message, candidate).not.toContain(path.dirname(path.dirname(candidate)))
    expect(message).toContain('http-token')
  }
  // The positive case proves the same locator is otherwise readable, so the refusals above are not vacuous.
  expect(await readRestrictedTokenFile(tokenFile(`${SECRET}\n`, 0o600).file)).toBe(SECRET)
})

// FC-0049 / C-0026: createAndSend.profileId is this connection's Harness execution identity. The only
// offline seam for that rule is the predicate itself, so every refusal below is the pre-request gate.
const refusal = (run: () => unknown): string => {
  try { run() } catch (error) { return String((error as Error).message) }
  throw new Error('expected the profile selection to refuse')
}
const profile = (id: string, harness?: string, extra: Record<string, unknown> = {}) =>
  ({ id, ...(harness ? { harness } : {}), displayName: `${id} label`, sendability: { state: 'ready' }, ...extra })

it('selects the one profile whose Harness the authenticated hello offers', () => {
  const pi = new Set(['pi'])
  expect(selectReadyProfile(pi, [profile('p_pi', 'pi')])).toEqual({ id: 'p_pi', harness: 'pi', displayName: 'p_pi label' })
  // A ready profile of another Harness sorts first but is never the execution identity of this connection.
  expect(selectReadyProfile(pi, [profile('a_other', 'codex'), profile('b_pi', 'pi')])).toEqual({ id: 'b_pi', harness: 'pi', displayName: 'b_pi label' })
  expect(refusal(() => selectReadyProfile(pi, [profile('a_other', 'codex')]))).toMatch(/no-ready-profile/)
  // displayName is Server-owned; an absent one falls back to the id rather than an invented label.
  expect(selectReadyProfile(pi, [{ id: 'p_pi', harness: 'pi', sendability: { state: 'ready' } }])).toEqual({ id: 'p_pi', harness: 'pi', displayName: 'p_pi' })
})

it('refuses to guess a Harness profile instead of picking a list position', () => {
  const pi = new Set(['pi'])
  expect(refusal(() => selectReadyProfile(pi, [profile('p_one', 'pi'), profile('p_two', 'pi')]))).toMatch(/profile-ambiguous/)
  expect(refusal(() => selectReadyProfile(pi, []))).toMatch(/no-ready-profile/)
  // Not ready or still recovering cannot accept a turn, so neither counts as a candidate.
  expect(refusal(() => selectReadyProfile(pi, [profile('p_one', 'pi', { sendability: { state: 'blocked' } }),
    profile('p_two', 'pi', { recoveryPending: true })]))).toMatch(/no-ready-profile/)
  // An empty hello gives no Harness to match, which must not widen into "any profile will do".
  expect(refusal(() => selectReadyProfile(new Set<string>(), [profile('p_pi', 'pi')]))).toMatch(/no-ready-profile/)
  // A profile the Server never attributed to a Harness is not selectable either.
  expect(refusal(() => selectReadyProfile(pi, [profile('p_orphan')]))).toMatch(/no-ready-profile/)
})
