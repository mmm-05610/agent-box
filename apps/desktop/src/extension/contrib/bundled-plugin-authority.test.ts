/**
 * Bundled-plugin discovery under an EXPLICIT product authority.
 *
 * Bot Mode (`hermes-bots`) is retired in the AgentBox product (master plan §4):
 * discovery must drop the id before an inventory record or an
 * activate/deactivate handle exists, so no persisted decision and no later
 * `setPluginEnabled('hermes-bots', true)` can activate it — and none of the
 * machinery `register()` starts (relay, face clock, hide sweep) can run.
 * Under the legacy `hermes` authority the same code path must behave exactly
 * as it always did, live toggle included.
 *
 * Every case builds a fresh world (`vi.resetModules()` + dynamic imports)
 * because discovery is one-shot per module instance, and the authority is part
 * of that instance's world.
 */

import { CHAT_EMPTY_AREA, COMPOSER_AREAS, PALETTE_AREA, STATUSBAR_AREAS } from '@hermes/plugin-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as HermesBotAvatar from '@/plugins/hermes-bots/avatar'

const boundaries = vi.hoisted(() => ({
  startBotRelay: vi.fn(),
  stopBotRelay: vi.fn(),
  startFaceClock: vi.fn(),
  stopFaceClock: vi.fn(),
  startHideSweepScheduler: vi.fn(),
  watchRuntimePlugins: vi.fn()
}))

// Boundaries this suite does not exercise. Stubbing them lets the suite prove
// they never START under agentbox, while the plugin's own trees stay real.
vi.mock('./runtime-loader', () => ({ watchRuntimePlugins: boundaries.watchRuntimePlugins }))
vi.mock('@/plugins/hermes-bots/relay', () => ({
  startBotRelay: boundaries.startBotRelay,
  stopBotRelay: boundaries.stopBotRelay
}))
vi.mock('@/plugins/hermes-bots/avatar', async importOriginal => {
  const original = await importOriginal<typeof HermesBotAvatar>()

  return { ...original, startFaceClock: boundaries.startFaceClock, stopFaceClock: boundaries.stopFaceClock }
})
vi.mock('@/plugins/hermes-bots/session-sweep', () => ({
  startHideSweepScheduler: boundaries.startHideSweepScheduler
}))

const DECISIONS_KEY = 'hermes.desktop.pluginDecisions.v2'
const BOT_MODE_SOURCE = 'plugin:hermes-bots'

// Every area Bot Mode can contribute to: registry, pane, palette and composer.
const BOT_MODE_AREAS = [COMPOSER_AREAS.atCompletions, COMPOSER_AREAS.middleware, CHAT_EMPTY_AREA, PALETTE_AREA, 'panes']

interface RegistryView {
  getArea: (area: string) => readonly { id: string; source: string }[]
}

/** Fresh module world for one authority; discovery runs exactly once. */
async function discoverUnder(authority: 'agentbox' | 'hermes', persisted?: Record<string, boolean>) {
  vi.resetModules()
  window.localStorage.clear()

  if (persisted) {
    window.localStorage.setItem(DECISIONS_KEY, JSON.stringify(persisted))
  }

  const state = await import('@/store/plugin-state')
  const { registry } = await import('@/lib/contributions')
  const { discoverBundledPlugins } = await import('./plugins')
  const bots = (await import('@/plugins/hermes-bots/plugin')).default
  const register = vi.spyOn(bots, 'register')

  discoverBundledPlugins(authority)

  return { register, registry: registry as RegistryView, state }
}

function botModeContributions(registry: RegistryView) {
  return BOT_MODE_AREAS.flatMap(area => registry.getArea(area).filter(item => item.source === BOT_MODE_SOURCE))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('agentbox authority', () => {
  it('never registers, publishes or activates the retired Bot Mode plugin', async () => {
    const { register, registry, state } = await discoverUnder('agentbox')

    // No inventory record, therefore no activate/deactivate handle exists.
    expect(state.$pluginRecords.get()['hermes-bots']).toBeUndefined()
    expect(register).not.toHaveBeenCalled()

    // None of the machinery register() starts.
    expect(boundaries.startBotRelay).not.toHaveBeenCalled()
    expect(boundaries.startFaceClock).not.toHaveBeenCalled()
    expect(boundaries.startHideSweepScheduler).not.toHaveBeenCalled()

    // No contribution of any kind: registry, pane, palette, composer middleware.
    expect(botModeContributions(registry)).toEqual([])

    // The disk/runtime door is NOT part of the retirement — it stays open.
    expect(boundaries.watchRuntimePlugins).toHaveBeenCalledTimes(1)

    // The missing handle is exactly what makes a re-enable impossible.
    await state.setPluginEnabled('hermes-bots', true)
    expect(state.$pluginRecords.get()['hermes-bots']).toBeUndefined()
    expect(register).not.toHaveBeenCalled()
    expect(botModeContributions(registry)).toEqual([])
  })

  it('ignores a persisted enabled=true decision from when Bot Mode still shipped', async () => {
    const { register, registry, state } = await discoverUnder('agentbox', { 'hermes-bots': true })

    // The decision really was loaded from the v2 key — and never consulted.
    expect(state.$pluginDecisions.get()['hermes-bots']).toBe(true)
    expect(state.$pluginRecords.get()['hermes-bots']).toBeUndefined()
    expect(register).not.toHaveBeenCalled()
    expect(botModeContributions(registry)).toEqual([])
  })

  it('keeps the other bundled plugins on their own policy', async () => {
    const { register, registry, state } = await discoverUnder('agentbox', { accent: true })

    expect(state.$pluginRecords.get()['hermes-bots']).toBeUndefined()
    expect(register).not.toHaveBeenCalled()

    // accent: opt-in, on because the user's decision says so.
    expect(state.$pluginRecords.get().accent).toMatchObject({ kind: 'bundled', status: 'loaded' })
    expect(registry.getArea(STATUSBAR_AREAS.right).some(item => item.source === 'plugin:accent')).toBe(true)

    // kanban: inventoried under its own default (off), never dropped.
    expect(state.$pluginRecords.get().kanban).toMatchObject({ kind: 'bundled', status: 'disabled' })

    // radio: still off by default, still live-toggleable.
    expect(state.$pluginRecords.get().radio).toMatchObject({ kind: 'bundled', status: 'disabled' })
    await state.setPluginEnabled('radio', true)
    expect(state.$pluginRecords.get().radio.status).toBe('loaded')
    expect(registry.getArea(STATUSBAR_AREAS.right).some(item => item.source === 'plugin:radio')).toBe(true)

    await state.setPluginEnabled('radio', false)
    expect(state.$pluginRecords.get().radio.status).toBe('disabled')
    expect(registry.getArea(STATUSBAR_AREAS.right).some(item => item.source === 'plugin:radio')).toBe(false)
  })
})

describe('legacy hermes authority', () => {
  it('activates Bot Mode by default and keeps the ordinary live toggle', async () => {
    const { register, registry, state } = await discoverUnder('hermes')

    expect(register).toHaveBeenCalledTimes(1)
    expect(state.$pluginRecords.get()['hermes-bots']).toMatchObject({ kind: 'bundled', status: 'loaded' })
    expect(boundaries.startBotRelay).toHaveBeenCalled()
    expect(boundaries.startFaceClock).toHaveBeenCalled()
    expect(boundaries.startHideSweepScheduler).toHaveBeenCalled()

    const ids = botModeContributions(registry).map(item => item.id)
    expect(ids).toContain('hermes-bots:mention-completions')
    expect(ids).toContain('hermes-bots:chat-empty')
    expect(ids).toContain('hermes-bots:new-agent')
    expect(ids).toContain('hermes-bots:mention-middleware')

    await state.setPluginEnabled('hermes-bots', false)
    expect(state.$pluginRecords.get()['hermes-bots'].status).toBe('disabled')
    expect(botModeContributions(registry)).toEqual([])

    await state.setPluginEnabled('hermes-bots', true)
    expect(register).toHaveBeenCalledTimes(2)
    expect(state.$pluginRecords.get()['hermes-bots'].status).toBe('loaded')
  })

  it('keeps an explicit false disabled, and honors a later explicit true', async () => {
    const { register, state } = await discoverUnder('hermes', { 'hermes-bots': false })

    expect(register).not.toHaveBeenCalled()
    expect(state.$pluginRecords.get()['hermes-bots']).toMatchObject({ kind: 'bundled', status: 'disabled' })

    await state.setPluginEnabled('hermes-bots', true)
    expect(register).toHaveBeenCalledTimes(1)
    expect(state.$pluginRecords.get()['hermes-bots'].status).toBe('loaded')
  })
})
