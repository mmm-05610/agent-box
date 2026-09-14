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
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import readline from "node:readline"
import { loadNativeDriver, redactDeep } from "./native-driver.mjs"

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
const CREDENTIAL_PATH = "/runtime/secret/credential"
const ENVIRONMENT_KEY = /^[A-Z][A-Z0-9_]{0,63}$/
const AUTHENTICATION_KEY = /^(?:[a-z][a-z0-9._-]{0,63})$/
const SENSITIVE_ENVIRONMENT_KEY = /(TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|AUTH)/i

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
  const { resolveHarnessProfile, registeredHarnessIDs, resolveNativeModel } = await import(
    path.join(here, "profile_extensions.mjs")
  )

  let registration = null
  let credentialValue = null
  // A deployment whose Harness speaks a native protocol rather than ACP names
  // the reviewed module that drives it; exactly one of these two is set, and
  // every operation below is routed to whichever the deployment declared.
  let driver = null
  // The registration names the Harness this sidecar speaks for, so the product
  // model id a caller sends is translated into that Harness's own catalogue
  // value here rather than by any layer above.
  let registeredProfileID = null

  function safeText(value, maximum) {
    let text = String(value ?? "")
    if (credentialValue) text = text.replaceAll(credentialValue, "[REDACTED]")
    return text.slice(0, maximum)
  }

  function emit(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`)
  }
  // Upward events from a native driver pass through the same redaction an
  // adapter's stderr does: whatever a driver puts in an event field, the
  // credential value never reaches the envelope.
  function driverEmit(message) {
    emit(credentialValue ? redactDeep(message, credentialValue) : message)
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
      const credentialEnvironment = request.credentialEnvironment
      const adapterEnvironment = request.launch.environment ?? {}
      if (!adapterEnvironment || typeof adapterEnvironment !== "object" || Array.isArray(adapterEnvironment)) {
        throw envelopeError("ADAPTER_ENVIRONMENT_INVALID")
      }
      for (const [key, value] of Object.entries(adapterEnvironment)) {
        if (!ENVIRONMENT_KEY.test(key) || SENSITIVE_ENVIRONMENT_KEY.test(key)
            || typeof value !== "string" || value.length > 8192 || /[\0]/.test(value)
            || /^sk-[A-Za-z0-9_-]+$/.test(value)) {
          throw envelopeError("ADAPTER_ENVIRONMENT_INVALID")
        }
      }
      const preferredAuthMethod = request.preferredAuthMethod
      if (preferredAuthMethod != null && (
        typeof preferredAuthMethod !== "string" || !AUTHENTICATION_KEY.test(preferredAuthMethod)
      )) throw envelopeError("PREFERRED_AUTH_METHOD_INVALID")
      let spawnProcess
      if (credentialEnvironment != null) {
        if (typeof credentialEnvironment !== "string" || !ENVIRONMENT_KEY.test(credentialEnvironment)) {
          throw envelopeError("CREDENTIAL_ENVIRONMENT_INVALID")
        }
        credentialValue = readFileSync(CREDENTIAL_PATH, "utf8").trim()
        if (!credentialValue || credentialValue.length > 4096 || /[\r\n\0]/.test(credentialValue)) {
          credentialValue = null
          throw envelopeError("CREDENTIAL_MATERIAL_INVALID")
        }
      }
      if (Object.keys(adapterEnvironment).length || credentialValue || request.launch.driver != null) {
        spawnProcess = (command, args, options = {}) => spawn(command, args, {
          ...options,
          env: {
            ...process.env, ...adapterEnvironment,
            ...(credentialValue ? { [credentialEnvironment]: credentialValue } : {}),
          },
        })
      }
      if (request.launch.driver != null) {
        registeredProfileID = request.profile
        driver = await loadNativeDriver({
          declaration: request.launch.driver,
          request, emit: driverEmit, redact: safeText, spawnProcess,
          directory: request.directory ?? process.cwd(),
          stateDirectory: request.stateDirectory,
          credentialEnvironment: credentialEnvironment ?? null,
          hasCredential: Boolean(credentialValue),
        })
        return {
          provenance: { commit: source.commit, ref: source.ref },
          profile: request.profile,
          driver: { module: request.launch.driver.module },
          launch: {
            command: request.launch.command,
            args: Array.isArray(request.launch.args) ? request.launch.args : [],
          },
          capabilities: driver.capabilities ?? {},
          contract: driver.contract ?? {},
        }
      }
      const profile = resolveHarnessProfile(request.profile)
      registeredProfileID = request.profile
      registration = await createAcpRegistration({
        profile: preferredAuthMethod == null ? profile : { ...profile, authMethod: preferredAuthMethod },
        directory: request.directory ?? process.cwd(),
        stateDirectory: request.stateDirectory,
        launch: { command: request.launch.command, args: request.launch.args ?? [] },
        permissionResolver: request.permissionRoundTrip
          ? makePermissionResolver(emit, permissionTimeoutMs)
          : null,
        permissionTimeoutMs,
        spawnProcess,
      })
      wireForwarding(registration, emit, safeText)
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
    if (!registration && !driver) throw envelopeError("NOT_REGISTERED")
    if (driver) {
      // A native driver answers the same generic operations as an ACP
      // registration. Which one is present is the deployment's decision; no
      // branch below knows a Harness name.
      switch (op) {
        case "start": {
          await driver.start()
          const declared = driver.capabilities ?? {}
          return {
            agentInfo: declared.agentInfo ?? null,
            promptCapabilities: declared.promptCapabilities ?? {},
            sessionCapabilities: declared.sessionCapabilities ?? {},
            processID: undefined,
          }
        }
        case "create": {
          const session = await driver.create({
            title: request.title,
            model: resolveNativeModel(registeredProfileID, request.model),
          })
          return {
            sessionId: session?.sessionId ?? session?.id ?? null,
            title: session?.title ?? null,
          }
        }
        case "open": {
          const session = await driver.open({
            sessionId: request.sessionId,
            model: resolveNativeModel(registeredProfileID, request.model),
          })
          return { sessionId: session?.sessionId ?? request.sessionId, claimed: true }
        }
        case "prompt": {
          const result = await driver.prompt({
            sessionId: request.sessionId,
            text: request.text,
            model: resolveNativeModel(registeredProfileID, request.model),
            attachments: Array.isArray(request.attachments) ? request.attachments : [],
          })
          return result ?? { done: true }
        }
        case "abort": {
          await driver.abort(request.sessionId)
          return { aborted: true }
        }
        case "status": {
          return (await driver.status(request.sessionId)) ?? {}
        }
        case "close": {
          await driver.close()
          driver = null
          credentialValue = null
          return { closed: true }
        }
        default:
          throw envelopeError("UNKNOWN_OP")
      }
    }
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
          model: resolveNativeModel(registeredProfileID, request.model),
        })
        return { sessionId: session.id ?? session.sessionId, title: session.title ?? null }
      }
      case "prompt": {
        const result = await registration.service.promptAndWait(
          request.sessionId, request.text,
          resolveNativeModel(registeredProfileID, request.model) ?? undefined,
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
        credentialValue = null
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
          message: safeText(error?.message ?? error, 500),
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

function wireForwarding(registration, emit, redact = (value, maximum) => String(value).slice(0, maximum)) {
  registration.agent.on("notification", (message) => {
    emit({ event: "acp_notification", data: message })
  })
  registration.agent.on("permission", (detail) => {
    emit({ event: "permission", data: detail })
  })
  registration.agent.on("stderr", (line) => {
    emit({ event: "stderr", data: { line: redact(line, 2000) } })
  })
  registration.agent.on("exit", (error) => {
    emit({ event: "adapter_exit", data: { message: redact(error?.message ?? error, 500) } })
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
