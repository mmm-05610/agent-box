"""REST facade contract of the model-providers authority (P2 vertical).

The provider REST layer was moved onto the plugin's
``HarnessProviderConfigStore`` (single ownership); these tests pin that the
HTTP endpoints call ONLY methods the registry-backed store actually exposes
(the handover left a stale ``list_rows`` call that 500'd the list endpoint
against the real plugin registry).
"""
from __future__ import annotations

import json

import pytest

from conftest import TEST_TOKEN


def test_provider_list_endpoint_returns_rows(client):
    response = client.get("/api/v1/providers")
    assert response.status_code == 200, response.text
    body = response.json()
    assert isinstance(body["providers"], list)


def test_provider_create_then_list_round_trip(client):
    created = client.post(
        "/api/v1/providers",
        json={
            "provider_id": "probe-roundtrip",
            "display_name": "roundtrip",
            "harness_type": "fake-harness",
            "base_url": "https://relay.example/v1",
            "protocol_family": "openai-completions",
            "models": [{"model_id": "MiniMax-M3"}],
        },
    )
    assert created.status_code == 201, created.text
    rows = client.get("/api/v1/providers").json()["providers"]
    assert any(row.get("config_id") == "probe-roundtrip" for row in rows)


def test_provider_probe_unknown_id_is_typed_404(client):
    response = client.post(
        "/api/v1/providers/no-such-provider/probe", json={"model": "MiniMax-M3"}
    )
    assert response.status_code == 404, response.text
    assert response.json()["error"]["code"] == "CONFIG_NOT_FOUND"


def test_provider_credential_is_write_only(client):
    created = client.post(
        "/api/v1/providers",
        json={
            "provider_id": "cred-write-only",
            "display_name": "cred",
            "harness_type": "fake-harness",
            "base_url": "https://relay.example/v1",
            "protocol_family": "anthropic-messages",
            "models": [{"model_id": "MiniMax-M3"}],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert "credential_value" not in json.dumps(body)
    set_resp = client.put(
        "/api/v1/providers/cred-write-only/credential", json={"value": "sk-test-cred"}
    )
    assert set_resp.status_code == 201, set_resp.text
    assert set_resp.json()["credential"]["present"] is True
    assert "sk-test-cred" not in set_resp.text
    # the row projection never carries the credential value
    rows = client.get("/api/v1/providers").json()["providers"]
    row = next(r for r in rows if r.get("config_id") == "cred-write-only")
    assert "sk-test-cred" not in json.dumps(row)


def test_provider_authority_exposes_distinct_account_and_config_resources(client):
    account = client.post(
        "/api/v1/provider-accounts",
        json={
            "account_id": "account-main",
            "display_name": "Main gateway",
            "endpoint_candidates": ["https://relay.example/v1"],
            "credential_refs": ["gateway/account-main"],
            "metadata": {"owner": "test"},
        },
    )
    assert account.status_code == 201, account.text
    assert account.json()["account"]["account_id"] == "account-main"
    config = client.post(
        "/api/v1/harness-provider-configs",
        json={
            "config_id": "config-main",
            "harness_type": "fake-harness",
            "protocol_family": "openai-completions",
            "base_url": "https://relay.example/v1",
            "models": [{"model_id": "MiniMax-M3"}],
            "credential_ref": "gateway/account-main",
            "provider_account_ref": "account/account-main",
        },
    )
    assert config.status_code == 201, config.text
    body = config.json()["config"]
    assert body["config_id"] == "config-main"
    assert body["revision"] == 1
    assert "display_name" not in body
    assert "harness_routes" not in body


def test_provider_config_selector_is_exact_revision(client):
    response = client.get("/api/v1/harness-provider-configs")
    assert response.status_code == 200, response.text
    for row in response.json()["configs"]:
        assert {"config_id", "revision", "digest", "harness_type"} <= row.keys()
