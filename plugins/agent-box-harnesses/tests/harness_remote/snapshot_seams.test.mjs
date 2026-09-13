/**
 * Work Order 40-A fake-seam gates for the vendored harness-remote snapshot.
 *
 * Adapted from the Work Order 38 behavior experiment
 * (docs/server-round1/harness-selection/experiments/harness_remote_stage_b.test.mjs)
 * to import from plugins/agent-box-harnesses/third_party/harness_remote, plus
 * new permission-resolver patch gates. All peers are fakes; no real Harness,
 * credential, or model is touched.
 */
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const snapshot = process.env.HARNESS_REMOTE_SNAPSHOT
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "third_party", "harness_remote")
const src = (...parts) => path.join(snapshot, "bridge", "src", ...parts)
const { AcpClient } = await import(`file://${src("acp-client.js")}`)
const { AcpService } = await import(`file://${src("acp-service.js")}`)
const { ManagedOpenCodeHost, waitForOpenCodeHealth } = await import(`file://${src("opencode-host.js")}`)
const { createOmpUndoRedoActionStateLoader } = await import(`file://${src("omp-extension-action-state.js")}`)
const { createAcpRegistration } = await import(`file://${src("acp-registration.js")}`)
const { HARNESS_PROFILES } = await import(`file://${src("harness-profiles.js")}`)

class Child extends EventEmitter {
  constructor(handler) {
    super()
    this.pid = 4811
    this.killed = false
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.stdout.setEncoding = () => undefined
    this.stderr.setEncoding = () => undefined
    this.stdin = { writable: true, write: (line, cb) => {
      const request = JSON.parse(line)
      handler(this, request)
      cb?.()
      return true
    } }
  }
  respond(message) { this.stdout.emit("data", `${JSON.stringify(message)}\n`) }
  kill() { this.killed = true; this.stdin.writable = false; return true }
}

function handshake(child, request, capabilities = {}) {
  if (request.method === "initialize") child.respond({ jsonrpc: "2.0", id: request.id, result: {
    agentInfo: { name: "controlled-harness", version: "test" },
    agentCapabilities: capabilities,
    authMethods: []
  } })
}

test("ACP delivers a live event before the prompt reaches its terminal response", async () => {
  const order = []
  const client = new AcpClient({ spawnProcess: () => new Child((child, request) => {
    handshake(child, request)
    if (request.method === "session/prompt") {
      order.push("request")
      child.respond({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: request.params.sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "stream" } }
      } })
      order.push("event")
      child.respond({ jsonrpc: "2.0", id: request.id, result: {} })
      order.push("response")
    }
  }) })
  const events = []
  client.on("notification", () => events.push("notification"))
  await client.start()
  await client.request("session/prompt", { sessionId: "native-1", prompt: [{ type: "text", text: "safe" }] })
  assert.deepEqual(order, ["request", "event", "response"])
  assert.deepEqual(events, ["notification"])
  client.close()
})

test("AcpService preserves native Session identity and chooses advertised resume", async () => {
  const calls = []
  const acp = new EventEmitter()
  acp.sessionCapabilities = { resume: true }
  acp.promptCapabilities = {}
  acp.start = async () => {}
  acp.listSessions = async () => [{ sessionId: "native-identity", cwd: "/controlled" }]
  acp.request = async (method, params) => {
    calls.push([method, params])
    return { configOptions: [{ id: "model", currentValue: "m", options: [{ value: "m" }] }] }
  }
  acp.notify = () => {}
  const service = new AcpService(acp, {
    historyLoader: async () => [],
    journalPageWhileOwned: false
  })
  assert.equal(await service.claimSession("native-identity"), true)
  assert.deepEqual(calls[0], ["session/resume", { sessionId: "native-identity", cwd: "/controlled", mcpServers: [] }])
  assert.equal(service.ownedSessionIndex()[0].session.id, "native-identity")
})

test("native cancel is a protocol notification; child disconnect rejects pending work", async () => {
  let child
  const client = new AcpClient({ spawnProcess: () => {
    child = new Child((current, request) => handshake(current, request))
    return child
  } })
  await client.start()
  const pending = client.request("session/prompt", { sessionId: "s", prompt: [] })
  child.emit("exit", 1, null)
  await assert.rejects(pending, /ACP adapter exited/)
  assert.equal(client.processID, undefined)

  const notifications = []
  const serviceAcp = new EventEmitter()
  serviceAcp.promptCapabilities = {}
  serviceAcp.start = async () => {}
  serviceAcp.listSessions = async () => [{ sessionId: "s", cwd: "/controlled" }]
  serviceAcp.request = async () => ({ configOptions: [] })
  serviceAcp.notify = (...args) => notifications.push(args)
  const service = new AcpService(serviceAcp)
  await service.claimSession("s")
  service.abort("s")
  assert.deepEqual(notifications.at(-1), ["session/cancel", { sessionId: "s" }])
  client.close()
})

test("OpenCode keeps its authenticated health path and managed Windows process boundary", async () => {
  const requests = []
  await waitForOpenCodeHealth({ host: "127.0.0.1", port: 4096, username: "u", password: "p", timeoutMs: 20,
    fetchImpl: async (url, options) => { requests.push([url, options.headers.Authorization]); return { status: 200 } } })
  assert.deepEqual(requests, [["http://127.0.0.1:4096/global/health", `Basic ${Buffer.from("u:p").toString("base64")}`]])
  const child = new Child(() => {})
  let readiness
  const host = new ManagedOpenCodeHost({ command: "opencode.cmd", platform: "win32", environment: { ComSpec: "cmd.exe" },
    spawnProcess: (command, args, options) => { readiness = { command, args, options }; return child },
    waitUntilReady: async () => {} })
  await host.start()
  assert.deepEqual(readiness.command, "cmd.exe")
  assert.deepEqual(readiness.args, ["/d", "/s", "/c", "opencode.cmd", "serve", "--hostname", "127.0.0.1", "--port", "4096"])
  host.stop()
  assert.equal(child.killed, true)
})

test("OMP undo/redo state is accepted only with native session hash and process identity", async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const dir = await mkdtemp(path.join(tmpdir(), "agentbox-hr-omp-"))
  try {
    const sessionID = "omp-native"
    const { createHash } = await import("node:crypto")
    const hash = createHash("sha256").update(sessionID).digest("hex")
    const stateDir = path.join(dir, "42", "sessions")
    await mkdir(stateDir, { recursive: true })
    await writeFile(path.join(dir, "42", "runtime.json"), JSON.stringify({ schemaVersion: 1, protocol: "omp-undo-redo/runtime", pid: 42, runtimeId: "r" }))
    await writeFile(path.join(stateDir, `${hash}.json`), JSON.stringify({ schemaVersion: 2, protocol: "omp-undo-redo/action-state", sessionHash: hash, pid: 42, runtimeId: "r", actions: [{ id: "undo", enabled: true }, { id: "redo", enabled: false }], sessionRevision: "rev", activeSessionLeaf: "leaf" }))
    const load = createOmpUndoRedoActionStateLoader({ runtimeRoot: dir, runGit: async () => { throw new Error("not git") } })
    assert.equal((await load({ sessionID, directory: dir, processID: 42 })).actions[0].enabled, true)
    assert.equal(await load({ sessionID, directory: dir, processID: 99 }), undefined)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("unknown model variant is rejected before it reaches the native Harness", async () => {
  const calls = []
  const acp = new EventEmitter()
  acp.promptCapabilities = {}
  acp.start = async () => {}
  acp.listSessions = async () => [{ sessionId: "s", cwd: "/controlled" }]
  acp.request = async (method, params) => { calls.push([method, params]); return { configOptions: [{ id: "model", currentValue: "m", options: [{ value: "m" }] }, { id: "thinking", options: [{ value: "low" }] }] } }
  acp.notify = () => {}
  const service = new AcpService(acp)
  await assert.rejects(service.setModel("s", "m", { configId: "thinking", value: "unknown" }), /variant is not available/)
  assert.equal(calls.some(([method]) => method === "session/set_config_option"), false)
})

// --- Work Order 40-A: the asynchronous permission-resolver patch -------------

// Permission flow fake: the adapter child answers `session/prompt` by first
// sending a `session/request_permission` REQUEST upstream; the client's answer
// (same id, result.outcome) releases the prompt result.
function permissionChild(options, { onPermissionAnswer } = {}) {
  let promptRequestID
  return new Child((child, message) => {
    handshake(child, message)
    if (message.method === "session/prompt") {
      promptRequestID = message.id
      child.respond({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: {
        sessionId: "s", options,
      } })
    }
    if (message.id === 900 && message.result !== undefined) {
      onPermissionAnswer?.(message.result)
      child.respond({ jsonrpc: "2.0", id: promptRequestID, result: {} })
    }
  })
}

const PERM_OPTIONS = [
  { kind: "allow_once", optionId: "grant" },
  { kind: "reject_once", optionId: "deny" },
]

test("permission resolver grant selects the requested option id", async () => {
  const answers = []
  let upstreamOutcome
  const client = new AcpClient({
    permissionMode: "deny",
    permissionResolver: async ({ options }) => options.find((option) => option.kind === "allow_once")?.optionId,
    spawnProcess: () => permissionChild(PERM_OPTIONS, {
      onPermissionAnswer: (result) => { upstreamOutcome = result },
    }),
  })
  client.on("permission", (detail) => answers.push(detail))
  await client.start()
  await client.request("session/prompt", { sessionId: "s", prompt: [] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  client.close()
  assert.deepEqual(answers, [{ optionId: "grant" }])
  assert.deepEqual(upstreamOutcome, { outcome: { outcome: "selected", optionId: "grant" } })
})

test("permission resolver deny (undefined) answers cancelled, static allow never fires", async () => {
  let upstreamOutcome
  const client = new AcpClient({
    permissionMode: "deny",
    permissionResolver: async () => undefined,
    spawnProcess: () => permissionChild(PERM_OPTIONS, {
      onPermissionAnswer: (result) => { upstreamOutcome = result },
    }),
  })
  await client.start()
  await client.request("session/prompt", { sessionId: "s", prompt: [] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  client.close()
  assert.deepEqual(upstreamOutcome, { outcome: { outcome: "cancelled" } })
})

test("without a resolver the upstream static deny still answers cancelled", async () => {
  let upstreamOutcome
  const client = new AcpClient({
    permissionMode: "deny",
    spawnProcess: () => permissionChild(PERM_OPTIONS, {
      onPermissionAnswer: (result) => { upstreamOutcome = result },
    }),
  })
  await client.start()
  await client.request("session/prompt", { sessionId: "s", prompt: [] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  client.close()
  assert.deepEqual(upstreamOutcome, { outcome: { outcome: "cancelled" } })
})

test("permission timeout defaults to deny", async () => {
  let upstreamOutcome
  const client = new AcpClient({
    permissionMode: "deny",
    permissionResolver: () => new Promise(() => {}), // never answers
    permissionTimeoutMs: 30,
    spawnProcess: () => permissionChild(PERM_OPTIONS, {
      onPermissionAnswer: (result) => { upstreamOutcome = result },
    }),
  })
  await client.start()
  await client.request("session/prompt", { sessionId: "s", prompt: [] })
  await new Promise((resolve) => setTimeout(resolve, 80))
  client.close()
  assert.deepEqual(upstreamOutcome, { outcome: { outcome: "cancelled" } })
})

test("resolver answering an optionId outside options denies", async () => {
  let upstreamOutcome
  const client = new AcpClient({
    permissionMode: "deny",
    permissionResolver: async () => "fabricated-option",
    spawnProcess: () => permissionChild(PERM_OPTIONS, {
      onPermissionAnswer: (result) => { upstreamOutcome = result },
    }),
  })
  await client.start()
  await client.request("session/prompt", { sessionId: "s", prompt: [] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  client.close()
  assert.deepEqual(upstreamOutcome, { outcome: { outcome: "cancelled" } })
})

test("registration factory builds one profile without the daemon control plane", async () => {
  const registration = await createAcpRegistration({
    profile: HARNESS_PROFILES.codex,
    directory: "/controlled",
    stateDirectory: "/controlled/.state",
    launch: { command: "/runtime/bin/codex-acp", args: [] },
    permissionResolver: async () => undefined,
    permissionTimeoutMs: 1000,
    spawnProcess: () => permissionChild(PERM_OPTIONS),
  })
  assert.equal(registration.profile.id, "codex")
  assert.equal(registration.launch.command, "/runtime/bin/codex-acp")
  assert.deepEqual(registration.launch.args, [])
  assert.equal(typeof registration.contract, "object")
  registration.agent.close()
  registration.modelCatalog.close?.()
})
