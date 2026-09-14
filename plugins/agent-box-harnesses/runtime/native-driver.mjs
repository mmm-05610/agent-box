/**
 * Native driver seam for a Harness that does not speak ACP.
 *
 * A deployment may name the reviewed module that drives its Harness. The
 * declaration travels through the Server, Core, Worker and bwrap layers as
 * opaque deployment data; those layers carry it without knowing what it is and
 * never branch on a Harness name. This module is the only place that loads it,
 * and it enforces the two rules that keep the seam narrow:
 *
 *   1. the module must live in the `deployment/` area of the same bundle this
 *      file came from, so a deployment cannot point the sidecar at code outside
 *      the digest-verified closure;
 *   2. the module is handed generic launch facts plus the credential-injecting
 *      spawn function - never the credential value - and everything it emits is
 *      redacted before it reaches the envelope.
 *
 * The driver contract (`createDriver`) is deliberately the same generic
 * vocabulary the sidecar already uses for ACP: start, create, open, prompt,
 * abort, close, plus capabilities. A driver that declares
 * `sessionCapabilities.resume` is claiming it can reopen a stored native
 * session, and that claim is what the product turns into a resumable
 * checkpoint.
 */
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
//: In the Worker this resolves to the read-only bundle root
//: (`/runtime/view/agentbox-sidecar`); the deployment area of that same bundle
//: is the only place a driver module may be loaded from.
const DEPLOYMENT_ROOT = path.join(path.resolve(here, ".."), "deployment")

export const DRIVER_METHODS = ["start", "create", "open", "prompt", "abort", "close"]

function envelopeError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code)
  error.code = code
  return error
}

/**
 * Load one deployment-declared driver module and validate its entrypoint.
 *
 * `emit` receives upward events already redacted by the caller; `redact` is the
 * caller's credential-safe text helper for a driver's own diagnostics.
 */
export async function loadNativeDriver({
  declaration, request, emit, redact, spawnProcess,
  directory, stateDirectory, credentialEnvironment, hasCredential,
}) {
  const modulePath = declaration?.module
  if (typeof modulePath !== "string" || !modulePath.startsWith("/")
      || modulePath.includes("\0") || modulePath.includes("\\")) {
    throw envelopeError("DRIVER_MODULE_OUTSIDE_BUNDLE")
  }
  const resolved = path.resolve(modulePath)
  if (resolved !== modulePath || !resolved.startsWith(DEPLOYMENT_ROOT + path.sep)
      || !resolved.endsWith(".mjs")) {
    throw envelopeError("DRIVER_MODULE_OUTSIDE_BUNDLE", path.basename(resolved))
  }
  let loaded
  try {
    loaded = await import(pathToFileURL(resolved).href)
  } catch (error) {
    throw envelopeError("DRIVER_MODULE_UNLOADABLE", String(error?.message ?? error).slice(0, 300))
  }
  if (typeof loaded.createDriver !== "function") throw envelopeError("DRIVER_ENTRYPOINT_MISSING")
  const created = await loaded.createDriver({
    profileID: request.profile,
    command: request.launch.command,
    args: Array.isArray(request.launch.args) ? request.launch.args : [],
    environment: { ...(request.launch.environment ?? {}) },
    credentialEnvironment: credentialEnvironment ?? null,
    hasCredential: Boolean(hasCredential),
    directory, stateDirectory,
    emit, redact, spawnProcess,
  })
  if (!created || typeof created !== "object") throw envelopeError("DRIVER_FACTORY_INVALID")
  for (const method of DRIVER_METHODS) {
    if (typeof created[method] !== "function") throw envelopeError("DRIVER_METHOD_MISSING", method)
  }
  return created
}

/**
 * Replace the credential value wherever a driver event would carry it.
 *
 * The value is never handed to a driver, but a driver could still echo
 * something it read. Redaction is applied to the whole event, so no event field
 * can smuggle the value into the Worker stream or the product's event log.
 */
export function redactDeep(node, value, depth = 0) {
  if (typeof node === "string") return node.replaceAll(value, "[REDACTED]")
  if (depth >= 8 || node === null || typeof node !== "object") return node
  if (Array.isArray(node)) return node.map((item) => redactDeep(item, value, depth + 1))
  const result = {}
  for (const [key, item] of Object.entries(node)) result[key] = redactDeep(item, value, depth + 1)
  return result
}
