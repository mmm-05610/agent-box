import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.env.HARNESS_REMOTE_CHECKOUT
  ?? "/tmp/agentbox-harness-selection-38.otEluD/checkouts/harness-remote"
const researchRoot = process.env.AGENTBOX_RESEARCH_ROOT
  ?? "/tmp/agentbox-harness-selection-38.otEluD"
const { AcpClient } = await import(`file://${root}/bridge/src/acp-client.js`)
const { AcpService } = await import(`file://${root}/bridge/src/acp-service.js`)
const { ManagedOpenCodeHost, waitForOpenCodeHealth } = await import(`file://${root}/bridge/src/opencode-host.js`)
const { createOmpUndoRedoActionStateLoader } = await import(`file://${root}/bridge/src/omp-extension-action-state.js`)

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
  const tempRoot = path.join(researchRoot, "homes", "experiment-tmp")
  await mkdir(tempRoot, { recursive: true })
  const dir = await mkdtemp(path.join(tempRoot, "harness-remote-stage-b-"))
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
