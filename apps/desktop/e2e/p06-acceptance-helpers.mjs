/**
 * Pure decisions the P06 independent-acceptance driver is built from.
 *
 * They live here — not inside the driver's `page.evaluate` callbacks — so the
 * rules can be proven without launching Electron: what counts as a legacy
 * palette entry, what the arrival screen is allowed to be, how the step summary
 * aggregates, which required steps a run owes, and whether the product still
 * issues legacy REST.
 */

/** Rendered palette rows that belong to the legacy Hermes runtime. The driver
 *  reads the rows the user can actually see and run, so the patterns match the
 *  visible labels rather than the registry ids. */
export const LEGACY_PALETTE_ENTRY_PATTERNS = [
  { id: 'restart-gateway', pattern: /\brestart\b/i },
  { id: 'update-hermes', pattern: /\bupdate hermes\b/i },
  { id: 'update-backend', pattern: /\bbackend update\b/i },
  { id: 'toggle-logs', pattern: /\blog(s)?\b/i },
  { id: 'profile-export', pattern: /export profile/i },
  { id: 'profile-import', pattern: /import profile/i }
]

export function findLegacyPaletteEntries(optionTexts) {
  const hits = []

  for (const text of optionTexts) {
    for (const entry of LEGACY_PALETTE_ENTRY_PATTERNS) {
      if (entry.pattern.test(String(text))) {
        hits.push({ id: entry.id, text: String(text).trim().slice(0, 120) })
      }
    }
  }

  return hits
}

/** Rendered palette rows that belong to the RETIRED Bot Mode surface. The
 *  product retires the plugin at discovery, so none of these can be
 *  registered — a hit means the retirement did not hold (or something else
 *  re-registered it) and the run must say so. Matched against visible rows,
 *  never against registry ids the user cannot see. */
export const BOT_MODE_PALETTE_PATTERNS = [
  { id: 'new-bot', pattern: /\bnew bot\b/i },
  { id: 'bots', pattern: /\bbots\b/i },
  { id: 'routines', pattern: /\broutines?\b/i },
  { id: 'group-chat', pattern: /\bgroup chat/i }
]

export function findBotModePaletteEntries(optionTexts) {
  const hits = []

  for (const text of optionTexts) {
    for (const entry of BOT_MODE_PALETTE_PATTERNS) {
      if (entry.pattern.test(String(text))) {
        hits.push({ id: entry.id, text: String(text).trim().slice(0, 120) })
      }
    }
  }

  return hits
}

/** Bot Mode's plugin-storage namespace (`createPluginStorage` prefixes every
 *  key with `hermes.plugin.<plugin id>.`). Its `register()` writes metadata
 *  there, so a stored key under this prefix means the retired plugin ran. */
export const BOT_MODE_STORAGE_PREFIX = 'hermes.plugin.hermes-bots.'

export function botModeStorageKeys(keys) {
  return (Array.isArray(keys) ? keys : []).filter(key => String(key).startsWith(BOT_MODE_STORAGE_PREFIX))
}

/** Rendered tabs / entries whose text names the retired Bot Mode surfaces.
 *  Read from the DOM rather than from copy keys: whatever the app is localized
 *  to, a Bots pane or a Routines tab has to call itself something with these
 *  words in it. */
export const BOT_MODE_ENTRY_PATTERNS = [/\bbots?\b/i, /\broutines?\b/i, /\bgroup chat/i]

export function findBotModeEntries(texts) {
  return (Array.isArray(texts) ? texts : [])
    .map(text => String(text).replace(/\s+/g, ' ').trim())
    .filter(text => text.length > 0 && BOT_MODE_ENTRY_PATTERNS.some(pattern => pattern.test(text)))
    .slice(0, 20)
}

/** Copy that states a capability is genuinely not available here. The driver
 *  accepts either language because the sandbox's system locale is not ours to
 *  choose, and it never accepts a fabricated row in place of this copy. */
export const UNAVAILABLE_COPY_PATTERN =
  /unavailable|not available|not connected|no service|not provided|offline|不可用|未连接|未能|无法|尚未|没有可用/i

export function statesUnavailable(text) {
  return UNAVAILABLE_COPY_PATTERN.test(String(text || ''))
}

/** Largest `[data-glass-opaque]` coverage over the viewport, from measured
 *  rects. The retired blocking surface covered essentially the whole viewport,
 *  so "is the app masked?" is a coverage question, not a node-count one. */
export function worstGlassCoverage(rects, viewportArea) {
  if (!(viewportArea > 0)) {
    return 0
  }

  let worst = 0

  for (const rect of rects) {
    const coverage = (Number(rect.width) * Number(rect.height)) / viewportArea

    if (coverage > worst) {
      worst = coverage
    }
  }

  return worst
}

/** The only statuses a recorded step may carry. A run that produces anything
 *  else is broken, not merely unusual, and must say so. */
export const ACCEPTANCE_STATUSES = ['PASS', 'FAIL', 'SKIP', 'PENDING']

/** Build one validated step record. Validation is structural, not a matter of
 *  remembering argument order: a call with a status anywhere outside
 *  `ACCEPTANCE_STATUSES` (a prose description that landed in the status slot,
 *  for example) throws here, so prose can never be recorded as a status the
 *  summary then drops. */
export function makeAcceptanceStep(id, step, status, detail) {
  if (!ACCEPTANCE_STATUSES.includes(status)) {
    throw new Error(
      `illegal acceptance status ${JSON.stringify(status)} for step ${JSON.stringify(id)}; expected one of ${ACCEPTANCE_STATUSES.join(', ')}`
    )
  }

  return { detail: detail == null ? '' : String(detail), id: String(id), status, step: String(step) }
}

/** The driver's `record(id, step, status, detail)`, bound to the run's step
 *  list. Every recorded step goes through `makeAcceptanceStep`, so no caller of
 *  this recorder can put a run's step list and its log out of sync. */
export function createStepRecorder(steps, onRecord) {
  return function record(id, step, status, detail) {
    const entry = makeAcceptanceStep(id, step, status, detail)

    steps.push(entry)

    if (typeof onRecord === 'function') {
      onRecord(entry)
    }

    return entry
  }
}

/** `results.json` aggregation. `allOk` covers EXECUTED steps only: a PENDING or
 *  SKIP is honesty about the environment, but it is not a pass either, so it
 *  can never make a required step look green.
 *
 *  A status this function does not understand is an accounting error, not an
 *  absence: it is collected in `unknownStatuses` and forces `allOk` false, so a
 *  step the summary cannot classify can never be silently dropped from a green
 *  run. Every input step is accounted for exactly once — the four counts plus
 *  `unknownStatuses` — and `executed` is exactly `PASS + FAIL`. */
export function summarizeResults(steps) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, PENDING: 0 }
  const unknownStatuses = []

  for (const step of steps) {
    if (ACCEPTANCE_STATUSES.includes(step.status)) {
      counts[step.status] += 1
    } else {
      unknownStatuses.push({ id: String(step.id), status: String(step.status) })
    }
  }

  const executed = counts.PASS + counts.FAIL

  return {
    allOk: counts.FAIL === 0 && executed > 0 && unknownStatuses.length === 0,
    counts,
    executed,
    unknownStatuses
  }
}

/** Steps this driver is not allowed to leave unexecuted or unrecorded. Every
 *  step whose absence, duplication or non-execution would make a green run
 *  dishonest belongs here — including BOTH legacy-REST gates, which must not
 *  substitute for each other ("the request was refused" still means the
 *  renderer issued one; "the renderer log is clean" still means a refusal was
 *  counted). The gate step itself (`required-steps-executed`) and the
 *  informational `driver-target` are deliberately absent: the gate cannot
 *  require its own prior existence. */
export const REQUIRED_STEP_IDS = [
  'sandbox-isolation',
  'no-service-provided',
  'window-appears',
  'no-blocking-overlay',
  'workspace-entries',
  'legacy-fake-boot-ignored',
  'send-fails-closed',
  'settings-opens-closes',
  'appearance-page-operable',
  'appearance-language-persists',
  'appearance-resume-pref-persists',
  'appearance-terminal-font-persists',
  'appearance-no-legacy-rest',
  'bot-mode-retired',
  'profiles-honest',
  'product-settings-honest',
  'command-center-agentbox',
  'command-palette-agentbox',
  'sidebar-operable',
  'legacy-view-routes-retired',
  'no-hermes-process',
  'exit-no-orphans',
  'required-screenshots',
  'logs-token-free',
  'no-legacy-rest-reached-main',
  'no-legacy-rest-issued-by-renderer'
]

/** The required-step gate as a pure verdict: an empty issue list means every
 *  required step is present exactly once and executed. Missing, duplicated,
 *  PENDING, SKIP and illegally-statused required steps all produce issues, so
 *  the gate step recorded from this list fails and `allOk` goes false with it.
 *  A step that is not required never produces an issue: `driver-target` and the
 *  gate step itself carry no honesty claim. */
export function requiredStepIssues(steps) {
  const issues = []

  for (const id of REQUIRED_STEP_IDS) {
    const matches = steps.filter(step => step.id === id)

    if (matches.length === 0) {
      issues.push({ id, kind: 'missing' })
      continue
    }

    if (matches.length > 1) {
      issues.push({ count: matches.length, id, kind: 'duplicated' })
    }

    for (const step of matches) {
      if (step.status === 'PENDING') {
        issues.push({ id, kind: 'pending' })
      } else if (step.status === 'SKIP') {
        issues.push({ id, kind: 'skipped' })
      } else if (!ACCEPTANCE_STATUSES.includes(step.status)) {
        issues.push({ id, kind: 'illegal-status', status: String(step.status) })
      }
    }
  }

  return issues
}

/** Every process descended from `rootPids`, transitively, including the roots.
 *  Orphan detection has to walk the tree: Electron's children are the helper
 *  and GPU processes, and the runtime (had one been spawned) would be another. */
export function collectDescendants(processes, rootPids) {
  const roots = new Set(rootPids.filter(pid => Number.isFinite(pid)).map(Number))
  const byParent = new Map()

  for (const entry of processes) {
    const parent = Number(entry.parentPid)
    const pid = Number(entry.pid)

    if (!Number.isFinite(pid)) {
      continue
    }

    const children = byParent.get(parent) ?? []

    children.push(pid)
    byParent.set(parent, children)
  }

  const seen = new Set()
  const queue = [...roots]

  while (queue.length > 0) {
    const pid = queue.pop()

    if (seen.has(pid)) {
      continue
    }

    seen.add(pid)

    for (const child of byParent.get(pid) ?? []) {
      queue.push(child)
    }
  }

  return [...seen]
}

/** Processes whose executable name mentions the Hermes runtime. The driver
 *  diffs this against a pre-launch baseline, so a runtime the user already had
 *  running is never counted against the product. */
export function hermesRuntimeProcesses(processes) {
  return processes.filter(entry => /hermes/i.test(String(entry.name || ''))).map(entry => ({ name: entry.name, pid: Number(entry.pid) }))
}

/** The renderer's one legacy-REST door (`src/api/legacy-rest.ts`) logs this
 *  marker when the product runtime refuses a call; the main process refuses the
 *  same surface with the code below (`electron/ipc/api-proxy-ipc.ts`). The
 *  driver greps both logs for exactly these strings. */
export const LEGACY_REST_MARKER = '[legacy-rest]'
export const LEGACY_RUNTIME_DISABLED_FOR_PRODUCT = 'LEGACY_RUNTIME_DISABLED_FOR_PRODUCT'

/** How many legacy-REST requests were refused at the main-process door. The
 *  gate is zero: a refusal on the far side of the IPC still means the renderer
 *  issued the call. */
export function countMainLegacyRestRefusals(mainLogText) {
  return String(mainLogText ?? '').split(LEGACY_RUNTIME_DISABLED_FOR_PRODUCT).length - 1
}

/** Every renderer console line that mentions the legacy-REST door, reduced to
 *  the path that was asked for. Parsing is fail-closed: a line carrying the
 *  marker counts even when its shape is not one this function recognises, so
 *  "no line I recognised" can never pass for "no residual caller". Paths keep
 *  first-seen order and are deduplicated for the report. */
export function residualLegacyRestPaths(consoleText) {
  const paths = []

  for (const line of String(consoleText ?? '').split(/\r?\n/)) {
    if (!line.includes(LEGACY_REST_MARKER)) {
      continue
    }

    const afterMarker = line.slice(line.indexOf(LEGACY_REST_MARKER) + LEGACY_REST_MARKER.length).trim()
    const head = afterMarker.split(':')[0].trim()
    const path = head.replace(/^(?:refused|blocked|denied|rejected)\b\s*/i, '').trim()
    const residual = path || head || afterMarker || LEGACY_REST_MARKER

    if (!paths.includes(residual)) {
      paths.push(residual)
    }
  }

  return paths
}

/** The two legacy-REST gates, decided together so they cannot substitute for
 *  each other. Zero main-process refusals says nothing when the renderer log
 *  still shows a call it issued, and a clean renderer log says nothing when a
 *  refusal was counted. The renderer gate additionally requires `captureCoversBoot`:
 *  proof that a whole renderer boot happened with the capture already live. A
 *  log that may predate the renderer's first request cannot establish that
 *  there was none, so unproven coverage fails closed rather than passing on
 *  missing evidence. How that proof is obtained is the driver's business — it
 *  may attach before the window exists, or re-run the boot under capture — but
 *  it must be true, and only the exact boolean `true` counts. `ok` is true only
 *  when both gates hold; a value that is not exactly the number zero, not an
 *  array, or not the boolean true fails closed. */
export function legacyRestGate({ captureCoversBoot, mainRefusals, residualPaths }) {
  const mainOk = mainRefusals === 0
  const residualsOk = Array.isArray(residualPaths) && residualPaths.length === 0
  const captureOk = captureCoversBoot === true
  const rendererOk = residualsOk && captureOk

  return { captureOk, mainOk, ok: mainOk && rendererOk, rendererOk, residualsOk }
}
