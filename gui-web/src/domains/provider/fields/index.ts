/**
 * Per-agent provider field registry — agent → fields component.
 *
 * The ProviderForm frame looks up the agent's fields component here and
 * mounts it below the shared identity block. Adding a new agent = add a
 * `fields/<Agent>Fields.tsx` + one registry line; the frame doesn't change.
 */
import type { ComponentType } from 'react'
import type { AgentType } from '@/api'
import type { ProviderFieldsProps } from './types'
import { ClaudeFields } from './ClaudeFields'
import { CodexFields } from './CodexFields'
import { HermesFields } from './HermesFields'
import { OpenCodeFields } from './OpenCodeFields'

export const FIELD_REGISTRY: Record<AgentType, ComponentType<ProviderFieldsProps>> = {
  claude: ClaudeFields,
  codex: CodexFields,
  hermes: HermesFields,
  opencode: OpenCodeFields,
}

export type { ProviderFieldsProps } from './types'
export type { ClaudeApiKeyField, CodexApiFormat, CodexCatalogModel, CodexChatReasoning, PromptCacheRoutingMode } from './CodexFields'
export { readCodexCatalogModels } from './CodexFields'
export type { HermesApiMode, HermesModel } from './HermesFields'
export { HERMES_API_MODE_OPTIONS, readHermesModels } from './HermesFields'
export type { OpenCodeModel, OpenCodeModels, OpenCodeNpmPackage } from './OpenCodeFields'
export { OPENCODE_NPM_PACKAGES } from './OpenCodeFields'
