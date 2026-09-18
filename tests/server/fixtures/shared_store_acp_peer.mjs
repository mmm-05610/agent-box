// Controlled ACP peer for the whole-db shared-store gate (order 66 G1/G2).
//
// Unlike `stateful_acp_peer.mjs`, which treats the *existence* of its state
// file as "a session was already persisted", this peer models the semantics a
// seeded whole-db library actually has: the shared file exists from the first
// room onward (the channel seeds it so the room can bind it), and an empty or
// unreadable file simply means "no state yet". That is the same shape a real
// family sees with an empty SQLite database.
//
// It keeps one durable fact - the native session id and the first nonce it was
// asked to remember - in ${homedir()}/sessions/state.json, so a later turn
// (including one issued under a different Profile of the same family) can
// prove the state outlived the role switch.
import readline from "node:readline"
import { writeFileSync, readFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"

const stateDir = `${homedir()}/sessions`
const stateFile = `${stateDir}/state.json`

function loadState() {
  try {
    const value = JSON.parse(readFileSync(stateFile, "utf8"))
    return value && typeof value === "object" ? value : {}
  } catch {
    return {} // empty or unreadable: no state yet, never a failure
  }
}

const saveState = (state) => {
  mkdirSync(stateDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify(state))
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
let sessionId = null
let nonce = null

for await (const line of rl) {
  if (!line.trim()) continue
  const { id, method, params = {} } = JSON.parse(line)
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "shared-store-no-model", version: "test" },
      agentCapabilities: { sessionCapabilities: { resume: true }, promptCapabilities: {} },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method === "session/new") {
    const saved = loadState()
    sessionId = saved.nativeSessionId ?? `shared-${process.pid}-${Date.now()}`
    nonce = saved.nonce ?? null
    saveState({ nativeSessionId: sessionId, nonce })
    send({ jsonrpc: "2.0", id, result: { sessionId } })
  } else if (method === "session/load" || method === "session/resume") {
    const saved = loadState()
    if (!saved.nativeSessionId) {
      send({ jsonrpc: "2.0", id, error: { code: -32010, message: "state missing" } })
    } else {
      sessionId = saved.nativeSessionId
      nonce = saved.nonce ?? null
      send({ jsonrpc: "2.0", id, result: { sessionId } })
    }
  } else if (method === "session/prompt") {
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    if (!nonce) {
      nonce = text.match(/STATEFUL-NONCE-[A-Z0-9-]+/)?.[0] ?? "STATEFUL-NONCE-MISSING"
      saveState({ nativeSessionId: sessionId, nonce })
    }
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: nonce } },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
  } else if (method === "session/cancel") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } })
  }
}
