/**
 * Pure decisions the P06 independent-acceptance driver is built from.
 *
 * They live here — not inside the driver's `page.evaluate` callbacks — so the
 * rules can be proven without launching Electron: what counts as a legacy
 * palette entry, what the arrival screen is allowed to be, how the step summary
 * aggregates, and which screenshots a run owes.
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

/** `results.json` aggregation. `allOk` covers EXECUTED steps only: a PENDING or
 *  SKIP is honesty about the environment, but it is not a pass either, so it
 *  can never make a required step look green. */
export function summarizeResults(steps) {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, PENDING: 0 }

  for (const step of steps) {
    if (step.status in counts) {
      counts[step.status] += 1
    }
  }

  const executed = counts.PASS + counts.FAIL

  return { allOk: counts.FAIL === 0 && executed > 0, counts, executed }
}

/** Steps this driver is not allowed to leave unexecuted. "The window opened and
 *  the shell is usable" cannot be PENDING: it either happened here or the
 *  product is broken. */
export const REQUIRED_STEP_IDS = [
  'window-appears',
  'no-blocking-overlay',
  'sidebar-operable',
  'settings-opens-closes',
  'legacy-view-routes-retired',
  'exit-no-orphans',
  'no-hermes-process'
]

export function pendingOrSkippedRequired(steps) {
  return steps.filter(step => REQUIRED_STEP_IDS.includes(step.id) && (step.status === 'PENDING' || step.status === 'SKIP'))
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
