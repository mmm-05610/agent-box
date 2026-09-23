// C-0080: direct 0.86.1 SettingsManager.create probe. No CLI, Agent or model.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const modulePath = '/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js';
const expectedSha = '5368b155ec26d88374cec9e66b8e588b5041a0fb0047414f70b34e13892c4f48';
const realAgentDir = '/home/maoqh/.pi/agent';
const mode = process.argv[2];
if (!['synthetic', 'real'].includes(mode)) process.exit(64);
let root;
try {
  const actualSha = createHash('sha256').update(readFileSync(modulePath)).digest('hex');
  if (actualSha !== expectedSha) throw new Error('MODULE_SHA_MISMATCH');
  root = mkdtempSync(join(tmpdir(), 'hd002-settings-component-'));
  const cwd = join(root, 'project');
  mkdirSync(cwd);
  const agentDir = mode === 'real' ? realAgentDir : join(root, 'agent');
  if (mode === 'synthetic') {
    mkdirSync(agentDir);
    writeFileSync(join(agentDir, 'settings.json'), '{}\n', { mode: 0o600 });
  }
  const settingsPath = join(agentDir, 'settings.json');
  const lockPath = `${settingsPath}.lock`;
  if (!existsSync(settingsPath)) throw new Error('SETTINGS_MISSING');
  if (existsSync(lockPath)) throw new Error('LOCK_PRESENT_BEFORE');
  const before = mode === 'synthetic' ? createHash('sha256').update(readFileSync(settingsPath)).digest('hex') : null;
  const { SettingsManager } = await import(modulePath);
  const manager = SettingsManager.create(cwd, agentDir);
  const errors = manager.drainErrors();
  const code = (e) => {
    const value = e?.error?.code;
    return typeof value === 'string' && /^(E[A-Z0-9_]{1,24}|ELOCKED)$/.test(value) ? value : 'OTHER';
  };
  const output = {
    mode,
    moduleShaMatched: true,
    globalWarning: errors.some((e) => e.scope === 'global'),
    errors: errors.map((e) => ({ scope: e.scope === 'global' ? 'global' : e.scope === 'project' ? 'project' : 'unknown', code: code(e) })),
    lockReleased: !existsSync(lockPath),
    syntheticSettingsUnchanged: mode === 'synthetic' ? before === createHash('sha256').update(readFileSync(settingsPath)).digest('hex') : null,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (!output.lockReleased || (mode === 'synthetic' && !output.syntheticSettingsUnchanged)) process.exitCode = 1;
} catch (e) {
  const value = e instanceof Error ? e.message : '';
  const safe = ['MODULE_SHA_MISMATCH', 'SETTINGS_MISSING', 'LOCK_PRESENT_BEFORE'].includes(value) ? value : 'UNCLASSIFIED';
  process.stdout.write(`${JSON.stringify({ mode, fatal: safe })}\n`);
  process.exitCode = 1;
} finally {
  if (root) rmSync(root, { recursive: true, force: true });
}
