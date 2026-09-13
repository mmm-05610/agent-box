import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.AGENT_CONTROLLER_CHECKOUT
  ?? "/tmp/agentbox-harness-selection-38.otEluD/checkouts/agent-controller";
const RESEARCH_ROOT = process.env.AGENTBOX_RESEARCH_ROOT
  ?? "/tmp/agentbox-harness-selection-38.otEluD";
const codex = await import(`${ROOT}/runtime-codex/dist/event-translator.js`);
const codexInvocation = await import(`${ROOT}/runtime-codex/dist/codex-invocation.js`);
const codexHome = await import(`${ROOT}/runtime-codex/dist/codex-home.js`);
const opencode = await import(`${ROOT}/runtime-opencode/dist/event-translator.js`);
const opencodeConfig = await import(`${ROOT}/runtime-opencode/dist/opencode-config.js`);
const claude = await import(`${ROOT}/runtime-claude/dist/event-translator.js`);
const claudeInvocation = await import(`${ROOT}/runtime-claude/dist/claude-invocation.js`);
const piAdapter = await import(`${ROOT}/runtime/dist/adapter.js`);

const baseSpec = {
  v: 1,
  metadata: { name: "stage-b" },
  model: { provider: "openai", name: "fixture-model" },
  task: "fixture task",
  tools: [],
  extensions: [],
  skills: [],
  runtime: { type: "local-codex" },
};

function event(type, payload) {
  return { payload: { type, properties: payload } };
}

// 1. Codex: event arrives before terminal, native command/tool semantics are retained.
{
  const state = codex.createTranslatorState();
  const first = codex.translateCodexLine(
    JSON.stringify({ type: "thread.started", thread_id: "native-thread-7" }),
    "wire-codex", state,
  );
  const middle = codex.translateCodexLine(
    JSON.stringify({ type: "item.completed", item: {
      type: "command_execution", id: "call-1", command: "printf fixture",
      aggregated_output: "fixture-output", exit_code: 0,
    } }), "wire-codex", state,
  );
  assert.equal(first.threadId, "native-thread-7");
  assert.deepEqual(middle.events.map((x) => x.type), ["tool.call", "tool.result"]);
  assert.equal(state.ended, false, "tool event must precede terminal event");
  const end = codex.translateCodexLine(
    JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1 } }),
    "wire-codex", state,
  );
  assert.equal(end.events[0].type, "session.ended");
  assert.equal(end.events[0].data.reason, "completed");
  assert.equal(state.ended, true);

  const args = codexInvocation.buildCodexArgs(baseSpec, {
    cwd: "/tmp/agentbox-stage-b-cwd", resumeThreadId: "native-thread-7",
  });
  assert.deepEqual(args.slice(0, 3), ["exec", "resume", "native-thread-7"]);
  assert.equal(args.includes("-s") && args.includes("workspace-write"), true);
}

// 2. OpenCode: streamed text and native tool permission survive until idle.
{
  const state = opencode.createTranslatorState();
  const sid = "oc-native-session";
  const textRole = opencode.translateEvent(
    event("message.updated", { info: { id: "m1", sessionID: sid, role: "assistant" } }),
    "wire-opencode", sid, state,
  );
  assert.equal(textRole.sessionIdle, false);
  const delta = opencode.translateEvent(
    event("message.part.updated", { part: {
      id: "p1", sessionID: sid, messageID: "m1", type: "text",
      text: "native streamed text", delta: "native streamed text",
    } }), "wire-opencode", sid, state,
  );
  assert.deepEqual(delta.wireEvents, []);
  const idle = opencode.translateEvent(
    event("session.idle", { sessionID: sid }), "wire-opencode", sid, state,
  );
  assert.equal(idle.sessionIdle, true);
  assert.equal(idle.wireEvents[0].type, "message");
  assert.equal(idle.wireEvents[0].data.text, "native streamed text");

  const toolState = opencode.createTranslatorState();
  const running = opencode.translateEvent(
    event("message.part.updated", { part: {
      id: "tp1", sessionID: sid, messageID: "m2", type: "tool", tool: "native_tool",
      callID: "tool-call-1", state: { status: "running", input: { x: 1 } },
    } }), "wire-opencode", sid, toolState,
  );
  const completed = opencode.translateEvent(
    event("message.part.updated", { part: {
      id: "tp1", sessionID: sid, messageID: "m2", type: "tool", tool: "native_tool",
      callID: "tool-call-1", state: { status: "completed", output: "native-result" },
    } }), "wire-opencode", sid, toolState,
  );
  assert.equal(running.wireEvents[0].type, "tool.call");
  assert.equal(completed.wireEvents[0].type, "tool.result");
  assert.equal(completed.wireEvents[0].data.content, "native-result");

  const spec = { ...baseSpec, model: { provider: "anthropic", name: "fixture" },
    runtime: { type: "local-opencode" },
    tools: [{ name: "bash", builtin: true }],
    mcpServers: [{ name: "fixture", transport: "stdio", command: "fixture-peer" }] };
  const cfg = opencodeConfig.buildOpencodeConfig(spec);
  assert.equal(cfg.agent["stage-b"].permission.bash, "allow");
  assert.deepEqual(cfg.mcp.fixture.command, ["fixture-peer"]);
  assert.throws(() => opencodeConfig.buildOpencodeConfig({ ...spec,
    tools: [{ name: "custom", entrypoint: "/tmp/custom.js" }] }), /custom|unsupported/i);
}

// 3. Claude: native session identity and tool use/result are preserved.
{
  const state = claude.createTranslatorState();
  const init = claude.translateSdkMessage(
    { type: "system", subtype: "init", session_id: "sdk-native-9", model: "fixture" },
    "wire-claude", state,
  );
  const assistant = claude.translateSdkMessage(
    { type: "assistant", message: { content: [
      { type: "text", text: "before terminal" },
      { type: "tool_use", id: "claude-call-1", name: "Bash", input: { command: "fixture" } },
    ] } }, "wire-claude", state,
  );
  const result = claude.translateSdkMessage(
    { type: "user", message: { content: [
      { type: "tool_result", tool_use_id: "claude-call-1", content: "fixture-result", is_error: false },
    ] } }, "wire-claude", state,
  );
  assert.equal(init.sdkSessionId, "sdk-native-9");
  assert.deepEqual(assistant.events.map((x) => x.type), ["message", "tool.call"]);
  assert.equal(result.events[0].type, "tool.result");
  assert.equal(state.ended, false, "Claude events must precede result terminal event");
  const spec = { ...baseSpec, model: { provider: "anthropic", name: "fixture" },
    runtime: { type: "local-claude" }, sessionId: "agent-session-9",
    tools: [{ name: "bash", builtin: true }] };
  const first = claudeInvocation.buildOptions(spec, "fixture-system", {}, undefined);
  const resumed = claudeInvocation.buildOptions(spec, "fixture-system", {}, "sdk-native-9");
  assert.equal(first.sessionId, claudeInvocation.deriveSdkSessionUuid("agent-session-9"));
  assert.equal(first.resume, undefined);
  assert.equal(resumed.resume, "sdk-native-9");
  assert.equal(resumed.sessionId, undefined);
  assert.throws(() => claudeInvocation.assertClaudeCompatible({ ...spec,
    model: { provider: "openai", name: "fixture" } }), /provider/i);
}

// 4. Cancel versus disconnect: adapter source owns cancellation; translator EOF has no idle.
{
  const adapterSource = readFileSync(`${ROOT}/runtime-opencode/src/index.ts`, "utf8");
  assert.match(adapterSource, /shutdownOnSignal/);
  assert.match(adapterSource, /reason: "cancelled"/);
  assert.match(adapterSource, /abortController\.abort/);
  const state = opencode.createTranslatorState();
  const eof = opencode.translateEvent(
    event("message.part.updated", { part: {
      id: "eof-p", sessionID: "disconnect-session", messageID: "eof-m",
      type: "text", text: "partial", delta: "partial",
    } }), "wire-disconnect", "disconnect-session", state,
  );
  assert.equal(eof.sessionIdle, false);
  assert.equal(eof.sessionError, undefined);
  // The actual adapter converts SSE EOF without idle to an error after the
  // translator returns; this assertion checks that cancellation is a distinct
  // adapter-owned terminal path rather than being synthesized by translation.
  assert.match(adapterSource, /SSE stream closed without session\.idle/);
}

// 5. Pi: use the candidate's built adapter seam and Pi's own upstream extension path.
{
  const upstream = piAdapter.resolveUpstreamSubagentPath();
  assert.equal(existsSync(upstream), true);
  assert.match(upstream, /pi-coding-agent[\\/]examples[\\/]extensions[\\/]subagent[\\/]index\.ts$/);
  const piPkg = await import(`${ROOT}/runtime/node_modules/@earendil-works/pi-coding-agent/dist/index.js`);
  assert.equal(typeof piPkg.createAgentSession, "function");
  assert.equal(typeof piPkg.DefaultResourceLoader, "function");
}

// 6. Native Codex home behavior and invalid capability/identity rejection.
{
  const experimentRoot = join(RESEARCH_ROOT, "homes", "experiment-tmp");
  mkdirSync(experimentRoot, { recursive: true });
  const isolatedXdg = mkdtempSync(join(experimentRoot, "agent-controller-xdg-"));
  const previous = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = isolatedXdg;
  try {
    const resolved = codexHome.resolveCodexHome("native-session");
    assert.equal(resolved.ephemeral, false);
    assert.match(resolved.dir, /agent-controller[\\/]codex-sessions[\\/]native-session$/);
    assert.throws(() => codexHome.resolveCodexHome("../escape"), /invalid session id/i);
  } finally {
    if (previous === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = previous;
    rmSync(isolatedXdg, { recursive: true, force: true });
  }
  assert.throws(() => codexInvocation.assertCodexCompatible({ ...baseSpec,
    extensions: [{ name: "pi-native-extension" }] }), /extensions/i);
  assert.throws(() => codexInvocation.buildConfigToml({ ...baseSpec,
    mcpServers: [{ name: "fixture", transport: "sse", url: "http://fixture" }] }), /SSE/i);
}

console.log("agent-controller Stage B narrow experiment: PASS");
console.log("platform:", process.platform, process.arch, "node:", process.version);
console.log("coverage: Codex/OpenCode/Claude/Pi seams, pre-terminal events, native identity/resume, native tools, cancel-vs-EOF distinction, invalid capability/parameter rejection");
console.log("safety: no provider/model/login calls; provider/token/auth env cleared by runner; isolated temporary XDG/HOME");
