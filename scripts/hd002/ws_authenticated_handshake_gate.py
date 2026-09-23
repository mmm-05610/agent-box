#!/usr/bin/env python3
"""Actual Uvicorn WS protocol gate against the product event route, no Agent."""
import base64
import os
from pathlib import Path
import socket
import sys
import tempfile
import threading
import time

from fastapi.testclient import TestClient
import uvicorn

from agent_box.server.bootstrap import build_runtime
from agent_box.server.execution import HarnessDescriptor, HarnessRegistry
from agent_box.server.transport.http import create_app


class FakeConnector:
    def distributions(self):
        return [{'name': 'Ubuntu'}]

    def probe(self, distribution, user):
        return {'probe_id': 'probe-Ubuntu', 'distribution': 'Ubuntu', 'user': user}

    def open_workspace(self, probe_id, path):
        return {'connection_id': f'conn-{path}', 'distribution': 'Ubuntu',
                'user': 'tester', 'path': path}


class RecordingExecution:
    def accept(self, execution_id):
        pass

    def cancel(self, execution_id):
        return True


def wire(client, token, method, params):
    response = client.post(f'/wire/v1/{method}',
                           headers={'Authorization': f'Bearer {token}'},
                           json={'jsonrpc': '2.0', 'id': method,
                                 'method': method, 'params': params})
    body = response.json()
    assert response.status_code == 200 and 'result' in body, (method, body)
    return body['result']


def status(port, session_id, token=None):
    key = base64.b64encode(os.urandom(16)).decode()
    auth = f'Authorization: Bearer {token}\r\n' if token else ''
    request = (f'GET /wire/v1/event-stream?sessionId={session_id} HTTP/1.1\r\n'
               f'Host: 127.0.0.1:{port}\r\nUpgrade: websocket\r\n'
               f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
               f'Sec-WebSocket-Version: 13\r\n{auth}\r\n').encode()
    with socket.create_connection(('127.0.0.1', port), timeout=2) as sock:
        sock.sendall(request)
        return sock.recv(256).split(b'\r\n', 1)[0]


def main():
    with tempfile.TemporaryDirectory(prefix='hd002-ws-gate-') as directory:
        registry = HarnessRegistry()
        registry.register(HarnessDescriptor(
            'alpha', capability_claims={'stream': True},
            control_options={'model': ('alpha-default',)},
            configuration_validator=lambda value: None,
        ))
        runtime = build_runtime(Path(directory) / 'data', harnesses=registry,
                                connector=FakeConnector(), execution=RecordingExecution())
        app = create_app(runtime)
        with TestClient(app, base_url='http://127.0.0.1') as client:
            workspace = wire(client, runtime.token, 'workspaces.open', {
                'requestId': 'ws-gate-open',
                'environment': {'kind': 'wsl', 'host': 'Ubuntu', 'user': None},
                'path': '/home/tester/project',
            })['workspace']
            profile_response = client.post('/api/v1/profiles',
                headers={'Authorization': f'Bearer {runtime.token}',
                         'Idempotency-Key': 'ws-gate-profile'},
                json={'name': 'role', 'harness_type': 'alpha',
                      'configuration': {'model': 'alpha-default'},
                      'credential_id': None})
            assert profile_response.status_code == 201
            profile = profile_response.json()
            accepted = wire(client, runtime.token, 'sessions.createAndSend', {
                'requestId': 'ws-gate-send-001', 'workspaceId': workspace['id'],
                'profileId': profile['profile_id'],
                'message': {'text': 'hello', 'attachments': []},
                'overrides': [],
            })
            session_id = accepted['session']['id']
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            server = uvicorn.Server(uvicorn.Config(app, host='127.0.0.1', port=port,
                                                   log_level='error', access_log=False))
            thread = threading.Thread(target=server.run, daemon=True)
            thread.start()
            try:
                for _ in range(100):
                    if server.started:
                        break
                    time.sleep(.02)
                assert server.started
                authenticated = status(port, session_id, runtime.token)
                unauthenticated = status(port, session_id)
                unknown_session = status(port, 'missing-session', runtime.token)
                assert authenticated == b'HTTP/1.1 101 Switching Protocols', authenticated
                assert unauthenticated.startswith(b'HTTP/1.1 403'), unauthenticated
                assert unknown_session.startswith(b'HTTP/1.1 403'), unknown_session
                print('WS_GATE_PASS authenticated=101 unauthenticated=403 unknownSession=403 agentStarted=false')
            finally:
                server.should_exit = True
                thread.join(timeout=3)
                assert not thread.is_alive()


if __name__ == '__main__':
    main()
