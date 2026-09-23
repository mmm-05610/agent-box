/** Controlled ACP peer for the native Server CLI gate. No network or Agent. */
import readline from "node:readline"
import { readFileSync, writeFileSync } from "node:fs"

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
let nextSession = 0
let pendingPermission = null
let pendingCancel = null
const registryPath = process.env.HD002_FAKE_SESSIONS
if (!registryPath) throw new Error("HD002_FAKE_SESSIONS_REQUIRED")
const sessions = () => {
  try { return JSON.parse(readFileSync(registryPath, "utf8")) }
  catch (error) { if (error.code === "ENOENT") return []; throw error }
}

for await (const line of lines) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params } = request
  if (method === "initialize") {
    const sessionCapabilities = process.env.HD002_FAKE_NO_RESUME === "1" ? {} : { resume: {} }
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "hd002-fake-native-peer", version: "test" },
      agentCapabilities: { loadSession: true, sessionCapabilities },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method === "session/new") {
    nextSession += 1
    const sessionId = `hd002-fake-${process.pid}-${nextSession}`
    writeFileSync(registryPath, JSON.stringify([...sessions(), { sessionId, cwd: params.cwd }]))
    send({ jsonrpc: "2.0", id, result: {
      sessionId,
      configOptions: [],
    } })
  } else if (method === "session/list") {
    send({ jsonrpc: "2.0", id, result: { sessions: sessions() } })
  } else if (method === "session/load") {
    send({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId, configOptions: [] } })
  } else if (method === "session/prompt") {
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    const update = (value) => send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: value } },
    } })
    update(`cwd=${process.cwd()} input=${text}`)
    if (text.includes("needs-permission")) {
      pendingPermission = { id, sessionId: params.sessionId }
      send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: {
        sessionId: params.sessionId,
        toolCall: { name: "shell", title: "Controlled fake approval" },
        options: [
          { kind: "allow_once", optionId: "grant-once" },
          { kind: "reject_once", optionId: "reject-once" },
        ],
      } })
    } else if (text.includes("wait-for-cancel")) {
      pendingCancel = id
    } else {
      send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
    }
  } else if (method === "session/cancel") {
    if (pendingCancel !== null) {
      send({ jsonrpc: "2.0", id: pendingCancel, result: { stopReason: "cancelled" } })
      pendingCancel = null
    }
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (id === 900 && pendingPermission !== null) {
    send({ jsonrpc: "2.0", id: pendingPermission.id, result: { stopReason: "end_turn" } })
    pendingPermission = null
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}
