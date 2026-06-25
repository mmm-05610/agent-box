/**
 * Providers API — CRUD operations for providers and Claude.md
 *
 * Currently uses mock data. Will be replaced with PyWebView bridge.
 */

import type { AgentType, ClaudeMd, Provider } from './types'
import { MOCK_CLAUDE_MDS, MOCK_PROVIDERS } from './mock-data'

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(_agentType: AgentType): Promise<Provider[]> {
  await delay(300)
  return [...MOCK_PROVIDERS]
}

export async function fetchProviderDetail(
  _agentType: AgentType,
  providerId: string,
): Promise<Provider | null> {
  await delay(200)
  return MOCK_PROVIDERS.find((p) => p.id === providerId) ?? null
}

export async function saveProvider(
  _agentType: AgentType,
  providerId: string,
  settingsJson: string,
): Promise<Provider> {
  await delay(500)
  const settings = JSON.parse(settingsJson)
  return {
    id: providerId,
    name: settings.name ?? providerId,
    category: settings.category,
    settings,
    createdAt: Date.now(),
  }
}

export async function deleteProvider(
  _agentType: AgentType,
  _providerId: string,
): Promise<void> {
  await delay(300)
}

export async function applyProviderToProfile(
  _profileName: string,
  _providerId: string,
): Promise<void> {
  await delay(500)
}

// ── Claude.md ──────────────────────────────────────────────────────────

export async function fetchClaudeMds(_agentType: AgentType): Promise<ClaudeMd[]> {
  await delay(300)
  return [...MOCK_CLAUDE_MDS]
}

export async function fetchClaudeMdDetail(
  _agentType: AgentType,
  mdId: string,
): Promise<ClaudeMd | null> {
  await delay(200)
  return MOCK_CLAUDE_MDS.find((m) => m.id === mdId) ?? null
}

export async function saveClaudeMd(
  _agentType: AgentType,
  mdId: string,
  content: string,
  name?: string,
  description?: string,
): Promise<ClaudeMd> {
  await delay(500)
  return {
    id: mdId,
    name: name ?? mdId,
    description,
    content,
    createdAt: Date.now(),
  }
}

export async function deleteClaudeMd(
  _agentType: AgentType,
  _mdId: string,
): Promise<void> {
  await delay(300)
}

export async function applyClaudeMdToProfile(
  _profileName: string,
  _mdId: string,
): Promise<void> {
  await delay(500)
}

// ── Helpers ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
