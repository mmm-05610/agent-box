#!/usr/bin/env python3
"""C-0087: real Server CLI + HTTP native first/follow-up, bounded output."""
import argparse
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'src'))
HELLO = {'clientVersions': ['wire/1'], 'clientPresentationSupports': []}


def port_number():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def call(port, token, method, params):
    data = json.dumps({'jsonrpc': '2.0', 'id': method, 'method': method, 'params': params}).encode()
    req = Request(f'http://127.0.0.1:{port}/wire/v1/{method}', data=data,
                  headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urlopen(req, timeout=6) as response:
        return json.load(response)


def session(port, token, session_id):
    req = Request(f'http://127.0.0.1:{port}/api/v1/sessions/{session_id}',
                  headers={'Authorization': f'Bearer {token}'})
    with urlopen(req, timeout=6) as response:
        return json.load(response)


def run(root, adapter, adapter_args):
    import uvicorn
    from agent_box.server import __main__ as server_main
    from agent_box.server.transport import http as transport_http

    project, sessions, data = root / 'project', root / 'sessions', root / 'data'
    assert project.is_dir() and sessions.is_dir() and not list(project.iterdir()) and not data.exists()
    result = {'serverHello': False, 'profileReady': False, 'workspaceCwd': False,
              'firstAccepted': False, 'firstCompleted': False, 'secondAccepted': False,
              'secondCompleted': False, 'approvalEvents': 0, 'toolEvents': 0,
              'firstReplyNonEmpty': False, 'secondReplyNonEmpty': False,
              'sameServerSession': False, 'sameNativeId': None,
              'stage': 'startup', 'failureType': None}
    holder = {}
    ready = threading.Event()
    old_app = transport_http.create_app
    old_run = uvicorn.run
    port = port_number()
    server_thread = None

    def capture(runtime):
        holder['runtime'] = runtime
        ready.set()
        return old_app(runtime)

    def run_uvicorn(app, *, host, port, workers, log_config):
        server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, workers=workers, log_config=log_config))
        holder['server'] = server
        server.run()

    def thread_main():
        try:
            server_main.main([
                '--data-root', str(data), '--port', str(port),
                '--execution-mode', 'native', '--native-harness', 'pi',
                '--plugin-root', str(REPO / 'plugins/agent-box-harnesses'),
                '--native-adapter-command', str(adapter),
                *[f'--native-adapter-arg={arg}' for arg in adapter_args],
            ])
        except BaseException as exc:
            holder['threadError'] = type(exc).__name__

    def frames(token, session_id):
        body = call(port, token, 'history.snapshot', {'sessionId': session_id, 'page': {'limit': 500}})
        return body.get('result', {}).get('frames', [])

    def settle(token, session_id, count, execution_id):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            events = [f.get('event', {}) for f in frames(token, session_id)]
            approvals = sum(e.get('kind') == 'approval.requested' for e in events)
            tools = sum(str(e.get('kind', '')).startswith('tool.') for e in events)
            result['approvalEvents'] = max(result['approvalEvents'], approvals)
            result['toolEvents'] = max(result['toolEvents'], tools)
            if approvals or tools:
                call(port, token, 'runs.stop', {'requestId': f'stop-unexpected-{count}',
                      'sessionId': session_id, 'executionId': execution_id})
                raise RuntimeError('UNEXPECTED_APPROVAL_OR_TOOL')
            row = session(port, token, session_id)
            turns = row.get('turns', [])
            if len(turns) >= count and turns[-1].get('state') in {'completed', 'failed', 'cancelled', 'unknown'}:
                return row, events
            time.sleep(.2)
        call(port, token, 'runs.stop', {'requestId': f'stop-timeout-{count}',
             'sessionId': session_id, 'executionId': execution_id})
        raise RuntimeError('TURN_TIMEOUT')

    transport_http.create_app = capture
    uvicorn.run = run_uvicorn
    server_thread = threading.Thread(target=thread_main, daemon=True)
    server_thread.start()
    try:
        if not ready.wait(15):
            raise RuntimeError('SERVER_RUNTIME_UNAVAILABLE')
        runtime = holder['runtime']
        token = None
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            token_file = data / 'secrets' / 'http-token'
            if token_file.is_file():
                candidate = token_file.read_text().strip()
                try:
                    hello = call(port, candidate, 'server.hello', HELLO)
                    if 'result' in hello:
                        token = candidate
                        break
                except (OSError, ValueError):
                    pass
            time.sleep(.1)
        if token is None:
            raise RuntimeError('SERVER_HELLO_UNAVAILABLE')
        identity = hello['result'].get('nativeExecution', {})
        result['serverHello'] = identity.get('mode') == 'native' and identity.get('harness') == 'pi' and identity.get('profileId') == runtime.native_profile_id
        if not result['serverHello']:
            raise RuntimeError('IDENTITY_MISMATCH')
        result['stage'] = 'profile'
        profiles = call(port, token, 'profiles.list', {'includeArchived': False})
        matches = [x for x in profiles.get('result', {}).get('items', []) if x.get('id') == identity['profileId']]
        result['profileReady'] = len(matches) == 1 and matches[0].get('sendability', {}).get('state') == 'ready'
        if not result['profileReady']:
            raise RuntimeError('PROFILE_NOT_READY')
        result['stage'] = 'workspace'
        opened = call(port, token, 'workspaces.open', {'requestId': 'hd002-product-open',
                      'environment': {'kind': 'local', 'host': None, 'user': None}, 'path': str(project)})
        workspace_id = opened['result']['workspace']['id']
        stored = runtime.service.workspaces.records.get(workspace_id)
        result['workspaceCwd'] = stored['normalized_path'] == str(project)
        if not result['workspaceCwd']:
            raise RuntimeError('WORKSPACE_CWD_MISMATCH')
        result['stage'] = 'first_send'
        first = call(port, token, 'sessions.createAndSend', {
            'requestId': 'hd002-product-first', 'workspaceId': workspace_id,
            'profileId': identity['profileId'],
            'message': {'text': 'Connection check. Reply with exactly HD002_SERVER_OK_1. Do not use tools.', 'attachments': []},
            'overrides': []})
        value = first.get('result', {})
        result['firstAccepted'] = value.get('outcome') == 'accepted'
        if not result['firstAccepted']:
            raise RuntimeError('FIRST_REJECTED')
        session_id = value['session']['id']
        row, events = settle(token, session_id, 1, value['executionId'])
        result['firstCompleted'] = row['turns'][-1]['state'] == 'completed'
        first_id = row.get('checkpoint', {}).get('native_id')
        first_text = ''.join(str(e.get('text', '')) for e in events if e.get('kind') == 'message.delta')
        result['firstReplyNonEmpty'] = bool(first_text)
        result['firstReplyExact'] = first_text.strip() == 'HD002_SERVER_OK_1'
        if not result['firstCompleted'] or not result['firstReplyNonEmpty']:
            raise RuntimeError('FIRST_NO_REPLY')
        result['stage'] = 'second_send'
        second = call(port, token, 'sessions.send', {
            'requestId': 'hd002-product-second', 'sessionId': session_id,
            'message': {'text': 'Connection check round two. Reply with exactly HD002_SERVER_OK_2. Do not use tools.', 'attachments': []},
            'overrides': []})
        value = second.get('result', {})
        result['secondAccepted'] = value.get('outcome') == 'accepted'
        if not result['secondAccepted']:
            raise RuntimeError('SECOND_REJECTED')
        row, events = settle(token, session_id, 2, value['executionId'])
        result['secondCompleted'] = row['turns'][-1]['state'] == 'completed'
        second_id = row.get('checkpoint', {}).get('native_id')
        # The REST row omits its id; the authenticated URL and a second settled
        # turn under that exact id are the observable continuity assertion.
        result['sameServerSession'] = len(row.get('turns', [])) >= 2
        result['sameNativeId'] = first_id == second_id if first_id and second_id else None
        text = ''.join(str(e.get('text', '')) for e in events if e.get('kind') == 'message.delta')
        result['secondReplyNonEmpty'] = bool(text)
        result['secondReplyExact'] = 'HD002_SERVER_OK_2' in text
        result['stage'] = 'done'
    except BaseException as exc:
        result['failureType'] = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
    finally:
        if 'server' in holder:
            holder['server'].should_exit = True
        server_thread.join(timeout=10)
        result['serverThreadStopped'] = not server_thread.is_alive()
        result['projectEntryCount'] = len(list(project.iterdir()))
        result['piSessionFileCount'] = sum(1 for p in sessions.rglob('*') if p.is_file())
        transport_http.create_app = old_app
        uvicorn.run = old_run
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--adapter', type=Path, required=True)
    parser.add_argument('--adapter-arg', action='append', default=[])
    args = parser.parse_args()
    print(json.dumps(run(args.root, args.adapter, tuple(args.adapter_arg)), sort_keys=True), flush=True)
