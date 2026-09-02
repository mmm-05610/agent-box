"""OpenCode ACP vertical: full formal chain + real subprocess + driver.

Level 1 (engine synthetic): the ACP second mode driven end-to-end over the
formal launch chain with a synthetic executable that IS the fake ACP agent.

Level 2 (driver-level policy): permission timeout / FIFO / duplicate / late
response / cancel / terminal semantics against a scripted memory peer.

No model request, no credential read, no real OpenCode binary required.
"""
from __future__ import annotations

import json
import sys
import time
from types import SimpleNamespace

import pytest

from agent_box.protocols.runtime import content_digest
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_acp import MemoryDuplexTransport
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.observation import ObservationKind
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.opencode.acp import opencode_acp_driver_factory
from agent_box_harnesses.registry import load_builtin_registry
from agent_box_harnesses.session.spi import (
    SessionDriverBindOptions, SessionDriverError,
)
from agent_box_runtime_local.provider import LocalRuntimeHostProvider
from agent_box_terminal_session.direct_stdio import DirectStdioResourceProvider
from agent_box_terminal_session.direct_stdio import DirectStdioSession
from helpers import definition_by_driver, make_fake_executable

from pathlib import Path as _Path
FAKE_AGENT = str(_Path(__file__).resolve().parents[2] / "agent-box-acp" / "tests" / "fixtures" / "fake_acp_agent.py")
PYTHON = sys.executable


def _acp_fake_binary(bin_dir, *, mode: str = "normal") -> str:
    from pathlib import Path

    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / "opencode"
    binary.write_text(
        "#!/bin/sh\nFAKE_ACP_MODE={mode} exec {python} {agent}\n".format(
            mode=mode, python=PYTHON, agent=FAKE_AGENT,
        ),
        encoding="utf-8",
    )
    binary.chmod(0o755)
    return str(binary)


def _full_chain_request(tmp_path, definition, *, prompt: str = "do it", binary_host_path: str | None = None) -> ExecutionStartRequest:
    from agent_box_harnesses.resources.executable import resolve_executable

    affinity = "local:vertical"
    host_provider = LocalRuntimeHostProvider()
    host_ref = host_provider.make_ref()
    affinity = host_ref.metadata["affinity"]
    terminal_ref = DirectStdioSession.make_ref(host_affinity=affinity)
    host_v1 = host_provider.resolve("agent-box.runtime-host@1", host_ref)
    terminal_provider = DirectStdioResourceProvider(transport=host_v1.port.transport)
    terminal_v1 = terminal_provider.resolve("agent-box.terminal-session@1", terminal_ref)
    from agent_box.protocols.runtime import SandboxV1
    from agent_box.protocols.runtime.protocol import IsolatedProcessSpec, SandboxRef
    from helpers import FakeSandboxPort

    sandbox_ref = SandboxRef("fake-sandbox", "s", "digest-s", affinity, network_mode="inherit")
    sandbox_port = FakeSandboxPort(sandbox_ref)
    if binary_host_path:
        # a sandbox would make the guest executable runnable; the synthetic
        # sandbox rewrites argv[0] to the host fake binary instead
        def _wrap(mount_plan, command, *, attempt_key):
            argv = (binary_host_path,) + tuple(command.argv)[1:]
            spec = IsolatedProcessSpec("spawn:fake", attempt_key, "digest:fake",
                                       command.io_mode, local_argv=argv)
            sandbox_port.wrapped.append((mount_plan, command))
            return spec
        sandbox_port.wrap = _wrap
    sandbox_v1 = SandboxV1(sandbox_ref, sandbox_port)
    workspace = tmp_path / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    return ExecutionStartRequest("exec_acp_vertical", "dispatch_acp_vertical", "inputs-digest", (
        ResolvedExecutionInput("agent-box.workspace@1", Ref(RefType.WORKSPACE, "w", "w"),
                               WorkspaceV1(workspace, content_digest(workspace))),
        ResolvedExecutionInput("agent-box.prompt-fragment@1", Ref(RefType.ARTIFACT, "p", "p"),
                               PromptFragmentV1("task", prompt, "sha256:" + "0" * 64)),
        ResolvedExecutionInput(host_v1.contract_id, host_ref, host_v1),
        ResolvedExecutionInput(sandbox_v1.contract_id, sandbox_ref, sandbox_v1),
        ResolvedExecutionInput(terminal_v1.contract_id, terminal_ref, terminal_v1),
    ))


def test_acp_vertical_full_chain_synthetic_agent(tmp_path):
    """Runtime spawns the fake ACP agent; the driver binds, initializes,
    prompts over the protocol, streams updates, and cleans up."""
    from agent_box_harnesses.resources.executable import resolve_executable

    definition = definition_by_driver("opencode")
    binary_path = _acp_fake_binary(tmp_path / "bin", mode="normal")
    executable = resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["opencode"], staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    request = _full_chain_request(tmp_path, definition, binary_host_path=binary_path)
    receipt = provider.start_mode(request, launch_mode="acp")
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "acp"

    driver = provider.attach_session_driver(receipt.dispatch_id)
    binding = driver.bind(handle, options=SessionDriverBindOptions(
        prompt="vertical prompt", session_start_timeout_s=10,
    ))
    assert binding.session_locator == "fake-session-1"
    assert driver.session_locator() == "fake-session-1"
    assert binding.protocol_version == "1"

    again = driver.bind(handle, options=SessionDriverBindOptions(session_start_timeout_s=10))
    assert again is binding  # idempotent binding, no second engine/pump

    seen = []
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        result = driver.poll(timeout=0.5)
        seen.extend(result.observations)
        if driver.terminal_state() is not None:
            break
    kinds = {item.kind for item in seen}
    assert ObservationKind.MESSAGE in kinds
    assert ObservationKind.TOOL_REQUEST in kinds
    assert ObservationKind.TOOL_RESULT in kinds
    assert driver.terminal_state() is not None

    proposal = provider.finish(handle)
    assert proposal.decision_owner == "host"
    assert proposal.harness_type == "opencode"

    driver.cancel()
    driver.close()
    # the fake agent exits cleanly after stdin close
    process = handle.runtime.transport
    process.wait(timeout=5)
    assert process.returncode == 0


def test_acp_permission_timeout_policy_driver_level():
    """Permission timeout -> policy cancel -> canonical diagnostics; no infinite wait."""
    from agent_box_harnesses.opencode.acp import OpenCodeAcpCodec

    transport = MemoryDuplexTransport()
    handle = SimpleNamespace(runtime=SimpleNamespace(transport=transport))
    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))

    # scripted peer: answer initialize + session/new, then post a permission
    import threading

    def peer():
        line = transport.peer_read_line(timeout=5)
        message = json.loads(line)
        if message.get("method") == "initialize":
            transport.feed_line((json.dumps({
                "jsonrpc": "2.0", "id": message["id"], "result": {
                    "protocolVersion": "1", "implementation": {"name": "peer", "version": "1"},
                    "agentCapabilities": {"loadSession": True, "sessionCapabilities": ["new"],
                                          "promptCapabilities": [], "mcpCapabilities": [],
                                          "authMethods": ["noop"]},
                }}, separators=(",", ":")) + "\n").encode())
        line = transport.peer_read_line(timeout=5)
        message = json.loads(line)
        if message.get("method") == "session/new":
            transport.feed_line((json.dumps(
                {"jsonrpc": "2.0", "id": message["id"], "result": {"sessionID": "s-perm"}},
                separators=(",", ":")) + "\n").encode())
        # post the permission request, then answer the incoming responses
        transport.feed_line((json.dumps({
            "jsonrpc": "2.0", "method": "session/request_permission",
            "params": {
                "sessionID": "s-perm", "requestID": "perm-1",
                "toolCall": {"name": "bash"},
                "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"}]}},
            separators=(",", ":")) + "\n").encode())
        for _ in range(30):
            line = transport.peer_read_line(timeout=5)
            if line is None:
                return
            message = json.loads(line)
            if message.get("method") == "session/respond_permission":
                transport.feed_line((json.dumps({
                    "jsonrpc": "2.0", "method": "session/update",
                    "params": {"sessionID": "s-perm", "update": {"kind": "agent_message_chunk",
                                                                 "payload": {"content": "done"}}}},
                    separators=(",", ":")) + "\n").encode())
                return

    threading.Thread(target=peer, daemon=True).start()
    driver.bind(handle, options=SessionDriverBindOptions(
        continuation_locator=None, session_start_timeout_s=5, permission_timeout_s=0.5,
    ))

    # drive until the permission request is presented
    view = None
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and view is None:
        driver.poll(timeout=0.1)
        view = driver.pending_permission()
    assert view is not None
    assert view.request_id == "perm-1"
    assert view.tool_name == "bash"

    # wait past the deadline; the policy must cancel + record + diagnose
    kinds = set()
    end = time.monotonic() + 3
    while time.monotonic() < end and driver.pending_permission() is not None:
        kinds.update(item.kind for item in driver.poll(timeout=0.1).observations)
    kinds.update(item.kind for item in driver.poll(timeout=0.2).observations)
    assert driver.pending_permission() is None
    assert ObservationKind.PERMISSION_RESULT in kinds
    diagnostics = driver.diagnostics()
    assert any("ACP_PERMISSION_TIMEOUT" in str(item) for item in diagnostics["engine_diagnostics"]) or \
        any("ACP_PERMISSION_TIMEOUT" in str(item) for item in diagnostics["driver_diagnostics"])
    driver.close()


def test_acp_permission_fifo_and_duplicate_at_driver_level():
    from agent_box_harnesses.opencode.acp import OpenCodeAcpCodec

    transport = MemoryDuplexTransport()
    handle = SimpleNamespace(runtime=SimpleNamespace(transport=transport))
    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))

    import threading

    def peer():
        for _ in range(30):
            line = transport.peer_read_line(timeout=5)
            if line is None:
                return
            message = json.loads(line)
            if message.get("method") == "initialize":
                transport.feed_line((json.dumps(
                    {"jsonrpc": "2.0", "id": message["id"], "result": {
                        "protocolVersion": "1", "implementation": {"name": "peer", "version": "1"},
                        "agentCapabilities": {"loadSession": True, "sessionCapabilities": ["new"],
                                              "promptCapabilities": [], "mcpCapabilities": [],
                                              "authMethods": ["noop"]}}},
                    separators=(",", ":")) + "\n").encode())
            elif message.get("method") == "session/new":
                transport.feed_line((json.dumps(
                    {"jsonrpc": "2.0", "id": message["id"], "result": {"sessionID": "s-fifo"}},
                    separators=(",", ":")) + "\n").encode())
            elif message.get("method") == "session/respond_permission":
                return

    threading.Thread(target=peer, daemon=True).start()
    driver.bind(handle, options=SessionDriverBindOptions(session_start_timeout_s=5))
    transport.feed_line(_perm_notification("p1"))
    transport.feed_line(_perm_notification("p2"))

    presented = []
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and len(presented) < 2:
        driver.poll(timeout=0.1)
        view = driver.pending_permission()
        if view is not None and view.request_id not in presented:
            presented.append(view.request_id)
            # answer the head so the FIFO advances; out-of-order answers
            # must be refused by the driver
            option = "always" if view.request_id == "p1" else "allow"
            assert driver.respond_permission(option)
    assert presented == ["p1", "p2"]
    # duplicate / late response after completion is refused
    assert not driver.respond_permission("allow")
    driver.close()


def test_acp_session_closed_late_response_is_safe():
    from agent_box_harnesses.session.spi import TRANSPORT_CLOSED

    transport = MemoryDuplexTransport()
    handle = SimpleNamespace(runtime=SimpleNamespace(transport=transport))
    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))
    transport.close()
    with pytest.raises(SessionDriverError) as exc:
        driver.bind(handle, options=SessionDriverBindOptions(session_start_timeout_s=5))
    assert exc.value.code == TRANSPORT_CLOSED
    assert not driver.respond_permission("allow")
    driver.close()


def test_acp_driver_reports_driver_unavailable_without_engine(monkeypatch):
    from agent_box_harnesses.opencode.acp import opencode_acp_driver_factory
    from agent_box_harnesses.session.spi import DRIVER_UNAVAILABLE

    transport = MemoryDuplexTransport()
    handle = SimpleNamespace(runtime=SimpleNamespace(transport=transport))
    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))
    monkeypatch.setattr(driver, "_engine_available", lambda: False)
    with pytest.raises(SessionDriverError) as exc:
        driver.bind(handle, options=SessionDriverBindOptions(session_start_timeout_s=2))
    assert exc.value.code == DRIVER_UNAVAILABLE


def test_acp_driver_initialize_failure_maps_to_driver_taxonomy():
    from agent_box_harnesses.opencode.acp import opencode_acp_driver_factory
    from agent_box_harnesses.session.spi import PROTOCOL_INITIALIZE_FAILED

    transport = MemoryDuplexTransport()
    handle = SimpleNamespace(runtime=SimpleNamespace(transport=transport))
    driver = opencode_acp_driver_factory(ADAPTERS["opencode"], load_builtin_registry().get("opencode"))
    with pytest.raises(SessionDriverError) as exc:
        driver.bind(handle, options=SessionDriverBindOptions(session_start_timeout_s=0.5))
    assert exc.value.code == PROTOCOL_INITIALIZE_FAILED
    driver.close()


def _perm_notification(request_id: str) -> bytes:
    return (json.dumps({
        "jsonrpc": "2.0", "method": "session/request_permission",
        "params": {
            "sessionID": "s-fifo", "requestID": request_id,
            "toolCall": {"name": "bash"},
            "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"},
                        {"optionId": "always", "name": "Always", "kind": "allow_always"}],
        }}, separators=(",", ":")) + "\n").encode()