#!/usr/bin/env python3
"""Test-only ASGI ingress method counter; never reads headers/body/query."""
import argparse
import json
import os
from pathlib import Path
import re
import stat

WIRE = re.compile(r'^/wire/v1/([A-Za-z][A-Za-z0-9.]*)$')
REST_SESSION = re.compile(r'^/api/v1/sessions/[^/]+$')


def category(scope):
    if scope.get('type') != 'http':
        return None
    method, path = scope.get('method'), scope.get('path')
    if method == 'POST' and isinstance(path, str):
        match = WIRE.fullmatch(path)
        if match:
            return match.group(1)
    if method == 'GET' and isinstance(path, str) and REST_SESSION.fullmatch(path):
        return 'REST_SESSION_GET'
    return 'OTHER_HTTP'


class Tap:
    def __init__(self, app, count_file):
        self.app = app
        self.fd = os.open(count_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                          os.O_APPEND | os.O_NOFOLLOW, 0o600)
        mode = os.fstat(self.fd).st_mode
        if not stat.S_ISREG(mode) or stat.S_IMODE(mode) != 0o600:
            os.close(self.fd)
            raise RuntimeError('TAP_FILE_NOT_PRIVATE')

    async def __call__(self, scope, receive, send):
        name = category(scope)
        if name is not None:
            os.write(self.fd, json.dumps({'method': name}, separators=(',', ':')).encode() + b'\n')
        return await self.app(scope, receive, send)


def self_test():
    assert category({'type': 'http', 'method': 'POST', 'path': '/wire/v1/sessions.createAndSend',
                     'headers': [(b'authorization', b'FAKE_SECRET')]}) == 'sessions.createAndSend'
    assert category({'type': 'http', 'method': 'GET', 'path': '/api/v1/sessions/FAKE_SECRET'}) == 'REST_SESSION_GET'
    assert category({'type': 'http', 'method': 'POST', 'path': '/unknown'}) == 'OTHER_HTTP'
    assert category({'type': 'lifespan'}) is None
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
