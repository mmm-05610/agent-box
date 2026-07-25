import { describe, expect, it } from 'vitest'
import { readProviderEditorDraft, writeProviderEditorDraft } from './providerDraft'

describe('provider editor draft round trips', () => {
  it('keeps Codex TOML model and catalog consistent', () => {
    const original = { auth: { OPENAI_API_KEY: 'key' }, config: 'model = "MiniMax-M3"\nmodel_provider = "custom"\n\n[model_providers.custom]\nbase_url = "https://api.minimax.io/v1"' }
    const draft = readProviderEditorDraft('codex', original)
    expect(draft.codex.catalogModels[0]?.model).toBe('MiniMax-M3')
    draft.codex.catalogModels[0].model = 'MiniMax-M4'
    const saved = writeProviderEditorDraft('codex', original, draft)
    expect(saved.config).toContain('model = "MiniMax-M4"')
    expect(saved.modelCatalog).toEqual({ models: [{ model: 'MiniMax-M4', displayName: 'MiniMax-M3', contextWindow: '' }] })
  })

  it('round trips Hermes models and rate limit', () => {
    const original = { base_url: 'https://example.com', api_key: 'key', api_mode: 'anthropic', models: [{ id: 'm1', name: 'M1', context_length: 200000 }], rate_limit_delay: 2 }
    const saved = writeProviderEditorDraft('hermes', original, readProviderEditorDraft('hermes', original))
    expect(saved.models).toEqual(original.models)
    expect(saved.rate_limit_delay).toBe(2)
  })

  it('round trips OpenCode options and models', () => {
    const original = { npm: '@ai-sdk/openai-compatible', options: { baseURL: 'https://example.com', apiKey: 'key', timeout: 10 }, models: { m1: { name: 'M1' } } }
    const saved = writeProviderEditorDraft('opencode', original, readProviderEditorDraft('opencode', original))
    expect(saved.options).toEqual(original.options)
    expect(saved.models).toEqual(original.models)
  })

  it('preserves unknown Claude settings', () => {
    const original = { env: { ANTHROPIC_BASE_URL: 'https://example.com', ANTHROPIC_AUTH_TOKEN: 'key' }, unknown: { keep: true } }
    const saved = writeProviderEditorDraft('claude', original, readProviderEditorDraft('claude', original))
    expect(saved.unknown).toEqual({ keep: true })
  })

  it('removes stale Claude auth and cleared optional fields', () => {
    const original = { env: { ANTHROPIC_API_KEY: 'old', ANTHROPIC_AUTH_TOKEN: 'token' }, effortLevel: 'high', ENABLE_TOOL_SEARCH: true }
    const draft = readProviderEditorDraft('claude', original)
    draft.values.useApiKey = false
    draft.values.authValue = 'new-token'
    draft.values.effortLevel = ''
    draft.values.enableToolSearch = false
    const saved = writeProviderEditorDraft('claude', original, draft)
    expect(saved.env).toEqual({ ANTHROPIC_AUTH_TOKEN: 'new-token' })
    expect(saved).not.toHaveProperty('effortLevel')
    expect(saved).not.toHaveProperty('ENABLE_TOOL_SEARCH')
  })

  it('removes cleared Codex model and catalog', () => {
    const original = { config: 'model = "old"\nmodel_provider = "custom"\n[model_providers.custom]\nbase_url = "https://old"', modelCatalog: { models: [{ model: 'old', displayName: 'Old' }] } }
    const draft = readProviderEditorDraft('codex', original)
    draft.codex.catalogModels = []
    const saved = writeProviderEditorDraft('codex', original, draft)
    expect(saved.config).not.toMatch(/^\s*model\s*=/m)
    expect(saved).not.toHaveProperty('modelCatalog')
  })

  it('deletes removed OpenCode extras and persists npm', () => {
    const original = { npm: '@ai-sdk/openai', options: { baseURL: 'https://example.com', oldOption: true } }
    const draft = readProviderEditorDraft('opencode', original)
    draft.opencode.npm = '@ai-sdk/anthropic'
    draft.opencode.extraOptions = {}
    const saved = writeProviderEditorDraft('opencode', original, draft)
    expect(saved.npm).toBe('@ai-sdk/anthropic')
    expect(saved.options).not.toHaveProperty('oldOption')
  })
})
