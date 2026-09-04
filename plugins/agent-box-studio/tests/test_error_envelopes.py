"""Strict DTO validation, stable error envelopes, redaction, correlation ids."""
from __future__ import annotations

import json

import pytest

from conftest import TEST_TOKEN, create_session

from agent_box_studio.server.errors import redact_message


# -- strict request validation -------------------------------------------------


def _post_session(client, body):
    return client.post("/api/v1/sessions", json=body)


def _assert_validation_error(response, field: str | None = None):
    assert response.status_code == 422, response.text
    body = response.json()
    error = body["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert error["message"] == "request validation failed"
    assert len(error["correlation_id"]) >= 32
    assert response.headers["X-Correlation-Id"] == error["correlation_id"]
    details = error["details"]
    assert isinstance(details, list) and details
    for item in details:
        assert set(item.keys()) == {"field", "issue"}
        # No raw pydantic repr/ctx/input echo in the details.
        assert "pydantic" not in str(item).lower()
    if field is not None:
        assert any(item["field"] == field for item in details), details
    return body


def test_unknown_field_is_rejected_with_stable_code(client, project_dir):
    response = _post_session(
        client,
        {
            "idempotency_key": "k",
            "title": "t",
            "project_path": str(project_dir),
            "unexpected_field": "x",
        },
    )
    _assert_validation_error(response, field="unexpected_field")


def test_missing_field_is_rejected(client, project_dir):
    response = _post_session(
        client, {"idempotency_key": "k", "project_path": str(project_dir)}
    )
    _assert_validation_error(response, field="title")


def test_missing_project_path_is_never_defaulted_to_cwd(client):
    """The Phase-1 bug: missing project_path became Path('') = CWD."""
    response = _post_session(client, {"idempotency_key": "cwd-1", "title": "t"})
    _assert_validation_error(response, field="project_path")
    listing = client.get("/api/v1/sessions").json()["sessions"]
    assert listing == []


def test_empty_project_path_is_rejected(client):
    response = _post_session(
        client, {"idempotency_key": "k", "title": "t", "project_path": ""}
    )
    _assert_validation_error(response, field="project_path")
    response = _post_session(
        client, {"idempotency_key": "k2", "title": "t", "project_path": "   "}
    )
    _assert_validation_error(response, field="project_path")


def test_objects_and_bools_are_never_string_coerced(client, project_dir):
    # title: 123 must not become str(123).
    response = _post_session(
        client,
        {"idempotency_key": "k", "title": 123, "project_path": str(project_dir)},
    )
    _assert_validation_error(response, field="title")
    # project_path: [] must not become str([]).
    response = _post_session(
        client, {"idempotency_key": "k", "title": "t", "project_path": []}
    )
    _assert_validation_error(response, field="project_path")


def test_oversized_fields_are_rejected(client, project_dir):
    response = _post_session(
        client,
        {
            "idempotency_key": "k",
            "title": "a" * 201,
            "project_path": str(project_dir),
        },
    )
    _assert_validation_error(response, field="title")
    response = _post_session(
        client,
        {
            "idempotency_key": "a" * 201,
            "title": "t",
            "project_path": str(project_dir),
        },
    )
    _assert_validation_error(response, field="idempotency_key")
    session = create_session(client, project_dir, "oversize-1")
    response = client.post(
        f"/api/v1/sessions/{session['session_id']}/turns",
        json={"idempotency_key": "k", "input": "a" * 131073},
    )
    _assert_validation_error(response, field="input")


def test_break_lease_request_is_strict(client, project_dir):
    session = create_session(client, project_dir, "lease-dto")
    sid = session["session_id"]
    url = f"/api/v1/sessions/{sid}/lease/break"
    base = {
        "expected_owner_id": "writer-a",
        "expected_turn_id": "turn_x",
        "reason": "stale writer",
    }
    # confirm must be the literal boolean true.
    for bad_confirm in (False, "yes", 1, None):
        response = client.post(url, json={**base, "confirm": bad_confirm})
        _assert_validation_error(response, field="confirm")
    for missing in ("expected_owner_id", "expected_turn_id", "reason", "confirm"):
        body = {k: v for k, v in base.items() if k != missing}
        response = client.post(url, json=body)
        _assert_validation_error(response, field=missing)
    response = client.post(url, json={**base, "confirm": True, "reason": ""})
    _assert_validation_error(response, field="reason")
    response = client.post(
        url, json={**base, "confirm": True, "expected_owner_id": "a" * 129}
    )
    _assert_validation_error(response, field="expected_owner_id")


# -- stable envelopes + correlation ids -----------------------------------------


def test_every_error_response_carries_correlation_id(client):
    client.headers.pop("Authorization")
    response = client.get("/api/v1/sessions")
    assert response.status_code == 401
    body = response.json()
    error = body["error"]
    assert error["code"] == "UNAUTHORIZED"
    assert error["correlation_id"] == response.headers["X-Correlation-Id"]


def test_unknown_route_returns_stable_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    error = response.json()["error"]
    assert error["code"] == "NOT_FOUND"
    assert error["correlation_id"] == response.headers["X-Correlation-Id"]


def test_successful_responses_carry_correlation_id_header(client):
    response = client.get("/api/v1/sessions")
    assert response.status_code == 200
    assert len(response.headers["X-Correlation-Id"]) >= 32


def test_unexpected_exception_returns_content_free_500(
    client, app, project_dir, monkeypatch
):
    session = create_session(client, project_dir, "boom-1")
    sid = session["session_id"]

    def explode(*args, **kwargs):
        raise RuntimeError("secret /home/x/y path detail")

    monkeypatch.setattr(app.state.service, "submit_turn", explode)
    response = client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "boom-turn", "input": "hello"},
    )
    assert response.status_code == 500
    body = response.json()
    error = body["error"]
    assert error["code"] == "INTERNAL_ERROR"
    assert error["message"] == "internal error"
    correlation_id = error["correlation_id"]
    assert len(correlation_id) >= 32
    assert response.headers["X-Correlation-Id"] == correlation_id
    text = response.text
    assert "/home" not in text
    assert "secret" not in text
    assert "RuntimeError" not in text
    assert "path detail" not in text


def test_no_prompt_text_leak_when_orchestration_fails(
    client, app, project_dir, monkeypatch
):
    """A failure after acceptance must never leak the prompt, and must
    never fabricate a terminal: the run lands in RECOVERY_REQUIRED."""
    session = create_session(client, project_dir, "leak-1")
    sid = session["session_id"]
    marker = "PROMPT-MARKER-do-not-echo-9f31"

    def explode(*args, **kwargs):
        raise RuntimeError(f"unexpected failure after receiving {marker}")

    monkeypatch.setattr(app.state.service, "_apply_finalization", explode)
    response = client.post(
        f"/api/v1/sessions/{sid}/turns",
        json={"idempotency_key": "leak-turn", "input": f"please {marker} now"},
    )
    assert response.status_code == 202
    assert marker not in response.text
    turn_id = response.json()["turn_id"]
    transcript = client.get(f"/api/v1/sessions/{sid}/transcript").json()
    # No fake success: no terminal was fabricated.
    assert [e for e in transcript["events"] if e["event_type"] == "TURN_TERMINAL"] == []
    assert any(
        e["event_type"] == "execution.recovery_required"
        for e in transcript["events"]
    )
    # The marker never reaches a redacted surface: the TURN_INPUT ledger
    # event stores only a digest, and the recovery payload carries no
    # exception text.  (The fake assistant deliberately echoes the input
    # into its own message event — that is provider content, not an error
    # surface.)
    input_events = [
        e for e in transcript["events"] if e["event_type"] == "TURN_INPUT"
    ]
    assert marker not in json.dumps(input_events)
    recovery = client.get(f"/api/v1/sessions/{sid}/recovery").json()
    assert marker not in json.dumps(recovery)
    turn = client.get(f"/api/v1/sessions/{sid}/turns/{turn_id}").json()["turn"]
    assert turn["state"] == "recovery_required"


# -- defensive redaction helper ---------------------------------------------------


def test_redact_message_strips_absolute_paths_and_credential_values():
    redacted = redact_message("failed to read /home/maoqh/secret.txt (see '/var/data')")
    assert "/home" not in redacted
    assert "/var/data" not in redacted
    assert "[path]" in redacted
    redacted = redact_message("auth failed: token: abc123-value")
    assert "abc123-value" not in redacted
    assert "[redacted]" in redacted
    redacted = redact_message("Authorization=Bearer sk-abc123")
    assert "sk-abc123" not in redacted
    # Normal prose without paths/credentials is untouched.
    assert redact_message("session is not open for new turns") == (
        "session is not open for new turns"
    )
    assert redact_message("") == ""
