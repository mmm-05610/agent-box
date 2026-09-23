#!/usr/bin/env python3
"""C-0048 Server half of one paired no-send gate. Invoke only after FC READY."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time
from urllib.request import Request, build_opener, ProxyHandler

ROOT = Path('/tmp/hd002-c0048-pair-834rpsal')
PORT = 50491
REPO = Path(__file__).resolve().parents[2]
PYTHON = Path('/tmp/hd002-bc-native-uv-cache/archive-v0/2h28R8ktUyTpYaIK/bin/python')
BRIDGE = Path('/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter')
PI = Path('/home/maoqh/.pi/agent/bin/pi')
BRIDGE_SHA = 'da8deda5f859d8f2b5f304468b09136df8430dd49490446e27088ecd776e1a94'
PI_SHA = '99142ef3d4cd5ce154cc568c6e915930632808dd7010666e514551c1430ffd3d'
CLI_SOURCE_SHA = '2bfebfbcaba454b809deb059a9855acd6d2a71db19fa194596689457d471d8b8'
ORIGIN = f'http://127.0.0.1:{PORT}'
SCHEMA = 'hd002-c0048/1'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def private_file(path: Path) -> bool:
    try:
        value = path.lstat()
        return stat.S_ISREG(value.st_mode) and value.st_uid == os.getuid() and stat.S_IMODE(value.st_mode) == 0o600
    except OSError:
        return False


def private_dir(path: Path) -> bool:
    try:
        value = path.lstat()
        return stat.S_ISDIR(value.st_mode) and value.st_uid == os.getuid() and stat.S_IMODE(value.st_mode) == 0o700
    except OSError:
        return False


def connect_counts(path: Path):
    if not path.exists():
        return None
    lines = path.read_bytes().splitlines()
    inet = [line for line in lines if b'connect(' in line and (b'AF_INET' in line or b'AF_INET6' in line)]
    loopback = sum(b'inet_addr("127.0.0.1")' in line or b'inet_pton(AF_INET6, "::1"' in line for line in inet)
    return {'loopback': loopback, 'nonLoopback': len(inet) - loopback}


def atomic_private_json(path: Path, value: dict):
    temp = path.with_name(path.name + '.pending')
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        payload = json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
        os.write(fd, payload)
        os.fsync(fd)
    finally:
        os.close(fd)
    os.replace(temp, path)


def wire(token: str, method: str, params: dict, counts: dict):
    payload = json.dumps({'jsonrpc': '2.0', 'id': method, 'method': method,
                          'params': params}, separators=(',', ':')).encode()
    request = Request(f'{ORIGIN}/wire/v1/{method}', data=payload,
                      headers={'Authorization': f'Bearer {token}',
                               'Content-Type': 'application/json'})
    opener = build_opener(ProxyHandler({}))
    counts[method] = counts.get(method, 0) + 1
    with opener.open(request, timeout=2) as response:
        value = json.load(response)
    if not isinstance(value, dict) or not isinstance(value.get('result'), dict):
        raise RuntimeError('WIRE_RESPONSE_INVALID')
    return value['result']


def self_test():
    assert connect_counts(Path('/does/not/exist')) is None
    assert private_dir(ROOT / 'project')
    assert private_dir(ROOT / 'sessions')
    assert not (ROOT / 'data').exists()
    assert digest(BRIDGE) == BRIDGE_SHA
    assert digest(PI) == PI_SHA
    assert digest(REPO / 'src/agent_box/server/__main__.py') == CLI_SOURCE_SHA
    assert PYTHON.is_file()
    print('SELF_TEST_PASS')


def run():
    os.umask(0o077)
    result = {'status': None, 'serverStarted': False, 'helloAuthenticated': False,
              'profileUniqueReady': False, 'projectOpened': False,
              'readyWritten': False, 'fcDone': False, 'httpMethodsBC': {},
              'errorClass': None, 'cleanup': {}}
    process = None
    stderr_fd = None
    start = time.monotonic()
    data = ROOT / 'data'
    token_file = data / 'secrets/http-token'
    trace = ROOT / 'server.connect.trace'
    stderr = ROOT / 'server.stderr'
    try:
        if (not private_dir(ROOT) or not private_dir(ROOT / 'project') or
            not private_dir(ROOT / 'sessions') or data.exists() or
            (ROOT / 'ready.json').exists() or (ROOT / 'fc-done.json').exists() or
            digest(BRIDGE) != BRIDGE_SHA or digest(PI) != PI_SHA or
            digest(REPO / 'src/agent_box/server/__main__.py') != CLI_SOURCE_SHA or
            not PYTHON.is_file()):
            raise RuntimeError('PREFLIGHT_REFUSAL')
        stderr_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        command = ['/usr/bin/strace', '-f', '-e', 'trace=connect', '-o', str(trace),
                   str(PYTHON), '-m', 'agent_box.server', '--data-root', str(data),
                   '--port', str(PORT), '--execution-mode', 'native', '--native-harness', 'pi',
                   '--plugin-root', str(REPO / 'plugins/agent-box-harnesses'),
                   '--native-adapter-command', str(BRIDGE),
                   '--native-adapter-arg=--adapter=pi',
                   f'--native-adapter-arg=--pi-bin={PI}',
                   f'--native-adapter-arg=--pi-session-dir={ROOT / "sessions"}']
        env = os.environ.copy()
        env['PYTHONPATH'] = str(REPO / 'src')
        env['TMPDIR'] = str(ROOT)
        process = subprocess.Popen(command, cwd=ROOT / 'project', env=env,
                                   stdin=subprocess.DEVNULL, stdout=stderr_fd,
                                   stderr=stderr_fd, start_new_session=True)
        result['serverStarted'] = True
        token = None
        while time.monotonic() - start < 20:
            network = connect_counts(trace)
            if network and network['nonLoopback']:
                raise RuntimeError('NON_LOOPBACK_CONNECT')
            if process.poll() is not None:
                raise RuntimeError('SERVER_EXIT_BEFORE_READY')
            if private_file(token_file):
                token = token_file.read_text(encoding='ascii').strip()
                if len(token) >= 32:
                    break
            time.sleep(0.05)
        if token is None:
            raise RuntimeError('TOKEN_UNAVAILABLE')
        for _ in range(80):
            try:
                hello = wire(token, 'server.hello', {'clientVersions': ['wire/1'],
                    'clientPresentationSupports': []}, result['httpMethodsBC'])
                break
            except OSError:
                time.sleep(0.05)
        else:
            raise RuntimeError('HELLO_UNAVAILABLE')
        identity = hello.get('nativeExecution')
        server_id = hello.get('serverId')
        if (not isinstance(identity, dict) or identity.get('mode') != 'native' or
            identity.get('harness') != 'pi' or not isinstance(identity.get('profileId'), str) or
            not isinstance(server_id, str)):
            raise RuntimeError('HELLO_IDENTITY_INVALID')
        result['helloAuthenticated'] = True
        profiles = wire(token, 'profiles.list', {'includeArchived': False}, result['httpMethodsBC'])
        items = profiles.get('items')
        matching = ([p for p in items if isinstance(p, dict) and p.get('id') == identity['profileId']]
                    if isinstance(items, list) else [])
        result['profileUniqueReady'] = (len(matching) == 1 and
            matching[0].get('harness') == 'pi' and
            matching[0].get('sendability', {}).get('state') == 'ready')
        if not result['profileUniqueReady']:
            raise RuntimeError('PROFILE_NOT_READY')
        opened = wire(token, 'workspaces.open', {'requestId': 'hd002-c0048-open',
            'environment': {'kind': 'local', 'host': None, 'user': None},
            'path': str(ROOT / 'project')}, result['httpMethodsBC'])
        workspace = opened.get('workspace')
        if (not isinstance(workspace, dict) or not isinstance(workspace.get('id'), str) or
            workspace.get('normalizedPath') != str(ROOT / 'project')):
            raise RuntimeError('PROJECT_OPEN_FAILED')
        result['projectOpened'] = True
        ready = {'schema': SCHEMA, 'origin': ORIGIN, 'tokenFile': str(token_file),
                 'serverId': server_id, 'nativeExecution': identity,
                 'project': {'normalizedPath': workspace['normalizedPath'],
                             'workspaceId': workspace['id']},
                 'bcProfileUniqueReady': True}
        atomic_private_json(ROOT / 'ready.json', ready)
        result['readyWritten'] = True
        while time.monotonic() - start < 90:
            network = connect_counts(trace)
            if network and network['nonLoopback']:
                raise RuntimeError('NON_LOOPBACK_CONNECT')
            if process.poll() is not None:
                raise RuntimeError('SERVER_EXIT_DURING_PAIR')
            done_file = ROOT / 'fc-done.json'
            if private_file(done_file):
                done = json.loads(done_file.read_bytes())
                if (done == {'schema': SCHEMA, 'done': True,
                             'electronStopped': True, 'sendCount': 0}):
                    result['fcDone'] = True
                    result['status'] = 'PAIR_DONE'
                    break
                raise RuntimeError('FC_DONE_INVALID')
            time.sleep(0.1)
        else:
            raise RuntimeError('PAIR_TIMEOUT')
    except BaseException as exc:
        result['status'] = 'STOPPED'
        result['errorClass'] = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
    finally:
        if process is not None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
            result['cleanup']['serverExitCode'] = process.returncode
            result['cleanup']['serverGroupStopped'] = True
        if stderr_fd is not None:
            os.close(stderr_fd)
        result['network'] = connect_counts(trace)
        if stderr.exists() and private_file(stderr):
            size = stderr.stat().st_size
            with stderr.open('r+b') as file:
                if size > 65536:
                    file.truncate(65536)
            content = stderr.read_bytes()
            result['stderr'] = {'originalLength': size,
                                'sha256': hashlib.sha256(content).hexdigest(),
                                'truncated': size > 65536}
        lock_path = data / 'server.lock'
        if lock_path.exists():
            with lock_path.open('rb') as lock:
                try:
                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    result['cleanup']['ownerLockReleased'] = True
                    fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
                except OSError:
                    result['cleanup']['ownerLockReleased'] = False
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif not sys.argv[1:]:
        run()
    else:
        raise SystemExit(2)
