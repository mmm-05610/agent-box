/**
 * store/wsl-workspace.ts — UI projection of the WSL Workspace host store
 * (work order 35).
 *
 * The Electron main process owns the persisted truth (`userData/wsl-workspaces.json`);
 * these atoms are the renderer's cache of that truth, refreshed from the host.
 * The list deliberately carries no online status: a record on disk is not a
 * fact about the distribution right now — reconnect has to re-verify it.
 */

import { atom } from 'nanostores'

import type { WslWorkspaceErrorCode, WslWorkspaceRecord } from '@/types/workspace'

export type WslWorkspaceValidationState =
  | { status: 'unverified' }
  | { status: 'validating' }
  | { status: 'validated'; actualUser: string; userChanged: boolean; verifiedAt: number }
  | { status: 'failed'; code: WslWorkspaceErrorCode; message: string; verifiedAt: number }

export const $wslWorkspaces = atom<WslWorkspaceRecord[]>([])

export const $wslWorkspaceValidation = atom<Record<string, WslWorkspaceValidationState>>({})

/** Wizard dialog mount state; the four steps live in the dialog component. */
export const $wslWorkspaceWizardOpen = atom(false)

/** Which workspace's connection-info dialog is open (null = closed). */
export const $wslWorkspaceInfoId = atom<null | string>(null)

export function setWslWorkspaces(workspaces: WslWorkspaceRecord[]): void {
  $wslWorkspaces.set(workspaces)
}

/** Merge one saved/reconnected record into the projection by id. */
export function upsertWslWorkspace(record: WslWorkspaceRecord): void {
  const existing = $wslWorkspaces.get()
  const index = existing.findIndex(w => w.id === record.id)

  setWslWorkspaces(index === -1 ? [...existing, record] : existing.map(w => (w.id === record.id ? record : w)))
}

export function setWslWorkspaceValidation(workspaceId: string, state: WslWorkspaceValidationState): void {
  $wslWorkspaceValidation.set({ ...$wslWorkspaceValidation.get(), [workspaceId]: state })
}

export function openWslWorkspaceWizard(): void {
  $wslWorkspaceWizardOpen.set(true)
}

export function closeWslWorkspaceWizard(): void {
  $wslWorkspaceWizardOpen.set(false)
}

export function openWslWorkspaceInfo(workspaceId: string): void {
  $wslWorkspaceInfoId.set(workspaceId)
}

export function closeWslWorkspaceInfo(): void {
  $wslWorkspaceInfoId.set(null)
}
