import readline from "node:readline"
import { appendFileSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs"
import { homedir } from "node:os"

const stateDir = `${homedir()}/sessions`
const stateFile = `${stateDir}/native-state.json`
// Which ACP operation reopened the stored session. It lives inside the declared
// native state directory so an outside observer can read the exact method the
// adapter sent from the captured state rather than inferring it from behavior.
const reopenLog = `${stateDir}/reopen-method.txt`
const recordReopen = (method) => {
  mkdirSync(stateDir, { recursive: true })
  appendFileSync(reopenLog, `${method}\n`)
}
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`)
let sessionId = null
let nonce = null
let pendingHeldPrompt = null

for await (const line of rl) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params = {} } = request
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "stateful-no-model", version: "test" },
      agentCapabilities: { sessionCapabilities: { resume: true }, promptCapabilities: {} },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") send({ jsonrpc: "2.0", id, result: {} })
  else if (method === "session/list") {
    if (!sessionId && existsSync(stateFile)) {
      const saved = JSON.parse(readFileSync(stateFile, "utf8"))
      sessionId = saved.nativeSessionId
    }
    send({ jsonrpc: "2.0", id, result: { sessions: sessionId ? [{ sessionId, cwd: "/workspace" }] : [] } })
  }
  else if (method === "session/load" || method === "session/resume") {
    if (!existsSync(stateFile)) send({ jsonrpc: "2.0", id, error: { code: -32010, message: "state missing" } })
    else {
      const saved = JSON.parse(readFileSync(stateFile, "utf8"))
      sessionId = saved.nativeSessionId
      nonce = saved.nonce
      recordReopen(method)
      send({ jsonrpc: "2.0", id, result: { sessionId } })
    }
  } else if (method === "session/new") {
    if (existsSync(stateFile)) send({ jsonrpc: "2.0", id, error: { code: -32011, message: "must resume persisted session" } })
    else {
      sessionId = `stateful-${process.pid}`
      recordReopen("session/new")
      send({ jsonrpc: "2.0", id, result: { sessionId } })
    }
  } else if (method === "session/prompt") {
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    if (!nonce) {
      nonce = text.match(/STATEFUL-NONCE-[A-Z0-9-]+/)?.[0] ?? "STATEFUL-NONCE-MISSING"
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(stateFile, JSON.stringify({ schema_version: 2, nativeSessionId: sessionId, nonce }))
    }
    if (text.includes("wait-for-cancel")) {
      // Journal the input immediately, then hold: what the harness wrote
      // before the cancel lands in the home, which is exactly what F4
      // protects. The response only goes out once the abort arrives.
      mkdirSync(stateDir, { recursive: true })
      appendFileSync(`${stateDir}/cancel-journal.txt`, `input:${text}\n`)
      continue
    }
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: nonce } },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
  } else if (method === "session/cancel") {
    if (pendingHeldPrompt !== null) {
      send({ jsonrpc: "2.0", id: pendingHeldPrompt, result: { stopReason: "cancelled" } })
      pendingHeldPrompt = null
    }
    send({ jsonrpc: "2.0", id, result: {} })
  }
  else if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} })
}
