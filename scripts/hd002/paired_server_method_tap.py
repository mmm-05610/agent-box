#!/usr/bin/env python3
"""Test-only ASGI ingress counter around the real Server CLI app.

Reads only scope type, HTTP verb and path. Never touches headers, body or URL query.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from pathlib import Path
import re
import stat
import tempfile

WIRE = re.compile(r'^/wire/v1/([A-Za-z][A-Za-z0-9.]*)$')
ALLOWED = frozenset(('server.hello', 'profiles.list', 'workspaces.list',
                     'workspaces.open', 'sessions.list'))
FORBIDDEN = frozenset(('sessions.createAndSend', 'sessions.send', 'sendOutcome.query'))


def category(scope: dict) -> str | None:
    if scope.get('type') != 'http':
        return None
    if scope.get('method') != 'POST':
        return 'OTHER_HTTP'
    path = scope.get('path')
    if not isinstance(path, str):
        return 'OTHER_HTTP'
    match = WIRE.fullmatch(path)
    if match is None:
        return 'OTHER_HTTP'
    method = match.group(1)
    if method in ALLOWED or method in FORBIDDEN:
        return method
    return 'OTHER_WIRE'


class Tap:
    def __init__(self, app, count_file: Path):
        self.app = app
        self.fd = os.open(count_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                          os.O_APPEND | os.O_NOFOLLOW, 0o600)
        metadata = os.fstat(self.fd)
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            os.close(self.fd)
            raise RuntimeError('TAP_FILE_NOT_PRIVATE')

    async def __call__(self, scope, receive, send):
        name = category(scope)
        if name is not None:
            os.write(self.fd, json.dumps({'method': name}, separators=(',', ':')).encode() + b'\n')
        return await self.app(scope, receive, send)


def self_test():
    seen = []

    async def app(scope, receive, send):
        seen.append(scope)
        await send({'type': 'http.response.start', 'status': 201, 'headers': []})
        await send({'type': 'http.response.body', 'body': b'ok'})

    async def receive():
        return {'type': 'http.request', 'body': b'SYNTHETIC_SECRET', 'more_body': False}

    async def run():
        with tempfile.TemporaryDirectory(prefix='hd002-tap-selftest-') as tmp:
            path = Path(tmp) / 'methods.jsonl'
            tap = Tap(app, path)
            events = []

            async def send(event):
                events.append(event)

            for route in ('server.hello', 'workspaces.open', 'sessions.createAndSend',
                          'sessions.send', 'unknown.method'):
                await tap({'type': 'http', 'method': 'POST', 'path': '/wire/v1/' + route,
                           'headers': [(b'authorization', b'SYNTHETIC_SECRET')],
                           'query_string': b'SYNTHETIC_SECRET'}, receive, send)
            await tap({'type': 'http', 'method': 'GET', 'path': '/health'}, receive, send)
            await tap({'type': 'lifespan'}, receive, send)
            rows = [json.loads(line) for line in path.read_bytes().splitlines()]
            assert rows == [{'method': name} for name in (
                'server.hello', 'workspaces.open', 'sessions.createAndSend',
                'sessions.send', 'OTHER_WIRE', 'OTHER_HTTP')]
            assert stat.S_IMODE(path.stat().st_mode) == 0o600
            assert b'SYNTHETIC_SECRET' not in path.read_bytes()
            assert len(seen) == 7 and len(events) == 14

    asyncio.run(run())
    print('SELF_TEST_PASS')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--count-file', type=Path, required=True)
    args, server_args = parser.parse_known_args()
    if not args.count_file.is_absolute() or not args.count_file.parent.is_dir():
        raise SystemExit('COUNT_FILE_INVALID')
    from agent_box.server.transport import http as transport_http
    original = transport_http.create_app
    transport_http.create_app = lambda runtime: Tap(original(runtime), args.count_file)
    from agent_box.server import __main__ as server_main
    return server_main.main(server_args)


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        raise SystemExit(main())
