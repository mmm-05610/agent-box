#!/usr/bin/env python3
"""One C-approved FE×native Server send slot with private ready/done files."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import sqlite3
import stat
import subprocess
import time
from urllib.request import Request, build_opener, ProxyHandler

REPO = Path(__file__).resolve().parents[2]
PYTHON = Path('/tmp/hd002-bc-native-uv-cache/archive-v0/2h28R8ktUyTpYaIK/bin/python')
BRIDGE = Path('/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter')
BRIDGE_SHA = 'da8deda5f859d8f2b5f304468b09136df8430dd49490446e27088ecd776e1a94'
PI = Path('/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')
PI_SHA = 'e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
CLI_SHA = '2bfebfbcaba454b809deb059a9855acd6d2a71db19fa194596689457d471d8b8'
TAP = Path(__file__).with_name('paired_server_send_tap.py')
SCHEMA = 'hd002-fe-send/1'
METHODS = frozenset(('server.hello', 'profiles.list', 'workspaces.list', 'workspaces.open',
                     'sessions.list', 'sessions.createAndSend', 'sessions.send',
                     'sendOutcome.query', 'history.snapshot', 'runs.stop',
                     'approvals.decide', 'REST_SESSION_GET', 'OTHER_HTTP'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private(path, directory=False):
    try:
        st = path.lstat()
        return st.st_uid == os.getuid() and stat.S_IMODE(st.st_mode) == (0o700 if directory else 0o600) and (
            stat.S_ISDIR(st.st_mode) if directory else stat.S_ISREG(st.st_mode))
    except OSError:
        return False


def counts(path):
    if not private(path):
        return None
    result = {}
    try:
        for line in path.read_bytes().splitlines():
            row = json.loads(line)
            if not isinstance(row, dict) or set(row) != {'method'} or row['method'] not in METHODS:
                return None
            name = row['method']
            result[name] = result.get(name, 0) + 1
    except (ValueError, TypeError):
        return None
    return result


def connects(path):
    if not path.exists():
        return None
    rows = [x for x in path.read_bytes().splitlines() if b'connect(' in x and
            (b'AF_INET' in x or b'AF_INET6' in x)]
    local = sum(b'127.0.0.1' in x or b'::1' in x for x in rows)
    return {'loopback': local, 'nonLoopback': len(rows) - local}


def call(port, token, method, params):
    payload = json.dumps({'jsonrpc': '2.0', 'id': method, 'method': method, 'params': params}).encode()
    request = Request(f'http://127.0.0.1:{port}/wire/v1/{method}', data=payload,
                      headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with build_opener(ProxyHandler({})).open(request, timeout=4) as response:
        frame = json.load(response)
    if not isinstance(frame, dict) or not isinstance(frame.get('result'), dict):
        raise RuntimeError('WIRE_RESPONSE_INVALID')
    return frame['result']


def atomic_json(path, value):
    temp = path.with_name(path.name + '.pending')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, json.dumps(value, sort_keys=True, separators=(',', ':')).encode())
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temp, path)


def valid_done(value):
    return (isinstance(value, dict) and set(value) == {'schema', 'done', 'electronStopped', 'sendCount', 'result'}
            and value['schema'] == SCHEMA and value['done'] is True and
            value['electronStopped'] is True and type(value['sendCount']) is int and
            0 <= value['sendCount'] <= 2 and value['result'] in ('PASS', 'FAIL'))


def lock_released(data):
    path = data / 'server.lock'
    if not path.is_file():
        return None
    with path.open('rb') as f:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    return True


def self_test():
    assert valid_done({'schema': SCHEMA, 'done': True, 'electronStopped': True,
                       'sendCount': 2, 'result': 'PASS'})
    assert valid_done({'schema': SCHEMA, 'done': True, 'electronStopped': True,
                       'sendCount': 0, 'result': 'FAIL'})
    for bad in ({'schema': SCHEMA, 'done': True, 'electronStopped': True, 'sendCount': 3, 'result': 'PASS'},
                {'schema': SCHEMA, 'done': True, 'electronStopped': False, 'sendCount': 2, 'result': 'PASS'}):
        assert not valid_done(bad)
    assert digest(BRIDGE) == BRIDGE_SHA and digest(PI) == PI_SHA
    assert digest(REPO / 'src/agent_box/server/__main__.py') == CLI_SHA
    print('SELF_TEST_PASS')


def main(root, port):
    os.umask(0o077)
    result = {'status': 'UNKNOWN', 'ready': False, 'done': False, 'error': None}
    process = None
    stderr_fd = None
    data = root / 'data'
    trace = root / 'server.connect.trace'
    tap = root / 'server-methods.jsonl'
    stderr = root / 'server.stderr'
    start = time.monotonic()
    try:
        if (not root.is_absolute() or root.parent != Path('/tmp') or
            not re.fullmatch(r'hd002-fe-send-[A-Za-z0-9_-]{6,32}', root.name) or
            type(port) is not int or not 1024 <= port <= 65535 or
            not private(root, True) or not private(root / 'project', True) or
            not private(root / 'sessions', True) or data.exists() or
            (root / 'ready.json').exists() or (root / 'fc-done.json').exists() or
            not PYTHON.is_file() or digest(BRIDGE) != BRIDGE_SHA or
            digest(PI) != PI_SHA or digest(REPO / 'src/agent_box/server/__main__.py') != CLI_SHA):
            raise RuntimeError('PREFLIGHT_REFUSAL')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', port))
        stderr_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        command = ['/usr/bin/strace', '-f', '-e', 'trace=connect', '-o', str(trace),
                   str(PYTHON), str(TAP), '--count-file', str(tap),
                   '--data-root', str(data), '--port', str(port),
                   '--execution-mode', 'native', '--native-harness', 'pi',
                   '--plugin-root', str(REPO / 'plugins/agent-box-harnesses'),
                   '--native-adapter-command', str(BRIDGE),
                   '--native-adapter-arg=--adapter=pi',
                   f'--native-adapter-arg=--pi-bin={PI}',
                   f'--native-adapter-arg=--pi-session-dir={root / "sessions"}']
        env = os.environ.copy()
        env['PYTHONPATH'] = str(REPO / 'src')
        env['TMPDIR'] = str(root)
        process = subprocess.Popen(command, cwd=root / 'project', env=env,
                                   stdin=subprocess.DEVNULL, stdout=stderr_fd,
                                   stderr=stderr_fd, start_new_session=True)
        token = None
        while time.monotonic() - start < 25:
            if process.poll() is not None:
                raise RuntimeError('SERVER_EXIT_BEFORE_READY')
            if connects(trace) and connects(trace)['nonLoopback']:
                raise RuntimeError('STARTUP_NON_LOOPBACK')
            token_file = data / 'secrets/http-token'
            if private(token_file) and private(tap):
                token = token_file.read_text().strip()
                if len(token) >= 32:
                    try:
                        hello = call(port, token, 'server.hello',
                                     {'clientVersions': ['wire/1'], 'clientPresentationSupports': []})
                        break
                    except (OSError, ValueError):
                        pass
            time.sleep(.1)
        else:
            raise RuntimeError('STARTUP_TIMEOUT')
        identity = hello.get('nativeExecution', {})
        if identity.get('mode') != 'native' or identity.get('harness') != 'pi' or not identity.get('profileId'):
            raise RuntimeError('NATIVE_IDENTITY_INVALID')
        rows = call(port, token, 'profiles.list', {'includeArchived': False})['items']
        matches = [x for x in rows if x.get('id') == identity['profileId']]
        if len(matches) != 1 or matches[0].get('sendability', {}).get('state') != 'ready':
            raise RuntimeError('PROFILE_NOT_READY')
        opened = call(port, token, 'workspaces.open', {'requestId': 'hd002-fe-send-open',
                      'environment': {'kind': 'local', 'host': None, 'user': None},
                      'path': str(root / 'project')})
        workspace = opened['workspace']
        if workspace.get('normalizedPath') != str(root / 'project'):
            raise RuntimeError('WORKSPACE_MISMATCH')
        ready = {'schema': SCHEMA, 'origin': f'http://127.0.0.1:{port}',
                 'tokenFile': str(token_file), 'serverId': hello['serverId'],
                 'nativeExecution': identity,
                 'project': {'normalizedPath': workspace['normalizedPath'],
                             'workspaceId': workspace['id']},
                 'bcProfileUniqueReady': True, 'sendAllowed': True, 'maxSendCount': 2}
        atomic_json(root / 'ready.json', ready)
        result['ready'] = True
        while time.monotonic() - start < 240:
            if process.poll() is not None:
                raise RuntimeError('SERVER_EXIT_DURING_PAIR')
            method_counts = counts(tap)
            if method_counts is None:
                raise RuntimeError('TAP_INVALID')
            if (method_counts.get('sessions.createAndSend', 0) > 1 or
                method_counts.get('sessions.send', 0) > 1 or
                method_counts.get('approvals.decide', 0) > 0):
                raise RuntimeError('SEND_OR_APPROVAL_LIMIT')
            done = root / 'fc-done.json'
            if done.exists():
                if not private(done) or not valid_done(json.loads(done.read_bytes())):
                    raise RuntimeError('DONE_INVALID')
                result['done'] = True
                result['fcResult'] = json.loads(done.read_bytes())['result']
                result['status'] = 'PAIR_DONE'
                break
            time.sleep(.1)
        else:
            raise RuntimeError('PAIR_TIMEOUT')
    except BaseException as exc:
        result['status'] = 'STOPPED'
        result['error'] = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
    finally:
        if process is not None:
            try: os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError: pass
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            result['serverExitCode'] = process.returncode
        if stderr_fd is not None:
            os.close(stderr_fd)
        result['methods'] = counts(tap)
        result['connects'] = connects(trace)
        result['ownerLockReleased'] = lock_released(data)
        if stderr.exists() and private(stderr):
            raw = stderr.read_bytes()
            result['stderr'] = {'length': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        db_path = data / 'state/agentbox.sqlite'
        if db_path.is_file():
            try:
                db = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
                result['serverSessionCount'] = db.execute('select count(*) from server_sessions').fetchone()[0]
                db.close()
            except sqlite3.Error:
                result['serverSessionCount'] = None
        result['projectEntryCount'] = sum(1 for _ in (root / 'project').iterdir()) if (root / 'project').is_dir() else None
        result['piSessionFileCount'] = sum(p.is_file() for p in (root / 'sessions').rglob('*')) if (root / 'sessions').is_dir() else None
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--root', type=Path)
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.root and args.port:
        main(args.root, args.port)
    else:
        raise SystemExit(2)
