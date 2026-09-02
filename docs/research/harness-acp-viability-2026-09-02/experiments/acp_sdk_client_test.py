#!/usr/bin/env python3
"""Official Python SDK (agent-client-protocol 0.12.1) as ACP Client,
talking to the synthetic fake agent over stdio. Validates that the SDK's
framing and Pydantic schema handling interoperate with a minimal
schema-conformant agent. No credentials, no model calls.

Run with PYTHONPATH=/tmp/acp-sdk-python-sdk/src
"""
import asyncio
import sys
from typing import Any

from acp import PROTOCOL_VERSION, spawn_agent_process
from acp.core import ClientSideConnection
from acp.schema import (
    AgentMessageChunk,
    Implementation,
    PermissionOption,
    RequestPermissionResponse,
    SessionNotification,
    TextContentBlock,
    ToolCallProgress,
    ToolCallStart,
)

FAKE_AGENT = str(__import__("pathlib").Path(__file__).with_name("acp_fake_agent.py"))

updates_seen = []


class TestClient:
    async def request_permission(
        self, session_id: str, tool_call: Any, options: list[PermissionOption], **kwargs: Any
    ) -> RequestPermissionResponse:
        raise RuntimeError("unexpected permission request")

    async def session_update(self, session_id: str, update: Any, **kwargs: Any) -> None:
        updates_seen.append(update)

    async def on_connect(self, conn: ClientSideConnection) -> None:
        print("[sdk] client connected; SDK PROTOCOL_VERSION constant =", PROTOCOL_VERSION)


async def main() -> None:
    async with spawn_agent_process(
        lambda _agent: TestClient(), sys.executable, FAKE_AGENT
    ) as (conn, proc):
        init = await conn.initialize(
            protocol_version=PROTOCOL_VERSION,
            client_capabilities=None,  # exercise lenient default-on-error path
            client_info=Implementation(name="sdk-test-client", version="0.0.0"),
        )
        print("[sdk] initialize response protocolVersion =", init.protocol_version)
        print("[sdk] agentCapabilities.loadSession =", init.agent_capabilities.load_session)
        assert init.protocol_version == 1

        session = await conn.new_session(cwd="/tmp", mcp_servers=[])
        print("[sdk] session/new ->", session.session_id)

        stop = await conn.prompt(session.session_id, [
            TextContentBlock(type="text", text="hi"),
        ])
        print("[sdk] prompt stopReason =", stop.stop_reason)
        print("[sdk] streamed updates received:", [type(u).__name__ for u in updates_seen])
        assert stop.stop_reason == "end_turn"
        assert any(isinstance(u, AgentMessageChunk) for u in updates_seen)
        assert any(isinstance(u, ToolCallStart) for u in updates_seen)
        assert any(isinstance(u, ToolCallProgress) for u in updates_seen)
        print("SDK INTEROP PASSED")


if __name__ == "__main__":
    asyncio.run(main())
