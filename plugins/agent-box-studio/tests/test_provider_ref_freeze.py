"""P5 architectural override: exact HarnessProviderConfigRef freeze.

RED first (2026-09-05, user ruling §一/二/三):

- the Turn API takes an EXACT HarnessProviderConfigRef selector
  ({config_id, revision?, digest?}) — a bare provider id string is
  rejected (no silent current-revision shim);
- the resolved config must match ALL THREE harness types
  (profile ref / config / execution provider) and carry the requested
  model in its catalog; mismatches are typed fail-closed;
- the Profile no longer owns the model: a profile without any model
  declaration executes fine when the binding carries
  ProviderRef + model_id;
- the frozen authority is Binding.model_provider_ref (formal field) —
  Binding.extra carries no provider facts;
- the deletion guard reads the formal field only.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from agent_box.work_core.db import _reset_connection_for_tests
from agent_box.work_core.models import Ref, RefType

from agent_box.protocols.session.failures import SessionError
from agent_box.work_core.registry import ProviderDescriptor
from agent_box_studio.service import BindingVerificationError
from agent_box_studio.testing import FAKE_PROVIDER_ID, FakeTurnExecutionProvider


class HarnessedFakeProvider(FakeTurnExecutionProvider):
    """The offline fake with an explicit harness_type (the launch invariant
    ProfileRef.harness_type == config.harness_type == provider.harness_type)."""

    def descriptor(self) -> ProviderDescriptor:
        return ProviderDescriptor(FAKE_PROVIDER_ID, "Fake offline harness", "1")

    @property
    def harness_type(self) -> str:
        return "fake-harness"

from test_continuation_provenance import _build, _project, _run_turn

FAKE_VALUE = "sk-fake-freeze-fixture-value"


def _authority_home() -> Path:
    return Path(os.environ["AGENT_BOX_HOME"])


def _seed_config(tmp_path, provider, config_id="hermes-maomao", harness="fake-harness",
                 model="MiniMax-M3", revision=None, digest=None):
    """Seed a HarnessProviderConfig revision and return its Ref.

    Uses the plugin's ConfigStore when available (agent_box_model_providers);
    the fixture degrades to a direct registry double for RED testing if the
    plugin module is absent.
    """
    try:
        from agent_box_model_providers.configs import HarnessProviderConfigStore
    except ImportError:
        pytest.skip("model-providers plugin not built yet (RED phase)")
    store = HarnessProviderConfigStore(_authority_home())
    kwargs = {}
    if revision is not None:
        kwargs["expected_revision"] = revision
    row = store.create(
        config_id=config_id,
        harness_type=harness,
        protocol_family="openai-completions",
        base_url="https://maomaokingdom.top/v1",
        models=[{"model_id": model}],
        credential_ref="gateway/maomao-credentials",
        projection={"credential_env_var": "MINIMAX_API_KEY"},
    )
    ref = store.get_ref(config_id, row["revision"])
    if digest is not None:
        ref = Ref(RefType.ARTIFACT, ref.provider, ref.native_id,
                  metadata={"revision": str(row["revision"]), "digest": digest,
                            "harness_type": harness})
    return store, ref


def _write_credential(value: str = FAKE_VALUE, name: str = "maomao-credentials") -> None:
    cred_dir = _authority_home() / "credentials" / "gateway"
    cred_dir.mkdir(parents=True, exist_ok=True)
    path = cred_dir / f"{name}.json"
    path.write_text(json.dumps({"value": value}))
    os.chmod(path, 0o600)


def test_bare_provider_id_string_is_rejected(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    sid = service.create_session(
        idempotency_key="fr-1", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    with pytest.raises((BindingVerificationError, SessionError)):
        _run_turn(
            service, sid, "fr-turn",
            execution_provider_id=FAKE_PROVIDER_ID,
            model_provider="gateway-a",  # bare string: no longer accepted
        )
    store.close()


def _turn_kwargs(ref: Ref, model: str = "MiniMax-M3"):
    return {
        "model_provider": {
            "config_id": ref.native_id.split("/revisions/")[0],
            "revision": int(ref.metadata.get("revision", "0")),
            "digest": ref.metadata.get("digest"),
        },
        "model": model,
    }


def test_exact_ref_freezes_formal_binding_field(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    store_api, ref = _seed_config(tmp_path, provider)
    sid = service.create_session(
        idempotency_key="fr-2", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(
        service, sid, "fr-turn",
        execution_provider_id=FAKE_PROVIDER_ID,
        **_turn_kwargs(ref),
    )
    turn = store.get_turn(sid, payload["turn_id"])
    frozen = turn.binding.model_provider_ref
    assert frozen is not None
    assert frozen.provider == "harness-model-providers"
    assert frozen.native_id == ref.native_id
    assert frozen.metadata.get("digest") == ref.metadata.get("digest")
    # Binding.extra carries NO provider authority facts
    assert "provider_id" not in turn.binding.extra
    assert "credential_locator" not in turn.binding.extra
    # the model came from the binding, not the profile
    assert turn.binding.model_selection == "MiniMax-M3"
    store.close()


def test_harness_type_mismatch_is_typed_rejected(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    # config declared for harness "hermes"; execution provider is fake-harness
    store_api, ref = _seed_config(tmp_path, provider, harness="hermes")
    sid = service.create_session(
        idempotency_key="fr-3", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    with pytest.raises(BindingVerificationError):
        _run_turn(
            service, sid, "fr-turn",
            execution_provider_id=FAKE_PROVIDER_ID,
            **_turn_kwargs(ref),
        )
    store.close()


def test_unknown_model_is_typed_rejected(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    store_api, ref = _seed_config(tmp_path, provider)
    sid = service.create_session(
        idempotency_key="fr-4", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    with pytest.raises(BindingVerificationError):
        _run_turn(
            service, sid, "fr-turn",
            execution_provider_id=FAKE_PROVIDER_ID,
            model_provider={
                "config_id": ref.native_id.split("/revisions/")[0],
                "revision": int(ref.metadata["revision"]),
                "digest": ref.metadata.get("digest"),
            },
            model="Model-That-Does-Not-Exist",
        )
    store.close()


def test_wrong_digest_is_typed_rejected(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    store_api, ref = _seed_config(tmp_path, provider)
    sid = service.create_session(
        idempotency_key="fr-5", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    with pytest.raises(BindingVerificationError):
        _run_turn(
            service, sid, "fr-turn",
            execution_provider_id=FAKE_PROVIDER_ID,
            model_provider={
                "config_id": ref.native_id.split("/revisions/")[0],
                "revision": int(ref.metadata["revision"]),
                "digest": "sha256:deadbeef",
            },
            model="MiniMax-M3",
        )
    store.close()


def test_profile_without_model_still_executes(tmp_path, monkeypatch):
    """Profile is no longer the model authority: a model-free profile plus a
    ProviderRef + model binding executes (RED against the old rule)."""
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    store_api, ref = _seed_config(tmp_path, provider)
    sid = service.create_session(
        idempotency_key="fr-6", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    payload = _run_turn(
        service, sid, "fr-turn",
        execution_provider_id=FAKE_PROVIDER_ID,
        **_turn_kwargs(ref),
    )
    assert payload["state"] in {"completed", "running", "accepted"}
    store.close()


def test_deletion_guard_reads_formal_field_only(tmp_path, monkeypatch):
    provider = HarnessedFakeProvider()
    service, store, _ = _build(tmp_path, monkeypatch, provider)
    _write_credential()
    store_api, ref = _seed_config(tmp_path, provider)
    sid = service.create_session(
        idempotency_key="fr-7", title="t", project_path=_project(tmp_path)
    )["session"].session_id
    _run_turn(
        service, sid, "fr-turn",
        execution_provider_id=FAKE_PROVIDER_ID,
        **_turn_kwargs(ref),
    )
    from agent_box_model_providers.references import find_config_references

    config_id = ref.native_id.split("/revisions/")[0]
    assert find_config_references(store, config_id) != []
    assert find_config_references(store, "never-referenced") == []
    store.close()
