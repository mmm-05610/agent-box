/**
 * Controlled ACP peer that proves one runtime artifact projection.
 *
 * It is launched as an ordinary Harness adapter by the sidecar, inside bwrap,
 * and does exactly what a real adapter would do with a dependency tree: it
 * loads a module from the directory the deployment mounted read-only at
 * /runtime/artifacts/<name>. The value it reports is the value that module
 * exports, so a passing gate means the guest really read the projected tree
 * rather than a copy that leaked into the workspace.
 *
 * It also attempts one write into the directory and reports whether the
 * kernel refused it, which is the read-only half of the same contract.
 *
 * Environment (declared by the deployment, non-secret by construction):
 *   FAKE_PEER_ARTIFACT  absolute guest path of the projected directory
 */
import readline from "node:readline"
import { readdirSync, writeFileSync } from "node:fs"
import path from "node:path"

const directory = process.env.FAKE_PEER_ARTIFACT
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
let sessionId = null

async function probe() {
  const facts = { directory, value: null, entries: [], writeBlocked: false, error: null }
  try {
    const entries = readdirSync(directory, { recursive: true }).map(String)
    facts.entries = entries.sort()
    const dependency = await import(path.join(directory, "dep.mjs"))
    facts.value = dependency.VALUE
    try {
      writeFileSync(path.join(directory, "guest-write"), "must not be possible")
    } catch {
      facts.writeBlocked = true
    }
  } catch (error) {
    facts.error = String(error?.message ?? error).slice(0, 200)
  }
  return facts
}

for await (const line of rl) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params = {} } = request
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "artifact-probe", version: "no-model" },
      agentCapabilities: { promptCapabilities: {} },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (method === "session/new") {
    sessionId = `artifact-probe-${process.pid}`
    send({ jsonrpc: "2.0", id, result: { sessionId } })
  } else if (method === "session/prompt") {
    const facts = await probe()
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `artifact-probe:${JSON.stringify(facts)}` },
      },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
  } else if (method === "session/cancel") {
    send({ jsonrpc: "2.0", id, result: {} })
  } else if (id !== undefined) {
    send({ jsonrpc: "2.0", id, result: {} })
  }
}
