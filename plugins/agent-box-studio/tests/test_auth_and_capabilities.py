"""Health, capabilities, auth boundary, and ticket tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from conftest import TEST_TOKEN, _make_app

from agent_box_studio.auth import TicketIssuer, TokenGuard, generate_token


# -- health / capabilities ---------------------------------------------------


def test_health_is_anonymous_liveness_only(client):
    client.headers.pop("Authorization")
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # Liveness only: no config, paths, token or version facts.
    assert set(body.keys()) <= {"status", "service"}


def test_capabilities_require_token(client):
    client.headers.pop("Authorization")
    assert client.get("/api/v1/capabilities").status_code == 401


def test_capabilities_report_honest_truth(client):
    body = client.get("/api/v1/capabilities").json()
    assert body["session_store"]["state"] == "READY"
    assert body["workspace"]["state"] == "READY"
    assert body["workspace"]["mode"] == "live"
    assert body["workspace"]["mutability"] == "externally_mutable"
    assert body["execution"]["state"] == "READY"
    # Honest capability vocabulary: permissions are a durable ledger with
    # limited delivery, cancel is proven-termination only, and compact is
    # deferred to the cross-harness codec phase.
    assert body["permissions"]["state"] == "PARTIAL"
    assert body["cancel"]["state"] == "READY"
    assert body["compact"]["state"] == "NOT_IMPLEMENTED"


def test_capabilities_without_fake_provider_report_unavailable(client_without_fake):
    body = client_without_fake.get("/api/v1/capabilities").json()
    # Without the fake provider no provider declares the session-turn
    # capability; the five real harness providers still report their own
    # honest capability truth (including an unavailable pi binary here).
    assert body["execution"]["session_turn_capability_providers"] == 0
    providers = {p["provider_id"]: p for p in body["execution"]["providers"]}
    assert set(providers) >= {
        "codex-execution",
        "claude-code-execution",
        "opencode-execution",
        "hermes-execution",
        "pi-execution",
    }
    assert providers["codex-execution"]["harness_type"] == "codex"
    # Without a harness the turn must fail closed, not fake success.
    session = client_without_fake.post(
        "/api/v1/sessions",
        json={
            "idempotency_key": "cap-1",
            "title": "s",
            "project_path": "/tmp",
        },
    )
    assert session.status_code == 201


def test_turn_without_harness_fails_closed(client_without_fake, tmp_path):
    project = tmp_path / "proj"
    project.mkdir()
    session = client_without_fake.post(
        "/api/v1/sessions",
        json={"idempotency_key": "cap-2", "title": "s", "project_path": str(project)},
    ).json()["session"]
    response = client_without_fake.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "turn-cap", "input": "hello"},
    )
    assert response.status_code == 409
    # No provider declares the session-turn capability and nothing was
    # selected explicitly: exact selection fails closed.
    assert response.json()["error"]["code"] == "PROVIDER_SELECTION_FAILED"


# -- REST auth ----------------------------------------------------------------


def test_protected_endpoints_reject_missing_or_wrong_tokens(client, tmp_path):
    client.headers.pop("Authorization")
    for method, url, kwargs in (
        ("get", "/api/v1/capabilities", {}),
        ("get", "/api/v1/sessions", {}),
        ("post", "/api/v1/sessions", {"json": {}}),
        ("get", "/api/v1/sessions/unknown", {}),
        ("post", "/api/v1/ws-ticket", {}),
    ):
        response = getattr(client, method)(url, **kwargs)
        assert response.status_code == 401, url
    # Wrong token and non-bearer schemes fail closed.
    client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}x"})
    assert client.get("/api/v1/sessions").status_code == 401
    client.headers.update({"Authorization": f"Basic {TEST_TOKEN}"})
    assert client.get("/api/v1/sessions").status_code == 401


def test_token_is_never_mirrored_in_error_responses(client):
    client.headers.pop("Authorization")
    response = client.get("/api/v1/sessions")
    assert TEST_TOKEN not in response.text


def test_ephemeral_token_is_printed_once_to_stderr_only(studio_home, capsys):
    app = _make_app(studio_home, with_fake=True, token=None)
    captured = capsys.readouterr()
    lines = [
        line for line in captured.err.splitlines() if "auth token" in line
    ]
    assert len(lines) == 1
    token_line = lines[0]
    assert token_line not in captured.out
    # The generated token works.
    with TestClient(app) as test_client:
        token = token_line.rsplit(" ", 1)[1]
        test_client.headers.update({"Authorization": f"Bearer {token}"})
        assert test_client.get("/api/v1/sessions").status_code == 200


def test_generated_token_is_strong():
    first, second = generate_token(), generate_token()
    assert first != second
    assert len(first) >= 32


def test_token_guard_is_constant_time_safe():
    guard = TokenGuard(TEST_TOKEN)
    assert guard.check(TEST_TOKEN)
    # A same-length wrong token fails closed (compare_digest semantics).
    wrong = TEST_TOKEN[:-1] + ("0" if TEST_TOKEN[-1] != "0" else "1")
    assert not guard.check(wrong)
    assert not guard.check(None)
    assert not guard.check("")
    assert guard.check_bearer(f"Bearer {TEST_TOKEN}")
    # The scheme is case-insensitive, but the token itself must match exactly.
    assert guard.check_bearer(f"bearer {TEST_TOKEN}")
    assert not guard.check_bearer(f"bearer {TEST_TOKEN}x")
    assert not guard.check_bearer(TEST_TOKEN)


# -- WS tickets -----------------------------------------------------------------


def test_ticket_is_single_use(app, tmp_path):
    project = tmp_path / "proj"
    project.mkdir()
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        session = test_client.post(
            "/api/v1/sessions",
            json={"idempotency_key": "ws-auth-1", "title": "s", "project_path": str(project)},
        ).json()["session"]
        ticket = test_client.post("/api/v1/ws-ticket").json()["ticket"]
        # First connect consumes the ticket and gets a replay message.
        with test_client.websocket_connect(
            f"/api/v1/sessions/{session['session_id']}/events?ticket={ticket}&after=0"
        ) as ws:
            assert ws.receive_json()["type"] == "replay"
        # The same ticket must be rejected now.
        with pytest.raises(Exception):
            with test_client.websocket_connect(
                f"/api/v1/sessions/{session['session_id']}/events?ticket={ticket}&after=0"
            ):
                pass


def test_ws_for_unknown_session_sends_typed_error(app, tmp_path):
    with TestClient(app) as test_client:
        test_client.headers.update({"Authorization": f"Bearer {TEST_TOKEN}"})
        ticket = test_client.post("/api/v1/ws-ticket").json()["ticket"]
        with test_client.websocket_connect(
            f"/api/v1/sessions/sess-missing/events?ticket={ticket}&after=0"
        ) as ws:
            message = ws.receive_json()
            assert message["type"] == "session_error"


def test_ticket_requires_bearer(client):
    client.headers.pop("Authorization")
    assert client.post("/api/v1/ws-ticket").status_code == 401


def test_expired_ticket_is_rejected(app):
    issuer = TicketIssuer(ttl_seconds=0)
    ticket = issuer.issue("subject")
    assert issuer.redeem(ticket.value) is None
    assert issuer.redeem("forged-value") is None


def test_ws_without_ticket_is_rejected(app):
    with TestClient(app) as test_client:
        with pytest.raises(Exception):
            with test_client.websocket_connect(
                "/api/v1/sessions/sess-x/events?after=0"
            ):
                pass
