import readline from "node:readline"
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs"
import { homedir } from "node:os"

const stateDir = `${homedir()}/sessions`
const stateFile = `${stateDir}/native-state.json`
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`)
let sessionId = null
let nonce = null

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
      send({ jsonrpc: "2.0", id, result: { sessionId } })
    }
  } else if (method === "session/new") {
    if (existsSync(stateFile)) send({ jsonrpc: "2.0", id, error: { code: -32011, message: "must resume persisted session" } })
    else { sessionId = `stateful-${process.pid}`; send({ jsonrpc: "2.0", id, result: { sessionId } }) }
  } else if (method === "session/prompt") {
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    if (!nonce) {
      nonce = text.match(/STATEFUL-NONCE-[A-Z0-9-]+/)?.[0] ?? "STATEFUL-NONCE-MISSING"
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(stateFile, JSON.stringify({ schema_version: 2, nativeSessionId: sessionId, nonce }))
    }
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: nonce } },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
  } else if (method === "session/cancel") send({ jsonrpc: "2.0", id, result: {} })
  else if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} })
}
