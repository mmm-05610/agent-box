/*
 * WO38 Stage B: bounded Codex ACP lower-layer experiment.
 *
 * Run from the codex-acp checkout with:
 *   node --import tsx <this-file>
 *
 * The imports below are the candidate's real TypeScript implementation. The
 * fake executable is only an app-server peer; it never contacts a provider.
 */
import assert from "node:assert/strict";
import {chmod, mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";

// This is the exact adapter version selected by harness-remote v3.0.2.
// CODEX_ACP_CHECKOUT permits a caller to repeat the same seam check against a
// future reviewed checkout without changing the experiment.
const checkout = process.env.CODEX_ACP_CHECKOUT
    ?? "/tmp/agentbox-harness-selection-38.otEluD/checkouts/codex-acp-1.1.14";
const researchRoot = process.env.AGENTBOX_RESEARCH_ROOT
    ?? "/tmp/agentbox-harness-selection-38.otEluD";
const {startCodexConnection} = await import(`${checkout}/src/CodexJsonRpcConnection.ts`);
const {CodexAppServerClient} = await import(`${checkout}/src/CodexAppServerClient.ts`);

const experimentRoot = join(researchRoot, "homes", "experiment-tmp");
await mkdir(experimentRoot, {recursive: true});
const root = await mkdtemp(join(experimentRoot, "codex-acp-stage-b-"));
const log = join(root, "argv.json");
const fake = join(root, "fake-codex.mjs");
await writeFile(fake, `#!/usr/bin/env node
import fs from "node:fs";
const log = process.env.FAKE_CODEX_LOG;
fs.writeFileSync(log, JSON.stringify({ argv: process.argv.slice(2), home: process.env.HOME }));
let buf = "";
function reply(id, result) { process.stdout.write(JSON.stringify({jsonrpc:"2.0", id, result}) + "\\n"); }
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  for (;;) {
    const i = buf.indexOf("\\n");
    if (i < 0) break;
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") reply(msg.id, {codexHome: process.env.HOME, userAgent: "fake-app-server"});
    else if (msg.method === "thread/resume") reply(msg.id, {thread: {id: msg.params.threadId, cwd: msg.params.cwd ?? "/tmp/wo38", modelProvider: "openai", modelId: "fake-model"}});
    else if (msg.method === "turn/interrupt") {
      reply(msg.id, {turn: {id: msg.params.turnId, status: "interrupted"}});
      process.stdout.write(JSON.stringify({jsonrpc:"2.0", method:"turn/completed", params:{threadId:msg.params.threadId, turn:{id:msg.params.turnId,status:"interrupted"}}}) + "\\n");
    } else reply(msg.id, {});
  }
});
`, "utf8");
await chmod(fake, 0o755);

const safeHome = join(root, "home");
const env = {
  PATH: process.env.PATH ?? "",
  HOME: safeHome,
  FAKE_CODEX_LOG: log,
};
const peer = startCodexConnection(fake, env);
const app = new CodexAppServerClient(peer.connection);
const events = [];
app.onServerNotification("thread-1", (event) => events.push(event));

try {
  const initialized = await app.initialize({capabilities: {experimentalApi: true, requestAttestation: false}, clientInfo: {name: "wo38-test", version: "0"}});
  assert.equal(initialized.codexHome, safeHome);

  const resume = await app.threadResume({threadId: "thread-1", cwd: "/tmp/wo38", model: "fake-model"});
  assert.equal(resume.thread.id, "thread-1");

  const interrupted = await app.turnInterrupt({threadId: "thread-1", turnId: "turn-1"});
  assert.equal(interrupted.turn.status, "interrupted");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(events.length > 0, `expected a routed event, got ${JSON.stringify(events)}`);
  assert.equal(events.at(-1)?.method, "turn/completed");
  assert.equal(events.at(-1)?.params.turn.status, "interrupted");

  const launch = JSON.parse(await readFile(log, "utf8"));
  assert.deepEqual(launch.argv, ["app-server"]);
  assert.equal(launch.home, safeHome);
  console.log(JSON.stringify({
    pass: true,
    launchArgv: launch.argv,
    initialize: initialized,
    resumeThreadId: resume.thread.id,
    interruptStatus: interrupted.turn.status,
    event: events.at(-1),
    note: "fake peer only; no provider/model/authentication call",
  }));
} finally {
  peer.connection.dispose();
  peer.process.kill();
  await rm(root, {recursive: true, force: true});
}
