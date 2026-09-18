import { describe, expect, it } from 'vitest'

import { visibleStatusbarItems } from './statusbar-items'

// The statusbar is shared by both authorities, but the connection/gateway
// switcher talks to `hermes:connections:*` — which the `hermes:api` hard gate
// does NOT cover, and whose "Test connection" dials the legacy runtime — and the
// agents/cron/webhooks entries open legacy data-plane views. Under the AgentBox
// product authority none of them may exist, however healthy the gateway looks.
describe('visibleStatusbarItems', () => {
  const items = [
    { id: 'command-center' },
    { id: 'gateway-switcher' },
    { id: 'gateway-health' },
    { id: 'workspace-cwd' },
    { id: 'agents' },
    { id: 'cron' },
    { id: 'webhooks' }
  ]

  it('drops the legacy-data-plane items under AgentBox authority', () => {
    expect(visibleStatusbarItems(items, 'agentbox').map(item => item.id)).toEqual([
      'command-center',
      'gateway-health',
      'workspace-cwd'
    ])
  })

  it('keeps the neutral product items that are not legacy data planes', () => {
    const ids = visibleStatusbarItems(items, 'agentbox').map(item => item.id)

    // The gateway HEALTH readout stays: it is handed a null status source by the
    // product surface, so it reports an honest neutral state and polls nothing.
    // Removing it is not the fix for B1.
    expect(ids).toContain('gateway-health')
    expect(ids).toContain('workspace-cwd')
  })

  it('returns the Hermes authority list untouched, in order', () => {
    expect(visibleStatusbarItems(items, 'hermes')).toEqual(items)
  })

  it('drops contributed items that collide with a legacy id, not just the built-ins', () => {
    const contributed = [{ id: 'cron', label: 'contributed' }, { id: 'plugin-thing' }]

    expect(visibleStatusbarItems(contributed, 'agentbox').map(item => item.id)).toEqual(['plugin-thing'])
  })
})
