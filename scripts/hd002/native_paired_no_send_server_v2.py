#!/usr/bin/env python3
"""C-0053 parametrized Server half of one paired no-send gate."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, build_opener, ProxyHandler

ROOT = None
PORT = None
REPO = Path(__file__).resolve().parents[2]
PYTHON = Path('/tmp/hd002-bc-native-uv-cache/archive-v0/2h28R8ktUyTpYaIK/bin/python')
BRIDGE = Path('/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter')
PI = Path('/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')
BRIDGE_SHA = 'da8deda5f859d8f2b5f304468b09136df8430dd49490446e27088ecd776e1a94'
PI_SHA = 'e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
CLI_SOURCE_SHA = '2bfebfbcaba454b809deb059a9855acd6d2a71db19fa194596689457d471d8b8'
ORIGIN = None
SCHEMA = 'hd002-c0048/1'
OLD_ROOT = Path('/tmp/hd002-c0048-pair-834rpsal')
OLD_PORT = 50491
BLOCKED_ROOT = Path('/tmp/hd002-c0053-pair-xqz00ugq')
BLOCKED_PORT = 52839
TAP = Path(__file__).with_name('paired_server_method_tap.py')
METHODS = frozenset(('server.hello', 'profiles.list', 'workspaces.list',
                     'workspaces.open', 'sessions.list', 'sessions.createAndSend',
                     'sessions.send', 'sendOutcome.query', 'OTHER_WIRE', 'OTHER_HTTP'))
FORBIDDEN = frozenset(('sessions.createAndSend', 'sessions.send',
                       'sendOutcome.query', 'OTHER_WIRE', 'OTHER_HTTP'))


def set_batch(root: Path, port: int):
    global ROOT, PORT, ORIGIN
    if (not root.is_absolute() or root.parent != Path('/tmp') or root in (OLD_ROOT, BLOCKED_ROOT) or
        not re.fullmatch(r'hd002-c0053-pair-[A-Za-z0-9_-]{6,32}', root.name) or
        type(port) is not int or not 1024 <= port <= 65535 or port in (OLD_PORT, BLOCKED_PORT)):
        raise ValueError('BATCH_ID_INVALID')
    ROOT, PORT, ORIGIN = root, port, f'http://127.0.0.1:{port}'


def port_unoccupied(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            return False
    return True


def inbound_counts(path: Path):
    if not private_file(path):
        return None
    counts = {}
    try:
        for line in path.read_bytes().splitlines():
            record = json.loads(line)
            if not isinstance(record, dict) or set(record) != {'method'} or record['method'] not in METHODS:
                return None
            name = record['method']
            counts[name] = counts.get(name, 0) + 1
    except (ValueError, TypeError):
        return None
    return counts


def assert_audit_safe(path: Path):
    counts = inbound_counts(path)
    if counts is None:
        raise RuntimeError('METHOD_AUDIT_INVALID')
    if any(counts.get(method, 0) for method in FORBIDDEN):
        raise RuntimeError('FORBIDDEN_HTTP_METHOD')
    return counts


def batch_preflight() -> bool:
    return (private_dir(ROOT) and private_dir(ROOT / 'project') and
            private_dir(ROOT / 'sessions') and not (ROOT / 'data').exists() and
            not (ROOT / 'ready.json').exists() and
            not (ROOT / 'fc-done.json').exists() and
            not (ROOT / 'server-methods.jsonl').exists() and
            port_unoccupied(PORT) and digest(BRIDGE) == BRIDGE_SHA and
            digest(PI) == PI_SHA and
            digest(REPO / 'src/agent_box/server/__main__.py') == CLI_SOURCE_SHA and
            PYTHON.is_file() and TAP.is_file())


def within_window(start: float, limit: float, now: float) -> bool:
    return now - start < limit


def wait_for_startup(token_file: Path, tap_file: Path, *, is_alive,
                     network_probe, now, sleep, start: float) -> str:
    """Token can precede create_app/tap; require both before first HTTP request."""
    while within_window(start, 20, now()) and within_window(start, 90, now()):
        network = network_probe()
        if network and network['nonLoopback']:
            raise RuntimeError('NON_LOOPBACK_CONNECT')
        if not is_alive():
            raise RuntimeError('SERVER_EXIT_BEFORE_READY')
        token_seen = token_file.exists() or token_file.is_symlink()
        tap_seen = tap_file.exists() or tap_file.is_symlink()
        if token_seen and not private_file(token_file):
            raise RuntimeError('TOKEN_FILE_INVALID')
        if tap_seen and not private_file(tap_file):
            raise RuntimeError('TAP_FILE_INVALID')
        if token_seen and tap_seen:
            assert_audit_safe(tap_file)
            token = token_file.read_text(encoding='ascii').strip()
            if len(token) < 32:
                raise RuntimeError('TOKEN_INVALID')
            return token
        sleep(0.05)
    raise RuntimeError('STARTUP_TIMEOUT')


def valid_done(value) -> bool:
    return value == {'schema': SCHEMA, 'done': True,
                     'electronStopped': True, 'sendCount': 0}


def make_ready(token_file: Path, server_id: str, identity: dict, workspace: dict):
    value = {'schema': SCHEMA, 'origin': ORIGIN, 'tokenFile': str(token_file),
             'serverId': server_id, 'nativeExecution': identity,
             'project': {'normalizedPath': workspace['normalizedPath'],
                         'workspaceId': workspace['id']},
             'bcProfileUniqueReady': True}
    if (not isinstance(server_id, str) or not server_id or
        identity.get('mode') != 'native' or identity.get('harness') != 'pi' or
        not isinstance(identity.get('profileId'), str) or
        workspace.get('normalizedPath') != str(ROOT / 'project') or
        not isinstance(workspace.get('id'), str)):
        raise ValueError('READY_SCHEMA_INVALID')
    return value


def owner_lock_released(data: Path):
    lock_path = data / 'server.lock'
    if not lock_path.exists():
        return None
    with lock_path.open('rb') as lock:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            return False
        fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
    return True


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
    for root, port in ((OLD_ROOT, 51492), (BLOCKED_ROOT, 51492),
                       (Path('/tmp/hd002-c0053-pair-synthetic'), OLD_PORT),
                       (Path('/tmp/hd002-c0053-pair-synthetic'), BLOCKED_PORT),
                       (Path('/home/hd002-c0053-pair-synthetic'), 51492)):
        try:
            set_batch(root, port)
        except ValueError:
            pass
        else:
            raise AssertionError('prior root/port or non-/tmp root accepted')
    assert within_window(0, 90, 89.99) and not within_window(0, 90, 90)
    assert valid_done({'schema': SCHEMA, 'done': True, 'electronStopped': True, 'sendCount': 0})
    assert not valid_done({'schema': SCHEMA, 'done': True, 'electronStopped': True, 'sendCount': 1})
    assert digest(BRIDGE) == BRIDGE_SHA
    assert digest(PI) == PI_SHA
    assert digest(REPO / 'src/agent_box/server/__main__.py') == CLI_SOURCE_SHA
    assert PYTHON.is_file()
    with tempfile.TemporaryDirectory(prefix='hd002-c0053-pair-', dir='/tmp') as tmp:
        root = Path(tmp)
        (root / 'project').mkdir(mode=0o700)
        (root / 'sessions').mkdir(mode=0o700)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        set_batch(root, port)
        assert batch_preflight()
        assert ORIGIN == f'http://127.0.0.1:{port}'
        with socket.socket() as occupied:
            occupied.bind(('127.0.0.1', port))
            assert not port_unoccupied(port)
        ready = make_ready(root / 'data/secrets/http-token', 'server_synthetic',
                           {'mode': 'native', 'harness': 'pi', 'profileId': 'profile_synthetic'},
                           {'id': 'workspace_synthetic', 'normalizedPath': str(root / 'project')})
        assert ready['schema'] == SCHEMA and ready['origin'] == ORIGIN
        assert ready['project']['normalizedPath'] == str(root / 'project')
        atomic_private_json(root / 'ready.json', ready)
        assert private_file(root / 'ready.json')
        assert json.loads((root / 'ready.json').read_text()) == ready
        try:
            make_ready(root / 'data/secrets/http-token', 'server_synthetic',
                       {'mode': 'native', 'harness': 'pi', 'profileId': 'profile_synthetic'},
                       {'id': 'workspace_synthetic', 'normalizedPath': str(OLD_ROOT / 'project')})
        except ValueError:
            pass
        else:
            raise AssertionError('old project path accepted')
        trace = root / 'synthetic.trace'
        trace.write_bytes(b'connect(3, {sa_family=AF_INET, sin_addr=inet_addr("127.0.0.1")})\n')
        assert connect_counts(trace) == {'loopback': 1, 'nonLoopback': 0}
        trace.write_bytes(b'connect(3, {sa_family=AF_INET, sin_addr=inet_addr("198.51.100.1")})\n')
        assert connect_counts(trace) == {'loopback': 0, 'nonLoopback': 1}
        count = root / 'server-methods.jsonl'
        fd = os.open(count, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.write(fd, b'{"method":"server.hello"}\n{"method":"sessions.createAndSend"}\n')
        os.close(fd)
        assert inbound_counts(count) == {'server.hello': 1, 'sessions.createAndSend': 1}
        try:
            assert_audit_safe(count)
        except RuntimeError as exc:
            assert str(exc) == 'FORBIDDEN_HTTP_METHOD'
        else:
            raise AssertionError('send method was allowed')
        with count.open('ab') as file:
            file.write(b'{"method":"not-a-method"}\n')
        assert inbound_counts(count) is None
        (root / 'data').mkdir(mode=0o700)
        marker = root / 'data/.agentbox-server-root'
        marker.write_text('agentbox-server-r1\n')
        lock_path = root / 'data/server.lock'
        lock_path.write_text('synthetic')
        assert owner_lock_released(root / 'data') is True
        with lock_path.open('rb') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert owner_lock_released(root / 'data') is False
            fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
        assert not batch_preflight()
    with tempfile.TemporaryDirectory(prefix='hd002-c0053-pair-', dir='/tmp') as tmp:
        base = Path(tmp)
        token_file = base / 'token'
        tap_file = base / 'tap'
        clock = [0.0]
        steps = [0]

        def step(_delay):
            steps[0] += 1
            clock[0] += 0.05
            if steps[0] == 1:
                token_file.write_text('SYNTHETIC_TOKEN_NOT_SECRET_' + 'x' * 16)
                os.chmod(token_file, 0o600)
            elif steps[0] == 2:
                tap_file.write_text('')
                os.chmod(tap_file, 0o600)

        returned = wait_for_startup(token_file, tap_file, is_alive=lambda: True,
            network_probe=lambda: {'nonLoopback': 0}, now=lambda: clock[0],
            sleep=step, start=0)
        assert returned.startswith('SYNTHETIC_TOKEN_') and steps[0] == 2
        tap_file.unlink()
        clock[0] = 0
        try:
            wait_for_startup(token_file, tap_file, is_alive=lambda: True,
                network_probe=lambda: {'nonLoopback': 0}, now=lambda: clock[0],
                sleep=lambda delay: clock.__setitem__(0, clock[0] + 1), start=0)
        except RuntimeError as exc:
            assert str(exc) == 'STARTUP_TIMEOUT'
        else:
            raise AssertionError('missing tap accepted')
        for alive, network, expected in (
            (False, {'nonLoopback': 0}, 'SERVER_EXIT_BEFORE_READY'),
            (True, {'nonLoopback': 1}, 'NON_LOOPBACK_CONNECT'),
        ):
            try:
                wait_for_startup(token_file, tap_file, is_alive=lambda: alive,
                    network_probe=lambda: network, now=lambda: 0, sleep=lambda _: None,
                    start=0)
            except RuntimeError as exc:
                assert str(exc) == expected
            else:
                raise AssertionError('startup stop condition ignored')
        tap_file.write_text('')
        os.chmod(tap_file, 0o644)
        try:
            wait_for_startup(token_file, tap_file, is_alive=lambda: True,
                network_probe=lambda: {'nonLoopback': 0}, now=lambda: 0,
                sleep=lambda _: None, start=0)
        except RuntimeError as exc:
            assert str(exc) == 'TAP_FILE_INVALID'
        else:
            raise AssertionError('non-private tap accepted')
        os.chmod(tap_file, 0o600)
        os.chmod(token_file, 0o644)
        try:
            wait_for_startup(token_file, tap_file, is_alive=lambda: True,
                network_probe=lambda: {'nonLoopback': 0}, now=lambda: 0,
                sleep=lambda _: None, start=0)
        except RuntimeError as exc:
            assert str(exc) == 'TOKEN_FILE_INVALID'
        else:
            raise AssertionError('non-private token accepted')
    assert not root.exists()
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
        if not batch_preflight():
            raise RuntimeError('PREFLIGHT_REFUSAL')
        stderr_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        command = ['/usr/bin/strace', '-f', '-e', 'trace=connect', '-o', str(trace),
                   str(PYTHON), str(TAP), '--count-file', str(ROOT / 'server-methods.jsonl'),
                   '--data-root', str(data),
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
        token = wait_for_startup(token_file, ROOT / 'server-methods.jsonl',
            is_alive=lambda: process.poll() is None,
            network_probe=lambda: connect_counts(trace), now=time.monotonic,
            sleep=time.sleep, start=start)
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
        opened = wire(token, 'workspaces.open', {'requestId': 'hd002-c0053-open',
            'environment': {'kind': 'local', 'host': None, 'user': None},
            'path': str(ROOT / 'project')}, result['httpMethodsBC'])
        workspace = opened.get('workspace')
        if (not isinstance(workspace, dict) or not isinstance(workspace.get('id'), str) or
            workspace.get('normalizedPath') != str(ROOT / 'project')):
            raise RuntimeError('PROJECT_OPEN_FAILED')
        result['projectOpened'] = True
        assert_audit_safe(ROOT / 'server-methods.jsonl')
        ready = make_ready(token_file, server_id, identity, workspace)
        atomic_private_json(ROOT / 'ready.json', ready)
        result['readyWritten'] = True
        while within_window(start, 90, time.monotonic()):
            network = connect_counts(trace)
            if network and network['nonLoopback']:
                raise RuntimeError('NON_LOOPBACK_CONNECT')
            assert_audit_safe(ROOT / 'server-methods.jsonl')
            if process.poll() is not None:
                raise RuntimeError('SERVER_EXIT_DURING_PAIR')
            done_file = ROOT / 'fc-done.json'
            if private_file(done_file):
                done = json.loads(done_file.read_bytes())
                if valid_done(done):
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
        result['serverMethodsAll'] = inbound_counts(ROOT / 'server-methods.jsonl')
        if stderr.exists() and private_file(stderr):
            size = stderr.stat().st_size
            with stderr.open('r+b') as file:
                if size > 65536:
                    file.truncate(65536)
            content = stderr.read_bytes()
            result['stderr'] = {'originalLength': size,
                                'sha256': hashlib.sha256(content).hexdigest(),
                                'truncated': size > 65536}
        result['cleanup']['ownerLockReleased'] = owner_lock_released(data)
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        parser = argparse.ArgumentParser()
        parser.add_argument('--root', type=Path, required=True)
        parser.add_argument('--port', type=int, required=True)
        args = parser.parse_args()
        set_batch(args.root, args.port)
        run()
