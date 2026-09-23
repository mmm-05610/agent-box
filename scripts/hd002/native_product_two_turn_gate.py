#!/usr/bin/env python3
"""Supervise C-0087 Server/native Pi product turn probe in one process group."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile

REPO = Path(__file__).resolve().parents[2]
PYTHON = Path('/tmp/hd002-bc-native-uv-cache/archive-v0/2h28R8ktUyTpYaIK/bin/python')
BRIDGE = Path('/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter')
BRIDGE_SHA = 'da8deda5f859d8f2b5f304468b09136df8430dd49490446e27088ecd776e1a94'
PI = Path('/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')
PI_SHA = 'e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
FAKE = REPO / 'tests/server/fake_native_acp_peer_hd002.mjs'
PROBE = Path(__file__).with_name('native_product_two_turn_probe.py')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(fake):
    pre = {'python': PYTHON.is_file(), 'bridgeSha': digest(BRIDGE) == BRIDGE_SHA,
           'piSha': digest(PI) == PI_SHA,
           'version': Path('/home/maoqh/.pi/agent/install/current-version').read_text().strip() == '0.86.1',
           'overlaysAbsent': all(k not in os.environ for k in ('PI_ARGS', 'PI_PROVIDER', 'PI_MODEL', 'PI_BIN',
                             'PI_SESSION_DIR', 'PI_DISABLE_GATE', 'PI_CODING_AGENT_DIR', 'PI_MANAGED_INSTALL_ROOT'))}
    if not all(pre.values()):
        print(json.dumps({'status': 'PREFLIGHT_REFUSAL', 'preflight': pre}))
        return
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='hd002-product-turn-'))
    for name in ('project', 'sessions'):
        (root / name).mkdir(mode=0o700)
    stderr = root / 'supervisor.stderr'
    fd = os.open(stderr, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    env = os.environ.copy()
    env['PYTHONPATH'] = str(REPO / 'src')
    env['TMPDIR'] = str(root)
    if fake:
        env['HD002_FAKE_SESSIONS'] = str(root / 'fake-registry.json')
        adapter = Path('/usr/bin/node')
        adapter_args = [str(FAKE)]
    else:
        adapter = BRIDGE
        adapter_args = ['--adapter=pi', f'--pi-bin={PI}', f'--pi-session-dir={root / "sessions"}']
    args = [str(PYTHON), str(PROBE), '--root', str(root), '--adapter', str(adapter),
            *[f'--adapter-arg={arg}' for arg in adapter_args]]
    proc = None
    output = b''
    result = {'status': 'UNKNOWN', 'preflight': pre, 'fake': fake}
    try:
        proc = subprocess.Popen(args, cwd=root / 'project', env=env,
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=fd, start_new_session=True)
        output, _ = proc.communicate(timeout=240)
        if len(output) > 65536:
            result['status'] = 'OUTPUT_LIMIT'
        else:
            try:
                payload = json.loads(output)
                if isinstance(payload, dict) and set(payload) <= {
                    'serverHello', 'profileReady', 'workspaceCwd', 'firstAccepted', 'firstCompleted',
                    'secondAccepted', 'secondCompleted', 'approvalEvents', 'toolEvents',
                    'firstReplyNonEmpty', 'secondReplyNonEmpty', 'firstReplyExact', 'secondReplyExact',
                    'sameServerSession', 'sameNativeId', 'stage', 'failureType',
                    'serverThreadStopped', 'projectEntryCount', 'piSessionFileCount'}:
                    result['probe'] = payload
                    result['status'] = 'PROBE_RETURNED'
                else:
                    result['status'] = 'OUTPUT_SHAPE'
            except (ValueError, UnicodeError):
                result['status'] = 'OUTPUT_JSON'
    except subprocess.TimeoutExpired:
        result['status'] = 'TIMEOUT'
    except BaseException as exc:
        result['status'] = 'EXCEPTION'
        result['errorType'] = type(exc).__name__
    finally:
        if proc is not None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait(timeout=3)
            result['exitCode'] = proc.returncode
        os.close(fd)
        raw = stderr.read_bytes()
        result['stderr'] = {'length': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        result['privateRootMode'] = oct(root.stat().st_mode & 0o777)
        result['rootRetained'] = True
        result['settingsLockReleased'] = not Path('/home/maoqh/.pi/agent/settings.json.lock').exists()
        result['authLockReleased'] = not Path('/home/maoqh/.pi/agent/auth.json.lock').exists()
        result['modelLockReleased'] = not Path('/home/maoqh/.pi/agent/models-store.json.lock').exists()
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--fake']:
        main(True)
    elif not sys.argv[1:]:
        main(False)
    else:
        raise SystemExit(2)
