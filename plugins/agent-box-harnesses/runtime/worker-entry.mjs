/**
 * AgentBox Harness sidecar entry (Work Order 40 glue).
 *
 * Owns exactly three things and nothing else:
 *   1. provenance: hash this snapshot against third_party/harness_remote/SOURCE.json;
 *   2. one generic NDJSON envelope over stdio that drives the upstream-owned
 *      registration (acp-registration.js) — no branded switches, no ACP
 *      reimplementation, no product state;
 *   3. refusal to run outside the isolation the Worker is required to provide.
 *
 * Native session ids, streaming payloads, capability contracts, and errors stay
 * opaque projections; Windows owns Profile/Session authority and the Worker owns
 * the bounded execution projection this process runs in.
 */
import { createHash, randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import readline from "node:readline"

const here = path.dirname(fileURLToPath(import.meta.url))
const snapshotRoot = path.resolve(here, "..", "third_party", "harness_remote")
const bridgeSrc = path.join(snapshotRoot, "bridge", "src")

function verifyProvenance() {
  const source = JSON.parse(readFileSync(path.join(snapshotRoot, "SOURCE.json"), "utf8"))
  for (const file of source.files) {
    const expected = file.patched_sha256 ?? file.current_sha256 ?? file.upstream_sha256
    const actual = createHash("sha256").update(readFileSync(path.join(snapshotRoot, file.path))).digest("hex")
    if (actual !== expected) throw envelopeError("PROVENANCE_MISMATCH", file.path)
  }
  return source
}

function envelopeError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  return error
}

/** Permission decisions still in flight; every entry resolves to deny on timeout. */
const pendingPermissions = new Map()

function makePermissionResolver(emit, timeoutMs) {
  return async ({ toolCall, options }) => {
    const requestId = randomUUID()
    const decision = new Promise((resolve) => {
      pendingPermissions.set(requestId, { resolve, options: Array.isArray(options) ? options : [] })
      if (timeoutMs > 0) {
        setTimeout(() => {
          if (pendingPermissions.delete(requestId)) resolve(undefined)
        }, timeoutMs)
      }
    })
    emit({ event: "permission_request", data: {
      requestId,
      toolCall: toolCall ?? null,
      options,
      expiresAt: timeoutMs > 0 ? new Date(Date.now() + timeoutMs).toISOString() : null,
    } })
    const optionId = await decision
    return typeof optionId === "string" ? optionId : undefined
  }
}

async function main() {
  if (process.env.AGENTBOX_SIDECAR_ISOLATED !== "1") {
    fail({ code: "SIDECAR_ISOLATION_REQUIRED" })
    return
  }
  let source
  try {
    source = verifyProvenance()
  } catch (error) {
    fail({ code: error.code ?? "PROVENANCE_UNREADABLE", message: String(error.message) })
    return
  }
  const { createAcpRegistration } = await import(path.join(bridgeSrc, "acp-registration.js"))
  const { resolveHarnessProfile, registeredHarnessIDs } = await import(
    path.join(here, "profile_extensions.mjs")
  )

  let registration = null

  function emit(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  }
  function fail({ id = null, code, message }) {
    emit({ id, ok: false, error: { code, message: message ?? code } })
  }

  async function handle(request) {
    const { op, id } = request
    if (op === "profiles") {
      return {
        provenance: { commit: source.commit, ref: source.ref },
        profiles: registeredHarnessIDs(),
      }
    }
    if (op === "register") {
      if (registration) throw envelopeError("ALREADY_REGISTERED")
      if (!request.launch?.command) throw envelopeError("ADAPTER_LAUNCH_REQUIRED")
      const permissionTimeoutMs = request.permissionTimeoutMs ?? 0
      registration = await createAcpRegistration({
        profile: resolveHarnessProfile(request.profile),
        directory: request.directory ?? process.cwd(),
        stateDirectory: request.stateDirectory,
        launch: { command: request.launch.command, args: request.launch.args ?? [] },
        permissionResolver: request.permissionRoundTrip
          ? makePermissionResolver(emit, permissionTimeoutMs)
          : null,
        permissionTimeoutMs,
      })
      wireForwarding(registration, emit)
      return {
        provenance: { commit: source.commit, ref: source.ref },
        profile: registration.profile.id,
        launch: registration.launch,
        capabilities: registration.capabilities,
        contract: registration.contract,
      }
    }
    if (op === "permission_decision") {
      const pending = pendingPermissions.get(request.requestId)
      if (!pending) throw envelopeError("PERMISSION_REQUEST_UNKNOWN")
      const optionId = permissionOption(pending.options, request.decision, request.scope)
      pendingPermissions.delete(request.requestId)
      pending.resolve(optionId)
      return { recorded: true }
    }
    if (!registration) throw envelopeError("NOT_REGISTERED")
    switch (op) {
      case "start": {
        await registration.agent.start()
        return {
          agentInfo: registration.agent.agentInfo,
          promptCapabilities: registration.agent.promptCapabilities,
          sessionCapabilities: registration.agent.sessionCapabilities,
          processID: registration.agent.processID,
        }
      }
      case "open": {
        const claimed = await registration.service.claimSession(request.sessionId)
        return { sessionId: request.sessionId, claimed }
      }
      case "create": {
        const session = await registration.service.createSession({
          directory: request.directory ?? process.cwd(),
          title: request.title,
          model: request.model,
        })
        return { sessionId: session.id ?? session.sessionId, title: session.title ?? null }
      }
      case "prompt": {
        const result = await registration.service.promptAndWait(
          request.sessionId, request.text, request.model ?? undefined,
          Array.isArray(request.attachments) ? request.attachments : [],
        )
        return result ?? { done: true }
      }
      case "abort": {
        registration.service.abort(request.sessionId)
        return { aborted: true }
      }
      case "status": {
        return registration.service.status(request.sessionId)
      }
      case "close": {
        registration.agent.close()
        registration = null
        return { closed: true }
      }
      default:
        throw envelopeError("UNKNOWN_OP")
    }
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    if (!line.trim()) continue
    let request
    try {
      request = JSON.parse(line)
    } catch {
      fail({ code: "ENVELOPE_MALFORMED" })
      continue
    }
    // A prompt may pause on a permission request. Keep consuming the control
    // stream so its permission_decision can complete that same in-flight op;
    // response ids preserve correlation while callers still sequence setup.
    void handle(request).then(
      (result) => emit({ id: request.id ?? null, ok: true, result }),
      (error) => emit({
        id: request.id ?? null,
        ok: false,
        error: {
          code: error?.code ?? "SIDECAR_OP_FAILED",
          message: String(error?.message ?? error).slice(0, 500),
        },
      }),
    )
  }
  process.exit(0)
}

function permissionOption(options, decision, scope) {
  if (!["allow", "deny"].includes(decision)) throw envelopeError("PERMISSION_DECISION_INVALID")
  const bounded = scope?.kind === "bounded"
  if (scope?.kind !== "once" && !bounded) throw envelopeError("PERMISSION_SCOPE_INVALID")
  const wanted = decision === "allow"
    ? (bounded ? ["allow_always", "allow"] : ["allow_once", "allow"])
    : (bounded ? ["reject_always", "deny_always", "reject", "deny"]
      : ["reject_once", "deny_once", "reject", "deny"])
  const normalized = (value) => String(value ?? "").toLowerCase().replace(/[ -]+/g, "_")
  for (const kind of wanted) {
    const option = options.find((item) =>
      [item?.kind, item?.name, item?.label].some((value) => normalized(value) === kind),
    )
    if (typeof option?.optionId === "string") return option.optionId
  }
  throw envelopeError("PERMISSION_OPTION_UNAVAILABLE")
}

function wireForwarding(registration, emit) {
  registration.agent.on("notification", (message) => {
    emit({ event: "acp_notification", data: message })
  })
  registration.agent.on("permission", (detail) => {
    emit({ event: "permission", data: detail })
  })
  registration.agent.on("stderr", (line) => {
    emit({ event: "stderr", data: { line: String(line).slice(0, 2000) } })
  })
  registration.agent.on("exit", (error) => {
    emit({ event: "adapter_exit", data: { message: String(error?.message ?? error).slice(0, 500) } })
  })
  registration.service.subscribe((event) => {
    emit({ event: "service", data: event })
  })
}

function fail({ code, message }) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message: message ?? code } })}\n`)
}

main().catch((error) => {
  fail({ code: "SIDECAR_FATAL", message: String(error?.stack ?? error).slice(0, 2000) })
  process.exit(1)
})
