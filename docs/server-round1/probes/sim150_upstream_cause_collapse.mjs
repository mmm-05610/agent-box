/**
 * Work Order 150 stage 1 (observation, re-runnable, 0 real model calls, 0
 * credential content): how many *different* upstream failures does the product
 * actually get told about?
 *
 * Drives the real `runtime/worker-entry.mjs` through several genuinely different
 * upstream faults and prints, for each: the `code` the Worker puts on the wire,
 * the bounded `message` it puts beside it, and what survives to the server-side
 * product state once `_safe_code` has taken the code alone.
 *
 *   node docs/server-round1/probes/sim150_upstream_cause_collapse.mjs
 */
import { spawn } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const entry = path.join(repo, "plugins", "agent-box-harnesses", "runtime", "worker-entry.mjs")
const fakePeer = path.join(repo, "plugins", "agent-box-harnesses", "tests",
  "harness_remote", "fake_acp_peer.mjs")

class Sidecar {
  constructor() {
    this.process = spawn(process.execPath, [entry], {
      env: { ...process.env, AGENTBOX_SIDECAR_ISOLATED: "1",
        HOME: "", XDG_CONFIG_HOME: "", XDG_CACHE_HOME: "", XDG_DATA_HOME: "" },
      cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"],
    })
    this.responses = []
    this.waiters = []
    this.buffer = ""
    this.nextID = 1
    this.process.stdout.setEncoding("utf8")
    this.process.stdout.on("data", (chunk) => {
      this.buffer += chunk
      let index
      while ((index = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, index)
        this.buffer = this.buffer.slice(index + 1)
        if (!line.trim()) continue
        const message = JSON.parse(line)
        if (!message.event) this.responses.push(message)
        this.waiters = this.waiters.filter((waiter) => !waiter())
      }
    })
  }

  request(payload, timeoutMs = 8000) {
    const id = this.nextID++
    this.process.stdin.write(`${JSON.stringify({ ...payload, id })}\n`)
    const startedAt = Date.now()
    return new Promise((resolve) => {
      const waiter = () => {
        const found = this.responses.find((item) => item.id === id)
        if (found) { resolve(found); return true }
        if (Date.now() - startedAt > timeoutMs) {
          resolve({ ok: false, error: { code: "<NO ANSWER IN 8s>", message: "" } })
          return true
        }
        return false
      }
      this.waiters.push(waiter)
      if (waiter()) return
      // The Worker may simply never answer (a peer that is not an ACP service
      // leaves the request outstanding), and waiters are otherwise only woken
      // by incoming lines - so poll on a timer as well.
      const timer = setInterval(() => {
        if (waiter()) clearInterval(timer)
      }, 100)
    })
  }

  close() { this.process.kill() }
}

const causes = [
  ["adapter 起不来：launch.command 不存在（spawn ENOENT）", async (sidecar, state) => [await sidecar.request({
    op: "register", profile: "codex", directory: "/controlled", stateDirectory: state,
    launch: { command: "/nonexistent/harness-binary-that-is-not-installed", args: [] },
  }), await sidecar.request({ op: "start" })]],
  ["adapter 起来了但不是 ACP 服务（握手无应答）", async (sidecar, state) => [await sidecar.request({
    op: "register", profile: "codex", directory: "/controlled", stateDirectory: state,
    launch: { command: "/bin/true", args: [] },
  }), await sidecar.request({ op: "start" })]],
  ["会话不存在（harness 侧拒绝这一轮）", async (sidecar, state) => {
    const registered = await sidecar.request({
      op: "register", profile: "codex", directory: "/controlled", stateDirectory: state,
      launch: { command: process.execPath, args: [fakePeer] },
    })
    return [registered, await sidecar.request({ op: "start" }), await sidecar.request({
      op: "prompt", sessionId: "no-such-native-session", text: "x",
    })]
  }],
  ["受控对照：已类型化的拒绝（未知 op）", async (sidecar, state) => [await sidecar.request({
    op: "teleport", sessionId: "x",
  })]],
]

const rows = []
for (const [cause, run] of causes) {
  const state = await mkdtemp(path.join(tmpdir(), "agentbox-150-cause-"))
  const sidecar = new Sidecar()
  try {
    const answers = await run(sidecar, state)
    const failed = answers.filter((answer) => answer && answer.ok === false)
    const last = failed.at(-1) ?? null
    rows.push({
      cause,
      code: last ? last.error.code : "<no failure produced>",
      messageBounded: last ? String(last.error.message ?? "").slice(0, 90) : "",
    })
  } finally {
    sidecar.close()
    await rm(state, { recursive: true, force: true })
  }
}

console.log("\n| 上游故障（各不相同） | Worker 发出的 code | message（有界，服务端落账时被丢掉） |")
console.log("| --- | --- | --- |")
for (const row of rows) {
  console.log(`| ${row.cause} | \`${row.code}\` | ${row.messageBounded.replace(/\|/g, "/") || "(空)"} |`)
}
const observed = rows.filter((row) => !row.cause.startsWith("受控对照"))
const distinctCodes = new Set(observed.map((row) => row.code))
const collapsed = observed.filter((row) => row.code === "SIDECAR_OP_FAILED").length
const errnoShaped = observed.filter((row) => /^(?:ENOENT|EACCES|EPERM|EPIPE|ENOEXEC|ECONN.*)$/.test(row.code))
console.log(`\n${observed.length} 个互不相同的上游故障 ⇒ ${distinctCodes.size} 个不同的码：${[...distinctCodes].join(", ")}`)
console.log(`① 塌进兜底码 SIDECAR_OP_FAILED（唯一信息在 message 里、服务端落账时丢掉）：${collapsed} 个`)
console.log(`② 内部 errno 冒充产品码上线（过 _safe_code 的 [A-Z][A-Z0-9_]{2,127} 形状白名单）：` +
  `${errnoShaped.length} 个 ${errnoShaped.map((row) => `\`${row.code}\``).join(" ")}`)
console.log(`③  Worker 根本不该答的（非 ACP 适配器 ⇒ 挂到服务端 SIDECAR_TIMEOUT 才收场）：` +
  `${observed.filter((row) => row.code.startsWith("<NO ANSWER")).length} 个`)
