"""Namespaced helpers for model-provider tests.

This module intentionally is not named ``conftest``: Studio and Provider
tests are sometimes collected in one pytest process and top-level conftest
names otherwise collide.
"""
from __future__ import annotations

FAKE_SECRET = "sk-fake-model-provider-secret-42"
GOOD_MODEL = "good-model"


class _FakeBinding:
    def __init__(self, model_provider_ref=None, extra=None):
        self.model_provider_ref = model_provider_ref
        self.extra = dict(extra or {})


class _FakeTurn:
    def __init__(self, binding):
        self.binding = binding


class _FakeEvent:
    def __init__(self, turn_id):
        self.turn_id = turn_id


class _FakeSession:
    def __init__(self, session_id):
        self.session_id = session_id


class FakeSessionStore:
    def __init__(self, turns=(), *, fail_listing=False):
        self._turns = list(turns)
        self.fail_listing = fail_listing

    def list_sessions(self):
        if self.fail_listing:
            raise RuntimeError("reference surface unavailable")
        seen = []
        for session_id, _, _ in self._turns:
            if session_id not in seen:
                seen.append(session_id)
        return [_FakeSession(session_id) for session_id in seen]

    def transcript(self, session_id):
        return [_FakeEvent(turn_id) for sid, turn_id, _ in self._turns if sid == session_id]

    def get_turn(self, session_id, turn_id):
        for sid, tid, turn in self._turns:
            if sid == session_id and tid == turn_id:
                return turn
        raise KeyError("turn not found")


class FakeSandboxPort:
    def __init__(self):
        self.provider = self

    def register_prepared_secret_mount(self, mount, path):
        if not path.is_file():
            raise ValueError("secret source must be an existing regular file")
        self.registered = (mount, path)


def make_account(store, account_id="gateway-main", **overrides):
    body = {
        "account_id": account_id,
        "display_name": "Main Gateway",
        "endpoint_candidates": ["https://gateway.example.com/v1"],
        "credential_refs": [f"gateway/{account_id}"],
        "metadata": {},
    }
    body.update(overrides)
    return store.create(**body)


def make_config(store, config_id="codex-gw", harness_type="codex", **overrides):
    body = {
        "config_id": config_id,
        "harness_type": harness_type,
        "protocol_family": "openai-completions",
        "base_url": "https://gateway.example.com/v1",
        "models": [{"model_id": GOOD_MODEL}],
        "credential_ref": "gateway/gateway-main",
        "projection": {"credential_env_var": "GATEWAY_API_KEY"},
        "provider_account_ref": "account/gateway-main",
    }
    body.update(overrides)
    return store.create(**body)
