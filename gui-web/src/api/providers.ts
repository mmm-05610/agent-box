/**
 * Providers API — CRUD operations for providers and Claude.md
 *
 * Currently returns empty data. Will be connected to PyWebView bridge.
 */

import type { AgentType, ClaudeMd, Provider } from './types'

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(_agentType: AgentType): Promise<Provider[]> {
  return []
}

export async function fetchProviderDetail(
  _agentType: AgentType,
  _providerId: string,
): Promise<Provider | null> {
  return null
}

export async function saveProvider(
  _agentType: AgentType,
  _providerId: string,
  _settingsJson: string,
): Promise<Provider> {
  throw new Error('Not connected to backend')
}

export async function deleteProvider(
  _agentType: AgentType,
  _providerId: string,
): Promise<void> {
  throw new Error('Not connected to backend')
}

export async function applyProviderToProfile(
  _profileName: string,
  _providerId: string,
): Promise<void> {
  throw new Error('Not connected to backend')
}

// ── Claude.md ──────────────────────────────────────────────────────────

export async function fetchClaudeMds(_agentType: AgentType): Promise<ClaudeMd[]> {
  return []
}

export async function fetchClaudeMdDetail(
  _agentType: AgentType,
  _mdId: string,
): Promise<ClaudeMd | null> {
  return null
}

export async function saveClaudeMd(
  _agentType: AgentType,
  _mdId: string,
  _content: string,
  _name?: string,
  _description?: string,
): Promise<ClaudeMd> {
  throw new Error('Not connected to backend')
}

export async function deleteClaudeMd(
  _agentType: AgentType,
  _mdId: string,
): Promise<void> {
  throw new Error('Not connected to backend')
}

export async function applyClaudeMdToProfile(
  _profileName: string,
  _mdId: string,
): Promise<void> {
  throw new Error('Not connected to backend')
}
