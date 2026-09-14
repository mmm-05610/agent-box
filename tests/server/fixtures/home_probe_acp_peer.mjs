/**
 * Controlled ACP peer that reports what the isolated home really looks like.
 *
 * It is deliberately brand-free: every path it inspects arrives through the
 * deployment's adapter environment, so the same fixture can stand in for any
 * Harness whose configuration lives under a projected home. It answers a prompt
 * with a single JSON report of the facts the isolation gate asserts:
 *
 *   - the home the process actually resolves (`os.homedir()`);
 *   - where the harness's own explicit directory variable points, so the
 *     default path and the explicit path can be compared;
 *   - whether a state file can be written under the declared writable target;
 *   - whether a read-only configuration file refuses writes;
 *   - whether a host-home sentinel (given by path, never read from the real
 *     user home by this file) is visible at all.
 */
import readline from "node:readline"
import { homedir } from "node:os"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

const report = {}
function attempt(name, action) {
  try {
    report[name] = { ok: true, value: action() }
  } catch (error) {
    report[name] = { ok: false, code: error?.code ?? String(error) }
  }
}

function probe() {
  report.home = homedir()
  report.nativeDirectory = process.env.AGENTBOX_FIXTURE_NATIVE_DIR ?? null
  report.converged = report.nativeDirectory === path.join(report.home, ".fixture")
  const stateDir = process.env.AGENTBOX_FIXTURE_STATE_DIR
  if (stateDir) {
    attempt("stateWrite", () => {
      mkdirSync(stateDir, { recursive: true })
      const file = path.join(stateDir, "native-state.json")
      writeFileSync(file, JSON.stringify({ schema_version: 2, nativeSessionId: "home-probe" }))
      return file
    })
  }
  const configPath = process.env.AGENTBOX_FIXTURE_CONFIG_PATH
  if (configPath) {
    attempt("configRead", () => readFileSync(configPath, "utf8").trim().slice(0, 64))
    attempt("configWrite", () => writeFileSync(configPath, "tamper\n"))
  }
  const hostSentinel = process.env.AGENTBOX_FIXTURE_HOST_SENTINEL
  if (hostSentinel) report.hostSentinelVisible = existsSync(hostSentinel)
  return report
}

for await (const line of rl) {
  if (!line.trim()) continue
  const request = JSON.parse(line)
  const { id, method, params = {} } = request
  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: {
      agentInfo: { name: "home-probe", version: "test" },
      agentCapabilities: { sessionCapabilities: { resume: {} }, promptCapabilities: {} },
      authMethods: [{ id: "none", name: "none" }],
    } })
  } else if (method === "authenticate") send({ jsonrpc: "2.0", id, result: {} })
  else if (method === "session/new") {
    send({ jsonrpc: "2.0", id, result: { sessionId: `home-probe-${process.pid}` } })
  } else if (method === "session/load" || method === "session/resume") {
    send({ jsonrpc: "2.0", id, result: { sessionId: params.sessionId } })
  } else if (method === "session/prompt") {
    const text = JSON.stringify(probe())
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: params.sessionId,
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
    } })
    send({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } })
  } else if (method === "session/cancel") send({ jsonrpc: "2.0", id, result: {} })
  else if (id !== undefined) send({ jsonrpc: "2.0", id, result: {} })
}
