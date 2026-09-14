import { describe, expect, it } from 'vitest'

import {
  ACCEPTANCE_STATUSES,
  collectDescendants,
  countMainLegacyRestRefusals,
  createStepRecorder,
  findLegacyPaletteEntries,
  hermesRuntimeProcesses,
  legacyRestGate,
  makeAcceptanceStep,
  REQUIRED_STEP_IDS,
  requiredStepIssues,
  residualLegacyRestPaths,
  statesUnavailable,
  summarizeResults,
  worstGlassCoverage
} from './p06-acceptance-helpers.mjs'
import type { AcceptanceStep, UnvalidatedAcceptanceStep } from './p06-acceptance-helpers.mjs'

// The P06 driver's decisions are pure so they can be proven here: an acceptance
// run that only "looked green" on Windows is worth little if the rule it applied
// was wrong.

const recordedStep = (id: string, status: string = 'PASS'): UnvalidatedAcceptanceStep => ({ detail: '', id, status, step: id })

const requiredRun = (): UnvalidatedAcceptanceStep[] => REQUIRED_STEP_IDS.map(id => recordedStep(id))

/** The way the driver composes the required-steps gate: issues in, PASS/FAIL
 *  and detail out, summarized together with every other recorded step. */
function summarizeWithRequiredGate(steps: UnvalidatedAcceptanceStep[]) {
  const issues = requiredStepIssues(steps)

  const gate = makeAcceptanceStep(
    'required-steps-executed',
    'every required step is present exactly once and executed',
    issues.length === 0 ? 'PASS' : 'FAIL',
    JSON.stringify(issues)
  )

  return summarizeResults([...steps, gate])
}

describe('createStepRecorder', () => {
  it('throws when a call puts prose where the status belongs (the recorded defect)', () => {
    const steps: AcceptanceStep[] = []
    const record = createStepRecorder(steps)

    expect(() =>
      record(
        'legacy-view-routes-retired',
        'no-legacy-rest-reached-main',
        'Cron/Agents/Starmap/Webhooks deep links land on the honest product page, not a legacy view',
        'PASS'
      )
    ).toThrow(/illegal acceptance status/)
    expect(steps).toEqual([])
  })

  it('records every legal status and returns the recorded step', () => {
    const steps: AcceptanceStep[] = []
    const record = createStepRecorder(steps)

    for (const status of ACCEPTANCE_STATUSES) {
      expect(record(`step-${status}`, 'a step', status, 'detail')).toEqual({
        detail: 'detail',
        id: `step-${status}`,
        status,
        step: 'a step'
      })
    }

    expect(steps).toHaveLength(ACCEPTANCE_STATUSES.length)
  })

  it('reports each recorded step to the sink so the log and the step list cannot drift', () => {
    const steps: AcceptanceStep[] = []
    const logged: string[] = []
    const record = createStepRecorder(steps, step => logged.push(`${step.status} ${step.id}`))

    record('window-appears', 'the window appears', 'PASS', '')

    expect(logged).toEqual(['PASS window-appears'])
    expect(steps.map(step => step.id)).toEqual(['window-appears'])
  })

  it('rejects an unknown or empty status, not just prose', () => {
    expect(() => makeAcceptanceStep('a', 'a', 'pass', '')).toThrow(/illegal acceptance status/)
    expect(() => makeAcceptanceStep('a', 'a', '', '')).toThrow(/illegal acceptance status/)
    expect(makeAcceptanceStep('a', 'a', 'PASS')).toEqual({ detail: '', id: 'a', status: 'PASS', step: 'a' })
  })
})

describe('findLegacyPaletteEntries', () => {
  it('flags the legacy shortcuts the product must not offer', () => {
    const hits = findLegacyPaletteEntries([
      'New chat',
      'Restart gateway',
      'Update Hermes',
      'Toggle logs',
      'Export profile…',
      'Import profile…'
    ])

    expect(hits.map(hit => hit.id).sort()).toEqual([
      'profile-export',
      'profile-import',
      'restart-gateway',
      'toggle-logs',
      'update-hermes'
    ])
  })

  it('leaves AgentBox navigation and ordinary product rows alone', () => {
    expect(
      findLegacyPaletteEntries(['New chat', 'Profiles', 'Settings', 'Scheduled jobs', 'Memory Graph', 'Open folder'])
    ).toEqual([])
  })

  it('matches case-insensitively but keeps the offending text for the report', () => {
    const hits = findLegacyPaletteEntries(['RESTART GATEWAY'])

    expect(hits).toHaveLength(1)
    expect(hits[0]?.text).toBe('RESTART GATEWAY')
  })
})

describe('statesUnavailable', () => {
  it('accepts the honest unavailable statements in the shipped locales', () => {
    expect(statesUnavailable('Models are unavailable until the service is connected.')).toBe(true)
    expect(statesUnavailable('未连接服务，暂不可用')).toBe(true)
  })

  it('does not accept fabricated content', () => {
    expect(statesUnavailable('default · gpt-4o')).toBe(false)
  })
})

describe('worstGlassCoverage', () => {
  it('reports the largest masked fraction, which is what "blocked" means', () => {
    expect(worstGlassCoverage([{ height: 100, width: 100 }, { height: 900, width: 900 }], 1_000_000)).toBe(0.81)
  })

  it('is zero when nothing masks the viewport', () => {
    expect(worstGlassCoverage([], 1_000_000)).toBe(0)
    expect(worstGlassCoverage([{ height: 800, width: 600 }], 0)).toBe(0)
  })
})

describe('summarizeResults', () => {
  it('counts each status and treats PENDING/SKIP as not-executed', () => {
    const summary = summarizeResults([
      { detail: '', id: 'a', status: 'PASS', step: 'a' },
      { detail: '', id: 'b', status: 'PASS', step: 'b' },
      { detail: '', id: 'c', status: 'PENDING', step: 'c' },
      { detail: '', id: 'd', status: 'SKIP', step: 'd' }
    ])

    expect(summary.counts).toEqual({ FAIL: 0, PASS: 2, PENDING: 1, SKIP: 1 })
    expect(summary.executed).toBe(2)
    expect(summary.allOk).toBe(true)
  })

  it('refuses to call a run green when a step failed', () => {
    const summary = summarizeResults([
      { detail: '', id: 'a', status: 'PASS', step: 'a' },
      { detail: '', id: 'b', status: 'FAIL', step: 'b' }
    ])

    expect(summary.allOk).toBe(false)
  })

  it('refuses to call a run green when nothing executed', () => {
    expect(summarizeResults([{ detail: '', id: 'a', status: 'PENDING', step: 'a' }]).allOk).toBe(false)
  })

  it('refuses to call a run green when a step carries a status it does not understand', () => {
    const summary = summarizeResults([
      { detail: '', id: 'a', status: 'PASS', step: 'a' },
      { detail: 'PASS', id: 'legacy-view-routes-retired', status: 'Cron/Agents/Starmap/Webhooks deep links ...', step: 'no-legacy-rest-reached-main' }
    ])

    expect(summary.allOk).toBe(false)
    expect(summary.unknownStatuses).toEqual([
      { id: 'legacy-view-routes-retired', status: 'Cron/Agents/Starmap/Webhooks deep links ...' }
    ])
    expect(summary.executed).toBe(1)
  })

  it('accounts for every recorded step exactly once, with executed = PASS + FAIL', () => {
    const steps = [
      ...requiredRun(),
      recordedStep('required-steps-executed'),
      recordedStep('a-step-with-an-unknown-status', 'Cron/Agents/Starmap/Webhooks deep links ...')
    ]

    const summary = summarizeResults(steps)

    expect(
      summary.counts.PASS + summary.counts.FAIL + summary.counts.SKIP + summary.counts.PENDING + summary.unknownStatuses.length
    ).toBe(steps.length)
    expect(summary.executed).toBe(summary.counts.PASS + summary.counts.FAIL)
  })

  it('refuses the recorded run shape: 21 recorded steps, one unknown status, not green', () => {
    const recorded = [
      ...Array.from({ length: 20 }, (_, index) => recordedStep(`recorded-${index}`)),
      {
        detail: 'PASS',
        id: 'legacy-view-routes-retired',
        status: 'Cron/Agents/Starmap/Webhooks deep links land on the honest product page, not a legacy view',
        step: 'no-legacy-rest-reached-main'
      }
    ]

    const summary = summarizeResults(recorded)

    expect(recorded).toHaveLength(21)
    expect(summary.counts.PASS).toBe(20)
    expect(summary.unknownStatuses).toHaveLength(1)
    expect(summary.allOk).toBe(false)
  })
})

describe('REQUIRED_STEP_IDS', () => {
  it('covers every step whose absence or non-execution would make a green run dishonest', () => {
    expect(REQUIRED_STEP_IDS).toEqual(
      expect.arrayContaining([
        'window-appears',
        'no-blocking-overlay',
        'workspace-entries',
        'settings-opens-closes',
        'profiles-honest',
        'sidebar-operable',
        'legacy-view-routes-retired',
        'exit-no-orphans',
        'no-hermes-process',
        'required-screenshots',
        'logs-token-free',
        'no-legacy-rest-reached-main',
        'no-legacy-rest-issued-by-renderer'
      ])
    )
  })

  it('lists each step once, so duplicate detection is meaningful', () => {
    expect(new Set(REQUIRED_STEP_IDS).size).toBe(REQUIRED_STEP_IDS.length)
  })
})

describe('requiredStepIssues', () => {
  it('never reports a step that is not required', () => {
    // `driver-target` and the gate step itself carry no honesty claim: a SKIP or
    // PENDING on them is honest bookkeeping, not a failure. This is the one
    // place a real failure could hide, so it is asserted rather than assumed —
    // the full required run is present, only the extra steps are not required.
    const steps: UnvalidatedAcceptanceStep[] = [
      ...requiredRun(),
      { detail: '', id: 'driver-target', status: 'SKIP', step: 'informational' },
      { detail: '', id: 'required-steps-executed', status: 'PENDING', step: 'the gate step' }
    ]

    expect(requiredStepIssues(steps)).toEqual([])
  })

  it('is empty when every required step ran exactly once', () => {
    expect(requiredStepIssues(requiredRun())).toEqual([])
  })

  it('reports a required step that is missing entirely', () => {
    const steps = requiredRun().filter(step => step.id !== 'legacy-view-routes-retired')

    expect(requiredStepIssues(steps)).toEqual([{ id: 'legacy-view-routes-retired', kind: 'missing' }])
  })

  it('reports a required step that is recorded twice', () => {
    const steps = [...requiredRun(), recordedStep('sidebar-operable')]

    expect(requiredStepIssues(steps)).toContainEqual({ count: 2, id: 'sidebar-operable', kind: 'duplicated' })
  })

  it('reports PENDING and SKIP required steps', () => {
    const pending = requiredRun().map(step => (step.id === 'window-appears' ? recordedStep('window-appears', 'PENDING') : step))
    const skipped = requiredRun().map(step => (step.id === 'exit-no-orphans' ? recordedStep('exit-no-orphans', 'SKIP') : step))

    expect(requiredStepIssues(pending)).toEqual([{ id: 'window-appears', kind: 'pending' }])
    expect(requiredStepIssues(skipped)).toEqual([{ id: 'exit-no-orphans', kind: 'skipped' }])
  })

  it('reports an illegal status on a required step', () => {
    const steps = requiredRun().map(step =>
      step.id === 'legacy-view-routes-retired' ? { ...step, status: 'Cron/Agents/Starmap/Webhooks deep links ...' } : step
    )

    expect(requiredStepIssues(steps)).toEqual([
      { id: 'legacy-view-routes-retired', kind: 'illegal-status', status: 'Cron/Agents/Starmap/Webhooks deep links ...' }
    ])
  })

  const dishonestyCases: [string, UnvalidatedAcceptanceStep[]][] = [
    ['a required step is missing', requiredRun().filter(step => step.id !== 'no-legacy-rest-issued-by-renderer')],
    ['a required step is duplicated', [...requiredRun(), recordedStep('no-hermes-process')]],
    [
      'a required step is PENDING',
      requiredRun().map(step => (step.id === 'legacy-view-routes-retired' ? recordedStep('legacy-view-routes-retired', 'PENDING') : step))
    ],
    [
      'a required step is SKIP',
      requiredRun().map(step => (step.id === 'no-legacy-rest-reached-main' ? recordedStep('no-legacy-rest-reached-main', 'SKIP') : step))
    ],
    [
      'a required step carries an illegal status',
      requiredRun().map(step => (step.id === 'legacy-view-routes-retired' ? { ...step, status: 'DONE' } : step))
    ]
  ]

  it.each(dishonestyCases)('fails the run when %s', (_name, steps) => {
    const summary = summarizeWithRequiredGate(steps)

    expect(summary.allOk).toBe(false)
    expect(summary.counts.FAIL).toBeGreaterThan(0)
  })
})

describe('collectDescendants', () => {
  it('walks the whole tree, not just the direct children', () => {
    const processes = [
      { parentPid: 1, pid: 10 },
      { parentPid: 10, pid: 11 },
      { parentPid: 11, pid: 12 },
      { parentPid: 999, pid: 50 }
    ]

    expect(collectDescendants(processes, [1]).sort((a, b) => a - b)).toEqual([1, 10, 11, 12])
  })

  it('survives a parent that already exited mid-walk', () => {
    expect(collectDescendants([{ parentPid: 4242, pid: 7 }], [1])).toEqual([1])
  })
})

describe('hermesRuntimeProcesses', () => {
  it('finds runtime-named processes so a launched runtime cannot hide', () => {
    const found = hermesRuntimeProcesses([
      { name: 'electron.exe', pid: 1 },
      { name: 'hermes.exe', pid: 2 },
      { name: 'HermesRuntime.exe', pid: 3 }
    ])

    expect(found).toEqual([
      { name: 'hermes.exe', pid: 2 },
      { name: 'HermesRuntime.exe', pid: 3 }
    ])
  })

  it('ignores the app process itself', () => {
    expect(hermesRuntimeProcesses([{ name: 'electron.exe', pid: 1 }])).toEqual([])
  })
})

describe('residualLegacyRestPaths', () => {
  it('extracts the path from the line the recorded run captured', () => {
    expect(
      residualLegacyRestPaths('[warning] [legacy-rest] refused /api/config: LEGACY_RUNTIME_DISABLED_FOR_PRODUCT')
    ).toEqual(['/api/config'])
  })

  it('is empty when the captured log holds no legacy-rest line', () => {
    expect(residualLegacyRestPaths('[info] booted\n[warning] nothing legacy here')).toEqual([])
    expect(residualLegacyRestPaths('')).toEqual([])
  })

  it('still counts a marker line whose shape is unrecognised, instead of dropping it', () => {
    expect(residualLegacyRestPaths('[legacy-rest] something the parser never saw')).toEqual(['something the parser never saw'])
    expect(residualLegacyRestPaths('[legacy-rest]')).toEqual(['[legacy-rest]'])
    expect(residualLegacyRestPaths('[warning] [legacy-rest] blocked /api/config')).toEqual(['/api/config'])
  })

  it('deduplicates repeated paths and keeps first-seen order', () => {
    const log = [
      '[warning] [legacy-rest] refused /api/config: CODE',
      '[warning] [legacy-rest] refused /api/profiles: CODE',
      '[warning] [legacy-rest] refused /api/config: CODE'
    ].join('\n')

    expect(residualLegacyRestPaths(log)).toEqual(['/api/config', '/api/profiles'])
  })
})

describe('countMainLegacyRestRefusals', () => {
  it('counts refusals at the main-process door', () => {
    expect(
      countMainLegacyRestRefusals('a LEGACY_RUNTIME_DISABLED_FOR_PRODUCT b LEGACY_RUNTIME_DISABLED_FOR_PRODUCT')
    ).toBe(2)
    expect(countMainLegacyRestRefusals('the main log has no refusal')).toBe(0)
  })
})

describe('legacyRestGate', () => {
  it('passes only when both gates hold and the capture is proven to cover renderer boot', () => {
    expect(legacyRestGate({ captureStartedAtWindow: true, mainRefusals: 0, residualPaths: [] })).toEqual({
      captureOk: true,
      mainOk: true,
      ok: true,
      rendererOk: true,
      residualsOk: true
    })
  })

  it('does not let a clean main log excuse a renderer residual (the recorded defect)', () => {
    const verdict = legacyRestGate({ captureStartedAtWindow: true, mainRefusals: 0, residualPaths: ['/api/config'] })

    expect(verdict.mainOk).toBe(true)
    expect(verdict.rendererOk).toBe(false)
    expect(verdict.ok).toBe(false)
  })

  it('does not let a clean renderer log excuse main-process refusals', () => {
    const verdict = legacyRestGate({ captureStartedAtWindow: true, mainRefusals: 3, residualPaths: [] })

    expect(verdict.mainOk).toBe(false)
    expect(verdict.residualsOk).toBe(true)
    expect(verdict.ok).toBe(false)
  })

  it('fails closed when the console capture cannot be proven to cover renderer boot', () => {
    const verdict = legacyRestGate({ captureStartedAtWindow: false, mainRefusals: 0, residualPaths: [] })

    expect(verdict.captureOk).toBe(false)
    expect(verdict.residualsOk).toBe(true)
    expect(verdict.rendererOk).toBe(false)
    expect(verdict.ok).toBe(false)
  })

  it('fails closed on inputs that are not a zero count, an array or a true flag', () => {
    expect(legacyRestGate({ captureStartedAtWindow: true, mainRefusals: '0', residualPaths: [] }).ok).toBe(false)
    expect(legacyRestGate({ captureStartedAtWindow: true, mainRefusals: undefined, residualPaths: [] }).ok).toBe(false)
    expect(legacyRestGate({ captureStartedAtWindow: true, mainRefusals: 0, residualPaths: undefined }).ok).toBe(false)
    expect(legacyRestGate({ captureStartedAtWindow: true, mainRefusals: 0, residualPaths: [''] }).ok).toBe(false)
    expect(legacyRestGate({ captureStartedAtWindow: 'yes', mainRefusals: 0, residualPaths: [] }).ok).toBe(false)
  })

  it('decides the recorded renderer evidence as a failure', () => {
    const verdict = legacyRestGate({
      captureStartedAtWindow: true,
      mainRefusals: countMainLegacyRestRefusals('no refusals in the main log'),
      residualPaths: residualLegacyRestPaths('[warning] [legacy-rest] refused /api/config: LEGACY_RUNTIME_DISABLED_FOR_PRODUCT')
    })

    expect(verdict.mainOk).toBe(true)
    expect(verdict.ok).toBe(false)
  })
})
