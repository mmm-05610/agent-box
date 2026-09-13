/**
 * PATCH (AgentBox Work Order 40-A) — upstream-owned registration factory.
 *
 * This file is a mechanical extraction of the ACP host registration block that
 * `daemon-cli.js` of Harness Remote v3.0.2 (commit 21ce6db) builds per profile:
 * one `AcpClient` for user-facing sessions, one prompt-less `AcpAgentModelCatalog`
 * connection, the capability contract, and the `AcpService` options. The block was
 * moved here unchanged in behavior so an embedder can construct one profile's
 * registration without adopting the machine/task daemon control plane, which
 * Harness Remote's embedders must not run as a second product authority.
 *
 * The only behavioral addition is forwarding the injected asynchronous
 * `permissionResolver`/`permissionTimeoutMs` (see PATCHES.md) into the user-facing
 * `AcpClient`. The model-catalog connection keeps `permissionMode` semantics
 * because it never prompts.
 */
import path from "node:path"

import { AcpClient } from "./acp-client.js"
import { AcpService } from "./acp-service.js"
import { AcpAgentModelCatalog } from "./agent-model-catalog.js"
import { acpHarnessCapabilityContract } from "./harness-capability-contract.js"
import { resolveAcpLaunch } from "./harness-profiles.js"

export async function createAcpRegistration({
  profile,
  directory = process.cwd(),
  stateDirectory,
  find,
  launch,
  permissionResolver = null,
  permissionTimeoutMs = 0,
  spawnProcess,
  modelCatalogHiddenSessionIDs,
} = {}) {
  const resolvedLaunch = launch ?? resolveAcpLaunch(profile, find ? { find } : {})
  const agentOptions = {
    command: resolvedLaunch.command,
    args: resolvedLaunch.args,
    permissionMode: profile.permissionMode,
    preferredAuthMethod: profile.authMethod,
  }
  if (spawnProcess) agentOptions.spawnProcess = spawnProcess
  const agent = new AcpClient({
    ...agentOptions,
    permissionResolver,
    permissionTimeoutMs,
  })
  const modelCatalog = new AcpAgentModelCatalog({
    agent: new AcpClient(agentOptions),
    agentID: profile.id,
    directory,
    stateDirectory,
    variantConfigIDs: profile.modelVariantConfigIDs,
  })
  await modelCatalog.preloadState()
  const service = new AcpService(agent, {
    snapshotDirectory: path.join(stateDirectory, profile.id),
    historyLoader: profile.historyLoader,
    preserveListedTimestamps: profile.preserveListedTimestamps,
    hiddenSessionIDs: modelCatalogHiddenSessionIDs ?? modelCatalog.hiddenSessionIDs,
    reloadOnHistoryRefresh: profile.reloadOnHistoryRefresh,
    replaySettleMs: profile.replaySettleMs,
    promptSettleMs: profile.promptSettleMs,
    preferListedTitles: profile.preferListedTitles,
    nativeRenameCommand: profile.nativeRenameCommand,
    journalPageWhileOwned: profile.journalPageWhileOwned,
    modelVariantConfigIDs: profile.modelVariantConfigIDs,
  })
  return {
    profile,
    launch: resolvedLaunch,
    agent,
    modelCatalog,
    service,
    capabilities: profile.capabilities,
    contract: acpHarnessCapabilityContract(profile),
  }
}
