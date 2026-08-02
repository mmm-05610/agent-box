// @vitest-environment jsdom
/**
 * Structural render test for the shared ProviderForm frame (Stage 4).
 *
 * Verifies the frame mounts for all four agent types with the right
 * per-agent fields from FIELD_REGISTRY, and that the save button invokes
 * onSave. Save-output parity ("save produces the same config as before")
 * is covered by components/provider/serialization/providerDraft.test.ts.
 */
import { describe, expect, it, vi } from 'vitest'
import { afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

afterEach(cleanup)
import { defaultFormValues } from '@/components/provider/ProviderFormFields'
import { ProviderForm } from './ProviderForm'

const values = () => defaultFormValues()

const PER_AGENT_MARKERS: Record<string, string[]> = {
  claude: ['API Endpoint (ANTHROPIC_BASE_URL)', 'Advanced Options', 'Model Mapping（per-role）'],
  codex: ['API 请求地址', 'auth.json (JSON) *', 'config.toml (TOML)', '模型测试配置'],
  hermes: ['API Mode', 'Models', 'Provider Advanced'],
  opencode: ['NPM Package', 'Extra Options', 'Headers'],
}

describe('ProviderForm shared frame', () => {
  for (const agentType of ['claude', 'codex', 'hermes', 'opencode'] as const) {
    it(`renders identity + per-agent fields for ${agentType}`, () => {
      const onSave = vi.fn()
      const { container } = render(
        <ProviderForm agentType={agentType} values={values()} onChange={() => {}} onSave={onSave} />,
      )
      // Shared identity block + frame marker
      expect(container.querySelector('[data-agent-type]')?.getAttribute('data-agent-type')).toBe(agentType)
      expect(screen.getAllByText('供应商名称').length).toBeGreaterThan(0)
      expect(screen.getAllByText('官网链接').length).toBeGreaterThan(0)

      // Per-agent markers
      for (const marker of PER_AGENT_MARKERS[agentType] ?? []) {
        expect(screen.getAllByText(marker).length).toBeGreaterThan(0)
      }

      // Save action
      screen.getByText('Save Provider Settings').click()
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  }
})
