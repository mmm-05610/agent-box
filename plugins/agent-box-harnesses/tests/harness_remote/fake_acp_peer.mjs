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

// Optional silence for the explicit `silent-success` prompt: the deployment's
// adapter environment can raise it above the Worker's lease so a gate can prove
// that an attempt quiet for longer than the lease still finishes. The default
// is 0, and every existing prompt path is untouched.
const SILENCE_MS = Number.parseInt(process.env.AGENTBOX_FIXTURE_SILENCE_MS ?? "0", 10)
const promptSilenceMs = Number.isFinite(SILENCE_MS) && SILENCE_MS > 0 ? SILENCE_MS : 0
const PROMPT_SILENCE_DEFAULT_MS = 8_000

// The peer declares exactly the one model it accepts. A bridge that is asked for
// a model resolves it against the options the harness advertised and refuses
// anything not on the list, so a peer that advertises none is a harness that can
// run no configured model at all.
const MODEL_OPTION = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "fixture-model",
  options: [{ value: "fixture-model", name: "Fixture model" }],
}

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
    send({ jsonrpc: "2.0", id, result: {
      sessionId: `fake-native-${process.pid}-${sessions}`,
      configOptions: [MODEL_OPTION],
    } })
  } else if (method === "session/load") {
    send({ jsonrpc: "2.0", id, result: {
      sessionId: params.sessionId,
      configOptions: [MODEL_OPTION],
    } })
  } else if (method === "session/prompt") {
    const image = params.prompt.find((item) => item.type === "image")
    const text = params.prompt.find((item) => item.type === "text")?.text ?? ""
    const streamed = image
      ? `image:${image.mimeType}:${createHash("sha256").update(Buffer.from(image.data, "base64")).digest("hex")}`
      : "controlled stream"
    const streamUpdate = () => send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: streamed } },
    } })
    if (text.includes("silent-success")) {
      // Write nothing at all for the declared silence, then answer: an attempt
      // that is quiet past the Worker lease must still finish, and the only
      // thing keeping the lease alive is the client's own traffic.
      setTimeout(() => {
        streamUpdate()
        send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
      }, promptSilenceMs > 0 ? promptSilenceMs : PROMPT_SILENCE_DEFAULT_MS)
      continue
    }
    // A live chunk must be observable before the terminal response arrives.
    streamUpdate()
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
    send({ jsonrpc: "2.0", id, result: {
      configOptions: [{ ...MODEL_OPTION, currentValue: params.value }],
    } })
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}
