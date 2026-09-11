/**
 * Bot Mode has to keep linking against a host that provides no views.
 *
 * `ctx.hostViews` is an optional host capability: the shell that hosts the
 * plugin may predate any of its surfaces (`McpTab`, `ToolsetConfigPanel`,
 * `SkillsView`). Every use site is therefore guarded, and the plugin module
 * graph must evaluate — and still hand back a registrable plugin — when the
 * context carries none of them. A bare top-level use of one of them turns a
 * missing capability into a blank Bots pane on an older host, which is
 * exactly the failure this pins.
 */

import { describe, expect, it, vi } from 'vitest'

/** Names an older SDK is allowed not to export. */
const OPTIONAL_CAPABILITY_EXPORTS = new Set(['McpTab', 'SkillsView', 'ToolsetConfigPanel'])

vi.mock('@hermes/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  // Everything an older SDK DOES export answers as a callable stand-in, so
  // module-level `host.state.x.get()` / `foo()` evaluation succeeds without
  // pinning the real surface.
  const stub: unknown = new Proxy(function stubbed() {}, {
    apply: () => stub,
    get: (_target, key) => {
      if (key === Symbol.iterator) {
        return function* () {}
      }

      if (key === Symbol.toPrimitive) {
        return () => 0
      }

      // Never look thenable: an awaited stub would hang the import.
      if (key === 'then' || OPTIONAL_CAPABILITY_EXPORTS.has(String(key))) {
        return undefined
      }

      return stub
    }
  })

  return new Proxy({ atom } as Record<string, unknown>, {
    get: (target, key) => {
      if (typeof key === 'symbol' || key in target) {
        return target[key as string]
      }

      // The namespace itself is awaited by the loader: a callable `then`
      // would make it look thenable and never settle.
      return key === 'then' || OPTIONAL_CAPABILITY_EXPORTS.has(key) ? undefined : stub
    },
    // The loader validates namespace access against the mock, so the
    // capability names must READ as undefined rather than be absent —
    // absent would throw where an older bundled SDK simply gives undefined.
    has: () => true
  })
})

describe('a host that provides no views', () => {
  it('still links Bot Mode into a registrable plugin', async () => {
    const plugin = (await import('./plugin')).default

    expect(plugin.id).toBe('hermes-bots')
    expect(typeof plugin.register).toBe('function')
  })

  it('leaves the SkillsView connection-routing capability off', async () => {
    // `skillsViewRoutesConnections` gates whether a source-scoped bot may open
    // the Capabilities tab at all — with no host views it must read false, not
    // throw on the missing capability. `getPluginCtx()` stays null here, which
    // is exactly a plugin no host has registered yet.
    const { hostViews, skillsViewRoutesConnections } = await import('./profile-config')

    expect(hostViews().SkillsView).toBeUndefined()
    expect(skillsViewRoutesConnections()).toBe(false)
  })
})
