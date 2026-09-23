// Offline only: synthetic ExtensionAPI. Never launches Pi, bridge or Server.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, chmodSync, symlinkSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import hd002ToolCount from './pi_tool_count_extension.mjs';

const roots = [];
function freshDir() {
  const dir = mkdtempSync(join(tmpdir(), 'hd002-pi-count-'));
  chmodSync(dir, 0o700);
  roots.push(dir);
  return dir;
}
function synthetic(tools) {
  let handler;
  hd002ToolCount({
    on(event, callback) { assert.equal(event, 'session_start'); handler = callback; },
    getActiveTools() { return tools; },
  });
  return (reason) => handler({ type: 'session_start', reason });
}
function record(dir, phase) {
  const file = join(dir, `${phase}.json`);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(value), ['schema', 'phase', 'activeToolCount', 'diagnosticLoaded']);
  return value;
}

const clean = freshDir();
process.env.HD002_PI_COUNT_DIR = clean;
const runClean = synthetic([]);
runClean('startup');
runClean('new');
assert.deepEqual(record(clean, 'startup'), {
  schema: 1, phase: 'startup', activeToolCount: 0, diagnosticLoaded: true,
});
assert.equal(record(clean, 'new').activeToolCount, 0);
assert.throws(() => runClean('new'), { code: 'EEXIST' });

const extraTool = freshDir();
process.env.HD002_PI_COUNT_DIR = extraTool;
synthetic(['unexpected_tool'])('new');
assert.equal(record(extraTool, 'new').activeToolCount, 1);
assert.notEqual(record(extraTool, 'new').activeToolCount, 0);

const symlinkRoot = freshDir();
const target = freshDir();
const link = join(symlinkRoot, 'linked');
symlinkSync(target, link);
process.env.HD002_PI_COUNT_DIR = link;
assert.throws(() => synthetic([])('new'));

const weak = freshDir();
chmodSync(weak, 0o755);
process.env.HD002_PI_COUNT_DIR = weak;
assert.throws(() => synthetic([])('new'));

const residual = freshDir();
writeFileSync(join(residual, 'new.json'), 'residual', { mode: 0o600 });
process.env.HD002_PI_COUNT_DIR = residual;
assert.throws(() => synthetic([])('new'), { code: 'EEXIST' });
assert.equal(readFileSync(join(residual, 'new.json'), 'utf8'), 'residual');

// Bridge supplies gate --extension before ExtraArgs. strings.Fields in the bridge
// requires a whitespace-free diagnostic path. Validate exact append-only shape.
const diagnostic = new URL('./pi_tool_count_extension.mjs', import.meta.url).pathname;
assert.equal(/\s/.test(diagnostic), false);
function approved(args) {
  return args.length === 4 && args[0] === '--no-tools' &&
    args[1] === '--no-extensions' && args[2] === '--extension' &&
    args[3] === diagnostic;
}
assert.equal(approved(['--no-tools', '--no-extensions', '--extension', diagnostic]), true);
assert.equal(approved(['--no-tools', '--no-extensions', '--extension', diagnostic,
  '--extension', '/extra.mjs']), false);
assert.equal(approved(['--no-tools', '--extension', diagnostic]), false);
// Parse the bridge's configured pi-args exactly as its strings.Fields would.
const piArgs = `--no-tools --no-extensions --extension ${diagnostic}`;
assert.equal(approved(piArgs.split(/\s+/)), true);
const gate = '/private/gate.mjs';
function approvedFinalArgv(args) {
  const extensions = args.flatMap((arg, i) => arg === '--extension' ? [args[i + 1]] : []);
  return extensions.length === 2 && extensions[0] === gate &&
    extensions[1] === diagnostic &&
    approved(args.slice(4));
}
const finalArgv = ['--mode', 'rpc', '--extension', gate, ...piArgs.split(/\s+/)];
assert.equal(approvedFinalArgv(finalArgv), true);
assert.equal(approvedFinalArgv([...finalArgv, '--extension', '/extra.mjs']), false);
assert.equal(approvedFinalArgv(['--mode', 'rpc', ...piArgs.split(/\s+/)]), false);

assert.ok(roots.length >= 1);
for (const dir of roots) rmSync(dir, { recursive: true, force: true });
delete process.env.HD002_PI_COUNT_DIR;
process.stdout.write('PASS synthetic Pi count extension: zero/extra tool, phase, file and argv guards\n');
