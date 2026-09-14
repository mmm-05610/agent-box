/**
 * AgentBox-owned Harness registration glue (Work Order 40 narrow glue).
 *
 * This file only registers profiles and declares parameters, environment, and
 * capabilities. It contains no branded execution branch, no ACP lifecycle, and
 * no native protocol translation: every profile is handed to the upstream-owned
 * factory (`createAcpRegistration`), which owns the mechanics.
 *
 * Upstream Harness Remote v3.0.2 registers `omp`, `pi`, `claude`, and `codex`.
 * Hermes Agent ships its own ACP server (`hermes acp`) but has no upstream
 * entry, so it is registered here — this is exactly the "registration,
 * parameters, environment, capability declaration" glue the reuse boundary
 * allows, and it deliberately avoids patching the upstream registry.
 */
import { HARNESS_PROFILES, harnessProfile } from "../third_party/harness_remote/bridge/src/harness-profiles.js"

const COMMON_ACP_CAPABILITIES = {
  sessions: true,
  prompt: true,
  abort: true,
  streaming: true,
  agents: false,
  diff: false,
  filesystemBrowser: true,
  questions: false,
  permissions: false,
  sessionRename: false,
  sessionDelete: false,
}

/**
 * Capability claims below are limited to what the bounded zero-credential
 * handshake actually advertised (promptCapabilities `image`;
 * sessionCapabilities `fork`/`list`/`resume`). Anything not observed stays
 * false, so an unverified ability is never reported as available.
 */
export const AGENTBOX_HARNESS_PROFILES = {
  hermes: {
    id: "hermes",
    label: "Hermes Agent",
    command: process.platform === "win32" ? "hermes.exe" : "hermes",
    args: ["acp"],
    adapterCommand: process.platform === "win32" ? "hermes.exe" : "hermes",
    // Approval policy is AgentBox-owned: the injected asynchronous permission
    // resolver decides, and an unanswered decision denies. `deny` is the
    // honest default for the prompt-less model-catalog connection too.
    permissionMode: "deny",
    modelVariantConfigIDs: [],
    capabilities: {
      ...COMMON_ACP_CAPABILITIES,
      models: false,
      todos: false,
      commands: false,
      actions: false,
      sessionRename: false,
      sessionDelete: false,
    },
    // Hermes keeps its own session store. No reviewed upstream history loader
    // exists for it, so the transcript is the live ACP stream only; native
    // journal replay is explicitly not claimed.
    historyLoader: undefined,
    journalPageWhileOwned: false,
    reloadOnHistoryRefresh: false,
  },
}

const REGISTERED = { ...HARNESS_PROFILES, ...AGENTBOX_HARNESS_PROFILES }

export function resolveHarnessProfile(id) {
  const profile = REGISTERED[id]
  if (!profile) throw new Error(`HARNESS_PROFILE_UNREGISTERED: ${id}`)
  return profile
}

export function registeredHarnessIDs() {
  return Object.keys(REGISTERED).sort()
}

export function upstreamProfile(id) {
  return harnessProfile(id)
}
