"""Studio-level synthetic vertical: one real harness through the FULL
production chain — StudioService → exact provider selection → frozen
binding → Work Core dispatch (freeze/resolve/start) → real runtime
composition (staging → lowering → assembler → coordinator → bwrap →
direct-stdio spawn) → observation decode → durable session events →
finalization → commit.

The pi harness is driven through a synthetic executable (the real `pi`
binary is not present on test machines), never a testing fake provider.
"""
from __future__ import annotations

import json
import time

import pytest

from conftest import TEST_TOKEN, create_session

PI_SCRIPT = """#!/bin/sh
printf '{"type":"session","version":3,"id":"studio-vertical-session"}\\n'
printf '{"type":"message_end","message":{"role":"assistant","text":"studio-vertical-done"}}\\n'
printf '{"type":"message_end","message":{"role":"assistant","usage":{"input_tokens":3,"output_tokens":5}}}\\n'
echo mutated-by-studio-vertical > /workspace/mutation.txt
"""


def _bwrap_available(tmp_path) -> bool:
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider

    return BwrapSandboxProvider(tmp_path / "sandbox").probe()["status"] == "available"


def _make_harness_app(studio_home, tmp_path):
    """Full preview environment; the synthetic executable is forced into the
    REAL pi execution provider via the documented test seam."""
    from fastapi.testclient import TestClient

    from agent_box.extensions.bootstrap import build_extension_environment
    from agent_box.work_core.db import _reset_connection_for_tests
    from agent_box_harnesses.resources.executable import resolve_executable
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    environment = build_extension_environment()
    provider = environment.registry.get("pi-execution")
    definition = provider.definition
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / "pi"
    binary.write_text(PI_SCRIPT, encoding="utf-8")
    binary.chmod(0o755)
    provider.install_executable_for_tests(
        resolve_executable(definition.executable, search_path=str(bin_dir), probe=False)
    )
    application = create_app(
        StudioConfig(worker_mode="inline", turn_timeout_seconds=60.0),
        environment=environment,
        token=TEST_TOKEN,
    )
    _reset_connection_for_tests()
    return application


@pytest.fixture
def harness_client(studio_home, tmp_path):
    from fastapi.testclient import TestClient

    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    application = _make_harness_app(studio_home, tmp_path)
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        yield test_client


def test_studio_turn_runs_real_pi_chain_and_mutates_live_workspace(
    harness_client, project_dir
):
    session = create_session(harness_client, project_dir, "studio-pi-vertical")
    sid = session["session_id"]
    response = harness_client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "pi-vertical-1", "harness_type": "pi", "input": "mutate the workspace"},
    )
    assert response.status_code == 202, response.text
    accepted = response.json()
    assert accepted["binding"]["harness_type"] == "pi"
    assert accepted["binding"]["harness_provider_id"] == "pi-execution"
    turn_id = accepted["turn_id"]

    turn = harness_client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
    assert turn["state"] == "completed", turn
    assert turn["terminal_outcome"] == "succeeded"
    assert turn["run_phase"] == "session_committed"

    # The harness really ran inside the sandbox against the LIVE workspace:
    # the mutation landed in the user's project directory.
    assert (project_dir / "mutation.txt").read_text().strip() == "mutated-by-studio-vertical"

    transcript = harness_client.get(f"/api/v1/sessions/{sid}/transcript").json()
    types = [e["event_type"] for e in transcript["events"]]
    for expected in (
        "execution.session",
        "assistant.message",
        "usage.updated",
        "execution.completed",
        "TURN_TERMINAL",
        "TURN_COMMITTED",
        "WORKSPACE_AFTER",
    ):
        assert expected in types, types
    session_event = next(
        e for e in transcript["events"] if e["event_type"] == "execution.session"
    )
    assert session_event["payload"]["session_locator"] == "studio-vertical-session"
    messages = [
        e["payload"]["text"]
        for e in transcript["events"]
        if e["event_type"] == "assistant.message"
    ]
    assert "studio-vertical-done" in messages
    usage = next(
        e for e in transcript["events"] if e["event_type"] == "usage.updated"
    )
    assert "output_tokens" in usage["payload"]["usage_json"]
    # The public event stream never exposes host paths or the executable
    # location.
    rendered = json.dumps(transcript)
    assert str(project_dir) not in rendered
    assert "/runtime/bin/pi" not in rendered
    # The workspace change is honestly attributed to the shared live root.
    after = next(
        e for e in transcript["events"] if e["event_type"] == "WORKSPACE_AFTER"
    )
    assert after["payload"]["changed"] == "True"
    assert after["payload"]["source"] == "shared_live_workspace"

    # Reserved per-Execution provenance (set-once, immutable): the harness
    # provider's own native session output Ref plus the workspace input /
    # output facts are recorded on the Turn↔Execution link.
    store = harness_client.app.state.store
    execution_id = accepted["execution_ids"][0]
    link = store.execution_link(sid, turn_id, execution_id)
    assert link.output_native_session_ref is not None
    assert link.output_native_session_ref.native_id == "studio-vertical-session"
    assert link.output_native_session_ref.provider == "pi-session"
    assert link.workspace_input_ref == link.workspace_output_ref
    assert link.parent_execution_id is None  # first attempt of the DAG


def test_studio_turn_with_unknown_harness_fails_closed(harness_client, project_dir):
    session = create_session(harness_client, project_dir, "studio-pi-unknown")
    response = harness_client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={
            "idempotency_key": "pi-unknown-1",
            "harness_type": "does-not-exist",
            "input": "x",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROVIDER_SELECTION_FAILED"
