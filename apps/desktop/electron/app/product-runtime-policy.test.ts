import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  autostartDesktopProductRuntime,
  DESKTOP_PRODUCT_RUNTIME,
  shouldAutostartLegacyHermes
} from './product-runtime-policy'

test('the AgentBox product does not autostart the legacy Hermes runtime', () => {
  assert.equal(DESKTOP_PRODUCT_RUNTIME, 'agentbox')
  assert.equal(shouldAutostartLegacyHermes(DESKTOP_PRODUCT_RUNTIME), false)
})

test('AgentBox invokes no legacy starter while explicit legacy runtime invokes it once', async () => {
  let agentBoxStarts = 0
  let legacyStarts = 0
  const errors: unknown[] = []

  await autostartDesktopProductRuntime(DESKTOP_PRODUCT_RUNTIME, {
    startLegacyHermes: () => {
      agentBoxStarts += 1
    },
    onError: error => errors.push(error)
  })
  await autostartDesktopProductRuntime('legacy-hermes', {
    startLegacyHermes: () => {
      legacyStarts += 1
    },
    onError: error => errors.push(error)
  })

  assert.equal(agentBoxStarts, 0)
  assert.equal(legacyStarts, 1)
  assert.deepEqual(errors, [])
})

test('legacy starter failures are handed to onError without escaping', async () => {
  const failure = new Error('legacy boot failed')
  const errors: unknown[] = []

  await autostartDesktopProductRuntime('legacy-hermes', {
    startLegacyHermes: async () => {
      throw failure
    },
    onError: error => errors.push(error)
  })

  assert.deepEqual(errors, [failure])
})
