#!/usr/bin/env python3
"""One direct Pi 0.86.1 RPC get_state; finite, private diagnostics only."""
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile
import time

CLI = Path('/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')
EXPECTED = 'e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
AGENT = Path('/home/maoqh/.pi/agent')
RID = 'hd002-native-direct-state'
LOCKS = ('settings.json.lock', 'auth.json.lock', 'models-store.json.lock')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_response(line):
    try:
        frame = json.loads(line)
    except (ValueError, UnicodeError):
        return None, 'JSON_INVALID'
    if not isinstance(frame, dict) or frame.get('id') != RID:
        return None, None
    if frame.get('type') != 'response' or frame.get('command') != 'get_state' or type(frame.get('success')) is not bool:
        return None, 'SHAPE_INVALID'
    data = frame.get('data')
    if not isinstance(data, dict):
        return None, 'DATA_INVALID'
    model = data.get('model')
    if isinstance(model, dict):
        provider = model.get('provider')
        model_id = model.get('id')
    else:
        provider = model_id = None
    safe_model = lambda value: value if isinstance(value, str) and len(value) <= 80 and all(c.isalnum() or c in '-._/' for c in value) else None
    return {'success': frame['success'], 'provider': safe_model(provider),
            'modelId': safe_model(model_id),
            'thinkingLevel': data.get('thinkingLevel') if data.get('thinkingLevel') in ('off', 'minimal', 'low', 'medium', 'high', 'xhigh') else None,
            'messageCount': data.get('messageCount') if type(data.get('messageCount')) is int else None}, None


def main():
    assert safe_response(json.dumps({'id': RID, 'type': 'response', 'command': 'get_state', 'success': True,
                                     'data': {'model': {'provider': 'fake', 'id': 'safe'}, 'sessionFile': '/fake/SECRET'}}).encode())[0]['modelId'] == 'safe'
    pre = {'shaMatch': digest(CLI) == EXPECTED,
           'versionMatch': Path('/home/maoqh/.pi/agent/install/current-version').read_text().strip() == '0.86.1',
           'managedEnvAbsent': 'PI_MANAGED_INSTALL_ROOT' not in os.environ,
           'locksAbsent': all(not (AGENT / name).exists() for name in LOCKS),
           'stracePresent': Path('/usr/bin/strace').exists()}
    if not all(pre.values()):
        print(json.dumps({'status': 'PREFLIGHT_REFUSAL', 'preflight': pre}))
        return
    os.umask(0o077)
    result = {'status': 'UNKNOWN', 'preflight': pre, 'command': 'get_state', 'promptSent': False}
    with tempfile.TemporaryDirectory(prefix='hd002-direct-pi-') as temp:
        root = Path(temp)
        project, sessions = root / 'project', root / 'sessions'
        project.mkdir(mode=0o700)
        sessions.mkdir(mode=0o700)
        stderr = root / 'stderr'
        trace = root / 'connect.trace'
        fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        args = ['/usr/bin/strace', '-f', '-e', 'trace=connect', '-o', str(trace),
                'node', str(CLI), '--mode', 'rpc', '--offline', '--no-session',
                '--session-dir', str(sessions)]
        proc = None
        try:
            proc = subprocess.Popen(args, cwd=project, env=os.environ.copy(),
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                    stderr=fd, start_new_session=True, bufsize=0)
            proc.stdin.write((json.dumps({'id': RID, 'type': 'get_state'}) + '\n').encode())
            proc.stdin.flush()
            end = time.monotonic() + 90
            buf = b''
            while time.monotonic() < end:
                if trace.exists():
                    lines = trace.read_bytes().splitlines()
                    inet = [x for x in lines if b'connect(' in x and (b'AF_INET' in x or b'AF_INET6' in x)]
                    if any(b'127.0.0.1' not in x and b'::1' not in x for x in inet):
                        result['status'] = 'NON_LOOPBACK_CONNECT'
                        break
                ready, _, _ = select.select([proc.stdout], [], [], .1)
                if not ready:
                    if proc.poll() is not None:
                        result['status'] = 'EXIT_BEFORE_RESPONSE'
                        break
                    continue
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    result['status'] = 'STDOUT_CLOSED'
                    break
                buf += chunk
                if len(buf) > 1048576:
                    result['status'] = 'OUTPUT_LIMIT'
                    break
                while b'\n' in buf:
                    line, buf = buf.split(b'\n', 1)
                    record, err = safe_response(line)
                    if err:
                        result['status'] = err
                        break
                    if record is not None:
                        result['response'] = record
                        result['status'] = 'RESPONSE_RECEIVED'
                        break
                if result['status'] != 'UNKNOWN':
                    break
            else:
                result['status'] = 'TIMEOUT'
        except BaseException as exc:
            result['status'] = 'EXCEPTION'
            result['errorType'] = type(exc).__name__
        finally:
            if proc:
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
            raw = stderr.read_bytes() if stderr.exists() else b''
            result['stderr'] = {'length': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                                'settingsWarning': b'Failed to load' in raw and b'settings' in raw.lower(),
                                'hasOtherOutput': bool(raw) and not (b'Failed to load' in raw and b'settings' in raw.lower())}
            result['locksReleased'] = all(not (AGENT / name).exists() for name in LOCKS)
            result['projectEntryCount'] = len(list(project.iterdir()))
            result['sessionEntryCount'] = len(list(sessions.iterdir()))
            result['tracePresent'] = trace.exists()
    result['tempRootRemoved'] = not root.exists()
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
