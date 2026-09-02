#!/usr/bin/env python3
"""Synthetic fake ACP Agent (no credentials, no model calls).

Reads newline-delimited JSON-RPC 2.0 from stdin, writes to stdout.
Implements: initialize, session/new, session/prompt (streams a chunk +
a tool_call update then finishes), session/cancel (ignored -> cancelled).
Anything else -> JSON-RPC error. Used to verify ACP v1 wire framing and
the error model from the client side.

Source policy: ACP_SPEC behavior re-derived from schema/v1 (spec repo
commit 7a5f3a7, 2026-09-02). Experiments allowed per SOURCE_POLICY section 4.
"""
import json
import sys


def send(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def handle(req):
    method = req.get("method")
    rid = req.get("id")
    params = req.get("params") or {}
    if rid is None:
        # notification
        return
    if method == "initialize":
        send({
            "jsonrpc": "2.0",
            "id": rid,
            "result": {
                "protocolVersion": params.get("protocolVersion", 1),
                "agentCapabilities": {
                    "loadSession": False,
                    "promptCapabilities": {"image": False, "audio": False, "embeddedContext": False},
                    "mcpCapabilities": {"http": False, "sse": False},
                },
                "authMethods": [],
                "agentInfo": {"name": "fake-acp-agent", "version": "0.0.1"},
            },
        })
    elif method == "session/new":
        send({"jsonrpc": "2.0", "id": rid, "result": {"sessionId": "sess_fake_0001"}})
    elif method == "session/prompt":
        sid = params.get("sessionId")
        if sid != "sess_fake_0001":
            send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32002, "message": "Resource not found: unknown session"}})
            return
        # stream one agent_message_chunk then one tool_call, then finish
        send({"jsonrpc": "2.0", "method": "session/update", "params": {
            "sessionId": sid,
            "update": {"sessionUpdate": "agent_message_chunk",
                       "content": {"type": "text", "text": "hello from fake agent"}}}})
        send({"jsonrpc": "2.0", "method": "session/update", "params": {
            "sessionId": sid,
            "update": {"sessionUpdate": "tool_call", "toolCallId": "call_1",
                       "title": "fake tool", "kind": "other", "status": "pending"}}})
        send({"jsonrpc": "2.0", "method": "session/update", "params": {
            "sessionId": sid,
            "update": {"sessionUpdate": "tool_call_update", "toolCallId": "call_1",
                       "status": "completed"}}})
        send({"jsonrpc": "2.0", "id": rid, "result": {"stopReason": "end_turn"}})
    elif method == "session/cancel":
        pass  # notification, no response by spec
    elif method == "unknown/method":
        send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "Method not found"}})
    else:
        send({"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": "Method not found"}})


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            send({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
            continue
        if isinstance(msg, list):
            for m in msg:
                handle(m)
        else:
            handle(msg)


if __name__ == "__main__":
    main()
