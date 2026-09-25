"""A minimal stdio MCP server for the order-58 probe tests.

Reads one line, answers an initialize result, and stays alive until the
probe kills it. `FAKE_MCP_MODE` changes the failure shape:
  ok (default) | silent | garbage | oversized
"""
import json
import os
import sys
import time

mode = os.environ.get("FAKE_MCP_MODE", "ok")
line = sys.stdin.readline()
if mode == "silent":
    time.sleep(30)
    sys.exit(0)
if mode == "garbage":
    sys.stdout.write("not json at all\n")
    sys.stdout.flush()
    time.sleep(30)
    sys.exit(0)
if mode == "oversized":
    sys.stdout.write("x" * (128 * 1024) + "\n")
    sys.stdout.flush()
    time.sleep(30)
    sys.exit(0)
request = json.loads(line)
sys.stdout.write(json.dumps({
    "jsonrpc": "2.0", "id": request.get("id"),
    "result": {
        "protocolVersion": "2024-11-05",
        "serverInfo": {"name": "fake-mcp", "version": "0.1"},
        "capabilities": {},
    },
}) + "\n")
sys.stdout.flush()
time.sleep(30)
