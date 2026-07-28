/**
 * ProviderAdvancedConfig — Test Config + Billing Config card pair.
 *
 * Mirrors cc-switch's `ProviderAdvancedConfig` (`@/components/providers/forms/`)
 * using our own `AdvancedCard` primitive (auto-opens when enabled, header has a
 * "use custom config" Toggle). Each card is fully independent: TestConfig
 * tracks its own timeout / degraded threshold / max-retries; BillingConfig
 * tracks costMultiplier + pricingModelSource. Both feed back into a single
 * `values` patch via the shared `onChange` callback.
 *
 * Numbers stay as strings in the form (matching the rest of `ProviderFormValues`)
 * and are parsed at save time in `perAgentSettings.ts`.
 */
import type { ChangeEvent } from 'react'
import { AdvancedCard } from './AdvancedCard'
import { Field } from './Field'
import { FlaskIcon, CoinsIcon } from './icons'

export type PricingModelSourceOption = 'inherit' | 'request' | 'response'

export interface ProviderAdvancedConfigProps {
  // Test config
  testConfigEnabled: boolean
  testTimeout: string
  testDegradedThreshold: string
  testMaxRetries: string
  // Billing config
  pricingConfigEnabled: boolean
  costMultiplier: string
  pricingModelSource: string
  // Patches — each callback patches a single field on the parent's ProviderFormValues
  onTestConfigEnabledChange: (enabled: boolean) => void
  onTestTimeoutChange: (value: string) => void
  onTestDegradedThresholdChange: (value: string) => void
  onTestMaxRetriesChange: (value: string) => void
  onPricingConfigEnabledChange: (enabled: boolean) => void
  onCostMultiplierChange: (value: string) => void
  onPricingModelSourceChange: (value: string) => void
  disabled?: boolean
}

const numberInputClass =
  'h-9 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed'

const numberInputProps = (value: string, onChange: (value: string) => void, disabled?: boolean) => ({
  value,
  onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
  disabled,
  className: numberInputClass,
  inputMode: 'numeric' as const,
})

export function ProviderAdvancedConfig({
  testConfigEnabled,
  testTimeout,
  testDegradedThreshold,
  testMaxRetries,
  pricingConfigEnabled,
  costMultiplier,
  pricingModelSource,
  onTestConfigEnabledChange,
  onTestTimeoutChange,
  onTestDegradedThresholdChange,
  onTestMaxRetriesChange,
  onPricingConfigEnabledChange,
  onCostMultiplierChange,
  onPricingModelSourceChange,
  disabled,
}: ProviderAdvancedConfigProps) {
  return (
    <div className="space-y-4">
      {/* ── Test config ───────────────────────────────────────────── */}
      <AdvancedCard
        icon={<FlaskIcon />}
        title="连通检测配置"
        enabled={testConfigEnabled}
        onEnabledChange={onTestConfigEnabledChange}
        enabledLabel="使用单独配置"
      >
        <p className="text-xs text-muted-foreground">
          为此供应商配置单独的连通检测参数（超时 / 阈值 / 重试），不启用时使用全局配置。
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="超时时间（秒）">
            <input
              type="number"
              min={1}
              max={60}
              placeholder="8"
              {...numberInputProps(testTimeout, onTestTimeoutChange, disabled || !testConfigEnabled)}
            />
          </Field>
          <Field label="降级阈值（毫秒）">
            <input
              type="number"
              min={1}
              placeholder="6000"
              {...numberInputProps(testDegradedThreshold, onTestDegradedThresholdChange, disabled || !testConfigEnabled)}
            />
          </Field>
          <Field label="最大重试次数">
            <input
              type="number"
              min={0}
              placeholder="1"
              {...numberInputProps(testMaxRetries, onTestMaxRetriesChange, disabled || !testConfigEnabled)}
            />
          </Field>
        </div>
      </AdvancedCard>

      {/* ── Billing config ────────────────────────────────────────── */}
      <AdvancedCard
        icon={<CoinsIcon />}
        title="计费配置"
        enabled={pricingConfigEnabled}
        onEnabledChange={onPricingConfigEnabledChange}
        enabledLabel="使用单独配置"
      >
        <p className="text-xs text-muted-foreground">
          为此供应商配置单独的计费参数，不启用时使用全局默认配置。
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field
            label="成本倍率"
            hint="实际成本 = 基础成本 × 倍率，支持小数如 1.5。留空使用全局默认（1）。"
          >
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="1"
              value={costMultiplier}
              onChange={(event) => onCostMultiplierChange(event.target.value)}
              disabled={disabled || !pricingConfigEnabled}
              inputMode="decimal"
              className={numberInputClass}
            />
          </Field>
          <Field
            label="计费模式"
            hint="选择按请求模型还是返回模型进行定价匹配。"
          >
            <select
              value={pricingModelSource}
              onChange={(event) => onPricingModelSourceChange(event.target.value)}
              disabled={disabled || !pricingConfigEnabled}
              className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground focus:border-foreground/30 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="inherit">继承全局默认</option>
              <option value="request">请求模型</option>
              <option value="response">返回模型</option>
            </select>
          </Field>
        </div>
      </AdvancedCard>
    </div>
  )
}
