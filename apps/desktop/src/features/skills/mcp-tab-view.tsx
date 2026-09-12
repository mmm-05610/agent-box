// Extracted verbatim from mcp-tab.tsx (see docs/desktop-megafile-decomposition.md).

import { useStore } from '@nanostores/react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { type HermesGateway, type ProfileScope, profileScopeKey } from '@/api/client'
import { getMcpCatalog, type McpTestResult, saveMcpServers, testMcpServer } from '@/api/mcp'
import { completeMcpDesktopOAuth } from '@/application/mcp-oauth'
import { type CodeEditorApi } from '@/components/chat/code-editor'
import { JsonDocumentEditor } from '@/components/chat/json-document-editor'
import { useOnProfileSwitch } from '@/components/hooks/use-on-profile-switch'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { ErrorBanner } from '@/components/ui/error-state'
import { TextTab } from '@/components/ui/text-tab'
import { useI18n } from '@/i18n'
import { estimateServerTokens, serverUsageCount } from '@/lib/mcp-cost'
import { type McpImportEntry } from '@/lib/mcp-import'
import { PROBE_TTL_MS, probeCache, probeKey, serverFingerprint } from '@/lib/mcp-probe-cache'
import { getServers, type McpServers } from '@/lib/mcp-servers'
import { toggleToolInServer } from '@/lib/mcp-tool-filter'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import { $activeSessionId } from '@/store/session'
import { type McpCatalogEntry } from '@/types/hermes'

import { hermesConfigCacheWriter, useHermesConfigRecord } from '@/app/hooks/use-config-record'
import { DetailPane, MASTER_DETAIL_WIDE_COLS } from '@/app/master-detail'
import { PanelAddButton, PanelEmpty } from '@/app/overlays/panel'
import { useDeepLinkHighlight } from '../settings/use-deep-link-highlight'

import {
  McpCatalog,
  McpImportButton,
  McpLogs,
  McpRow,
  ServerConfig,
} from './mcp-tab-parts'
import {
  loadMcpUsage,
  MCP_CATALOG_KEY,
  parseServersDoc,
  type Probe,
  scanServerBlocks,
  type ServerCost,
  serverEnabled,
  STARTER_ENTRY,
  statusLine,
  statusOf,
  wrapDoc,
} from './view-model'

export function McpTab({ gateway, profile }: { gateway: HermesGateway | null; profile?: ProfileScope }) {
  const { t } = useI18n()
  const m = t.settings.mcp
  const activeSessionId = useStore($activeSessionId)

  // The profile this tab configures: the Capabilities profile-scope selector's
  // choice (`profile`) when set, otherwise the app-wide active profile. Every
  // fetch/save below is scoped to it, and it keys the config/catalog/probe
  // caches so switching the selector refetches and never shows another
  // profile's servers (AGENTS.md scope-in-key). When no override is passed this
  // resolves to $activeGatewayProfile, so behavior is identical to before.
  const appProfile = useStore($activeGatewayProfile)
  const scopeProfileKey = profile != null ? profileScopeKey(profile) : normalizeProfileKey(appProfile)

  // Shared config cache (see use-config-record): revisiting the tab paints the
  // cached record instantly; mutations write through `setConfig` and stay
  // visible to the other settings surfaces.
  const {
    data: config,
    isLoading: configLoading,
    isError: configFailed,
    error: configError,
    refetch: refetchConfig,
    dataUpdatedAt: configUpdatedAt,
    errorUpdatedAt: configErroredAt
  } = useHermesConfigRecord(profile)

  const setConfig = hermesConfigCacheWriter(profile)

  // True from a profile switch until the config query resettles for the new
  // profile. Until then `config` (and thus `servers`) still holds profile A's
  // data, so any persist would write A's server list into B — block mutations.
  const [profilePending, setProfilePending] = useState(false)
  const staleConfigStamp = useRef<null | number>(null)
  const staleErrorStamp = useRef<null | number>(null)

  const [saving, setSaving] = useState(false)
  const [probes, setProbes] = useState<Record<string, Probe>>({})
  const probesRef = useRef(probes)
  probesRef.current = probes

  // 30-day per-tool call counts (registry names). null = analytics unavailable
  // or not loaded yet — the cost overlay then omits usage entirely.
  const [toolCalls30d, setToolCalls30d] = useState<null | Record<string, number>>(null)

  // Blocks the browser until an OAuth flow lands a token; also reset on profile
  // switch, so declared up here alongside the other per-profile view state.
  const [authing, setAuthing] = useState<null | string>(null)

  // Master document draft. `docVersion` remounts the editor when the draft is
  // regenerated programmatically (list-side mutations); `dirty` guards user
  // edits from being clobbered by those regenerations.
  const [draft, setDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [docVersion, setDocVersion] = useState(0)
  const [logSource, setLogSource] = useState<'stdio' | 'agent'>('stdio')

  // Selection IS the editor cursor: whichever server block contains it is the
  // configured server on the left. Cursor outside every block → the list.
  const editorApi = useRef<CodeEditorApi | null>(null)
  const [cursor, setCursor] = useState(0)
  const blocks = useMemo(() => scanServerBlocks(draft), [draft])

  const activeBlock = useMemo(
    () => blocks.find(block => cursor >= block.from && cursor <= block.to) ?? null,
    [blocks, cursor]
  )

  const selected = activeBlock?.name ?? null

  const focusServer = (name: string) => {
    const block = blocks.find(b => b.name === name)

    if (block) {
      // Land just inside the key so the block claims the cursor.
      editorApi.current?.setCursor(block.from + 1)
      setCursor(block.from + 1)
    }
  }

  const servers = useMemo(() => getServers(config ?? null), [config])

  // Config/document order, not alphabetical — the list mirrors mcp.json.
  const names = useMemo(() => Object.keys(servers), [servers])

  // Key by the SCOPED profile — installed/enabled badges are per-profile, so
  // sharing one cache across profiles would flash the previous profile's state
  // on switch. When no selector override is set this is the active profile,
  // identical to before.
  const catalogQuery = useQuery({
    queryKey: [...MCP_CATALOG_KEY, scopeProfileKey],
    queryFn: () => getMcpCatalog(profile ?? undefined),
    staleTime: 5 * 60_000
  })

  const catalog = useMemo(() => catalogQuery.data?.entries ?? [], [catalogQuery.data])

  // The catalog SECTION of the unified list only offers entries that aren't
  // already configured — installed servers appear once, in the fleet list
  // above, with live status. Match by catalog `installed` flag or a config
  // entry under the same name (covers a just-saved doc the catalog refetch
  // hasn't caught up with yet).
  const availableCatalog = useMemo(
    () => catalog.filter((entry: McpCatalogEntry) => !entry.installed && !(entry.name in servers)),
    [catalog, servers]
  )

  const descriptionFor = (serverName: string, server: Record<string, unknown>): null | string => {
    const lower = serverName.toLowerCase()

    const match = catalog.find(
      entry =>
        entry.name.toLowerCase() === lower ||
        (entry.url && entry.url === server.url) ||
        (entry.command && entry.command === server.command)
    )

    return match?.description ?? null
  }

  const resetDraft = (entries: McpServers) => {
    setDraft(wrapDoc(entries))
    setDirty(false)
    setDocVersion(version => version + 1)
  }

  // Mirror a list-side mutation into a dirty draft without losing the user's
  // other edits. Unparseable drafts are left alone — save resolves the race.
  const patchDraft = (mutate: (doc: McpServers) => McpServers) => {
    try {
      setDraft(wrapDoc(mutate(parseServersDoc(draft))))
      setDocVersion(version => version + 1)
    } catch {
      // Draft is mid-edit / invalid JSON; the user's text wins until save.
    }
  }

  // Seed the editor draft from config exactly once, the first time it lands.
  // Background refetches thereafter update the list but must not clobber an
  // in-progress edit — the draft is the user's until they save or reset.
  const draftSeeded = useRef(false)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    // profilePending: config still holds the PREVIOUS profile's record right
    // after a switch — seeding from it would latch the wrong profile's doc.
    if (!config || profilePending) {
      return
    }

    if (!draftSeeded.current) {
      draftSeeded.current = true
      resetDraft(getServers(config))

      return
    }

    if (dirty || names.length === 0) {
      return
    }

    // Heal the early-boot race: the first config snapshot can land before the
    // backend has mcp_servers assembled, seeding (and latching) an empty doc
    // while later refetches fill the list — saving would then wipe the real
    // servers. A PRISTINE empty draft reseeds when servers arrive; any user
    // edit (dirty) still always wins.
    try {
      if (Object.keys(parseServersDoc(draft)).length === 0) {
        resetDraft(servers)
      }
    } catch {
      // Mid-edit / invalid JSON — the user's text wins.
    }
  }, [config, dirty, draft, names, profilePending, servers])

  // Bumped on every profile switch. Async probe/auth completions capture the
  // epoch at call time and bail if it changed, so a slow profile-A request can't
  // write its result into profile B's state after the user switched.
  const profileEpoch = useRef(0)

  // Scoped Skills tabs remount when their owner changes; stop the old native
  // OAuth waiter even when no app-wide profile-switch event is emitted.
  useEffect(
    () => () => {
      profileEpoch.current += 1
    },
    [scopeProfileKey]
  )

  // A profile switch invalidates the config query (see
  // application/profile/active-route-effects), which
  // refetches the new backend's mcp.json. Reset ALL per-profile view state — the
  // draft (incl. a dirty one, so profile A's edits can't be saved into B), its
  // seed latch, probes, and cursor — so everything reseeds for the new profile.
  // The probe cache is already profile-keyed, so this just forces a re-probe.
  useOnProfileSwitch(() => {
    profileEpoch.current += 1
    draftSeeded.current = false
    setProbes({})
    setToolCalls30d(null)
    setCursor(0)
    setAuthing(null)
    setDirty(false)
    setDraft('')
    setDocVersion(version => version + 1)
    // Mark stale until the config query replaces profile A's data — guards
    // sidebar mutations from persisting A's server list into B mid-refetch.
    staleConfigStamp.current = configUpdatedAt
    staleErrorStamp.current = configErroredAt
    setProfilePending(true)
  })

  // Clear once the config query settles for the new profile: dataUpdatedAt bumps
  // on a fresh success, errorUpdatedAt on a fresh failure. Releasing on error too
  // means a failed refetch surfaces the retry UI instead of leaving mutations
  // silently no-op forever.
  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (
      profilePending &&
      staleConfigStamp.current !== null &&
      (configUpdatedAt !== staleConfigStamp.current || configErroredAt !== staleErrorStamp.current)
    ) {
      setProfilePending(false)
      staleConfigStamp.current = null
      staleErrorStamp.current = null
    }
  }, [profilePending, configUpdatedAt, configErroredAt])

  useDeepLinkHighlight({
    block: 'nearest',
    elementId: serverName => `mcp-server-${serverName}`,
    onResolve: focusServer,
    param: 'server',
    ready: serverName => blocks.some(block => block.name === serverName)
  })

  const runProbe = async (serverName: string) => {
    const epoch = profileEpoch.current
    const key = probeKey(serverName, servers[serverName], scopeProfileKey)
    setProbes(current => ({ ...current, [serverName]: 'probing' }))

    try {
      const result = await testMcpServer(serverName, profile ?? undefined)

      // Drop the result if the profile changed mid-probe — it belongs to A.
      if (profileEpoch.current !== epoch) {
        return
      }

      probeCache.set(key, { at: Date.now(), result })
      setProbes(current => ({ ...current, [serverName]: result }))
    } catch (err) {
      if (profileEpoch.current !== epoch) {
        return
      }

      const result = { ok: false, error: err instanceof Error ? err.message : String(err), tools: [] }
      probeCache.set(key, { at: Date.now(), result })
      setProbes(current => ({ ...current, [serverName]: result }))
    }
  }

  // First-class OAuth: opens the system browser, blocks until the flow lands a
  // token (verified on disk — a friendly tools/list is not proof), then the
  // auth result doubles as the probe (it carries the tool list).
  const authenticate = async (serverName: string) => {
    const epoch = profileEpoch.current
    setAuthing(serverName)
    setProbes(current => ({ ...current, [serverName]: 'probing' }))

    try {
      const flow = await completeMcpDesktopOAuth({
        serverName,
        profile,
        cancelled: () => profileEpoch.current !== epoch
      })

      const result: McpTestResult = { ok: true, tools: flow.tools ?? [] }

      // Bail if the user switched profiles mid-flow — this result is profile A's.
      if (profileEpoch.current !== epoch) {
        return
      }

      setProbes(current => ({ ...current, [serverName]: result }))
      // Cache under the POST-auth fingerprint (auth: oauth) on success — that's
      // the config the mount effect will read back, so it hits this entry.
      const probedConfig = result.ok ? { ...servers[serverName], auth: 'oauth' } : servers[serverName]
      probeCache.set(probeKey(serverName, probedConfig, scopeProfileKey), { at: Date.now(), result })

      if (result.ok) {
        // The endpoint persisted `auth: oauth` — mirror it locally.
        const nextServers = { ...servers, [serverName]: { ...servers[serverName], auth: 'oauth' } }
        setConfig(current => (current ? { ...current, mcp_servers: nextServers } : current))

        // Mirror `auth: oauth` into the editor too. If we only reset a clean
        // draft, a dirty draft keeps the pre-auth text and the next Save would
        // drop the freshly-persisted auth field — so patch the dirty draft in
        // place instead of clobbering the user's other edits.
        if (dirty) {
          patchDraft(doc => (doc[serverName] ? { ...doc, [serverName]: { ...doc[serverName], auth: 'oauth' } } : doc))
        } else {
          resetDraft(nextServers)
        }

        notify({
          kind: 'success',
          title: m.authenticatedTitle,
          message: m.authenticatedMessage(serverName, result.tools.length)
        })
        void silentReload()
      } else if (result.error) {
        notifyError(new Error(result.error), serverName)
      }
    } catch (err) {
      if (profileEpoch.current !== epoch) {
        return
      }

      setProbes(current => ({
        ...current,
        [serverName]: { ok: false, error: err instanceof Error ? err.message : String(err), tools: [] }
      }))
      notifyError(err, serverName)
    } finally {
      if (profileEpoch.current === epoch) {
        setAuthing(null)
      }
    }
  }

  // It should just know: probe enabled servers as config arrives — but through
  // the cache, so revisiting the page doesn't respawn/reconnect the fleet.
  useEffect(() => {
    for (const [serverName, server] of Object.entries(servers)) {
      if (!serverEnabled(server) || probesRef.current[serverName] !== undefined) {
        continue
      }

      const cached = probeCache.get(probeKey(serverName, server, scopeProfileKey))

      if (cached && Date.now() - cached.at < PROBE_TTL_MS) {
        setProbes(current => ({ ...current, [serverName]: cached.result }))
      } else {
        void runProbe(serverName)
      }
    }
    // Re-run only when the server set changes; runProbe is recreated every
    // render and adding it would re-probe the fleet on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers])

  // Cosmetic 30-day usage counts for the cost overlay — cached module-wide per
  // scope profile, epoch-guarded like the probes so a slow profile-A fetch
  // can't paint into profile B.
  useEffect(() => {
    const epoch = profileEpoch.current

    void loadMcpUsage(scopeProfileKey, profile ?? appProfile ?? null).then(value => {
      if (profileEpoch.current === epoch) {
        setToolCalls30d(value)
      }
    })
  }, [scopeProfileKey, profile, appProfile])

  // Overlay inputs for one server: token estimate from its (successful) probe,
  // 30-day uses from analytics. Both halves degrade to null independently.
  const costFor = (serverName: string, server: Record<string, unknown>): ServerCost => {
    const probe = probes[serverName]

    return {
      tokens: probe && probe !== 'probing' && probe.ok ? estimateServerTokens(server, probe.tools) : null,
      uses: toolCalls30d ? serverUsageCount(serverName, toolCalls30d) : null
    }
  }

  // Config writes reach live sessions immediately — no manual "Reload MCP".
  const silentReload = async () => {
    if (!gateway) {
      return
    }

    try {
      await gateway.request('reload.mcp', { confirm: true, session_id: activeSessionId ?? undefined })
    } catch (err) {
      notifyError(err, m.reloadFailed)
    }
  }

  // Whole-map replace (NOT saveHermesConfig, which deep-merges and so can never
  // delete a server, drop `enabled: false`, or remove a nested field). Only
  // after the replace lands do we write the cache through + reload live sessions.
  // Returns false when the profile switched mid-save: the write hit profile A's
  // backend (correct), but the client-side cache/editor now belong to B, so the
  // caller must skip its post-await writes.
  const persist = async (nextServers: McpServers): Promise<boolean> => {
    const epoch = profileEpoch.current
    await saveMcpServers(nextServers, profile ?? undefined)

    if (profileEpoch.current !== epoch) {
      return false
    }

    setConfig(current => ({ ...current, mcp_servers: nextServers }))
    void silentReload()

    return true
  }

  // A catalog install wrote a new server into config.yaml on the backend —
  // refresh the catalog (installed state) and the config, then RECONCILE THE
  // EDITOR DRAFT with the fresh servers. Without this a dirty draft (or even a
  // clean one the seed never refreshes) would omit the new server, and the next
  // whole-map Save would silently drop it.
  const onCatalogInstalled = async () => {
    void catalogQuery.refetch()
    const { data } = await refetchConfig()
    const nextServers = getServers(data ?? null)

    if (dirty) {
      // Keep the user's in-progress edits (doc wins), add any server the install
      // introduced that the draft doesn't have yet.
      patchDraft(doc => ({ ...nextServers, ...doc }))
    } else {
      resetDraft(nextServers)
    }

    void silentReload()
  }

  const withEnabled = (server: Record<string, unknown>, enabled: boolean) => {
    const next = { ...server }

    if (enabled) {
      delete next.enabled
    } else {
      next.enabled = false
    }

    return next
  }

  const setServerEnabled = async (serverName: string, enabled: boolean) => {
    if (profilePending) {
      return
    }

    const next = withEnabled(servers[serverName], enabled)

    try {
      if (!(await persist({ ...servers, [serverName]: next }))) {
        return
      }

      if (dirty) {
        patchDraft(doc => (doc[serverName] ? { ...doc, [serverName]: withEnabled(doc[serverName], enabled) } : doc))
      } else {
        resetDraft({ ...servers, [serverName]: next })
      }

      if (enabled) {
        void runProbe(serverName)
      }
    } catch (err) {
      notifyError(err, m.saveFailed)
    }
  }

  // Per-tool gating writes the server's `tools.include`/`tools.exclude` and
  // persists like any other config change (immediate reload of live sessions).
  // The probe still lists every discovered tool; the filter decides which ones
  // the agent actually registers.
  const toggleTool = async (serverName: string, toolName: string) => {
    const base = servers[serverName]

    if (!base || profilePending) {
      return
    }

    const next = toggleToolInServer(base, toolName)

    try {
      if (!(await persist({ ...servers, [serverName]: next }))) {
        return
      }

      if (dirty) {
        patchDraft(doc =>
          doc[serverName] ? { ...doc, [serverName]: toggleToolInServer(doc[serverName], toolName) } : doc
        )
      } else {
        resetDraft({ ...servers, [serverName]: next })
      }
    } catch (err) {
      notifyError(err, m.saveFailed)
    }
  }

  const removeServer = async (serverName: string) => {
    if (profilePending) {
      return
    }

    setSaving(true)

    try {
      const next = { ...servers }
      delete next[serverName]

      if (!(await persist(next))) {
        return
      }

      if (dirty) {
        patchDraft(doc => {
          const patched = { ...doc }
          delete patched[serverName]

          return patched
        })
      } else {
        resetDraft(next)
      }

      setCursor(0)
    } catch (err) {
      notifyError(err, m.removeFailed)
    } finally {
      setSaving(false)
    }
  }

  // "+" seeds a starter entry into the document (unique key) and marks it
  // dirty — naming happens in the editor, like every other mcp.json.
  const addServer = () => {
    if (profilePending) {
      return
    }

    let base: McpServers

    try {
      base = parseServersDoc(draft)
    } catch {
      base = { ...servers }
    }

    let key = 'my-server'

    for (let i = 2; key in base; i++) {
      key = `my-server-${i}`
    }

    const nextDraft = wrapDoc({ ...base, [key]: STARTER_ENTRY })
    setDraft(nextDraft)
    setDirty(true)
    setDocVersion(version => version + 1)

    // Focus the fresh block once the editor remounts with the new doc.
    const from = nextDraft.indexOf(`"${key}"`)

    if (from >= 0) {
      requestAnimationFrame(() => {
        editorApi.current?.setCursor(from + 1)
        setCursor(from + 1)
      })
    }
  }

  // Paste-anything import: merge parsed entries into the draft exactly like
  // addServer seeds its starter — dirty draft, unique keys, focus the first
  // new block. Saving stays an explicit step, so the user can fix placeholder
  // env values (YOUR_KEY, …) in the editor first.
  const importServers = (entries: McpImportEntry[]) => {
    if (profilePending || entries.length === 0) {
      return
    }

    let base: McpServers

    try {
      base = parseServersDoc(draft)
    } catch {
      base = { ...servers }
    }

    let firstKey: null | string = null

    for (const entry of entries) {
      let key = entry.name

      for (let i = 2; key in base; i++) {
        key = `${entry.name}-${i}`
      }

      base = { ...base, [key]: entry.config }
      firstKey ??= key
    }

    const nextDraft = wrapDoc(base)
    setDraft(nextDraft)
    setDirty(true)
    setDocVersion(version => version + 1)

    if (firstKey) {
      const from = nextDraft.indexOf(`"${firstKey}"`)

      if (from >= 0) {
        requestAnimationFrame(() => {
          editorApi.current?.setCursor(from + 1)
          setCursor(from + 1)
        })
      }
    }
  }

  const saveDoc = async () => {
    if (profilePending) {
      return
    }

    let entries: McpServers

    try {
      entries = parseServersDoc(draft)
    } catch (err) {
      notifyError(err, m.invalidJson)

      return
    }

    setSaving(true)

    const prevServers = servers

    try {
      if (!(await persist(entries))) {
        return
      }

      resetDraft(entries)
      // Keep only probes for servers that survived AND kept the same config;
      // removed OR edited entries drop their probe so the mount effect re-probes
      // the new shape (the cache also misses on the changed fingerprint).
      setProbes(current =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([name]) =>
              name in entries && serverFingerprint(entries[name]) === serverFingerprint(prevServers[name] ?? {})
          )
        )
      )
      notify({ kind: 'success', title: m.savedTitle, message: m.savedMessage('mcp.json') })
    } catch (err) {
      notifyError(err, m.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  // Cached data paints instantly; a spinner only ever shows on the first-ever
  // load, and a failed load gets a real retry — never a silent blank pane.
  if (configFailed && !config) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <ErrorBanner className="max-w-sm">
          <span className="flex flex-col gap-2">
            {configError instanceof Error ? configError.message : m.failedLoad}
            <Button className="self-start" onClick={() => void refetchConfig()} size="xs" variant="text">
              {m.reload}
            </Button>
          </span>
        </ErrorBanner>
      </div>
    )
  }

  if (!config) {
    return <PageLoader className="min-h-24" label={configLoading ? m.loading : t.skills.loading} />
  }

  // Selection may reference an unsaved block (freshly pasted) — fall back to
  // the draft's parsed entry so the config pane can still describe it.
  const savedEntry = selected ? servers[selected] : undefined

  const draftEntry = (() => {
    if (!selected || savedEntry) {
      return undefined
    }

    try {
      return parseServersDoc(draft)[selected]
    } catch {
      return undefined
    }
  })()

  const activeEntry = savedEntry ?? draftEntry

  return (
    <div className={cn('grid h-full min-h-0 grid-cols-1', MASTER_DETAIL_WIDE_COLS)}>
      {/* LEFT: the focused block's server config, or the unified fleet+catalog list. */}
      <aside className="flex min-h-0 flex-col overflow-hidden border-r border-(--ui-stroke-quaternary)">
        {selected && activeEntry ? (
          <ServerConfig
            authing={authing === selected}
            cost={costFor(selected, activeEntry)}
            description={descriptionFor(selected, activeEntry)}
            entry={activeEntry}
            name={selected}
            onAuthenticate={() => void authenticate(selected)}
            onBack={() => setCursor(0)}
            onProbe={() => void runProbe(selected)}
            onRemove={() => void removeServer(selected)}
            onToggle={checked => void setServerEnabled(selected, checked)}
            onToggleTool={toolName => void toggleTool(selected, toolName)}
            probe={probes[selected]}
            saved={savedEntry !== undefined}
            saving={saving}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-2">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {/* ONE coherent column: the configured fleet on top, the
                  Nous-approved catalog below it. Installed entries live in the
                  fleet list (with live status), so the catalog section only
                  offers what's NOT installed yet — no duplicate rows, no tab
                  flipping to find the install button. */}
              {/* Geometry mirrors ListStrip (mb-1 h-6 pl-2) so this header
                  lands on the exact line the sort link occupies in the
                  Skills/Tools views. */}
              <div className="mb-1 flex h-6 shrink-0 items-center pl-2 pr-1">
                <span className="flex-1 text-[0.72rem] font-medium text-(--ui-text-tertiary)">{m.tabServers}</span>
                <McpImportButton disabled={profilePending} onImport={importServers} />
              </div>
              {names.length === 0 ? (
                <PanelEmpty
                  action={
                    <Button onClick={addServer} size="sm">
                      {m.newServer}
                    </Button>
                  }
                  description={m.emptyDesc}
                  icon="plug"
                  title={m.emptyTitle}
                />
              ) : (
                <>
                  {names.map(serverName => {
                    const server = servers[serverName]
                    const status = statusOf(server, probes[serverName])
                    const cost = costFor(serverName, server)

                    return (
                      <McpRow
                        active={false}
                        busy={saving}
                        enabled={serverEnabled(server)}
                        key={serverName}
                        name={serverName}
                        onProbe={() => void runProbe(serverName)}
                        onRemove={() => void removeServer(serverName)}
                        onSelect={() => focusServer(serverName)}
                        onToggle={checked => void setServerEnabled(serverName, checked)}
                        status={status}
                        statusText={statusLine(m, status, probes[serverName], server, cost)}
                        unused={
                          serverEnabled(server) &&
                          status === 'ok' &&
                          cost.tokens !== null &&
                          cost.tokens > 0 &&
                          cost.uses === 0
                        }
                      />
                    )
                  })}
                  <PanelAddButton label={m.newServer} onClick={addServer} />
                </>
              )}
              {(catalogQuery.isLoading || availableCatalog.length > 0) && (
                <>
                  <div className="mb-1 mt-3 flex h-6 shrink-0 items-center border-t border-(--ui-stroke-quaternary) pl-2 pr-1 pt-2">
                    <span className="text-[0.72rem] font-medium text-(--ui-text-tertiary)">{m.tabCatalog}</span>
                  </div>
                  <McpCatalog
                    entries={availableCatalog}
                    loading={catalogQuery.isLoading}
                    onInstalled={onCatalogInstalled}
                    profile={profile}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* RIGHT: the mcp.json editor, logs hard-pinned below. */}
      <main className="flex min-h-0 flex-col overflow-hidden">
        <JsonDocumentEditor
          apiRef={editorApi}
          disabled={saving}
          filePath="mcp.json"
          header={
            <>
              mcp.json
              {dirty && <span aria-hidden className="size-1.5 rounded-full bg-current/60" />}
            </>
          }
          highlight={activeBlock ? { from: activeBlock.from, to: activeBlock.to } : null}
          initialValue={draft}
          onChange={next => {
            setDraft(next)
            setDirty(true)
          }}
          onCursorChange={setCursor}
          onFormatJsonError={error => notifyError(new Error(error), m.invalidJson)}
          onSave={() => void saveDoc()}
          remountKey={docVersion}
          trailing={
            <Button disabled={saving || !dirty} onClick={() => void saveDoc()} size="xs">
              {saving ? t.common.saving : t.common.save}
            </Button>
          }
        />
        <DetailPane
          actions={
            <span className="flex items-center gap-1.5">
              {(['stdio', 'agent'] as const).map(kind => (
                <TextTab
                  active={logSource === kind}
                  className="h-5 px-0.5 text-[0.65rem]"
                  key={kind}
                  onClick={() => setLogSource(kind)}
                >
                  {kind}
                </TextTab>
              ))}
            </span>
          }
          defaultHeight={176}
          id="mcp-logs"
          title={
            <span className="text-[0.68rem] font-normal text-muted-foreground/60">
              {selected && savedEntry ? selected : m.allServers}
            </span>
          }
        >
          <McpLogs emptyLabel={m.noOutput} server={selected && savedEntry ? selected : null} source={logSource} />
        </DetailPane>
      </main>
    </div>
  )
}
