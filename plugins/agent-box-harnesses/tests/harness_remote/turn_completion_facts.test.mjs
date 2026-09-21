/**
 * Gates for PATCHES.md §6 and the `promptSettleMs` declaration in `runtime/profile_extensions.mjs`:
 * a turn's own terminal statement, and any tail the transport lost, become facts on the bridge's
 * event bus instead of nothing at all.
 *
 * The rows are the same inputs measured against the unpatched snapshot in
 * `worktrees/backend-loop/harness/tests/acp-defect-evidence.test.mjs` (instruments X1–X3), and each
 * row states which side of the approved change it sits on:
 *
 *   ① answered without `stopReason`      changed — `session.stop_reason_not_reported`, not `end_turn`
 *   ② answered with a `stopReason`        unchanged — silent, and the value still reaches the caller
 *   ③ the turn errored                    unchanged — `session.error` only; the two never overlap
 *   ④ chunk after a closed drain window   changed — `session.tail_dropped` with the counted loss
 *   ⑤ a zero-window session               unchanged — permissive, and reports no loss
 *   ⑥ the next turn                       unchanged acceptance, and it inherits no earlier count
 *
 * Every peer is a fake `EventEmitter` handed to the constructor. No process is spawned, and no real
 * Harness, credential, or model is touched.
 */
import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const src = (...parts) => path.join(pluginRoot, "third_party", "harness_remote", "bridge", "src", ...parts)
const { AcpService } = await import(`file://${src("acp-service.js")}`)
const { AGENTBOX_HARNESS_PROFILES, upstreamProfile } = await import(
  new URL(`../../runtime/profile_extensions.mjs`, import.meta.url).href
)

const tick = (n = 2) => {
  const steps = []
  for (let i = 0; i < n; i += 1) steps.push(new Promise((resolve) => setImmediate(resolve)))
  return Promise.all(steps)
}

const assistantChunk = (text) => ({
  method: "session/update",
  params: { sessionId: "native-1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } },
})

function makeService(options = {}) {
  const acp = new EventEmitter()
  acp.sessionCapabilities = {}
  acp.promptCapabilities = { image: false }
  acp.start = async () => {}
  acp.listSessions = async () => [{ sessionId: "native-1", cwd: "/controlled" }]
  acp.notify = () => {}
  acp.request = async () => ({ configOptions: [] })
  const service = new AcpService(acp, {
    historyLoader: async () => [],
    journalPageWhileOwned: false,
    ...options,
  })
  return { acp, service }
}

/** Run one turn whose `session/prompt` answer the caller controls, and keep every bus event. */
async function runTurn({ promptSettleMs = 0, response = {}, reject = null, duringTurn = null } = {}) {
  const { acp, service } = makeService({ promptSettleMs })
  await service.claimSession("native-1")
  let release, fail
  acp.request = (method) => method === "session/prompt"
    ? new Promise((resolve, rejectPromise) => { release = resolve; fail = rejectPromise })
    : Promise.resolve({ configOptions: [] })
  const events = []
  service.subscribe((event) => events.push(event))
  const done = service.promptAndWait("native-1", "safe").then(
    (result) => ({ ok: true, result }),
    (error) => ({ ok: false, message: error.message }),
  )
  await tick(1)
  if (duringTurn) await duringTurn(acp)
  if (reject) fail(new Error(reject))
  else release(response)
  const outcome = await done
  await tick()
  return { acp, service, events, outcome }
}

const ofType = (events, type) => events.filter((event) => event.type === type)

test("① an adapter that never said why the turn ended is not reported as a clean stop", async () => {
  const { events, outcome } = await runTurn({ response: {} })
  const facts = ofType(events, "session.stop_reason_not_reported")
  assert.equal(facts.length, 1, "exactly one fact for the turn")
  assert.equal(facts[0].sessionId, "native-1")
  assert.equal(facts[0].responseRecorded, true, "the turn did answer — only the reason is missing")
  assert.equal(facts[0].stopReason, null, "an absent reason stays absent; nothing is invented")
  // The fact must precede the notification that ends the wait (`session.updated` fires earlier too,
  // when the turn starts), or a projection built on the completion leg could not see it.
  assert.ok(events.findIndex((event) => event.type === "session.stop_reason_not_reported")
    < events.findLastIndex((event) => event.type === "session.updated"),
  "reported before the turn is declared idle")
  assert.equal(outcome.ok, true)
  assert.deepEqual(outcome.result, {}, "the caller still gets the raw response, un-filled-in")
})

test("② a reported reason stays silent and keeps its own meaning", async () => {
  for (const stopReason of ["end_turn", "max_tokens", "cancelled"]) {
    const { events, outcome } = await runTurn({ response: { stopReason } })
    assert.deepEqual(ofType(events, "session.stop_reason_not_reported"), [], `no fact for ${stopReason}`)
    assert.equal(outcome.result.stopReason, stopReason,
      `the ${stopReason} verdict survives to the caller, which is what the terminal reason is built from`)
  }
})

test("③ a failed turn is reported once, as a failure", async () => {
  const { events, outcome } = await runTurn({ reject: "adapter exploded" })
  assert.equal(outcome.ok, false)
  assert.equal(outcome.message, "adapter exploded")
  assert.equal(ofType(events, "session.error").length, 1)
  assert.deepEqual(ofType(events, "session.stop_reason_not_reported"), [],
    "a turn that never answered is a different fact from one that answered without a reason")
})

const transcriptOf = async (service) => (await service.messages("native-1"))
  .flatMap((message) => message.parts ?? [])
  .filter((part) => typeof part.text === "string")
  .map((part) => part.text).join("")

test("④ a tail chunk arriving after the drain window closes is counted where it is dropped", async () => {
  const { acp, service, events } = await runTurn({
    promptSettleMs: 30,
    response: { stopReason: "end_turn" },
    duringTurn: async (peer) => { peer.emit("notification", assistantChunk("during")); await tick() },
  })
  assert.match(await transcriptOf(service), /during/, "a chunk inside the turn is accepted")

  acp.emit("notification", assistantChunk("after-one"))
  await tick()
  acp.emit("notification", assistantChunk("after-two"))
  await tick()

  const facts = ofType(events, "session.tail_dropped")
  assert.equal(facts.length, 2, "each rejected tail chunk is reported, not swallowed")
  assert.deepEqual(facts.map((fact) => fact.dropped), [1, 2], "the running count is per session")
  assert.deepEqual(facts.map((fact) => fact.characters), ["after-one".length, "after-two".length],
    "the amount lost is stated in characters, never as content")
  assert.deepEqual(facts.map((fact) => fact.sessionUpdate), ["agent_message_chunk", "agent_message_chunk"])
  assert.match(await transcriptOf(service), /during/, "the accepted text is untouched")
  assert.doesNotMatch(await transcriptOf(service), /after-/,
    "reporting the loss does not widen the window or rescue the chunk")
})

test("⑤ a session with no drain window keeps its permissive history and claims no loss", async () => {
  const { acp, service, events } = await runTurn({ promptSettleMs: 0, response: { stopReason: "end_turn" } })
  acp.emit("notification", assistantChunk("late-but-kept"))
  await tick()
  assert.deepEqual(ofType(events, "session.tail_dropped"), [],
    "an adapter that never opted into a window is not told it lost anything")
  assert.match(await transcriptOf(service), /late-but-kept/, "its historical behaviour is unchanged")
})

test("⑥ the next turn owns its own tail count", async () => {
  const { acp, service } = makeService({ promptSettleMs: 20 })
  await service.claimSession("native-1")
  let release
  acp.request = (method) => method === "session/prompt"
    ? new Promise((resolve) => { release = resolve })
    : Promise.resolve({ configOptions: [] })
  const events = []
  service.subscribe((event) => events.push(event))

  const first = service.promptAndWait("native-1", "one")
  await tick(1)
  release({ stopReason: "end_turn" })
  await first
  acp.emit("notification", assistantChunk("lost-one"))
  await tick()

  const second = service.promptAndWait("native-1", "two")
  await tick(1)
  release({ stopReason: "end_turn" })
  await second
  acp.emit("notification", assistantChunk("lost-two"))
  await tick()

  const counts = ofType(events, "session.tail_dropped").map((fact) => fact.dropped)
  assert.deepEqual(counts, [1, 1], "a count never bleeds from one turn into the next")
})

test("every AgentBox profile declares a real drain window, so ④ applies to them", async () => {
  const ids = Object.keys(AGENTBOX_HARNESS_PROFILES)
  assert.deepEqual(ids, ["hermes", "dsh", "claude-code", "qwen", "kilo"],
    "the profiles this increment had to give a window to")
  for (const id of ids) {
    const value = AGENTBOX_HARNESS_PROFILES[id].promptSettleMs
    assert.equal(typeof value, "number", `${id} declares a number`)
    assert.ok(value > 0, `${id} closes its window instead of leaving it open for the session's life`)
  }
  // Pi already had one upstream; this increment must not have moved it.
  assert.equal(upstreamProfile("pi").promptSettleMs, 250)
})
