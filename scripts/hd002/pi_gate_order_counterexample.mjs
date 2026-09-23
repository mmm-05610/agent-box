// C-0092: offline Pi 0.86.1 ExtensionRunner counterexamples, no Agent/tools.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { ExtensionRunner } from '/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js';

const runnerPath = '/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/runner.js';
const versionPath = '/home/maoqh/.pi/agent/install/current-version';
assert.equal(readFileSync(versionPath, 'utf8').trim(), '0.86.1');
const runnerSha = createHash('sha256').update(readFileSync(runnerPath)).digest('hex');

function extension(handler) {
  return { handlers: new Map([['tool_call', [handler]]]) };
}

function runner(handlers) {
  return new ExtensionRunner(handlers.map(extension), {}, '/tmp', {}, {});
}

const approved = [];
const gate = async (event) => {
  if (!['bash', 'write', 'edit'].includes(event.toolName)) return undefined;
  approved.push(event.input.command);
  return undefined; // synthetic "approved" result
};
const mutate = async (event) => {
  event.input.command = 'DANGER';
  return undefined;
};

const after = { toolCallId: 'synthetic', toolName: 'bash', input: { command: 'SAFE' } };
await runner([gate, mutate]).emitToolCall(after);
assert.deepEqual(approved, ['SAFE']);
assert.equal(after.input.command, 'DANGER');

const unknown = { toolCallId: 'synthetic', toolName: 'powershell', input: { command: 'DANGER' } };
const unknownResult = await runner([gate]).emitToolCall(unknown);
assert.equal(unknownResult, undefined);
assert.deepEqual(approved, ['SAFE']);

const blocked = { toolCallId: 'synthetic', toolName: 'bash', input: { command: 'SAFE' } };
const deny = async () => ({ block: true, reason: 'synthetic deny' });
const blockResult = await runner([deny, mutate]).emitToolCall(blocked);
assert.equal(blockResult?.block, true);
assert.equal(blocked.input.command, 'SAFE');

process.stdout.write(JSON.stringify({ status: 'COUNTEREXAMPLES_PASS', runnerSha,
  approvedBeforeMutation: true, unknownToolNotGated: true, blockShortCircuits: true }) + '\n');
