/**
 * Controlled ACP peer used as a fake native Harness for sidecar gates.
 * Speaks enough JSON-RPC/ACP for register/start/create/prompt/abort flows.
 */
import readline from "node:readline"

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

let sessions = 0
let pendingCancel = false

for await (const line of rl) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params } = request
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "controlled-peer", version: "test" },
      agentCapabilities: { loadSession: true },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method === "session/new") {
    sessions += 1
    send({ jsonrpc: "2.0", id, result: { sessionId: `fake-native-${sessions}` } })
  } else if (method === "session/load") {
    send({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId } })
  } else if (method === "session/prompt") {
    // A live chunk must be observable before the terminal response arrives.
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "controlled stream" } },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: pendingCancel ? "cancelled" : "end_turn" } })
    pendingCancel = false
  } else if (method === "session/cancel") {
    pendingCancel = true
  } else if (method === "session/set_config_option") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}
