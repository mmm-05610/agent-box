/**
 * Controlled ACP peer used as a fake native Harness for sidecar gates.
 * Speaks enough JSON-RPC/ACP for register/start/create/prompt/abort flows.
 */
import readline from "node:readline"
import { createHash } from "node:crypto"

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

let sessions = 0
let pendingCancel = false
let pendingPrompt = null
let pendingPermission = null

for await (const line of rl) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params } = request
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "controlled-peer", version: "test" },
      agentCapabilities: { loadSession: true, promptCapabilities: { image: true } },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method === "session/new") {
    sessions += 1
    send({ jsonrpc: "2.0", id, result: { sessionId: `fake-native-${process.pid}-${sessions}` } })
  } else if (method === "session/load") {
    send({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId } })
  } else if (method === "session/prompt") {
    const image = params.prompt.find((item) => item.type === "image")
    const streamed = image
      ? `image:${image.mimeType}:${createHash("sha256").update(Buffer.from(image.data, "base64")).digest("hex")}`
      : "controlled stream"
    // A live chunk must be observable before the terminal response arrives.
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: streamed } },
    } })
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    if (text.includes("needs-permission")) {
      pendingPermission = { promptId: id, sessionId: params.sessionId }
      send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: {
        sessionId: params.sessionId,
        toolCall: { name: "shell", title: "Run a bounded command" },
        options: [
          { kind: "allow_once", optionId: "grant-once" },
          { kind: "reject_once", optionId: "reject-once" },
        ],
      } })
      continue
    }
    if (text.includes("wait-for-cancel")) {
      pendingPrompt = id
      continue
    }
    if (text.includes("delay-success")) {
      setTimeout(() => send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } }), 500)
      continue
    }
    if (text.includes("delay-failure")) {
      setTimeout(() => send({ jsonrpc: "2.0", id, error: { code: -32001, message: "controlled failure" } }), 500)
      continue
    }
    send({ jsonrpc: "2.0", id, result: { stopReason: pendingCancel ? "cancelled" : "end_turn" } })
    pendingCancel = false
  } else if (method === "session/cancel") {
    pendingCancel = true
    if (pendingPrompt !== null) {
      send({ jsonrpc: "2.0", id: pendingPrompt, result: { stopReason: "cancelled" } })
      pendingPrompt = null
    }
  } else if (id === 900 && request.result !== undefined && pendingPermission !== null) {
    const selected = request.result?.outcome?.optionId ?? "cancelled"
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: pendingPermission.sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `permission:${selected}` },
      },
    } })
    send({ jsonrpc: "2.0", id: pendingPermission.promptId, result: { stopReason: "end_turn" } })
    pendingPermission = null
  } else if (method === "session/set_config_option") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}
