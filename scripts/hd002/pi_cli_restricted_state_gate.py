#!/usr/bin/env python3
"""C-0044 single Pi RPC get_state gate. Output has only bounded metadata."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import sys
import tempfile
import time

CLI = Path('/home/maoqh/.pi/agent/bin/pi')
EXTENSION = Path(__file__).with_name('pi_tool_count_extension.mjs')
CLI_SHA = '99142ef3d4cd5ce154cc568c6e915930632808dd7010666e514551c1430ffd3d'
EXT_SHA = '1234bc324aa51ca6cc632f6476856b4289cc75407b6565cbbb33ce0152cb15c0'
REQUEST_ID = 'hd002-c0044-get-state-only'
OVERLAY_NAMES = ('PI_ARGS', 'PI_PROVIDER', 'PI_MODEL', 'PI_CODING_AGENT_DIR',
                 'PI_BIN', 'PI_SESSION_DIR', 'PI_DISABLE_GATE', 'HD002_PI_COUNT_DIR')


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def response_record(raw: bytes):
    try:
        value = json.loads(raw)
    except (UnicodeError, ValueError):
        return None, 'INVALID_JSONL'
    if not isinstance(value, dict) or value.get('id') != REQUEST_ID:
        return None, None
    if value.get('type') != 'response' or value.get('command') != 'get_state':
        return None, 'CORRELATED_SHAPE'
    if type(value.get('success')) is not bool:
        return None, 'SUCCESS_TYPE'
    data = value.get('data')
    return {'type': 'response', 'command': 'get_state',
            'success': value['success'],
            'modelPresent': isinstance(data, dict) and data.get('model') is not None}, None


def count_record(path: Path):
    if not path.exists():
        return None, 'COUNT_MISSING'
    if path.is_symlink() or (path.stat().st_mode & 0o777) != 0o600:
        return None, 'COUNT_FILE_MODE'
    try:
        value = json.loads(path.read_bytes())
    except (ValueError, OSError):
        return None, 'COUNT_JSON'
    if not isinstance(value, dict) or set(value) != {
        'schema', 'phase', 'activeToolCount', 'diagnosticLoaded'}:
        return None, 'COUNT_SHAPE'
    if value['schema'] != 1 or value['phase'] != 'startup' or value['diagnosticLoaded'] is not True:
        return None, 'COUNT_SHAPE'
    if type(value['activeToolCount']) is not int or value['activeToolCount'] < 0:
        return None, 'COUNT_SHAPE'
    return {'diagnosticFilePresent': True,
            'activeToolCount': value['activeToolCount']}, None


def network_counts(trace: Path):
    if not trace.exists():
        return None
    lines = trace.read_bytes().splitlines()
    inet = [line for line in lines if b'connect(' in line and
            (b'AF_INET' in line or b'AF_INET6' in line)]
    loopback = sum(b'inet_addr("127.0.0.1")' in line or
                   b'inet_pton(AF_INET6, "::1"' in line for line in inet)
    return {'loopback': loopback, 'nonLoopback': len(inet) - loopback}


def self_test():
    secret = 'FAKE_SECRET_NEVER_EMIT'
    path = '/fake/private/config.json'
    frame = json.dumps({'id': REQUEST_ID, 'type': 'response', 'command': 'get_state',
                        'success': True, 'data': {'model': {'id': secret},
                                                   'tools': [secret], 'sessionFile': path}}).encode()
    clean, error = response_record(frame)
    assert error is None and clean == {'type': 'response', 'command': 'get_state',
                                       'success': True, 'modelPresent': True}
    assert secret not in json.dumps(clean) and path not in json.dumps(clean)
    assert response_record(json.dumps({'id': REQUEST_ID, 'type': 'prompt',
                                       'content': secret}).encode())[1] == 'CORRELATED_SHAPE'
    with tempfile.TemporaryDirectory(prefix='hd002-c0044-selftest-') as root:
        count = Path(root) / 'startup.json'
        count.write_text(json.dumps({'schema': 1, 'phase': 'startup',
                                     'activeToolCount': 1, 'diagnosticLoaded': True}))
        os.chmod(count, 0o600)
        value, error = count_record(count)
        assert error is None and value['activeToolCount'] == 1
        assert value['activeToolCount'] != 0  # extra tool is a hard failure
        count.write_text(json.dumps({'schema': 1, 'phase': 'startup',
                                     'activeToolCount': 0, 'diagnosticLoaded': True,
                                     'secret': secret}))
        assert count_record(count)[1] == 'COUNT_SHAPE'
        short = Path(root) / 'short.stderr'
        short.write_bytes(b'abc')
        assert truncate_stderr(short) == (3, False)
        assert short.read_bytes() == b'abc'
        long = Path(root) / 'long.stderr'
        long.write_bytes(b'x' * 65537)
        assert truncate_stderr(long) == (65537, True)
        assert long.stat().st_size == 65536
    print('SELF_TEST_PASS')


def truncate_stderr(path: Path):
    size = path.stat().st_size
    truncated = size > 65536
    if truncated:
        with path.open('r+b') as stderr_file:
            stderr_file.truncate(65536)
    return size, truncated


def run():
    overlay = {name: bool(os.environ.get(name)) for name in OVERLAY_NAMES}
    preflight = {'overlayPresent': overlay, 'launcherHashMatch': sha(CLI) == CLI_SHA,
                 'extensionHashMatch': sha(EXTENSION) == EXT_SHA,
                 'installedVersionMatch': Path('/home/maoqh/.pi/agent/install/current-version').read_text().strip() == '0.86.1',
                 'stracePresent': Path('/usr/bin/strace').is_file()}
    if any(overlay.values()) or not all(value for key, value in preflight.items() if key != 'overlayPresent'):
        print(json.dumps({'status': 'PREFLIGHT_REFUSAL', 'preflight': preflight}, sort_keys=True))
        return
    os.umask(0o077)
    result = {'status': None, 'preflight': preflight, 'response': None,
              'count': None, 'errorClass': None, 'promptSent': False,
              'commandSent': 'get_state', 'cleanup': {}}
    with tempfile.TemporaryDirectory(prefix='hd002-c0044-') as tmp:
        root = Path(tmp)
        project, count_dir, sessions = (root / name for name in ('project', 'count', 'sessions'))
        for directory in (project, count_dir, sessions):
            directory.mkdir(mode=0o700)
        trace = root / 'connect.trace'
        stderr = root / 'pi.stderr'
        fd = os.open(stderr, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        env = os.environ.copy()
        env['HD002_PI_COUNT_DIR'] = str(count_dir)
        command = ['/usr/bin/strace', '-f', '-e', 'trace=connect', '-o', str(trace),
                   str(CLI), '--mode', 'rpc', '--no-session', '--session-dir', str(sessions),
                   '--no-tools', '--no-extensions', '--extension', str(EXTENSION)]
        process = None
        try:
            process = subprocess.Popen(command, cwd=project, env=env,
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=fd, start_new_session=True, bufsize=0)
            request = json.dumps({'id': REQUEST_ID, 'type': 'get_state'}, separators=(',', ':')).encode() + b'\n'
            process.stdin.write(request)
            process.stdin.flush()
            deadline = time.monotonic() + 90
            buffer = b''
            while time.monotonic() < deadline:
                counts = network_counts(trace)
                if counts and counts['nonLoopback']:
                    result['status'] = 'NON_LOOPBACK_CONNECT'
                    break
                ready, _, _ = select.select([process.stdout], [], [], 0.1)
                if not ready:
                    if process.poll() is not None:
                        result['status'] = 'EXIT_BEFORE_RESPONSE'
                        break
                    continue
                chunk = os.read(process.stdout.fileno(), 65536)
                if not chunk:
                    result['status'] = 'STDOUT_CLOSED'
                    break
                buffer += chunk
                if len(buffer) > 1048576:
                    result['status'] = 'OUTPUT_LIMIT'
                    break
                while b'\n' in buffer:
                    line, buffer = buffer.split(b'\n', 1)
                    record, error = response_record(line.rstrip(b'\r'))
                    if error:
                        result['status'] = error
                        break
                    if record is not None:
                        result['response'] = record
                        result['status'] = 'RESPONSE_RECEIVED'
                        break
                if result['status']:
                    break
            else:
                result['status'] = 'TIMEOUT'
        except BaseException as error:
            result['status'] = 'PROBE_EXCEPTION'
            result['errorClass'] = type(error).__name__
        finally:
            if process is not None:
                if result['status'] in {'NON_LOOPBACK_CONNECT', 'TIMEOUT', 'OUTPUT_LIMIT',
                                        'PROBE_EXCEPTION', 'CORRELATED_SHAPE', 'SUCCESS_TYPE'}:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                try:
                    process.stdin.close()
                except OSError:
                    pass
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait(timeout=3)
                try:
                    os.killpg(process.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                result['cleanup'] = {'exitCode': process.returncode, 'groupSignalSent': True}
            os.close(fd)
            result['network'] = network_counts(trace)
            count, error = count_record(count_dir / 'startup.json')
            result['count'] = count
            if error:
                result['errorClass'] = error
            original_stderr_bytes, stderr_truncated = truncate_stderr(stderr)
            stderr_bytes = stderr.read_bytes()
            result['stderr'] = {'length': len(stderr_bytes),
                                'sha256': hashlib.sha256(stderr_bytes).hexdigest(),
                                'category': 'UNCLASSIFIED',
                                'originalLength': original_stderr_bytes,
                                'truncated': stderr_truncated}
            result['projectEntryCount'] = len(list(project.iterdir()))
            result['tempDirectoryCount'] = len(list(root.iterdir()))
            if result['network'] is None:
                result['status'] = 'TRACE_MISSING'
            elif result['network']['nonLoopback']:
                result['status'] = 'NON_LOOPBACK_CONNECT'
            elif result['status'] == 'RESPONSE_RECEIVED':
                good = (result['response']['success'] and result['response']['modelPresent']
                        and count is not None and count['activeToolCount'] == 0)
                result['status'] = 'PASS' if good else 'GATE_FAIL'
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif not sys.argv[1:]:
        run()
    else:
        raise SystemExit(2)
