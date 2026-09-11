import { getHermesConfig, type HermesGateway } from '@/hermes'
import { desktopGit } from '@/lib/desktop-git'

import {
  activeProjectsContext,
  type ActiveProjectsContext,
  gatewayRequestOn,
  projectParams,
  stillOnProjectsContext
} from './gateway'
import { refreshProjectTree, refreshProjectTreeOn } from './refresh'
import {
  markProjectsRpcFailure
} from './scope'

/** Discover repos under a project's folders and record them on the project
 *  rows. */
export const $reposScanning = atom(false)

// ── Project scope (the "you're inside a project" view, mirroring profile scope)─
// The sidebar's grouped view is a project switcher: ALL_PROJECTS shows the
// project overview (a list you drill into), and a concrete id means you've
// "entered" that project so only its worktrees/branches/sessions show. This is
// pure view state (localStorage), distinct from the durable active-project
// pointer in projects.db — though entering a project also makes it active so new
// chats land there, exactly as selecting a profile does.

import { atom } from 'nanostores'

import { isDesktopFsRemoteMode } from '@/lib/desktop-fs'
import {
  $gateway,
  activeGateway
} from '@/store/gateway'
export interface RepoDiscoveryPolicy {
  enabled: boolean
  roots: string[]
  exclude_paths: string[]
}

export function repoDiscoveryPolicyFromConfig(config: unknown): RepoDiscoveryPolicy {
  const desktopValue = config && typeof config === 'object' ? (config as { desktop?: unknown }).desktop : undefined

  const desktop =
    desktopValue && typeof desktopValue === 'object'
      ? (desktopValue as {
          repo_scan_enabled?: unknown
          repo_scan_exclude_paths?: unknown
          repo_scan_roots?: unknown
        })
      : {}

  return {
    enabled: desktop.repo_scan_enabled !== false,
    roots: Array.isArray(desktop.repo_scan_roots)
      ? desktop.repo_scan_roots.filter((value): value is string => typeof value === 'string')
      : [],
    exclude_paths: Array.isArray(desktop.repo_scan_exclude_paths)
      ? desktop.repo_scan_exclude_paths.filter((value): value is string => typeof value === 'string')
      : []
  }
}

export function repoDiscoveryPolicySignature(policy: RepoDiscoveryPolicy): string {
  return JSON.stringify(policy)
}

interface RepoScanState {
  completedSignature?: string
  generation: number
  runningSignature?: string
}

const repoScanStates = new WeakMap<HermesGateway, RepoScanState>()
const scanningGatewayGenerations = new WeakMap<HermesGateway, number>()

function syncReposScanning(): void {
  const gateway = activeGateway()
  $reposScanning.set(Boolean(gateway && scanningGatewayGenerations.has(gateway)))
}

$gateway.subscribe(syncReposScanning)

export async function scanAndRecordRepos(force = false): Promise<void> {
  if (isDesktopFsRemoteMode()) {
    // On a remote backend the desktop can't crawl the host filesystem.
    // Ask the host to scan its own discovery roots (`projects.discover_repos`
    // with `scan: true` — added in #81723) so repos with zero Hermes
    // sessions still surface, then refresh the tree so the sidebar picks up
    // the merged session-derived + scanned list.
    try {
      const context = await activeProjectsContext()

      const discovered = await gatewayRequestOn<{
        repos?: unknown
        discovery_policy?: unknown
      }>(context.gateway, 'projects.discover_repos', projectParams({ scan: true }, context.profile))

      // A resolved response must be the discovery shape. Anything else (an
      // error/`accepted:false` body, or a backend that ignored `scan` and
      // returned no repo list) means the scan didn't happen — bail out without
      // touching the tree so the sidebar keeps its last known list instead of
      // being blanked back to the silent, unpopulated state of #81723.
      if (discovered?.repos === undefined) {
        markProjectsRpcFailure(new Error('projects.discover_repos returned no repo list'))

        return
      }

      // Remote scan succeeded: refresh the tree so the merged session-derived +
      // scanned list surfaces. Skip if the user moved on — a stale scan must
      // not publish into the newly focused profile.
      if (stillOnProjectsContext(context)) {
        await refreshProjectTreeOn(context)
      }
    } catch (err) {
      // Surface the failure (stale backend, RPC error, gateway drop) instead
      // of swallowing it: a silent return is exactly the "sidebar goes quiet"
      // symptom `scan:true` was meant to fix (#81723). Keep the old list and
      // let the sidebar show the error/absent state.
      markProjectsRpcFailure(err)
    }

    return
  }

  let context: ActiveProjectsContext

  try {
    context = await activeProjectsContext()
  } catch {
    return
  }

  const scan = desktopGit()?.scanRepos

  if (!scan) {
    return
  }

  const state = repoScanStates.get(context.gateway) ?? { generation: 0 }
  repoScanStates.set(context.gateway, state)
  let generation: number | undefined

  try {
    const policy = repoDiscoveryPolicyFromConfig(await getHermesConfig(context.profile))
    const signature = repoDiscoveryPolicySignature(policy)

    if (!force && (state.completedSignature === signature || state.runningSignature === signature)) {
      return
    }

    generation = ++state.generation
    state.runningSignature = signature

    if (!policy.enabled) {
      await gatewayRequestOn(
        context.gateway,
        'projects.record_repos',
        projectParams({ discovery_policy: policy, repos: [] }, context.profile)
      )
    } else {
      scanningGatewayGenerations.set(context.gateway, generation)
      syncReposScanning()

      const repos = await scan(policy.roots, {
        enabled: true,
        excludePaths: policy.exclude_paths
      })

      if (state.generation !== generation) {
        return
      }

      await gatewayRequestOn(
        context.gateway,
        'projects.record_repos',
        projectParams({ discovery_policy: policy, repos }, context.profile)
      )
    }

    if (state.generation !== generation) {
      return
    }

    state.completedSignature = signature

    // Completion refresh only when the focused profile still matches the one
    // the scan was captured under. refreshProjectTree() re-derives the current
    // context, so skipping on mismatch keeps a stale scan from publishing into
    // the newly focused profile.
    if (stillOnProjectsContext(context)) {
      await refreshProjectTree()
    }
  } catch {
    state.completedSignature = undefined
  } finally {
    state.runningSignature = undefined

    if (scanningGatewayGenerations.get(context.gateway) === generation) {
      scanningGatewayGenerations.delete(context.gateway)
    }

    syncReposScanning()
  }
}
