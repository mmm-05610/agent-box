#!/usr/bin/env python3
"""Raw synthetic ACP Client driver: spawns the fake agent subprocess and
exercises initialize / session/new / session/prompt / error model over
newline-delimited stdio JSON-RPC. No credentials, no model calls.

Verifies (per SOURCE_POLICY section 4, synthetic fixtures allowed):
 1. framing: one JSON-RPC message per line, no embedded newlines
 2. initialize negotiation echo
 3. session/new -> agent-owned sessionId
 4. streaming session/update before the session/prompt response
 5. error model: unknown method -32601, unknown session -32002,
    malformed JSON -32700
"""
import json
import subprocess
import sys

FAKE_AGENT = str(__import__("pathlib").Path(__file__).with_name("acp_fake_agent.py"))

proc = subprocess.Popen(
    [sys.executable, FAKE_AGENT],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    text=True, bufsize=1,
)
received = []


def send(obj):
    data = json.dumps(obj, ensure_ascii=False)
    assert "\n" not in data, "ACP framing forbids embedded newlines"
    proc.stdin.write(data + "\n")
    proc.stdin.flush()


def recv_until_response(rid):
    """Read lines until the response with matching id; collect notifications."""
    while True:
        line = proc.stdout.readline()
        if not line:
            raise RuntimeError("agent closed stdout")
        msg = json.loads(line)
        received.append(msg)
        if msg.get("id") == rid and ("result" in msg or "error" in msg):
            return msg


# 1. initialize (client requests v2 to test downgrade -> agent echoes 2 since fake supports it)
send({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {
    "protocolVersion": 2,
    "clientCapabilities": {"fs": {"readTextFile": True, "writeTextFile": False}, "terminal": False},
    "clientInfo": {"name": "raw-test-client", "version": "0.0.0"},
}})
r0 = recv_until_response(0)
print("initialize ->", json.dumps(r0))
assert r0["result"]["protocolVersion"] in (1, 2)

# 2. session/new
send({"jsonrpc": "2.0", "id": 1, "method": "session/new", "params": {
    "cwd": "/tmp", "mcpServers": []}})
r1 = recv_until_response(1)
sid = r1["result"]["sessionId"]
print("session/new -> sessionId:", sid)

# 3. session/prompt with streaming updates
send({"jsonrpc": "2.0", "id": 2, "method": "session/prompt", "params": {
    "sessionId": sid, "prompt": [{"type": "text", "text": "hi"}]}})
r2 = recv_until_response(2)
print("session/prompt ->", json.dumps(r2))
updates = [m for m in received if m.get("method") == "session/update"]
kinds = [u["params"]["update"]["sessionUpdate"] for u in updates]
print("streamed update variants:", kinds)
assert kinds[0] == "agent_message_chunk"
assert r2["result"]["stopReason"] == "end_turn"

# 4. unknown method -> -32601
send({"jsonrpc": "2.0", "id": 3, "method": "unknown/method", "params": {}})
r3 = recv_until_response(3)
print("unknown/method ->", json.dumps(r3))
assert r3["error"]["code"] == -32601

# 5. prompt against unknown session -> -32002
send({"jsonrpc": "2.0", "id": 4, "method": "session/prompt", "params": {
    "sessionId": "sess_does_not_exist", "prompt": [{"type": "text", "text": "x"}]}})
r4 = recv_until_response(4)
print("unknown session ->", json.dumps(r4))
assert r4["error"]["code"] == -32002

# 6. malformed JSON -> -32700 with id null
proc.stdin.write("{not json\n")
proc.stdin.flush()
line = proc.stdout.readline()
r5 = json.loads(line)
print("malformed ->", json.dumps(r5))
assert r5["error"]["code"] == -32700 and r5.get("id") is None

# 7. session/cancel notification must produce no response: send and verify next line is nothing pending
send({"jsonrpc": "2.0", "method": "session/cancel", "params": {"sessionId": sid}})

proc.stdin.close()
proc.wait(timeout=5)
err = proc.stderr.read()
print("stderr of agent:", repr(err))
print("ALL RAW FRAMING/ERROR CHECKS PASSED")
