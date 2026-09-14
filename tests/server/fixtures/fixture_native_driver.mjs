/**
 * Controlled native driver for the generic driver-seam tests.
 *
 * It is deliberately not a Harness: it proves the seam - load from the bundle's
 * deployment area, receive the generic launch facts, answer the generic
 * operations, and report upward facts through the neutral event vocabulary -
 * without any real native protocol in the picture.
 *
 * Two behaviours are switchable so one fixture can cover the seam's failure
 * surface: a prompt of exactly `__driver_exit__` reports a driver exit, and
 * `status` reports what the driver was given.
 */
export async function createDriver(context) {
  const sessions = new Set()
  return {
    capabilities: {
      agentInfo: { name: "fixture-native-driver", version: "1.0" },
      promptCapabilities: { image: false },
      sessionCapabilities: { resume: {}, list: {} },
    },
    async start() {},
    async create({ title, model }) {
      const sessionId = `fixture-native-${sessions.size + 1}`
      sessions.add(sessionId)
      context.emit({ event: "message_delta", data: { text: `created ${sessionId} for ${model}` } })
      return { sessionId, title: title ?? null }
    },
    async open({ sessionId }) {
      sessions.add(sessionId)
      return { sessionId }
    },
    async prompt({ sessionId, text }) {
      if (text === "__driver_exit__") {
        context.emit({ event: "driver_exit", data: { message: "fixture exited" } })
        return { done: false }
      }
      context.emit({ event: "message_delta", data: { text: "controlled native stream" } })
      context.emit({ event: "message_delta", data: { text: `${sessionId}:${text.length}` } })
      return { done: true, sessionId }
    },
    async abort() {},
    async close() {},
    async status() {
      return {
        sessions: [...sessions],
        environment: { ...context.environment },
        credentialEnvironment: context.credentialEnvironment,
        hasCredential: context.hasCredential,
        hasSpawnProcess: typeof context.spawnProcess === "function",
      }
    },
  }
}
