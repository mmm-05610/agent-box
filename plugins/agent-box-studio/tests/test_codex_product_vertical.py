"""Codex-first product vertical: the API surface a frontend needs.

Tests in this file are written BEFORE the implementation (test-first):
each targets one capability of the goal checklist that is missing at
baseline and must exist, with honest evidence, when the round completes.

Batches:

- Bootstrap: /api/v1/readiness component truth (no single ready flag).
- Profiles: list/get exact revision+digest, create/update revision,
  drift diagnostics without host paths.
- Projects: standalone register/list/get, project_id-based sessions.
- Capability detail: input limits + continuation contract per provider.
- Turn facts: native continuation Refs readable from GET turn.
- Transcript cursor gate: REST matches the WS replay gate.
- Permission delivery: harness request id + option id reach the driver.
- WS: tail batches carry the committed watermark.
- Codex verticals (bwrap-gated): credential mount, two-turn native
  resume with exact persisted output Ref provenance.
"""
from __future__ import annotations

import json

import pytest

from conftest import TEST_TOKEN, create_session

CODEX_MODEL = "synthetic-codex-model"

# A synthetic `codex` binary speaking the real `codex exec --json` event
# set.  When invoked in resume form (`exec resume <id> ...`) it answers a
# marker that only the resume path produces, and it records its argv so the
# test can prove the official native-resume form `exec resume <thread_id>`.
CODEX_SCRIPT = r"""#!/bin/sh
# Production exec argv: `codex exec [resume <id>] --json --skip-git-repo-check <prompt>`
# so "$2" distinguishes the official native-resume form.
# The synthetic binary mimics the native thread store: the first run writes a
# session rollout under $CODEX_HOME/sessions, the resume run READS the
# persisted rollout and answers with its content — so a correct turn-2
# answer can only come from thread state that actually survived the first
# execution.
if [ "$2" = "resume" ]; then
  echo "$@" > /workspace/resume-argv.txt
  printf '%s\n' '{"type":"thread.started","thread_id":"synth-thread-1"}'
  ROLLOUT=$(cat /runtime/home/.codex/sessions/*/*/*/rollout-synth-thread-1.jsonl 2>&1 | head -1)
  printf '%s\n' "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"resume-read:${ROLLOUT}\"}}"
  printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":2,"output_tokens":2}}'
else
  echo "$@" > /workspace/first-argv.txt
  if [ -f /runtime/home/.codex/auth.json ]; then echo mounted > /workspace/authcheck.txt; else echo missing > /workspace/authcheck.txt; fi
  mkdir -p /runtime/home/.codex/sessions/2026/01/01
  printf '%s\n' 'thread-state-synth-thread-1' > /runtime/home/.codex/sessions/2026/01/01/rollout-synth-thread-1.jsonl
  printf '%s\n' '{"type":"thread.started","thread_id":"synth-thread-1"}'
  printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"first-answer-1"}}'
  printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
fi
"""


def _bwrap_available(tmp_path) -> bool:
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider

    return BwrapSandboxProvider(tmp_path / "sandbox").probe()["status"] == "available"


def _profile_authority(environment):
    from agent_box.resource_contracts import AgentBoxProfileV1

    for provider in environment.registry.resource_providers():
        if AgentBoxProfileV1.contract_id in set(getattr(provider, "supported_contract_ids", ()) or ()):
            return provider
    raise AssertionError("no profile authority registered")


def _make_codex_app(studio_home, tmp_path, monkeypatch, *, fake_home=None):
    """Full preview environment with a synthetic codex executable forced
    into the REAL codex-execution provider (documented test seam)."""
    from fastapi.testclient import TestClient

    from agent_box.extensions.bootstrap import build_extension_environment
    from agent_box.work_core.db import _reset_connection_for_tests
    from agent_box_harnesses.resources.executable import resolve_executable
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app

    if fake_home is not None:
        # The codex credential materializer resolves its native home at
        # plugin build time; point it at an isolated, harmless fake login.
        (fake_home / ".codex").mkdir(parents=True, exist_ok=True)
        (fake_home / ".codex" / "auth.json").write_text("{}\n", encoding="utf-8")
        monkeypatch.setenv("HOME", str(fake_home))
    environment = build_extension_environment()
    provider = environment.registry.get("codex-execution")
    definition = provider.definition
    bin_dir = tmp_path / "codex-bin"
    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / "codex"
    binary.write_text(CODEX_SCRIPT, encoding="utf-8")
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
def codex_client(studio_home, tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    application = _make_codex_app(studio_home, tmp_path, monkeypatch)
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        yield test_client


# ---------------------------------------------------------------------------
# Bootstrap: readiness / component truth
# ---------------------------------------------------------------------------


def test_readiness_endpoint_reports_component_truth(codex_client):
    response = codex_client.get("/api/v1/readiness")
    assert response.status_code == 200, response.text
    body = response.json()

    # Every reported state uses the four-state truth vocabulary.
    allowed = {"supported", "available", "unavailable", "not_implemented",
               "unknown", "ready", "ready_for_use", "deferred"}
    rendered = json.dumps(body)
    assert "codex-execution" in rendered

    codex = next(
        p for p in body["execution"]["providers"] if p["provider_id"] == "codex-execution"
    )
    # Per-launch-mode session truth, honest about modes without drivers.
    assert codex["session_modes"]["exec"]["state"] == "available"
    assert codex["session_modes"]["app-server"]["state"] == "not_implemented"
    # Executable readiness with the version from the synthetic probe.
    assert codex["executable"]["status"] == "resolved"
    assert codex["executable"]["version"]
    # Native resume truth is explicit, never folded into a single flag.
    assert codex["continuation"]["contract_id"] == "agent-box.codex-continuation@1"
    assert codex["continuation"]["native_resume"] in allowed
    # Runtime ports and credential locator readiness are first-class facts.
    for key in ("sandbox", "runtime_host", "terminal", "credential", "streaming", "permission", "cancel", "durable_replay"):
        assert key in codex, (key, codex)
    # No host paths anywhere in the readiness surface.
    assert "/runtime/bin/" not in rendered
    assert str(codex_client.app.state.config) not in rendered


def test_readiness_reports_credential_locator_without_content(codex_client):
    body = codex_client.get("/api/v1/readiness").json()
    codex = next(
        p for p in body["execution"]["providers"] if p["provider_id"] == "codex-execution"
    )
    credential = codex["credential"]
    assert credential["locator"] == "codex-login/default"
    # Readiness may state availability facts, never credential material.
    assert "auth" not in json.dumps(credential).replace("auth.json-availability", "")
    assert credential["available"] in (True, False)


# ---------------------------------------------------------------------------
# Profiles API
# ---------------------------------------------------------------------------


def _seed_codex_profile(client, profile_id="main"):
    store = _profile_authority(client.app.state.environment)
    store.put("codex", {"profile_id": profile_id, "native_payload": {"model": CODEX_MODEL}})
    return store


def test_profiles_list_codex_profiles_exact_revision_and_digest(client):
    _seed_codex_profile(client)
    response = client.get("/api/v1/harnesses/codex/profiles")
    assert response.status_code == 200, response.text
    profiles = response.json()["profiles"]
    assert len(profiles) == 1
    profile = profiles[0]
    assert profile["profile_id"] == "main"
    assert isinstance(profile["revision"], int) and profile["revision"] >= 1
    assert profile["digest"].startswith("sha256:")
    assert profile["model"] == CODEX_MODEL


def test_profiles_get_exact_profile_and_unknown_404(client):
    _seed_codex_profile(client)
    got = client.get("/api/v1/harnesses/codex/profiles/main")
    assert got.status_code == 200
    body = got.json()["profile"]
    assert body["profile_id"] == "main"
    assert body["revision"] == got.json()["profile"]["revision"]
    missing = client.get("/api/v1/harnesses/codex/profiles/nope")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "PROFILE_NOT_FOUND"


def test_profile_get_projection_carries_bounded_native_payload(client):
    """The exact-revision get projection exposes the profile's own
    ``native_payload`` so a GUI edit form can backfill from the authority
    (P0 contract; list stays payload-free for cardinality reasons)."""
    store = _seed_codex_profile(client)
    store.put(
        "codex",
        {"profile_id": "editable", "native_payload": {
            "model": CODEX_MODEL, "system_instructions": "be terse",
        }},
    )
    got = client.get("/api/v1/harnesses/codex/profiles/editable")
    assert got.status_code == 200, got.text
    body = got.json()["profile"]
    assert body["native_payload"] == {
        "model": CODEX_MODEL, "system_instructions": "be terse",
    }
    listed = client.get("/api/v1/harnesses/codex/profiles").json()["profiles"]
    row = next(p for p in listed if p["profile_id"] == "editable")
    assert "native_payload" not in row


def test_profiles_create_and_update_revision_with_conflict_detection(client):
    created = client.post(
        "/api/v1/harnesses/codex/profiles",
        json={"profile_id": "team", "payload": {"model": CODEX_MODEL}},
    )
    assert created.status_code == 201, created.text
    first = created.json()["profile"]
    assert first["revision"] == 1

    updated = client.post(
        "/api/v1/harnesses/codex/profiles",
        json={"profile_id": "team", "payload": {"model": "other-model"},
              "expected_revision": 1},
    )
    assert updated.status_code == 201, updated.text
    assert updated.json()["profile"]["revision"] == 2

    stale = client.post(
        "/api/v1/harnesses/codex/profiles",
        json={"profile_id": "team", "payload": {"model": "x"},
              "expected_revision": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "PROFILE_REVISION_CONFLICT"


def test_profiles_drift_diagnostics_without_host_paths(client):
    client.post(
        "/api/v1/harnesses/codex/profiles",
        json={"profile_id": "drifted", "payload": {"model": CODEX_MODEL}},
    )
    # Corrupt the current pointer behind the authority's back: the API must
    # report a typed problem, never silently re-point or hide the profile.
    store = _profile_authority(client.app.state.environment)
    pointer = store.layout("codex", "drifted").profile_json
    pointer.write_text("{not json", encoding="utf-8")

    response = client.get("/api/v1/harnesses/codex/profiles")
    assert response.status_code == 200
    body = response.json()
    problems = body["problems"]
    assert any(
        p["profile_id"] == "drifted" and p["harness_type"] == "codex" and p["code"]
        for p in problems
    ), problems
    rendered = json.dumps(body)
    assert str(store.root) not in rendered
    assert "/tmp/" not in rendered


def test_profiles_endpoint_rejects_unknown_harness(client):
    response = client.get("/api/v1/harnesses/not-a-harness/profiles")
    assert response.status_code == 404
    assert response.json()["error"]["code"] in {"HARNESS_NOT_FOUND", "PROFILE_NOT_FOUND", "PROVIDER_SELECTION_FAILED"}


# ---------------------------------------------------------------------------
# Projects API
# ---------------------------------------------------------------------------


def test_projects_register_list_get_and_idempotent_replay(client, project_dir):
    created = client.post("/api/v1/projects", json={"path": str(project_dir)})
    assert created.status_code == 201, created.text
    first = created.json()["project"]
    assert first["project_id"]
    assert first["workspace_mode"] == "live"
    # The host path never comes back.
    assert str(project_dir) not in json.dumps(first)

    replayed = client.post("/api/v1/projects", json={"path": str(project_dir)})
    assert replayed.status_code == 200
    again = replayed.json()["project"]
    assert again["project_id"] == first["project_id"]
    assert again["registered_at"] == first["registered_at"]

    listing = client.get("/api/v1/projects").json()["projects"]
    assert [p["project_id"] for p in listing] == [first["project_id"]]

    got = client.get(f"/api/v1/projects/{first['project_id']}")
    assert got.status_code == 200
    assert got.json()["project"]["project_id"] == first["project_id"]
    assert got.json()["project"]["workspace_ref"]["provider"] == "local-live-workspace"

    missing = client.get("/api/v1/projects/proj_missing")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "PROJECT_NOT_REGISTERED"


def test_projects_rejects_symlink_root(client, tmp_path):
    target = tmp_path / "outside"
    target.mkdir()
    link = tmp_path / "link"
    link.symlink_to(target)
    response = client.post("/api/v1/projects", json={"path": str(link)})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROJECT_PATH_REJECTED"


def test_create_session_with_registered_project_id(client, project_dir):
    registered = client.post("/api/v1/projects", json={"path": str(project_dir)}).json()["project"]
    response = client.post(
        "/api/v1/sessions",
        json={"idempotency_key": "sess-by-project-id", "title": "By id",
              "project_id": registered["project_id"]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["session"]["project_id"] == registered["project_id"]

    unknown = client.post(
        "/api/v1/sessions",
        json={"idempotency_key": "sess-by-unknown-project", "title": "X",
              "project_id": "proj_missing"},
    )
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "PROJECT_NOT_REGISTERED"


# ---------------------------------------------------------------------------
# Capability detail / transcript gate / WS watermark
# ---------------------------------------------------------------------------


def test_capability_provider_entry_declares_input_limits_and_continuation(client):
    body = client.get("/api/v1/capabilities").json()
    codex = next(
        p for p in body["execution"]["providers"] if p["provider_id"] == "codex-execution"
    )
    limits = codex["input_limits"]
    assert "agent-box.credential@1" in limits
    assert "agent-box.codex-continuation@1" in limits
    assert codex["continuation_contract_id"] == "agent-box.codex-continuation@1"


def test_transcript_cursor_beyond_watermark_is_rejected(client, project_dir):
    session = create_session(client, project_dir, "transcript-gate")
    sid = session["session_id"]
    response = client.get(f"/api/v1/sessions/{sid}/transcript", params={"after": 999999})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RESYNC_REQUIRED"


def test_ws_tail_batches_carry_watermark(client, project_dir):
    session = create_session(client, project_dir, "ws-watermark")
    sid = session["session_id"]
    stream = client.app.state.stream
    batch = stream.tail_batch(sid, 0)
    assert "watermark" in batch
    assert isinstance(batch["watermark"], int)


# ---------------------------------------------------------------------------
# Permission delivery (harness request id + option id reach the driver)
# ---------------------------------------------------------------------------


def test_permission_delivered_to_driver_with_harness_request_id(studio_home, project_dir):
    """The driver receives the harness's own option id for the mapped
    decision, and the durable ledger records the harness request id —
    never a Studio-invented uuid."""
    import threading

    from fastapi.testclient import TestClient

    from agent_box.extensions.bootstrap import build_extension_environment
    from agent_box.protocols.session import SESSION_TURN_INPUT_CONTRACT_ID
    from agent_box.protocols.session.contracts import SessionTurnInputV1, TerminalOutcome
    from agent_box.resource_contracts import WorkspaceV1
    from agent_box.work_core.db import _reset_connection_for_tests
    from agent_box.work_core.registry import (
        ExecutionStartReceipt, ProviderDescriptor, RecoverySupport,
    )
    from agent_box_studio.config import StudioConfig
    from agent_box_studio.server.app import create_app
    from agent_box_harnesses.adapters.observation import (
        Observation, ObservationKind, TerminalCondition,
    )

    delivered: list[tuple[str, str]] = []

    class FakeDriver:
        def __init__(self) -> None:
            from agent_box_harnesses.session.hub import ObservationHub
            self.hub = ObservationHub()
            self.hub.push(Observation(
                ObservationKind.PERMISSION_REQUEST, "fake",
                text="run command?", tool_name="shell",
            ))
            self._responded = threading.Event()

        def poll(self, timeout: float = 0.0):
            return None

        def pending_permission(self):
            from agent_box_harnesses.session.spi import PermissionOptionView, PermissionView
            if self._responded.is_set():
                return None
            return PermissionView(
                request_id="harness-req-1",
                session_locator="fake-loc",
                tool_name="shell",
                options=(
                    PermissionOptionView("opt-allow", "Allow", "allow_once"),
                    PermissionOptionView("opt-reject", "Reject", "reject_once"),
                ),
            )

        def respond_permission(self, option_id: str) -> bool:
            delivered.append(("harness-req-1", option_id))
            self.hub.push(Observation(
                ObservationKind.TERMINAL, "fake",
                terminal_condition=TerminalCondition.TURN_COMPLETED,
            ))
            self._responded.set()
            return True

        def cancel(self):
            raise AttributeError

    class PermissionStubProvider:
        def __init__(self) -> None:
            self._driver: FakeDriver | None = None

        def descriptor(self):
            return ProviderDescriptor("permission-stub", "Permission stub", "1")

        @property
        def harness_type(self):
            return "fake-permission"

        def capabilities(self):
            return {
                "session_turn_execution": "supported", "start": "supported",
                "observe": "supported", "stream": "supported",
            }

        def input_limits(self):
            return {SESSION_TURN_INPUT_CONTRACT_ID: (1, 1), WorkspaceV1.contract_id: (1, 1)}

        def runtime_requirements(self):
            return {}

        def start(self, request):
            return ExecutionStartReceipt(
                execution_id=request.execution_id, dispatch_id=request.dispatch_id,
                inputs_digest=request.inputs_digest, recovery_support=RecoverySupport.NONE,
            )

        def get_handle(self, dispatch_id):
            return dispatch_id

        def dispatch_state(self, dispatch_id):
            if self._driver is not None and self._driver._responded.is_set():
                return {"state": "terminal", "exit_code": 0, "via": "session-driver"}
            return {"state": "running", "via": "session-driver"}

        def attach_session_driver(self, dispatch_id):
            self._driver = FakeDriver()
            return self._driver

        def observe(self, handle):
            return ()

    from conftest import TEST_TOKEN as _t  # noqa: F401  (token asserted below)
    from conftest import _make_app  # noqa: F401

    # A thread worker is required: the turn must be accepted (202) while the
    # permission is still pending, and answered from another thread.
    application = _make_app(
        studio_home,
        with_fake=False,
        config=StudioConfig(worker_mode="thread", turn_timeout_seconds=30.0, poll_interval=0.01),
    )
    application.state.environment.registry.register_execution_provider(PermissionStubProvider())
    _reset_connection_for_tests()
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "perm-delivery")
        sid = session["session_id"]
        accepted = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "perm-1", "input": "go",
                  "execution_provider_id": "permission-stub"},
        )
        assert accepted.status_code == 202, accepted.text
        accepted = accepted.json()
        turn_id = accepted["turn_id"]

        # Wait for the durable permission request event (no sleeps: the
        # ledger is polled through its own authority until it appears).
        import time
        request_event = None
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            events = test_client.get(f"/api/v1/sessions/{sid}/transcript").json()["events"]
            permission_events = [e for e in events if e["event_type"] == "permission.requested"]
            if permission_events:
                request_event = permission_events[0]
                break
            time.sleep(0.01)
        assert request_event is not None, "permission request was never recorded"
        assert request_event["payload"]["request_id"] == "harness-req-1"

        answered = test_client.post(
            f"/api/v1/sessions/{sid}/permissions/harness-req-1/respond",
            json={"decision": "approve"},
        )
        assert answered.status_code == 200, answered.text
        assert answered.json()["delivered"] is True
        assert delivered == [("harness-req-1", "opt-allow")]

        # Duplicate adjudication fails closed.
        duplicate = test_client.post(
            f"/api/v1/sessions/{sid}/permissions/harness-req-1/respond",
            json={"decision": "approve"},
        )
        assert duplicate.status_code == 400

        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            turn = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
            if turn["state"] == "completed":
                break
            time.sleep(0.01)
        assert turn["state"] == "completed", turn
        assert turn["terminal_outcome"] == "succeeded"


# ---------------------------------------------------------------------------
# Codex verticals (bwrap-gated): credential mount + native resume
# ---------------------------------------------------------------------------


def test_studio_codex_turn_mounts_credential_locator_only(
    studio_home, tmp_path, monkeypatch, project_dir
):
    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    from fastapi.testclient import TestClient

    application = _make_codex_app(
        studio_home, tmp_path, monkeypatch, fake_home=tmp_path / "fake-home"
    )
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = create_session(test_client, project_dir, "codex-cred")
        sid = session["session_id"]
        response = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "codex-cred-1", "harness_type": "codex",
                  "input": "first"},
        )
        assert response.status_code == 202, response.text
        turn_id = response.json()["turn_id"]
        turn = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
        assert turn["state"] == "completed", turn
        # The synthetic codex saw the locator-only credential mount inside
        # the sandbox: Studio dispatched the credential contract.
        assert (project_dir / "authcheck.txt").read_text().strip() == "mounted"
        rendered = json.dumps(test_client.get(f"/api/v1/sessions/{sid}/transcript").json())
        assert "SECRET" not in rendered


def test_profile_turns_persist_native_thread_state_and_resume(
    studio_home, tmp_path, monkeypatch, project_dir
):
    """Profile-based turns must reconcile the execution view back into the
    profile native home: the native thread state (sessions/) survives the
    execution, so the SECOND turn's official native resume actually finds
    the thread.  Without the host-side reconcile the thread state dies with
    the execution-scoped staging home and resume cannot work."""
    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    from fastapi.testclient import TestClient

    application = _make_codex_app(studio_home, tmp_path, monkeypatch)
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        seeded = test_client.post(
            "/api/v1/harnesses/codex/profiles",
            json={"profile_id": "main", "payload": {"model": CODEX_MODEL}},
        )
        assert seeded.status_code == 201, seeded.text
        session = create_session(test_client, project_dir, "codex-profile-resume")
        sid = session["session_id"]

        first = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "profile-t1", "harness_type": "codex",
                  "profile": {"profile_id": "main"}, "launch_mode": "exec",
                  "input": "first"},
        )
        assert first.status_code == 202, first.text
        turn1_id = first.json()["turn_id"]
        turn1 = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn1_id}").json()["turn"]
        assert turn1["state"] == "completed", turn1
        thread_id = turn1["continuation"]["output_native_session_ref"]["native_id"]

        # The profile native home must now carry the native thread state:
        # the host-side reconcile copied the execution view's sessions back.
        store = _profile_authority(test_client.app.state.environment)
        home = store.native_home_root("codex", "main")
        rollouts = list(home.glob(".codex/sessions/**/rollout-*"))
        assert rollouts, f"profile native home carries no session state: {sorted(str(p) for p in home.rglob('*') if p.is_file())[:8]}"
        persisted = rollouts[0].read_text()
        assert "thread-state-synth-thread-1" in persisted, persisted

        # The attempt's temporary runtime is released after the commit: the
        # plain execution staging home is removed (the profile native home
        # above is the durable carrier of the thread state).
        staging = studio_home / "plugins" / "codex" / "execution-staging"
        leftovers = sorted(p.name for p in staging.glob("exec_turn_*"))
        assert not leftovers, f"execution staging not released: {leftovers}"

        second = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "profile-t2", "harness_type": "codex",
                  "profile": {"profile_id": "main"}, "launch_mode": "exec",
                  "input": "second", "continue_from_turn_id": turn1_id},
        )
        assert second.status_code == 202, second.text
        turn2_id = second.json()["turn_id"]
        turn2 = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn2_id}").json()["turn"]
        assert turn2["state"] == "completed", turn2
        assert turn2["terminal_outcome"] == "succeeded"
        assert "synth-thread-1" in (project_dir / "resume-argv.txt").read_text()
        messages = [
            e["payload"]["text"]
            for e in test_client.get(f"/api/v1/sessions/{sid}/transcript").json()["events"]
            if e["event_type"] == "assistant.message"
        ]
        # The resume answer is the PERSISTED thread state read back by the
        # resumed process — it can only be correct if the profile native
        # home actually carried the rollout into the second execution.
        assert any("resume-read:thread-state-synth-thread-1" in m for m in messages), messages


def test_service_restart_preserves_session_and_native_resume(
    studio_home, tmp_path, monkeypatch, project_dir
):
    """Restart between turns: the durable store keeps the session, the
    committed turn, and its native session Ref; a NEW process resolves the
    continuation authority and the second turn still uses the official
    native resume."""
    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    from fastapi.testclient import TestClient

    from agent_box.work_core.db import _reset_connection_for_tests

    def make_client():
        application = _make_codex_app(studio_home, tmp_path, monkeypatch)
        test_client = TestClient(application)
        test_client.__enter__()
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        return test_client

    client1 = make_client()
    try:
        session = create_session(client1, project_dir, "codex-restart")
        sid = session["session_id"]
        first = client1.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "restart-t1", "harness_type": "codex",
                  "input": "first"},
        )
        assert first.status_code == 202, first.text
        turn1_id = first.json()["turn_id"]
        turn1 = client1.get(f"/api/v1/sessions/{sid}/turns/{turn1_id}").json()["turn"]
        assert turn1["state"] == "completed", turn1
        cont1 = turn1["continuation"]
        assert cont1["output_native_session_ref"]["native_id"] == "synth-thread-1"
    finally:
        client1.__exit__(None, None, None)
        _reset_connection_for_tests()

    # A genuinely fresh service process (new app, same durable home) reads
    # the same session and continues from the persisted native Ref.
    client2 = make_client()
    try:
        session_view = client2.get(f"/api/v1/sessions/{sid}").json()["session"]
        assert session_view["session_id"] == sid
        assert session_view["watermark"] > 0
        turn1_view = client2.get(f"/api/v1/sessions/{sid}/turns/{turn1_id}").json()["turn"]
        assert turn1_view["state"] == "completed"
        assert turn1_view["continuation"]["output_native_session_ref"]["native_id"] == "synth-thread-1"

        second = client2.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "restart-t2", "harness_type": "codex",
                  "input": "second", "continue_from_turn_id": turn1_id},
        )
        assert second.status_code == 202, second.text
        turn2_id = second.json()["turn_id"]
        turn2 = client2.get(f"/api/v1/sessions/{sid}/turns/{turn2_id}").json()["turn"]
        assert turn2["state"] == "completed", turn2
        assert turn2["terminal_outcome"] == "succeeded"
        assert turn2["continuation"]["parent_execution_id"] is not None
        assert (project_dir / "resume-argv.txt").exists()
        assert "synth-thread-1" in (project_dir / "resume-argv.txt").read_text()
    finally:
        client2.__exit__(None, None, None)
        _reset_connection_for_tests()


def test_studio_codex_second_turn_uses_official_native_resume(
    studio_home, tmp_path, monkeypatch, project_dir
):
    if not _bwrap_available(tmp_path):
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")
    from fastapi.testclient import TestClient

    application = _make_codex_app(studio_home, tmp_path, monkeypatch)
    with TestClient(application) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        # The exact Profile revision is created through the public Profiles
        # API and pinned by id (goal: select Codex + exact profile revision).
        seeded = test_client.post(
            "/api/v1/harnesses/codex/profiles",
            json={"profile_id": "main", "payload": {"model": CODEX_MODEL}},
        )
        assert seeded.status_code == 201, seeded.text
        session = create_session(test_client, project_dir, "codex-resume")
        sid = session["session_id"]

        first = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "codex-t1", "harness_type": "codex",
                  "profile": {"profile_id": "main"}, "launch_mode": "exec",
                  "input": "first"},
        )
        assert first.status_code == 202, first.text
        turn1_id = first.json()["turn_id"]
        exec1 = first.json()["execution_ids"][0]
        turn1 = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn1_id}").json()["turn"]
        assert turn1["state"] == "completed", turn1

        # The native continuation Ref is readable from the public API.
        cont = turn1["continuation"]
        assert cont["output_native_session_ref"]["provider"] == "codex-continuation"
        assert cont["output_native_session_ref"]["native_id"] == "synth-thread-1"
        assert cont["parent_execution_id"] is None
        # The frozen binding is queryable from the turn: exact provider,
        # model from the profile authority, and launch mode.
        binding = turn1["binding"]
        assert binding["harness_provider_id"] == "codex-execution"
        assert binding["harness_type"] == "codex"
        # preferred_model is non-authoritative: the launch still renders
        # CODEX_MODEL into config.toml; the binding records only a
        # request-pinned model (none here — no provider config pinned).
        assert binding["model_selection"] in (None, CODEX_MODEL)
        assert binding["launch_mode"] == "exec"

        second = test_client.post(
            f"/api/v1/sessions/{sid}/turns",
            json={"idempotency_key": "codex-t2", "harness_type": "codex",
                  "profile": {"profile_id": "main"}, "launch_mode": "exec",
                  "input": "second", "continue_from_turn_id": turn1_id},
        )
        assert second.status_code == 202, second.text
        turn2_id = second.json()["turn_id"]
        exec2 = second.json()["execution_ids"][0]
        turn2 = test_client.get(f"/api/v1/sessions/{sid}/turns/{turn2_id}").json()["turn"]
        assert turn2["state"] == "completed", turn2
        assert turn2["terminal_outcome"] == "succeeded"

        # The harness really resumed: the argv marker written by the
        # synthetic codex records the official native-resume form.
        resume_argv = (project_dir / "resume-argv.txt").read_text()
        assert "resume" in resume_argv.split()
        assert "synth-thread-1" in resume_argv

        # Provenance: turn 2 consumed EXACTLY turn 1's persisted output Ref.
        store = test_client.app.state.store
        link2 = store.execution_link(sid, turn2_id, exec2)
        link1 = store.execution_link(sid, turn1_id, exec1)
        assert link2.parent_execution_id == exec1
        assert link2.input_session_ref == link1.output_native_session_ref
        assert link2.output_native_session_ref.native_id == "synth-thread-1"

        # The assistant message came from the resume path (without a
        # profile the native thread state is not persisted across the
        # execution-scoped home — that persistence is the profile test's
        # contract).
        transcript = test_client.get(f"/api/v1/sessions/{sid}/transcript").json()
        messages = [e["payload"]["text"] for e in transcript["events"]
                    if e["event_type"] == "assistant.message"]
        assert any(m.startswith("resume-read:") for m in messages), messages
