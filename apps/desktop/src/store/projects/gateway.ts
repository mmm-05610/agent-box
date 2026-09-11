import { type HermesGateway } from '@/hermes'
import { activeGateway, ensureActiveGatewayOpen } from '@/store/gateway'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $activeGatewayProfile } from '@/store/profile/runtime-route-state'
import { $profileScope, ALL_PROFILES } from '@/store/profile/sidebar-scope'

import type {
  ProjectsPayload
} from './scope'
import {
  $activeProjectId,
  $projects
} from './scope'

/** JSON-RPC plumbing for projects.*: profile scoping, typed requests, and
 *  payload application. */
export async function gatewayRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  let gateway = activeGateway()

  if (!gateway || gateway.connectionState !== 'open') {
    gateway = await ensureActiveGatewayOpen()
  }

  if (!gateway) {
    throw new Error('Hermes gateway is not connected')
  }

  return gateway.request<T>(method, params)
}

export function projectProfile(): null | string {
  const profile = normalizeProfileKey($activeGatewayProfile.get())

  return $profileScope.get() === ALL_PROFILES || profile === ALL_PROFILES ? null : profile
}

export function projectParams(
  params: Record<string, unknown> = {},
  profile: null | string = projectProfile()
): Record<string, unknown> {
  if (!profile) {
    throw new Error('Projects are unavailable while viewing all profiles')
  }

  return { ...params, profile }
}

export async function gatewayRequestOn<T>(
  gateway: HermesGateway,
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  return gateway.request<T>(method, params)
}

export function isRetryableProjectTreeReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')

  return message.includes('request timed out') || message.includes('gateway connection closed')
}

export interface ActiveProjectsContext {
  gateway: HermesGateway
  profile: string
}

export function stillOnProjectsContext(context: ActiveProjectsContext): boolean {
  return activeGateway() === context.gateway && projectProfile() === context.profile
}

export async function activeProjectsContext(profile = projectProfile()): Promise<ActiveProjectsContext> {
  if (!profile || profile === ALL_PROFILES) {
    throw new Error('Projects are unavailable while viewing all profiles')
  }

  let gateway = activeGateway()

  if (!gateway || gateway.connectionState !== 'open') {
    gateway = await ensureActiveGatewayOpen()
  }

  if (!gateway || gateway !== activeGateway() || profile !== normalizeProfileKey($activeGatewayProfile.get())) {
    throw new Error('Active Hermes profile changed while connecting')
  }

  return { gateway, profile }
}

export function applyPayload(payload: ProjectsPayload): void {
  $projects.set(payload.projects ?? [])
  $activeProjectId.set(payload.active_id ?? null)
}


// Pull the full project list + active pointer. Best-effort: a failure (gateway
// not up yet) leaves the cached atoms intact so the sidebar doesn't flicker.
