#!/usr/bin/env python3
"""Deterministic fake ACP agent (stdio) for synthetic vertical tests.

Reads newline-delimited JSON-RPC from stdin, writes protocol lines to
stdout, logs to stderr.  No model call is ever made and no credential file
is touched.  Behavior modes are selected via ``FAKE_ACP_MODE``:

  normal        initialize/new/prompt streaming (text -> tool -> stop)
  permission    prompt emits a permission request and awaits the response
  malformed     emits a garbage line after initialize
  unknown-rt    session/new answers JSON-RPC -32601 (method not found)
  oversized     emits a frame larger than the engine's bound
  early-exit    exits 0 right after initialize (process exit path)
  silent        never answers initialize (request timeout path)
"""
from __future__ import annotations

import json
import os
import sys

MODE = os.environ.get("FAKE_ACP_MODE", "normal")

SESSION_ID = "fake-session-1"


def send(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def status(message: str) -> None:
    sys.stderr.write("fake-acp: " + message + "\n")
    sys.stderr.flush()


def update(session_id: str, update_value: dict) -> None:
    send({"jsonrpc": "2.0", "method": "session/update",
          "params": {"sessionID": session_id, "update": update_value}})


def main() -> int:
    if MODE == "early-exit":
        return 0
    if MODE == "silent":
        # consume stdin forever without answering; parent drives timeout
        while sys.stdin.readline():
            pass
        return 0
    for raw in sys.stdin:
        if not raw.strip():
            continue
        try:
            message = json.loads(raw)
        except ValueError:
            continue
        method = message.get("method")
        params = message.get("params", {}) or {}
        if method == "initialize":
            status("initialized")
            if MODE == "malformed":
                sys.stdout.write("this is not json\n")
                sys.stdout.flush()
            if MODE == "oversized":
                sys.stdout.write("{" + '"x":"' + "y" * 4096 + '"}\n')
                sys.stdout.flush()
            send({"jsonrpc": "2.0", "id": message["id"], "result": {
                "protocolVersion": "1",
                "implementation": {"name": "fake-acp-agent", "version": "1.0.0"},
                "agentCapabilities": {
                    "loadSession": True,
                    "sessionCapabilities": ["new", "load", "resume", "list"],
                    "promptCapabilities": ["embeddedContext"],
                    "mcpCapabilities": [],
                    "authMethods": ["fake-noop"],
                },
            }})
            continue
        if method == "session/new":
            if MODE == "unknown-rt":
                send({"jsonrpc": "2.0", "id": message["id"],
                      "error": {"code": -32601, "message": "method not found"}})
            else:
                send({"jsonrpc": "2.0", "id": message["id"],
                      "result": {"sessionID": SESSION_ID}})
            continue
        if method in ("session/load", "session/resume"):
            send({"jsonrpc": "2.0", "id": message["id"],
                  "result": {"sessionID": SESSION_ID}})
            continue
        if method == "session/prompt":
            session_id = params.get("sessionID", SESSION_ID)
            status("prompting")
            update(session_id, {"kind": "agent_message_chunk", "payload": {"content": "hello from fake agent"}})
            update(session_id, {"kind": "tool_call",
                                "payload": {"name": "bash", "args": {"command": "echo hi"}}})
            if MODE == "permission":
                update(session_id, {"kind": "tool_call_update", "payload": {
                    "name": "bash", "status": "running",
                }})
                send({"jsonrpc": "2.0", "method": "session/request_permission",
                      "params": {
                          "sessionID": session_id,
                          "requestID": "perm-1",
                          "toolCall": {"name": "bash", "args": {"command": "echo hi"}},
                          "options": [
                              {"optionId": "allow", "name": "Allow", "kind": "allow_once"},
                              {"optionId": "always", "name": "Always", "kind": "allow_always"},
                              {"optionId": "deny", "name": "Deny", "kind": "reject_once"},
                          ],
                      }})
                continue
            update(session_id, {"kind": "tool_call_update",
                                "payload": {"name": "bash", "status": "completed"}})
            update(session_id, {"kind": "agent_message_chunk",
                                "payload": {"content": "done", "stopReason": "end_turn"}})
            continue
        if method == "session/respond_permission":
            response = params.get("response", {}) or {}
            status("permission responded: " + json.dumps(response))
            update(params.get("sessionID", SESSION_ID), {"kind": "tool_call_update",
                                                         "payload": {"name": "bash", "status": "completed"}})
            update(params.get("sessionID", SESSION_ID), {"kind": "agent_message_chunk",
                                                         "payload": {"content": "done", "stopReason": "end_turn"}})
            continue
        if method == "session/cancel":
            update(params.get("sessionID", SESSION_ID), {"kind": "agent_message_chunk",
                                                         "payload": {"content": "cancelled", "stopReason": "cancelled"}})
            continue
        if method == "session/respond_permission" and MODE == "permission":
            continue
        # unknown client method -> JSON-RPC method-not-found on requests
        if "id" in message:
            send({"jsonrpc": "2.0", "id": message["id"],
                  "error": {"code": -32601, "message": "method not found"}})
    return 0


if __name__ == "__main__":
    sys.exit(main())