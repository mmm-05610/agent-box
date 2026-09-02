#!/usr/bin/env python3
"""Official Python SDK as ACP Agent; a raw JSON-RPC client drives it.
Verifies: (a) agent-side handler surface, (b) session/request_permission
round-trip (SDK agent asks, raw client answers `selected`), (c) that the
SDK serializes ACP wire frames on stdio.

Run:  python3 acp_sdk_agent_perm_test.py           (driver + spawn --serve)
      python3 acp_sdk_agent_perm_test.py --serve   (SDK agent on stdio)
Requires PYTHONPATH=/tmp/acp-sdk-python-sdk/src
"""
import asyncio
import json
import sys
from typing import Any

from acp import run_agent
from acp.schema import (
    AgentCapabilities, InitializeRequest, InitializeResponse, McpCapabilities,
    NewSessionRequest, NewSessionResponse, PermissionOption, PromptCapabilities,
    PromptRequest, PromptResponse, ToolCallProgress, ToolCallStart, ToolCallStatus,
    ToolKind,
)


class FakeAgent:
    def on_connect(self, conn) -> None:
        self._conn = conn

    async def initialize(self, params: InitializeRequest) -> InitializeResponse:
        return InitializeResponse(
            protocol_version=params.protocol_version,
            agent_capabilities=AgentCapabilities(
                load_session=False,
                prompt_capabilities=PromptCapabilities(),
                mcp_capabilities=McpCapabilities(),
            ),
            auth_methods=[],
            agent_info=None,
        )

    async def new_session(self, cwd: str, mcp_servers: list, **kwargs: Any) -> NewSessionResponse:
        return NewSessionResponse(session_id="sess_sdk_agent_1")

    async def prompt(self, params: PromptRequest) -> PromptResponse:
        await self._conn.session_update(
            params.session_id,
            ToolCallStart(
                session_update="tool_call", tool_call_id="call_9",
                title="sensitive op", kind="execute",
                status="pending",
            ),
        )
        await self._conn.request_permission(
            session_id=params.session_id,
            tool_call=ToolCallProgress(
                session_update="tool_call_update", tool_call_id="call_9",
            ),
            options=[PermissionOption(option_id="allow-once", name="Allow", kind="allow_once")],
        )
        await self._conn.session_update(
            params.session_id,
            ToolCallProgress(
                session_update="tool_call_update", tool_call_id="call_9",
                status="completed",
            ),
        )
        return PromptResponse(stop_reason="end_turn")


async def serve() -> None:
    await run_agent(FakeAgent())


async def drive() -> None:
    proc = await asyncio.create_subprocess_exec(
        sys.executable, __file__, "--serve",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        env={"PYTHONPATH": "/tmp/acp-sdk-python-sdk/src", "PATH": "/usr/bin:/bin"},
    )
    next_id = 0

    async def rpc(method, params):
        nonlocal next_id
        next_id += 1
        rid = next_id
        proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}) + "\n").encode())
        await proc.stdin.drain()
        while True:
            line = await proc.stdout.readline()
            msg = json.loads(line)
            if msg.get("id") == rid and ("result" in msg or "error" in msg):
                return msg
            print("[drv] notification:", msg.get("method"), json.dumps(msg.get("params", {}).get("update", ""))[:100])

    r0 = await rpc("initialize", {"protocolVersion": 1, "clientCapabilities": {}})
    print("[drv] initialize ->", json.dumps(r0)[:300])

    r1 = await rpc("session/new", {"cwd": "/tmp", "mcpServers": []})
    sid = r1["result"]["sessionId"]
    print("[drv] session/new ->", sid)

    # prompt: when the permission request arrives, answer `selected`
    next_id += 1
    pid = next_id
    proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": pid, "method": "session/prompt",
                                  "params": {"sessionId": sid, "prompt": [{"type": "text", "text": "go"}]}}) + "\n").encode())
    await proc.stdin.drain()
    answered = False
    while True:
        line = await proc.stdout.readline()
        msg = json.loads(line)
        if msg.get("method") == "session/request_permission":
            print("[drv] permission request options:", json.dumps(msg["params"]["options"]))
            assert msg["params"]["sessionId"] == sid
            proc.stdin.write((json.dumps({"jsonrpc": "2.0", "id": msg["id"],
                                          "result": {"outcome": {"outcome": "selected", "optionId": "allow-once"}}}) + "\n").encode())
            await proc.stdin.drain()
            answered = True
            continue
        if msg.get("id") == pid and ("result" in msg or "error" in msg):
            print("[drv] prompt result:", json.dumps(msg.get("result") or msg.get("error")))
            break
        print("[drv] notification:", msg.get("method"), json.dumps(msg.get("params", {}).get("update", ""))[:100])
    assert answered, "permission request never arrived"
    proc.stdin.close()
    await proc.wait()
    print("PERMISSION ROUND-TRIP PASSED")


if __name__ == "__main__":
    if "--serve" in sys.argv:
        asyncio.run(serve())
    else:
        asyncio.run(drive())
