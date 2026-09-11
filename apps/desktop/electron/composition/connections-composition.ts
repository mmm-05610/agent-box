// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import {
  BrowserWindow,
  safeStorage
} from 'electron'

import {
  connectionScopeKey,
  localProfileEntry,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode,
  resolveAuthMode,
  savedProfileSsh,
  tokenPreview
} from '../legacy-hermes/connection-config'
import {
  backendScopePrefix,
  connectionDialFieldsChanged,
  mergeConnectionInput,
  normalizeConnectionInput,
  upsertConnection
} from '../legacy-hermes/connection-registry'
import {
  encryptDesktopSecret as encryptDesktopSecretStrict,
  resolvePersistedRemoteToken,
  SAFE_STORAGE_ENCODING
} from '../hardening'
import {
  oauthSessionIsLive
} from '../native-auth-decisions'
import {
  classifyStoredSecret,
  type SecretStoragePolicy,
  writeSecretStoragePolicy
} from '../secret-storage-policy'

import {
  _nativeTokenStoreIo,
  _secretStoragePolicy,
  _secretStoragePolicyIo,
  backendPool,
  decryptDesktopSecret,
  encryptDesktopSecret,
  hasLiveOauthSession,
  hasNativeSession,
  managedConnectionUpdateGate,
  readDesktopConnectionConfig,
  readDesktopConnectionsRegistry,
  secretStoragePolicy,
  set_secretStoragePolicy,
  sshBootstrapCoordinator,
  sshConnections,
  stopPoolBackend,
  teardownSshConnection,
  writeDesktopConnectionConfig,
  writeDesktopConnectionsRegistry,
} from './bootstrap-env-composition'
import {
  rememberLog
} from './log-buffer'

export function setSecretStoragePolicy(next: SecretStoragePolicy) {
  set_secretStoragePolicy({ on: next.on === true, migrated: next.migrated === true })
  writeSecretStoragePolicy(_secretStoragePolicy, _secretStoragePolicyIo)
}

export function probeSecureTokenStorage(): boolean {
  if (!secretStoragePolicy().on) {
    return true
  }

  try {
    return Boolean(safeStorage.isEncryptionAvailable())
  } catch {
    return false
  }
}

export function rewriteAllStoredSecrets(shouldRewrite: (secret: any) => boolean, reencode: (secret: any) => any): boolean {
  let touched = false

  const rewriteBlock = (block: any) => {
    if (!block || typeof block !== 'object') {
      return block
    }

    const next = { ...block, ...(block.token ? { token: reencode(block.token) } : {}) }

    if (block.headers && typeof block.headers === 'object') {
      next.headers = Object.fromEntries(Object.entries(block.headers).map(([k, v]) => [k, reencode(v)]))
    }

    return next
  }

  const blockNeedsRewrite = (o: any) =>
    shouldRewrite(o?.token) ||
    Object.values(o?.headers && typeof o.headers === 'object' ? o.headers : {}).some(shouldRewrite)

  // v1 connection.json.
  const config = readDesktopConnectionConfig()

  if (blockNeedsRewrite(config.remote) || Object.values(config.profiles || {}).some(blockNeedsRewrite)) {
    touched = true
    writeDesktopConnectionConfig({
      ...config,
      remote: rewriteBlock(config.remote),
      profiles: Object.fromEntries(Object.entries(config.profiles || {}).map(([k, v]) => [k, rewriteBlock(v)]))
    })
  }

  // v2 connections.json registry.
  const registry = readDesktopConnectionsRegistry()

  if (registry.connections?.some(blockNeedsRewrite)) {
    touched = true
    writeDesktopConnectionsRegistry({ ...registry, connections: registry.connections.map(rewriteBlock) })
  }

  // Native OAuth token store: baseUrl → blob.
  const io = _nativeTokenStoreIo()

  try {
    const store = JSON.parse(io.readStoreText())

    if (store && typeof store === 'object' && !Array.isArray(store)) {
      const entries = Object.entries(store)

      if (entries.some(([, v]) => shouldRewrite(v))) {
        touched = true
        io.writeStoreText(JSON.stringify(Object.fromEntries(entries.map(([k, v]) => [k, reencode(v)]))))
      }
    }
  } catch {
    // Missing/corrupt native token store: nothing to rewrite.
  }

  return touched
}

export function migrateLegacyEncryptedSecretsOnce() {
  const policy = secretStoragePolicy()

  if (policy.on || policy.migrated) {
    return
  }

  const needsMigration = (secret: any) => classifyStoredSecret(secret, policy) === 'migrate'

  const reencode = (secret: any) => {
    if (!needsMigration(secret)) {
      return secret
    }

    const plaintext = decryptDesktopSecret(secret)

    // Undecryptable now (locked/absent keychain): keep the blob for a
    // potential future opt-in, but post-migration reads treat it as unset.
    return plaintext ? { encoding: 'plain', value: plaintext } : secret
  }

  let touchedKeychain = false

  try {
    touchedKeychain = rewriteAllStoredSecrets(needsMigration, reencode)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)

    rememberLog(`[secret-storage] legacy migration pass failed: ${detail}`)
  }

  setSecretStoragePolicy({ on: false, migrated: true })

  if (touchedKeychain) {
    rememberLog('[secret-storage] migrated legacy keychain-encrypted secrets to opt-out storage (one-shot pass)')
  }
}

export function applySecretStorageEncryption(on: boolean) {
  const enable = on === true

  if (secretStoragePolicy().on === enable) {
    return { on: enable }
  }

  if (enable) {
    const needsEncrypt = (secret: any) => secret?.encoding === 'plain' && Boolean(secret.value)

    // Probe FIRST so an unusable keychain fails before any store is touched.
    if (
      !(() => {
        try {
          return Boolean(safeStorage.isEncryptionAvailable())
        } catch {
          return false
        }
      })()
    ) {
      throw new Error(
        'OS keychain encryption is unavailable on this machine, so stored gateway secrets cannot be encrypted.'
      )
    }

    setSecretStoragePolicy({ on: true, migrated: true })

    try {
      rewriteAllStoredSecrets(needsEncrypt, secret =>
        needsEncrypt(secret) ? encryptDesktopSecretStrict(String(secret.value), safeStorage) : secret
      )
    } catch (error) {
      // Encryption failed midway: revert the policy so reads keep working
      // against whatever encodings are on disk (mixed stores read fine —
      // decryptDesktopSecret handles both encodings under either policy).
      setSecretStoragePolicy({ on: false, migrated: true })
      throw error
    }

    return { on: true }
  }

  // Turning OFF: decrypt everything back to plain while the keychain is
  // still readable, then flip the policy.
  const needsDecrypt = (secret: any) => secret?.encoding === SAFE_STORAGE_ENCODING

  rewriteAllStoredSecrets(needsDecrypt, (secret: any) => {
    if (!needsDecrypt(secret)) {
      return secret
    }

    const plaintext = decryptDesktopSecret(secret)

    return plaintext ? { encoding: 'plain', value: plaintext } : secret
  })

  setSecretStoragePolicy({ on: false, migrated: true })

  return { on: false }
}

export function encryptIncomingRemoteHeaders(raw, existing, options: { allowPlainText?: boolean } = {}) {
  const out = {}
  const stored = normalizeRemoteHeaders(existing)

  for (const [name, value] of Object.entries(raw || {})) {
    const key = String(name || '').trim()

    if (!key) {
      continue
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()

      if (trimmed) {
        out[key] = encryptDesktopSecret(trimmed, { allowPlainText: options.allowPlainText === true })
      }

      continue
    }

    if (value === null) {
      if (stored[key]) {
        out[key] = stored[key]
      }

      continue
    }

    if (value && typeof value === 'object') {
      out[key] = value
    }
  }

  return out
}

export function sanitizeRegistryConnection(entry) {
  const { token, headers, ...rest } = entry
  const decrypted = decryptDesktopSecret(token)
  // Last-known stable backend identity (from roster enumeration / Test) so
  // Settings can hint "Same backend as <label>" on connections that are two
  // addresses for one box. Display-only; absent until a probe has seen it.
  const knownInstallId = connectionInstallIds.get(entry.id)?.id

  return {
    ...rest,
    tokenSet: Boolean(decrypted),
    tokenPreview: tokenPreview(decrypted),
    ...(knownInstallId ? { installId: knownInstallId } : {}),
    // Header VALUES are secrets (Cloudflare Access client secrets etc.) and
    // never cross the IPC boundary — the renderer only needs the names to
    // render the edit form.
    headerNames: headers && typeof headers === 'object' ? Object.keys(headers) : []
  }
}

export async function saveRegistryConnection(input: any = {}) {
  const registry = readDesktopConnectionsRegistry()
  const existing = input.id ? registry.connections.find(c => c.id === input.id) : null
  const incomingToken = typeof input.token === 'string' ? input.token.trim() : ''

  const token = resolvePersistedRemoteToken({
    incomingToken,
    persistToken: true,
    existingToken: existing?.token,
    allowPlainText: input.allowPlainTextToken,
    encryptSecret: encryptDesktopSecret
  })

  // Extra gateway headers arrive as plaintext strings from the editor (or
  // envelopes from a hand-edited import). Encrypt plaintext values the same
  // way tokens are stored; a null/empty value drops that header. An absent
  // `headers` field inherits the stored set via mergeConnectionInput.
  const headers =
    input.headers && typeof input.headers === 'object'
      ? encryptIncomingRemoteHeaders(input.headers, existing?.headers, {
          allowPlainText: input.allowPlainTextToken
        })
      : input.headers

  const merged = mergeConnectionInput({ ...input, token, headers }, existing)
  const entry = normalizeConnectionInput(merged, registry)

  // Token-auth remotes must actually have a token to be dialable. OAuth and
  // cloud entries authenticate via cookies/native tokens instead.
  if (entry.kind === 'remote' && entry.authMode !== 'oauth' && !decryptDesktopSecret(entry.token)) {
    throw new Error('Remote gateway session token is required.')
  }

  if (existing && connectionDialFieldsChanged(existing, entry)) {
    managedConnectionUpdateGate.assertCanMutate(entry.id)
  }

  writeDesktopConnectionsRegistry(upsertConnection(registry, entry))

  // A dial-material edit (endpoint/auth/ssh routing — NOT a label rename)
  // leaves pooled backends under `conn:<id>::*` and renderer sockets pointing
  // at the OLD target while the UI shows the new one. Recycle them: stop this
  // connection's pooled backends/tunnels and tell renderers to dispose+redial
  // their secondaries for this connection id.
  if (existing && connectionDialFieldsChanged(existing, entry)) {
    await stopRegistryConnectionBackends(entry.id)
    broadcastConnectionsChanged({ connectionId: entry.id, reason: 'updated' })
  } else {
    // Every OTHER successful save (a brand-new connection, a label rename)
    // must still republish the registry snapshot, or windows that didn't
    // perform the save — and the switcher menu fed by $connectionsRegistry —
    // keep painting the stale list until reload (#95393). 'saved' is a pure
    // registry-refresh signal: no sockets moved, so listeners must not
    // dispose or redial anything for it.
    broadcastConnectionsChanged({ connectionId: entry.id, reason: 'saved' })
  }

  return sanitizeRegistryConnection(entry)
}

export async function sanitizeDesktopConnectionConfig(config = readDesktopConnectionConfig(), profile = null) {
  const key = connectionScopeKey(profile)
  const scoped = key ? config.profiles?.[key] || null : null
  const block = key ? scoped || {} : config.remote || {}

  const envOverride = key ? false : Boolean(process.env.HERMES_DESKTOP_REMOTE_URL)
  const savedMode = key ? scoped?.mode : config.mode
  const ssh = savedMode === 'ssh' ? normalizeSshConfig(block) : null

  const savedSsh = savedMode === 'local' ? (key ? savedProfileSsh(config, key) : normalizeSshConfig(block)) : null

  const remoteToken = decryptDesktopSecret(block.token)
  const authMode = normAuthMode(block.authMode)
  const remoteUrl = envOverride ? String(process.env.HERMES_DESKTOP_REMOTE_URL || '') : String(block.url || '')
  const mode = envOverride ? 'remote' : savedMode === 'ssh' ? 'ssh' : modeIsRemoteLike(savedMode) ? savedMode : 'local'

  // Whether the OS keyring (safeStorage) can encrypt the saved token. When
  // false the renderer knows to offer the plain-text opt-in in Settings →
  // Gateway. With keychain encryption opted out (the default) this reports
  // true WITHOUT touching safeStorage — probing is itself a keychain touch
  // that raises the macOS password dialog (see probeSecureTokenStorage).
  const secureTokenStorage = probeSecureTokenStorage()

  // Whether the currently saved token is stored in plain text (the keyring-less
  // opt-in path). The env override supplies its token from the environment, not
  // the saved block, so it never reports as plain text here.
  const remoteTokenPlainText = !envOverride && block.token?.encoding === 'plain'

  let remoteOauthConnected = false

  if (authMode === 'oauth' && remoteUrl) {
    try {
      // Display signal: treat a live RT cookie as "connected" even if the AT
      // cookie has lapsed — the gateway refreshes the AT on the next request,
      // so the session is still usable. A stored native bearer token (cookieless
      // RFC 8252 flow) counts as connected too — otherwise a completed native
      // sign-in shows "not connected" in Settings. The authoritative liveness
      // check is the ws-ticket mint in resolveRemoteBackend at actual connect time.
      remoteOauthConnected = oauthSessionIsLive(hasNativeSession(remoteUrl), await hasLiveOauthSession(remoteUrl))
    } catch {
      remoteOauthConnected = false
    }
  }

  return {
    mode,
    // Echo the scope back so the UI knows which profile (if any) this reflects.
    profile: key,
    remoteAuthMode: authMode,
    remoteOauthConnected,
    remoteUrl,
    // The persisted Hermes Cloud org (slug/id) for a cloud connection, or '' for
    // remote/local. Lets Settings → Gateway reopen into the same org.
    cloudOrg: mode === 'cloud' ? String(block.org || '') : '',
    remoteTokenPreview: tokenPreview(remoteToken),
    remoteTokenSet: Boolean(remoteToken),
    // Whether the OS keyring can encrypt a token; drives the plain-text opt-in
    // affordance in Settings → Gateway on keyring-less Linux.
    secureTokenStorage,
    // Whether the saved token is currently persisted in plain text.
    remoteTokenPlainText,
    sshHost: (ssh || savedSsh)?.host || '',
    sshUser: (ssh || savedSsh)?.user || '',
    sshPort: (ssh || savedSsh)?.port || null,
    sshKeyPath: (ssh || savedSsh)?.keyPath || '',
    sshRemoteHermesPath: (ssh || savedSsh)?.remoteHermesPath || '',
    sshRemoteProfile: (ssh || savedSsh)?.remoteProfile || '',
    // The env override only forces the global/primary connection; a per-profile
    // scope is never overridden by HERMES_DESKTOP_REMOTE_URL.
    envOverride
  }
}

export function buildRemoteBlock(remoteUrl, authMode, token, org?: string, headers?: object, name?: string) {
  if (authMode !== 'oauth' && !decryptDesktopSecret(token)) {
    throw new Error('Remote gateway session token is required.')
  }

  const block: { url: string; authMode: string; token: object; headers?: object; org?: string; name?: string } = {
    url: normalizeRemoteBaseUrl(remoteUrl),
    authMode,
    token
  }

  const remoteHeaders = normalizeRemoteHeaders(headers)

  if (Object.keys(remoteHeaders).length > 0) {
    block.headers = remoteHeaders
  }

  const nameValue = typeof name === 'string' ? name.trim() : ''

  if (nameValue) {
    block.name = nameValue
  }

  const orgValue = typeof org === 'string' ? org.trim() : ''

  if (orgValue) {
    block.org = orgValue
  }

  return block
}

export function coerceDesktopConnectionConfig(input: any = {}, existing = readDesktopConnectionConfig(), options: any = {}) {
  const persistToken = options.persistToken !== false
  const key = connectionScopeKey(input.profile)
  // 'cloud' and 'remote' both persist a remote-shaped block; 'cloud' is
  // remembered as its own provenance (Q6) and resolves to remote downstream.
  // Anything else collapses to local.
  const mode = input.mode === 'ssh' ? 'ssh' : modeIsRemoteLike(input.mode) ? input.mode : 'local'
  const remoteLike = modeIsRemoteLike(mode)

  // The block being edited: a per-profile entry or the global remote block.
  const rawExistingBlock = key ? existing.profiles?.[key] || {} : existing.remote || {}
  // Leaving a CLOUD connection unselects it: a cloud block's url/org/token
  // describe a discovered Hermes Cloud instance, NOT a user-owned remote gateway,
  // so switching to local or remote must NOT inherit them (otherwise the stale
  // cloud URL lingers and re-selecting Cloud looks "already connected"). When the
  // saved block was cloud and the new mode is not cloud, start from an empty
  // block. (remote↔local toggles still preserve a real remote URL as before.)
  const existingMode = key ? existing.profiles?.[key]?.mode : existing.mode
  const leavingCloud = existingMode === 'cloud' && mode !== 'cloud'
  const leavingSsh = rawExistingBlock.mode === 'ssh' && mode !== 'ssh' && mode !== 'local'
  const existingBlock = leavingCloud || leavingSsh ? {} : rawExistingBlock
  const remoteUrl = String(input.remoteUrl ?? existingBlock.url ?? '').trim()
  // authMode: explicit input wins; otherwise inherit the saved value, default 'token'.
  const authMode = resolveAuthMode(input.remoteAuthMode, existingBlock.authMode)
  // Cloud org: only meaningful for 'cloud' mode. Explicit input wins; otherwise
  // inherit the saved org. A plain 'remote' connection never carries an org
  // (switching cloud→remote drops it), so it stays unset unless mode is cloud.
  const cloudOrg = mode === 'cloud' ? String(input.cloudOrg ?? existingBlock.org ?? '').trim() : ''

  // A saved name belongs to this exact gateway, not another instance in the same org.
  const cloudName =
    mode === 'cloud'
      ? String(
          input.cloudName ??
            (existingBlock.url && normalizeRemoteBaseUrl(remoteUrl) === normalizeRemoteBaseUrl(existingBlock.url)
              ? existingBlock.name
              : '') ??
            ''
        ).trim()
      : ''

  const incomingToken = typeof input.remoteToken === 'string' ? input.remoteToken.trim() : ''

  const remoteHeaders =
    input.remoteHeaders && typeof input.remoteHeaders === 'object' ? input.remoteHeaders : existingBlock.headers

  // Persist decision lives in hardening.resolvePersistedRemoteToken so the
  // IPC-propagation seam (allowPlainTextToken → encryptDesktopSecret opt-in) is
  // covered by a focused regression test. Pass allowPlainText through RAW — the
  // helper coerces with `=== true`, so a truthy-non-true value never enables
  // plain-text storage, and that strictness is asserted in exactly one place.
  const nextToken = resolvePersistedRemoteToken({
    incomingToken,
    persistToken,
    existingToken: existingBlock.token,
    allowPlainText: input.allowPlainTextToken,
    encryptSecret: encryptDesktopSecret
  })

  if (mode === 'ssh') {
    const sshBlock = buildSshBlock(input, savedProfileSsh(existing, key) || rawExistingBlock)

    if (key) {
      const profiles = { ...(existing.profiles || {}), [key]: sshBlock }

      return {
        mode: existing.mode === 'ssh' || modeIsRemoteLike(existing.mode) ? existing.mode : 'local',
        remote: existing.remote || {},
        profiles
      }
    }

    return { mode: 'ssh', remote: sshBlock, profiles: existing.profiles || {} }
  }

  if (key) {
    // Per-profile scope: a remote/cloud entry pins this profile to its own
    // backend; a local entry clears the override so the profile inherits the
    // default. The mode tag (remote vs cloud) is preserved on the entry.
    const profiles = { ...(existing.profiles || {}) }

    if (remoteLike) {
      profiles[key] = {
        mode,
        ...buildRemoteBlock(remoteUrl, authMode, nextToken, cloudOrg, remoteHeaders, cloudName)
      }
    } else {
      const localEntry = localProfileEntry(rawExistingBlock)

      if (localEntry) {
        profiles[key] = localEntry
      } else {
        delete profiles[key]
      }
    }

    return {
      mode: existing.mode === 'ssh' || modeIsRemoteLike(existing.mode) ? existing.mode : 'local',
      remote: existing.remote || {},
      profiles
    }
  }

  const nextRemote = remoteLike
    ? buildRemoteBlock(remoteUrl, authMode, nextToken, cloudOrg, remoteHeaders, cloudName)
    : existingMode === 'ssh'
      ? rawExistingBlock
      : { url: remoteUrl ? normalizeRemoteBaseUrl(remoteUrl) : remoteUrl, authMode, token: nextToken }

  // Preserve per-profile overrides when saving the global connection.
  return { mode, remote: nextRemote, profiles: existing.profiles || {} }
}

export function buildSshBlock(input: any, existingBlock: any = {}) {
  // `??` (not `||`) so an explicit '' (user CLEARED the field) wins over the
  // saved value; only a truly absent (undefined) field inherits.
  const merged = normalizeSshConfig({
    mode: 'ssh',
    host: input.sshHost ?? existingBlock.host,
    user: input.sshUser ?? existingBlock.user,
    port: input.sshPort ?? existingBlock.port,
    keyPath: input.sshKeyPath ?? existingBlock.keyPath,
    remoteHermesPath: input.sshRemoteHermesPath ?? existingBlock.remoteHermesPath,
    remoteProfile: input.sshRemoteProfile ?? existingBlock.remoteProfile
  })

  if (!merged) {
    throw new Error('SSH host is required.')
  }

  // Carry forward an already-adopted dashboard token unless the host changed
  // (a different host invalidates the old dashboard's token).
  if (existingBlock.token && existingBlock.host === merged.host) {
    merged.token = existingBlock.token
  }

  return merged
}

export function broadcastConnectionsChanged(payload: { connectionId: string; reason: 'removed' | 'saved' | 'updated' }) {
  for (const win of BrowserWindow.getAllWindows()) {
    const { webContents } = win

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('hermes:connections:changed', payload)
    }
  }
}

export async function stopRegistryConnectionBackends(connectionId) {
  const prefix = backendScopePrefix(connectionId)

  for (const key of [...backendPool.keys()]) {
    if (String(key).startsWith(prefix)) {
      stopPoolBackend(key)
    }
  }

  const sshScopes = new Set([
    ...[...sshConnections.keys()].filter(scope => String(scope).startsWith(prefix)),
    ...[...sshBootstrapCoordinator.active].map(entry => entry.scope).filter(scope => String(scope).startsWith(prefix))
  ])

  await Promise.all(
    [...sshScopes].map(async scope => {
      await sshBootstrapCoordinator.cancelAndWait(scope)
      await teardownSshConnection(scope)
    })
  )
}

export const connectionInstallIds = new Map<string, { id?: string; ts: number }>()
