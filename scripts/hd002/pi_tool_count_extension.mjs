// HD-002 test-only Pi extension. It does not register tools, providers or commands.
import { constants, closeSync, fstatSync, lstatSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

const OUTPUT_DIR_ENV = 'HD002_PI_COUNT_DIR';
const REASONS = new Set(['startup', 'new']);

function privateOutputDir() {
  const dir = process.env[OUTPUT_DIR_ENV];
  if (!dir || !isAbsolute(dir) || realpathSync(dir) !== dir) {
    throw new Error('HD002 count directory must be an existing physical absolute path');
  }
  const stat = lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() ||
      (stat.mode & 0o777) !== 0o700) {
    throw new Error('HD002 count directory must be owned by this user and mode 0700');
  }
  return dir;
}

export default function hd002ToolCount(pi) {
  pi.on('session_start', (event) => {
    if (!REASONS.has(event.reason)) return;
    const tools = pi.getActiveTools();
    if (!Array.isArray(tools) || !tools.every((tool) => typeof tool === 'string')) {
      throw new Error('HD002 active-tools API returned an invalid value');
    }
    const filename = join(privateOutputDir(), `${event.reason}.json`);
    const fd = openSync(filename, constants.O_CREAT | constants.O_EXCL |
      constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try {
      if ((fstatSync(fd).mode & 0o777) !== 0o600) {
        throw new Error('HD002 count file must be mode 0600');
      }
      writeFileSync(fd, JSON.stringify({
        schema: 1,
        phase: event.reason,
        activeToolCount: tools.length,
        diagnosticLoaded: true,
      }) + '\n', 'utf8');
    } finally {
      closeSync(fd);
    }
  });
}
