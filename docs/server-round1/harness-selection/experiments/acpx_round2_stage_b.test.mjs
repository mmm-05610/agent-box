import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const checkout = process.env.ACPX_CHECKOUT;
const researchRoot = process.env.AGENTBOX_RESEARCH_ROOT;
assert.ok(checkout, "ACPX_CHECKOUT is required");
assert.ok(researchRoot, "AGENTBOX_RESEARCH_ROOT is required");

const expectedCheckout = path.join(researchRoot, "checkouts", "acpx-review");
assert.equal(await fs.realpath(checkout), await fs.realpath(expectedCheckout));
const runtimeModule = await import(pathToFileURL(path.join(checkout, "dist", "runtime.js")).href);
const mockAgent = path.join(checkout, "dist-test", "test", "mock-agent.js");
await fs.access(mockAgent);

function memoryStore() {
  const records = new Map();
  return {
    records,
    async load(id) {
      const value = records.get(id);
      return value === undefined ? undefined : structuredClone(value);
    },
    async save(record) {
      records.set(record.acpxRecordId, structuredClone(record));
    },
  };
}

function fixedRegistry(agentName, args) {
  const command = [process.execPath, mockAgent, ...args];
  return {
    resolve(requested) {
      assert.equal(requested, agentName);
      return [...command];
    },
    list() {
      return [agentName];
    },
  };
}

function lifecycleLog() {
  const entries = [];
  return {
    entries,
    observer: {
      onBeforeSpawn(launch) {
        assert.equal(path.isAbsolute(launch.command), true);
        assert.equal(launch.command, process.execPath);
        assert.equal(launch.args[0], mockAgent);
        entries.push({ type: "before", pid: undefined, scope: launch.scope });
      },
      onSpawned(started) {
        entries.push({ type: "spawned", pid: started.pid, scope: started.scope });
      },
      onExit(exited) {
        entries.push({
          type: "exit",
          pid: exited.pid,
          scope: exited.scope,
          exitCode: exited.exitCode,
          signal: exited.signal,
        });
      },
    },
  };
}

function makeRuntime({ name, store, args, permissions, lifecycle }) {
  return runtimeModule.createAcpRuntime({
    cwd: path.join(researchRoot, "acpx", "experiment"),
    sessionStore: store,
    agentRegistry: fixedRegistry(name, args),
    permissionMode: "deny-all",
    nonInteractivePermissions: "deny",
    agentProcessEnv: {
      HOME: path.join(researchRoot, "acpx", "native-home"),
      XDG_CONFIG_HOME: path.join(researchRoot, "acpx", "native-xdg-config"),
      XDG_DATA_HOME: path.join(researchRoot, "acpx", "native-xdg-data"),
      AGENTBOX_FAKE_ONLY: "1",
    },
    onPermissionRequest: permissions,
    processLifecycle: lifecycle,
    timeoutMs: 2_000,
  });
}

async function collectTurn(turn, onEvent) {
  const events = [];
  for await (const event of turn.events) {
    events.push(event);
    onEvent?.(event);
  }
  return { events, result: await turn.result };
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 2_000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(predicate(), true, message);
}

await fs.mkdir(path.join(researchRoot, "acpx", "experiment"), { recursive: true });
await fs.mkdir(path.join(researchRoot, "acpx", "native-home"), { recursive: true });
await fs.mkdir(path.join(researchRoot, "acpx", "native-xdg-config"), { recursive: true });
await fs.mkdir(path.join(researchRoot, "acpx", "native-xdg-data"), { recursive: true });

test("fixed acpx runtime streams before completion and preserves native resume/config state", async () => {
  const store = memoryStore();
  const lifecycle = lifecycleLog();
  const args = [
    "--supports-resume-session",
    "--codex-session-id",
    "codex-native-first",
    "--resume-codex-session-id",
    "codex-native-resumed",
    "--advertise-config-options",
  ];
  const runtime = makeRuntime({
    name: "fixed-codex-peer",
    store,
    args,
    lifecycle: lifecycle.observer,
  });
  const handle = await runtime.ensureSession({
    sessionKey: "round2-codex",
    agent: "fixed-codex-peer",
    mode: "persistent",
  });
  assert.equal(handle.agentSessionId, "codex-native-first");
  const originalBackendSessionId = handle.backendSessionId;

  const turn = runtime.startTurn({
    handle,
    text: "stream-sleep 150 visible-before-result",
    mode: "prompt",
    requestId: "round2-live-event",
  });
  let terminalSettled = false;
  void turn.result.finally(() => {
    terminalSettled = true;
  });
  let sawLiveBeforeTerminal = false;
  const observed = await collectTurn(turn, (event) => {
    if (event.type === "text_delta" && event.text === "visible-before-result") {
      sawLiveBeforeTerminal = !terminalSettled;
    }
  });
  assert.equal(sawLiveBeforeTerminal, true);
  assert.deepEqual(observed.result, { status: "completed", stopReason: "end_turn" });

  const config = await runtime.setConfigOption({
    handle,
    key: "reasoning_effort",
    value: "high",
  });
  assert.equal(
    config.configOptions.find((option) => option.id === "reasoning_effort")?.currentValue,
    "high",
  );
  await assert.rejects(
    runtime.setConfigOption({ handle, key: "unknown_native_option", value: "x" }),
    /not advertised|unsupported|unknown/i,
  );
  await runtime.close({ handle, reason: "reconnect proof" });

  const resumedRuntime = makeRuntime({
    name: "fixed-codex-peer",
    store,
    args,
    lifecycle: lifecycle.observer,
  });
  const resumed = await resumedRuntime.ensureSession({
    sessionKey: "round2-codex",
    agent: "fixed-codex-peer",
    mode: "persistent",
  });
  assert.equal(resumed.backendSessionId, originalBackendSessionId);
  assert.equal(resumed.agentSessionId, "codex-native-first");
  const resumedTurn = await collectTurn(
    resumedRuntime.startTurn({
      handle: resumed,
      text: "echo resumed-session",
      mode: "prompt",
      requestId: "round2-resumed-turn",
    }),
  );
  assert.equal(resumedTurn.result.status, "completed");
  const resumedStatus = await resumedRuntime.getStatus({ handle: resumed });
  assert.equal(resumedStatus.backendSessionId, originalBackendSessionId);
  assert.equal(resumedStatus.agentSessionId, "codex-native-resumed");
  await resumedRuntime.close({ handle: resumed, reason: "test complete" });

  assert.equal(lifecycle.entries.filter((entry) => entry.type === "spawned").length, 2);
  assert.equal(lifecycle.entries.filter((entry) => entry.type === "exit").length, 2);
  assert.equal(
    lifecycle.entries.every(
      (entry) => entry.scope.kind === "runtime-session" && entry.scope.sessionKey === "round2-codex",
    ),
    true,
  );
});

test("fixed acpx runtime keeps permission denial, cancellation, and disconnect distinct", async () => {
  const permissionStore = memoryStore();
  let permissionRequests = 0;
  const permissionRuntime = makeRuntime({
    name: "fixed-permission-peer",
    store: permissionStore,
    args: [],
    permissions: async (request) => {
      permissionRequests += 1;
      assert.equal(request.inferredKind, "edit");
      return { outcome: "reject_once" };
    },
  });
  const permissionHandle = await permissionRuntime.ensureSession({
    sessionKey: "round2-permission",
    agent: "fixed-permission-peer",
    mode: "persistent",
  });
  const denied = await collectTurn(
    permissionRuntime.startTurn({
      handle: permissionHandle,
      text: "permission edit protected-change",
      mode: "prompt",
      requestId: "round2-deny",
    }),
  );
  assert.equal(permissionRequests, 1);
  assert.equal(
    denied.events.some(
      (event) => event.type === "text_delta" && event.text === "permission selected:reject",
    ),
    true,
  );
  assert.equal(denied.result.status, "completed");
  await permissionRuntime.close({ handle: permissionHandle, reason: "deny proof complete" });

  const cancelRuntime = makeRuntime({
    name: "fixed-cancel-peer",
    store: memoryStore(),
    args: [],
  });
  const cancelHandle = await cancelRuntime.ensureSession({
    sessionKey: "round2-cancel",
    agent: "fixed-cancel-peer",
    mode: "persistent",
  });
  const cancellable = cancelRuntime.startTurn({
    handle: cancelHandle,
    text: "sleep 1000",
    mode: "prompt",
    requestId: "round2-cancel",
  });
  await cancellable.promptStarted;
  await cancellable.cancel({ reason: "controlled cancellation" });
  const cancelled = await collectTurn(cancellable);
  assert.equal(cancelled.result.status, "cancelled");
  await cancelRuntime.close({ handle: cancelHandle, reason: "cancel proof complete" });

  const disconnectLifecycle = lifecycleLog();
  const disconnectRuntime = makeRuntime({
    name: "fixed-disconnect-peer",
    store: memoryStore(),
    args: [],
    lifecycle: disconnectLifecycle.observer,
  });
  const disconnectHandle = await disconnectRuntime.ensureSession({
    sessionKey: "round2-disconnect",
    agent: "fixed-disconnect-peer",
    mode: "persistent",
  });
  const disconnected = await collectTurn(
    disconnectRuntime.startTurn({
      handle: disconnectHandle,
      text: "disconnect 50",
      mode: "prompt",
      requestId: "round2-disconnect",
    }),
  );
  assert.equal(disconnected.result.status, "failed");
  assert.match(disconnected.result.error.message, /exit|disconnect|closed/i);
  await waitUntil(
    () => disconnectLifecycle.entries.some((entry) => entry.exitCode === 91),
    "process lifecycle observer did not receive the fake peer exit",
  );
  await disconnectRuntime.close({ handle: disconnectHandle, reason: "disconnect proof complete" });
});
