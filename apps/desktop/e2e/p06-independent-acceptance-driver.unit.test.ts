import { describe, expect, it } from 'vitest'

import {
  collectDescendants,
  findLegacyPaletteEntries,
  hermesRuntimeProcesses,
  pendingOrSkippedRequired,
  statesUnavailable,
  summarizeResults,
  worstGlassCoverage
} from './p06-acceptance-helpers.mjs'

// The P06 driver's decisions are pure so they can be proven here: an acceptance
// run that only "looked green" on Windows is worth little if the rule it applied
// was wrong.

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
})

describe('pendingOrSkippedRequired', () => {
  it('catches a required step that hid behind the environment', () => {
    const steps = [
      { detail: '', id: 'window-appears', status: 'PENDING', step: 'window' },
      { detail: '', id: 'profiles-honest', status: 'SKIP', step: 'profiles' },
      { detail: '', id: 'sidebar-operable', status: 'PASS', step: 'sidebar' }
    ] as const

    expect(pendingOrSkippedRequired([...steps]).map(step => step.id)).toEqual(['window-appears'])
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
