/**
 * Work Order 40-A sidecar envelope gates: the AgentBox glue drives the
 * upstream-owned registration through the NDJSON stdio envelope with a
 * controlled fake peer. Proves pre-terminal streaming, native identity,
 * cancel, envelope errors, isolation refusal, and provenance verification.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, writeFile, chmod, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const entry = path.join(pluginRoot, "runtime", "worker-entry.mjs")
const fakePeer = path.join(pluginRoot, "tests", "harness_remote", "fake_acp_peer.mjs")
const snapshotSource = path.join(pluginRoot, "third_party", "harness_remote", "SOURCE.json")

const ISOLATED_ENV = {
  ...process.env,
  AGENTBOX_SIDECAR_ISOLATED: "1",
  HOME: "", XDG_CONFIG_HOME: "", XDG_CACHE_HOME: "", XDG_DATA_HOME: "",
}

class Sidecar {
  constructor(extraEnv = {}) {
    this.process = spawn(process.execPath, [entry], {
      env: { ...ISOLATED_ENV, ...extraEnv },
      cwd: "/tmp",
      stdio: ["pipe", "pipe", "pipe"],
    })
    this.events = []
    this.waiters = []
    this.buffer = ""
    this.process.stdout.setEncoding("utf8")
    this.process.stdout.on("data", (chunk) => {
      this.buffer += chunk
      let index
      while ((index = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + 1)
        if (!line.trim()) continue
        this.#line(JSON.parse(line))
      }
    })
    this.process.stderr.on("data", (chunk) => this.stderrText = (this.stderrText ?? "") + chunk)
  }

  #line(message) {
    if (message.event) {
      this.events.push(message)
      this.waiters = this.waiters.filter((waiter) => !waiter())
      return
    }
    this.responses.push(message)
    this.waiters = this.waiters.filter((waiter) => !waiter())
  }

  responses = []
  stderrText = ""
  nextID = 1

  request(payload) {
    const id = this.nextID++
    this.process.stdin.write(`${JSON.stringify({ ...payload, id })}\n`)
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
      const waiter = () => {
        const response = this.responses.find((item) => item.id === id)
        if (response) {
          resolve(response)
          return true
        }
        if (Date.now() - startedAt > 10000) {
          reject(new Error(`sidecar timeout for op ${payload.op}`))
          return true
        }
        return false
      }
      this.waiters.push(waiter)
      waiter()
    })
  }

  async waitEvent(kind, timeoutMs = 5000) {
    const startedAt = Date.now()
    for (;;) {
      const match = this.events.find((item) => item.event === kind)
      if (match) return match
      if (Date.now() - startedAt > timeoutMs) throw new Error(`timeout waiting for ${kind}`)
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  close() {
    this.process.kill()
  }
}

test("sidecar refuses to run without the Worker isolation marker", async () => {
  const env = { ...process.env }
  delete env.AGENTBOX_SIDECAR_ISOLATED
  const processRun = spawn(process.execPath, [entry], {
    env, cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"],
  })
  let output = ""
  processRun.stdout.setEncoding("utf8")
  processRun.stdout.on("data", (chunk) => output += chunk)
  await new Promise((resolve) => setTimeout(resolve, 800))
  processRun.kill()
  assert.match(output, /SIDECAR_ISOLATION_REQUIRED/)
})

test("explicit native entry accepts a provenance-only operation without isolation", async () => {
  const env = { ...process.env }
  delete env.AGENTBOX_SIDECAR_ISOLATED
  const processRun = spawn(process.execPath, [entry, "--native"], {
    env, cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"],
  })
  try {
    const response = await new Promise((resolve, reject) => {
      let output = ""
      const timeout = setTimeout(() => reject(new Error("native entry timeout")), 5000)
      processRun.stdout.setEncoding("utf8")
      processRun.stdout.on("data", (chunk) => {
        output += chunk
        if (output.includes("\n")) {
          clearTimeout(timeout)
          resolve(JSON.parse(output.slice(0, output.indexOf("\n"))))
        }
      })
      processRun.stdin.write(`${JSON.stringify({ id: 1, op: "profiles" })}\n`)
    })
    assert.equal(response.ok, true, JSON.stringify(response))
    assert.equal(response.result.provenance.commit, JSON.parse(await readFile(snapshotSource, "utf8")).commit)
  } finally {
    processRun.kill()
  }
})

test("native entry rejects an isolation marker and unknown execution flags", async () => {
  for (const [args, environment, code] of [
    [["--native"], { ...ISOLATED_ENV }, "SIDECAR_MODE_CONFLICT"],
    [["--unsupported"], { ...ISOLATED_ENV }, "SIDECAR_MODE_INVALID"],
  ]) {
    const processRun = spawn(process.execPath, [entry, ...args], {
      env: environment, cwd: "/tmp", stdio: ["ignore", "pipe", "pipe"],
    })
    let output = ""
    processRun.stdout.setEncoding("utf8")
    processRun.stdout.on("data", (chunk) => output += chunk)
    await new Promise((resolve) => processRun.on("close", resolve))
    assert.match(output, new RegExp(code))
  }
})

test("provenance verification rejects a tampered snapshot", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agentbox-sidecar-tamper-"))
  try {
    const { cp, mkdir } = await import("node:fs/promises")
    await mkdir(root, { recursive: true })
    await cp(path.join(pluginRoot, "runtime"), path.join(root, "runtime"), { recursive: true })
    await cp(path.join(pluginRoot, "third_party"), path.join(root, "third_party"), { recursive: true })
    const victim = path.join(root, "third_party", "harness_remote", "bridge", "src", "bounded-lru.js")
    await writeFile(victim, (await readFile(victim, "utf8")) + "\n// tampered\n")
    const processRun = spawn(process.execPath, [path.join(root, "runtime", "worker-entry.mjs")], {
      env: { ...ISOLATED_ENV }, cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"],
    })
    let output = ""
    processRun.stdout.setEncoding("utf8")
    processRun.stdout.on("data", (chunk) => output += chunk)
    await new Promise((resolve) => { processRun.stdout.on("data", (c) => { output += c }); setTimeout(resolve, 1500) })
    processRun.kill()
    assert.match(output, /PROVENANCE_MISMATCH/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("envelope drives register/start/create/prompt with pre-terminal events", async () => {
  const sidecar = new Sidecar()
  try {
    const registered = await sidecar.request({
      op: "register", profile: "codex",
      launch: { command: process.execPath, args: [fakePeer] },
      directory: "/controlled",
      stateDirectory: await mkdtemp(path.join(tmpdir(), "agentbox-sidecar-state-")),
      permissionRoundTrip: true, permissionTimeoutMs: 1000,
    })
    assert.equal(registered.ok, true, JSON.stringify(registered))
    assert.equal(registered.result.profile, "codex")
    assert.equal(registered.result.provenance.commit, JSON.parse(await readFile(snapshotSource, "utf8")).commit)

    const started = await sidecar.request({ op: "start" })
    assert.equal(started.ok, true, JSON.stringify(started))
    assert.equal(started.result.agentInfo.name, "controlled-peer")

    const created = await sidecar.request({ op: "create", title: "gate" })
    assert.equal(created.ok, true)
    const sessionId = created.result.sessionId
    assert.match(sessionId, /^fake-native-/)

    const prompt = sidecar.request({ op: "prompt", sessionId, text: "hello" })
    const chunk = await sidecar.waitEvent("acp_notification")
    assert.equal(chunk.data.params.update.sessionUpdate, "agent_message_chunk")
    const done = await prompt
    assert.equal(done.ok, true)

    // Second turn keeps the exact native identity through the same service.
    const reopened = await sidecar.request({ op: "open", sessionId })
    assert.equal(reopened.ok, true)
    assert.equal(reopened.result.claimed, true)
  } finally {
    sidecar.close()
  }
})

test("envelope rejects unknown ops and double registration with typed errors", async () => {
  const sidecar = new Sidecar()
  try {
    const unknown = await sidecar.request({ op: "teleport" })
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, "NOT_REGISTERED")

    const first = await sidecar.request({
      op: "register", profile: "codex",
      launch: { command: process.execPath, args: [fakePeer] },
      stateDirectory: await mkdtemp(path.join(tmpdir(), "agentbox-sidecar-state-")),
    })
    assert.equal(first.ok, true)
    const second = await sidecar.request({
      op: "register", profile: "pi",
      launch: { command: process.execPath, args: [fakePeer] },
      stateDirectory: await mkdtemp(path.join(tmpdir(), "agentbox-sidecar-state-")),
    })
    assert.equal(second.ok, false)
    assert.equal(second.error.code, "ALREADY_REGISTERED")

    const bogus = await sidecar.request({ op: "teleport" })
    assert.equal(bogus.error.code, "UNKNOWN_OP")
  } finally {
    sidecar.close()
  }
})
