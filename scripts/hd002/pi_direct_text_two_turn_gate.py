#!/usr/bin/env python3
"""C-0084: one direct Pi RPC process, two no-tool text turns, finite output."""
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

CLI = Path('/home/maoqh/.pi/agent/install/releases/0.86.1/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js')
SHA = 'e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774'
AGENT = Path('/home/maoqh/.pi/agent')
MODEL = ('opencode-go', 'kimi-k2.6', 'high')
LOCKS = ('settings.json.lock', 'auth.json.lock', 'models-store.json.lock')
OVERLAYS = ('PI_ARGS', 'PI_PROVIDER', 'PI_MODEL', 'PI_CODING_AGENT_DIR',
            'PI_BIN', 'PI_SESSION_DIR', 'PI_DISABLE_GATE', 'PI_MANAGED_INSTALL_ROOT')


def summarize_assistant(frame):
    message = frame.get('message')
    if not isinstance(message, dict) or message.get('role') != 'assistant':
        return None
    content = message.get('content')
    if not isinstance(content, list):
        return None
    parts = [item.get('text', '') for item in content if isinstance(item, dict) and item.get('type') == 'text']
    return ''.join(part for part in parts if isinstance(part, str))


def safe_state(frame):
    if not isinstance(frame, dict) or frame.get('type') != 'response' or frame.get('command') != 'get_state' or frame.get('success') is not True:
        return None
    data = frame.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('model'), dict):
        return None
    model = data['model']
    return {'modelMatches': (model.get('provider'), model.get('id'), data.get('thinkingLevel')) == MODEL,
            'sessionId': data.get('sessionId'),
            'sessionFile': data.get('sessionFile'),
            'messageCount': data.get('messageCount')}


def self_test():
    fake = {'type': 'message_end', 'message': {'role': 'assistant', 'content': [
        {'type': 'thinking', 'thinking': 'SECRET'}, {'type': 'text', 'text': 'HD002_OK_1'}]}}
    assert summarize_assistant(fake) == 'HD002_OK_1'
    assert summarize_assistant({'message': {'role': 'user', 'content': []}}) is None
    state = safe_state({'type': 'response', 'command': 'get_state', 'success': True,
                        'data': {'model': {'provider': MODEL[0], 'id': MODEL[1]},
                                 'thinkingLevel': MODEL[2], 'sessionId': 'fake',
                                 'sessionFile': '/fake/private/SECRET', 'messageCount': 2}})
    assert state['modelMatches'] and state['sessionId'] == 'fake'
    print('SELF_TEST_PASS')


def main():
    pre = {'version': Path('/home/maoqh/.pi/agent/install/current-version').read_text().strip() == '0.86.1',
           'sha': hashlib.sha256(CLI.read_bytes()).hexdigest() == SHA,
           'overlaysAbsent': all(name not in os.environ for name in OVERLAYS),
           'locksAbsent': all(not (AGENT / name).exists() for name in LOCKS)}
    if not all(pre.values()):
        print(json.dumps({'status': 'PREFLIGHT_REFUSAL', 'preflight': pre}))
        return
    os.umask(0o077)
    root = Path(tempfile.mkdtemp(prefix='hd002-native-text-'))
    project, sessions = root / 'project', root / 'sessions'
    project.mkdir(mode=0o700)
    sessions.mkdir(mode=0o700)
    stderr_path = root / 'pi.stderr'
    fd = os.open(stderr_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    args = ['node', str(CLI), '--mode', 'rpc', '--session-dir', str(sessions),
            '--no-tools', '--no-extensions']
    result = {'status': 'UNKNOWN', 'preflight': pre, 'promptCount': 0,
              'toolEventCount': 0, 'sameSession': False, 'modelStable': False,
              'reply': []}
    proc = None
    buffer = b''

    def send(record):
        proc.stdin.write((json.dumps(record, separators=(',', ':')) + '\n').encode())
        proc.stdin.flush()

    def next_frame(deadline):
        nonlocal buffer
        while time.monotonic() < deadline:
            if b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                try:
                    value = json.loads(line)
                except (UnicodeError, ValueError):
                    raise RuntimeError('BAD_JSONL')
                if not isinstance(value, dict):
                    raise RuntimeError('BAD_FRAME')
                return value
            ready, _, _ = select.select([proc.stdout], [], [], .2)
            if ready:
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('STDOUT_CLOSED')
                buffer += chunk
                if len(buffer) > 1048576:
                    raise RuntimeError('OUTPUT_LIMIT')
            elif proc.poll() is not None:
                raise RuntimeError('EXIT_EARLY')
        raise RuntimeError('TIMEOUT')

    def state(number):
        send({'id': f'state-{number}', 'type': 'get_state'})
        deadline = time.monotonic() + 30
        while True:
            frame = next_frame(deadline)
            if frame.get('type') == 'tool_execution_start':
                result['toolEventCount'] += 1
                raise RuntimeError('TOOL_EVENT')
            if frame.get('id') == f'state-{number}':
                value = safe_state(frame)
                if value is None:
                    raise RuntimeError('STATE_INVALID')
                return value

    try:
        proc = subprocess.Popen(args, cwd=project, env=os.environ.copy(),
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=fd, start_new_session=True, bufsize=0)
        first_state = state(0)
        if not first_state['modelMatches'] or not isinstance(first_state['sessionId'], str) or not first_state['sessionId']:
            raise RuntimeError('IDENTITY_DRIFT_BEFORE_PROMPT')
        if not isinstance(first_state['sessionFile'], str) or not Path(first_state['sessionFile']).is_relative_to(sessions):
            raise RuntimeError('SESSION_OUTSIDE_TEST_ROOT')
        session_id = first_state['sessionId']
        for number in (1, 2):
            token = f'HD002_OK_{number}'
            prompt = f'Connection check. Reply with exactly {token}. Do not use tools.'
            send({'id': f'prompt-{number}', 'type': 'prompt', 'message': prompt})
            result['promptCount'] += 1
            got_ack = False
            assistant = None
            deadline = time.monotonic() + 150
            while True:
                frame = next_frame(deadline)
                kind = frame.get('type')
                if kind == 'tool_execution_start':
                    result['toolEventCount'] += 1
                    raise RuntimeError('TOOL_EVENT')
                if frame.get('id') == f'prompt-{number}':
                    if kind != 'response' or frame.get('success') is not True:
                        raise RuntimeError('PROMPT_REJECTED')
                    got_ack = True
                if kind == 'message_end':
                    maybe = summarize_assistant(frame)
                    if maybe is not None:
                        assistant = maybe
                if kind == 'agent_end':
                    if frame.get('willRetry'):
                        continue
                    if not got_ack:
                        raise RuntimeError('AGENT_END_BEFORE_ACK')
                    break
            result['reply'].append({'nonEmpty': bool(assistant), 'exactToken': assistant.strip() == token if assistant else False,
                                    'length': len(assistant or ''),
                                    'sha256': hashlib.sha256((assistant or '').encode()).hexdigest()})
            latest = state(number)
            if latest['sessionId'] != session_id or not latest['modelMatches']:
                raise RuntimeError('SESSION_OR_MODEL_DRIFT')
            if not isinstance(latest['sessionFile'], str) or not Path(latest['sessionFile']).is_relative_to(sessions):
                raise RuntimeError('SESSION_OUTSIDE_TEST_ROOT')
            result['sameSession'] = True
            result['modelStable'] = True
            result[f'messageCountAfter{number}'] = latest['messageCount'] if type(latest['messageCount']) is int else None
            if not assistant:
                raise RuntimeError('NO_ASSISTANT_REPLY')
        result['status'] = 'TWO_TURNS_DONE'
    except BaseException as exc:
        result['status'] = str(exc) if isinstance(exc, RuntimeError) and str(exc) in {
            'BAD_JSONL', 'BAD_FRAME', 'STDOUT_CLOSED', 'OUTPUT_LIMIT', 'EXIT_EARLY', 'TIMEOUT',
            'TOOL_EVENT', 'STATE_INVALID', 'IDENTITY_DRIFT_BEFORE_PROMPT', 'SESSION_OUTSIDE_TEST_ROOT',
            'PROMPT_REJECTED', 'AGENT_END_BEFORE_ACK', 'SESSION_OR_MODEL_DRIFT', 'NO_ASSISTANT_REPLY'} else 'EXCEPTION'
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
        raw = stderr_path.read_bytes()
        result['stderr'] = {'length': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
                            'settingsWarning': b'Failed to load' in raw and b'settings' in raw.lower()}
        result['locksReleased'] = all(not (AGENT / name).exists() for name in LOCKS)
        result['projectEntryCount'] = len(list(project.iterdir()))
        result['sessionFileCount'] = sum(1 for p in sessions.rglob('*') if p.is_file())
        result['privateRootMode'] = oct(root.stat().st_mode & 0o777)
        result['testRootRetained'] = True
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif not sys.argv[1:]:
        main()
    else:
        raise SystemExit(2)
