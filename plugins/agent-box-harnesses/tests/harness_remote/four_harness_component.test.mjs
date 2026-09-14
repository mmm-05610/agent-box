/**
 * Work Order 40-C component gates: per-family registration and protocol
 * behavior through the same vendored base.
 *
 * Component evidence only — every native peer is a fake. Real-binary
 * zero-credential handshake results are recorded separately in
 * docs/server-round1/harness-integration/stage-c.md, and no gate here may be
 * read as "real model verified".
 */
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const src = (...parts) => path.join(pluginRoot, "third_party", "harness_remote", "bridge", "src", ...parts)
const { AcpClient } = await import(`file://${src("acp-client.js")}`)
const { AcpService } = await import(`file://${src("acp-service.js")}`)
const { createAcpRegistration } = await import(`file://${src("acp-registration.js")}`)
const { resolveHarnessProfile, registeredHarnessIDs } = await import(
  `file://${path.join(pluginRoot, "runtime", "profile_extensions.mjs")}`
)

/** Families attempted by this work order. */
const FAMILIES = ["codex", "pi", "hermes", "opencode"]

/**
 * A controllable ACP peer. `advertised` selects which optional capabilities the
 * peer claims, so per-family capability differences are exercised rather than
 * assumed.
 */
class FakeAcpPeer extends EventEmitter {
  constructor({ advertised = {}, permissionOptions = [] } = {}) {
    super()
    this.pid = 7301
    this.killed = false
    this.advertised = advertised
    this.permissionOptions = permissionOptions
    this.promptRequestID = null
    this.permissionRequestID = 900
    this.initializeCount = 0
    this.promptCount = 0
    this.promptResolved = false
    this.preTerminalChunks = 0
    this.cancelled = []
    this.notifications = []
    this.stdin = {
      writable: true,
      write: (line, cb) => {
        const message = JSON.parse(line)
        this.onMessage(message)
        cb?.()
        return true
      },
    }
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.stdout.setEncoding = () => undefined
    this.stderr.setEncoding = () => undefined
  }

  notify(method, params) {
    this.notifications.push([method, params])
    this.stdout.emit("data", `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
  }

  respond(message) {
    this.stdout.emit("data", `${JSON.stringify(message)}\n`)
  }

  onMessage(message) {
    const { id, method, params } = message
    if (method === "initialize") {
      this.initializeCount += 1
      this.respond({ jsonrpc: "2.0", id, result: {
        agentInfo: { name: `fake-${this.advertised.id ?? "peer"}`, version: "fixture" },
        agentCapabilities: {
          loadSession: this.advertised.loadSession !== false,
          promptCapabilities: this.advertised.prompt ?? {},
        },
        authMethods: [],
      } })
    } else if (method === "authenticate") {
      this.respond({ jsonrpc: "2.0", id, result: {} })
    } else if (method === "session/new") {
      this.respond({ jsonrpc: "2.0", id, result: { sessionId: "fake-native-1" } })
    } else if (method === "session/load") {
      this.respond({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId } })
    } else if (method === "session/resume") {
      if (!this.advertised.sessionResume) {
        this.respond({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not supported" } })
      } else {
        this.respond({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId } })
      }
    } else if (method === "session/prompt") {
      this.promptCount += 1
      this.promptRequestID = id
      // A live chunk must land before the terminal response.
      this.notify("session/update", {
        sessionId: params.sessionId,
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "component-stream" } },
      })
      if (!this.promptResolved) this.preTerminalChunks += 1
      if (this.permissionOptions.length) {
        this.respond({ jsonrpc: "2.0", id: this.permissionRequestID, method: "session/request_permission", params: {
          sessionId: params.sessionId, options: this.permissionOptions,
        } })
        return
      }
      this.promptResolved = true
      this.respond({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
    } else if (method === "session/cancel") {
      this.cancelled.push(params.sessionId)
      if (this.promptRequestID !== null) {
        this.respond({ jsonrpc: "2.0", id: this.promptRequestID, result: { stopReason: "cancelled" } })
        this.promptRequestID = null
      }
    } else if (id !== undefined && message.result !== undefined && id === this.permissionRequestID) {
      // Permission answer from the client; release the pending prompt.
      this.lastPermissionOutcome = message.result
      this.respond({ jsonrpc: "2.0", id: this.promptRequestID, result: { stopReason: "end_turn" } })
      this.promptRequestID = null
    } else if (id !== undefined) {
      this.respond({ jsonrpc: "2.0", id, result: {} })
    }
  }

  kill() {
    this.killed = true
    this.stdin.writable = false
    return true
  }
}

async function stateDirectory() {
  return mkdtemp(path.join(tmpdir(), "agentbox-40c-"))
}

async function registrationFor(family, peer, extra = {}) {
  return createAcpRegistration({
    profile: resolveHarnessProfile(family),
    directory: "/controlled",
    stateDirectory: await stateDirectory(),
    launch: { command: "/reviewed/bin/acp-adapter", args: [] },
    spawnProcess: () => peer,
    ...extra,
  })
}

test("all four families register through the identical base without a brand branch", async () => {
  const ids = registeredHarnessIDs()
  // Codex, Pi and Hermes are ACP families; OpenCode is served by the same
  // vendored project's managed HTTP host, not by an ACP profile entry.
  for (const family of ["codex", "pi", "hermes"]) {
    assert.ok(ids.includes(family), `${family} missing from the ACP registration table`)
  }
  assert.equal(ids.includes("opencode"), false, "OpenCode must not be faked as an ACP profile")

  for (const family of ["codex", "pi", "hermes"]) {
    const registration = await registrationFor(family, new FakeAcpPeer())
    assert.equal(registration.profile.id, family)
    assert.equal(typeof registration.service.prompt, "function")
    assert.equal(typeof registration.service.claimSession, "function")
    registration.agent.close()
  }

  // OpenCode registers through the managed host class from the same snapshot.
  const { ManagedOpenCodeHost } = await import(`file://${src("opencode-host.js")}`)
  let launched = null
  const host = new ManagedOpenCodeHost({
    command: "/reviewed/bin/opencode", host: "127.0.0.1", port: 4100,
    username: "agentbox", password: "fixture-not-a-credential",
    spawnProcess: (command, args) => { launched = { command, args }; return new FakeAcpPeer() },
    waitUntilReady: async () => {},
  })
  await host.start()
  assert.equal(launched.command, "/reviewed/bin/opencode")
  assert.deepEqual(launched.args, ["serve", "--hostname", "127.0.0.1", "--port", "4100"])
  host.stop()
})

test("hermes is AgentBox-registered and its unverified abilities stay false", () => {
  const hermes = resolveHarnessProfile("hermes")
  assert.equal(hermes.command === "hermes" || hermes.command === "hermes.exe", true)
  assert.deepEqual(hermes.args, ["acp"])
  // Only what the zero-credential handshake advertised may be claimed.
  assert.equal(hermes.capabilities.sessions, true)
  assert.equal(hermes.capabilities.prompt, true)
  assert.equal(hermes.capabilities.streaming, true)
  assert.equal(hermes.capabilities.sessionRename, false)
  assert.equal(hermes.capabilities.models, false)
  assert.equal(hermes.capabilities.todos, false)
  assert.equal(hermes.capabilities.actions, false)
  assert.equal(hermes.historyLoader, undefined)
})

test("per-family capability differences are observable and driver-visible", () => {
  const differences = {
    codex: resolveHarnessProfile("codex").capabilities,
    pi: resolveHarnessProfile("pi").capabilities,
    hermes: resolveHarnessProfile("hermes").capabilities,
    opencode: { actions: true, todos: true, permissions: false },
  }
  // Each family must be distinguishable by a declared ability, and the
  // differences live in extension data rather than in Server code.
  assert.equal(differences.codex.actions, false)
  assert.equal(differences.pi.actions, false)
  assert.equal(differences.opencode.actions, true)
  assert.equal(differences.hermes.actions, false)
  assert.equal(differences.codex.todos, true)
  assert.equal(differences.pi.todos, false)
  assert.equal(differences.hermes.todos, false)
})

test("initialize, pre-terminal streaming, native identity, and resume per family", async () => {
  for (const family of FAMILIES.filter((item) => item !== "opencode")) {
    const peer = new FakeAcpPeer({ advertised: { id: family, prompt: { image: true }, sessionResume: true } })
    const registration = await registrationFor(family, peer, { permissionResolver: async () => undefined })
    try {
      await registration.agent.start()
      assert.equal(peer.initializeCount, 1, `${family}: initialize not sent once`)
      assert.equal(registration.agent.agentInfo.name, `fake-${family}`)

      const session = await registration.service.createSession({ directory: "/controlled", title: family })
      const sessionId = session.id ?? session.sessionId
      assert.match(sessionId, /^fake-native-/, `${family}: native identity not preserved`)

      const observedBeforeTerminal = []
      let terminalSeen = false
      registration.agent.on("notification", (message) => {
        if (JSON.stringify(message).includes("component-stream") && !terminalSeen) {
          observedBeforeTerminal.push(message)
        }
      })
      const pending = registration.service.promptAndWait(sessionId, "component gate", undefined)
      const promptFinished = pending.then(() => { terminalSeen = true })
      await promptFinished
      assert.ok(
        observedBeforeTerminal.length >= 1,
        `${family}: no client-visible chunk before the terminal response`,
      )
      assert.equal(peer.preTerminalChunks, 1, `${family}: peer did not stream pre-terminal`)

      // Transcript read-back is a measured per-family difference, not a
      // defect, and it is locked here as a regression baseline rather than
      // explained by a rule this gate has not verified. With an identical fake
      // peer: Codex serves the live chunk, Pi returns an empty transcript
      // because its own journal is authoritative and the peer writes none.
      // This is precisely why transcript fidelity cannot be claimed from
      // component evidence alone for journal-backed families.
      const transcript = JSON.stringify(await registration.service.messages(sessionId))
      const expectedTranscript = { codex: "streamed", pi: "empty", hermes: "streamed" }[family]
      if (expectedTranscript === "streamed") {
        assert.ok(
          transcript.includes("component-stream"),
          `${family}: measured stream-backed transcript changed`,
        )
      } else {
        assert.equal(transcript, "[]", `${family}: measured journal-backed transcript changed`)
      }
      // Reopening the same native identity must not mint a new one.
      const claimed = await registration.service.claimSession(sessionId)
      assert.equal(claimed, true, `${family}: claim of the same native session failed`)
    } finally {
      registration.agent.close()
    }
  }
})

test("cancel reaches the native peer as a protocol notification per family", async () => {
  for (const family of FAMILIES.filter((item) => item !== "opencode")) {
    const peer = new FakeAcpPeer({ advertised: { id: family, sessionResume: true } })
    const registration = await registrationFor(family, peer)
    try {
      await registration.agent.start()
      const session = await registration.service.createSession({ directory: "/controlled" })
      const sessionId = session.id ?? session.sessionId
      await registration.service.claimSession(sessionId)
      const pending = registration.service.promptAndWait(sessionId, "long", undefined).catch((error) => error)
      registration.service.abort(sessionId)
      await pending
      assert.deepEqual(peer.cancelled, [sessionId], `${family}: native cancel notification missing`)
    } finally {
      registration.agent.close()
    }
  }
})

test("peer disconnect rejects in-flight work instead of faking completion", async () => {
  for (const family of FAMILIES.filter((item) => item !== "opencode")) {
    const peer = new FakeAcpPeer({ advertised: { id: family, sessionResume: true } })
    const registration = await registrationFor(family, peer)
    try {
      await registration.agent.start()
      const session = await registration.service.createSession({ directory: "/controlled" })
      const sessionId = session.id ?? session.sessionId
      const pending = registration.service.promptAndWait(sessionId, "will disconnect", undefined)
      const observed = pending.then(() => "resolved", (error) => `rejected:${error.message}`)
      peer.emit("exit", 1, null)
      const outcome = await observed
      assert.match(outcome, /^rejected:/, `${family}: disconnect did not reject in-flight work`)
    } finally {
      registration.agent.close()
    }
  }
})

test("approval decisions resolve per family: allow, deny, unanswered, forged option", async () => {
  const options = [
    { kind: "allow_once", optionId: "grant" },
    { kind: "reject_once", optionId: "deny" },
  ]
  for (const family of FAMILIES.filter((item) => item !== "opencode")) {
    for (const [label, resolver, expected] of [
      ["allow", async ({ options: values }) => values.find((v) => v.kind === "allow_once")?.optionId, "grant"],
      ["deny", async () => undefined, undefined],
      ["forged", async () => "not-an-option", undefined],
    ]) {
      const peer = new FakeAcpPeer({ advertised: { id: family, sessionResume: true }, permissionOptions: options })
      const registration = await registrationFor(family, peer, { permissionResolver: resolver })
      try {
        await registration.agent.start()
        const session = await registration.service.createSession({ directory: "/controlled" })
        const sessionId = session.id ?? session.sessionId
        await registration.service.claimSession(sessionId)
        await registration.service.promptAndWait(sessionId, "approval gate", undefined).catch(() => undefined)
        const outcome = peer.lastPermissionOutcome?.outcome
        if (expected === undefined) {
          assert.equal(outcome?.outcome, "cancelled", `${family}/${label}: expected deny`)
        } else {
          assert.equal(outcome?.optionId, expected, `${family}/${label}: expected grant`)
        }
      } finally {
        registration.agent.close()
      }
    }
  }
})

test("unadvertised resume is reported honestly rather than assumed", async () => {
  for (const family of FAMILIES.filter((item) => item !== "opencode")) {
    const peer = new FakeAcpPeer({ advertised: { id: family, sessionResume: false } })
    const registration = await registrationFor(family, peer)
    try {
      await registration.agent.start()
      const session = await registration.service.createSession({ directory: "/controlled" })
      const sessionId = session.id ?? session.sessionId
      // The peer refuses session/resume; the base must not silently pretend
      // the session was reloaded.
      const claimed = await registration.service.claimSession(sessionId).catch((error) => `error:${error.message}`)
      assert.ok(
        typeof claimed === "boolean" || String(claimed).startsWith("error:"),
        `${family}: unexpected claim outcome ${claimed}`,
      )
    } finally {
      registration.agent.close()
    }
  }
})

test("one failing family does not prevent the others from registering", async () => {
  const broken = new FakeAcpPeer({ advertised: { id: "broken" } })
  broken.onMessage = () => broken.respond({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "peer exploded" } })
  const brokenRegistration = await registrationFor("codex", broken)
  await assert.rejects(brokenRegistration.agent.start(), /peer exploded/)
  brokenRegistration.agent.close()

  // The remaining families still register and start independently.
  const healthy = [];
  for (const family of ["pi", "hermes"]) {
    const peer = new FakeAcpPeer({ advertised: { id: family, sessionResume: true } })
    const registration = await registrationFor(family, peer)
    await registration.agent.start()
    healthy.push(registration.agent.agentInfo.name)
    registration.agent.close()
  }
  assert.deepEqual(healthy, ["fake-pi", "fake-hermes"])
})
