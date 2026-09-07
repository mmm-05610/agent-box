"""Model-provider authority plugin tests (RED-first).

The user's two-layer model, migrated out of the studio provider authority:

1. The user-view ProviderAccount store (``model-provider-accounts.json``)
   NEVER enters Execution Bindings; it only derives HarnessProviderConfigs.
2. The harness-scoped HarnessProviderConfig store
   (``harness-provider-configs.json``) is the Execution-Binding authority:
   immutable per-config revision streams, exact-revision Refs
   (``RefType.ARTIFACT``, provider ``harness-model-providers``,
   ``<config_id>/revisions/<n>``), CAS updates, guarded deletion.
3. Account changes are PROPOSALS only; applying them is an explicit
   per-config ``update``.
4. The credential authority materializes execution-scoped staging files
   (0600) and the secret value never appears in any resolve result,
   mount object, repr, or store row.

The credential value in this file is a SYNTHETIC fake; no real credential
is ever read, written, or imported by these tests.
"""
from __future__ import annotations

import json
import stat
from types import SimpleNamespace

import pytest

from agent_box.resource_contracts import CredentialRefV1, HarnessModelProviderV1
from agent_box.work_core import Ref, RefType

from agent_box_model_providers.errors import ProviderAuthorityError

from model_provider_test_helpers import (
    FAKE_SECRET,
    GOOD_MODEL,
    FakeSessionStore,
    FakeSandboxPort,
    _FakeBinding,
    _FakeTurn,
    make_account,
    make_config,
)

PROVIDER_ID = "harness-model-providers"


# -- helpers -------------------------------------------------------------------


def _codes(excinfo):
    return excinfo.value.http_status, excinfo.value.code


# -- RED 1: one account -> per-harness configs, pairwise-unequal Refs ----------


def test_same_account_derives_distinct_harness_refs(account_store, config_store):
    make_account(account_store)
    created = {
        harness: make_config(
            config_store,
            config_id=f"{harness}-gw",
            harness_type=harness,
        )
        for harness in ("codex", "hermes", "pi")
    }
    assert all(row["revision"] == 1 for row in created.values())
    refs = {h: config_store.get_ref(f"{h}-gw") for h in created}
    codex, hermes, pi = refs["codex"], refs["hermes"], refs["pi"]
    assert codex != hermes and hermes != pi and codex != pi
    for harness, ref in refs.items():
        assert ref.type is RefType.ARTIFACT
        assert ref.provider == PROVIDER_ID
        assert ref.native_id == f"{harness}-gw/revisions/1"
        assert ref.metadata["revision"] == "1"
        assert ref.metadata["harness_type"] == harness
        assert ref.metadata["digest"]
    # every config points back at the same user-view account locator
    for harness in created:
        record = config_store.get(f"{harness}-gw")
        assert record["provider_account_ref"] == "account/gateway-main"


# -- RED 2: resolve rejects a harness_type mismatch -----------------------------


def test_resolve_rejects_harness_type_mismatch(config_store):
    make_config(
        config_store,
        config_id="hermes-gw",
        harness_type="hermes",
        credential_ref="gateway/hermes-key",
        projection={"credential_env_var": "HERMES_API_KEY"},
        provider_account_ref=None,
    )
    ref = config_store.get_ref("hermes-gw")
    assert ref.metadata["harness_type"] == "hermes"
    wrong = Ref(
        RefType.ARTIFACT,
        ref.provider,
        ref.native_id,
        metadata={**ref.metadata, "harness_type": "codex"},
    )
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.resolve(wrong)
    status, code = _codes(excinfo)
    assert status == 422
    assert code == "CONFIG_HARNESS_MISMATCH"


# -- RED 3: streams are independent ---------------------------------------------


def test_updating_one_stream_does_not_touch_another(account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    make_config(config_store, config_id="hermes-gw", harness_type="hermes")
    codex_ref = config_store.get_ref("codex-gw")

    updated = config_store.update(
        "hermes-gw", 1, base_url="https://hermes.example.com/v2"
    )
    assert updated["revision"] == 2

    assert config_store.get_ref("codex-gw") == codex_ref
    assert config_store.get("codex-gw")["revision"] == 1
    assert config_store.get("codex-gw")["base_url"] == "https://gateway.example.com/v1"
    assert config_store.get("hermes-gw")["base_url"] == "https://hermes.example.com/v2"


# -- RED 4: account changes are proposals only ----------------------------------


def test_account_change_is_proposal_only(account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    make_config(config_store, config_id="hermes-gw", harness_type="hermes")

    report = account_store.propose_account_change(
        "gateway-main",
        config_store,
        endpoint_candidates=["https://moved.example.com/v9"],
    )
    proposals = report["proposals"]
    assert {p["config_id"] for p in proposals} == {"codex-gw", "hermes-gw"}
    for proposal in proposals:
        assert proposal["current_revision"] == 1
        assert proposal["proposed_changes"] == {
            "base_url": "https://moved.example.com/v9"
        }

    # nothing moved: neither the account nor any config
    row = account_store.get("gateway-main")
    assert row["endpoint_candidates"] == ["https://gateway.example.com/v1"]
    assert config_store.get("codex-gw")["revision"] == 1
    assert config_store.get("hermes-gw")["revision"] == 1

    # applying is explicit and per-config
    account_store.update(
        "gateway-main", endpoint_candidates=["https://moved.example.com/v9"]
    )
    applied = config_store.update(
        "codex-gw", 1, base_url="https://moved.example.com/v9"
    )
    assert applied["revision"] == 2
    assert config_store.get("hermes-gw")["revision"] == 1


def test_proposal_for_unbound_account_is_empty(account_store, config_store):
    make_account(account_store)
    report = account_store.propose_account_change(
        "gateway-main", config_store, endpoint_candidates=["https://x.example.com"]
    )
    assert report["proposals"] == []


# -- RED 5: old revision refs stay exact after an update ------------------------


def test_old_revision_ref_resolves_old_full_record(account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    old_ref = config_store.get_ref("codex-gw", 1)
    old_record = config_store.get("codex-gw", 1)

    config_store.update(
        "codex-gw",
        1,
        base_url="https://next.example.com/v2",
        models=[{"model_id": "next-model"}],
        protocol_family="openai-responses",
    )

    resolved = config_store.resolve(old_ref)
    assert isinstance(resolved, HarnessModelProviderV1)
    assert resolved.revision == 1
    assert resolved.base_url == "https://gateway.example.com/v1"
    assert resolved.protocol_family == "openai-completions"
    assert resolved.model_ids == (GOOD_MODEL,)
    assert resolved.credential_ref == "gateway/gateway-main"
    assert resolved.projection == {"credential_env_var": "GATEWAY_API_KEY"}
    assert resolved.harness_type == "codex"
    assert resolved.digest == old_record["digest"]


# -- RED 6: resolve is idempotent across store reloads --------------------------


def test_resolve_idempotent_across_store_reload(home, account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    old_ref = config_store.get_ref("codex-gw", 1)
    expected = config_store.resolve(old_ref)

    from agent_box_model_providers.configs import HarnessProviderConfigStore
    from agent_box_model_providers.resource import HarnessModelProviderConfigResolver

    reloaded = HarnessProviderConfigStore(home)
    assert reloaded.resolve(old_ref) == expected
    assert reloaded.get("codex-gw", 1) == config_store.get("codex-gw", 1)
    assert reloaded.get_ref("codex-gw") == config_store.get_ref("codex-gw")

    resolver = HarnessModelProviderConfigResolver(reloaded)
    assert (
        resolver.resolve(HarnessModelProviderV1.contract_id, old_ref) == expected
    )


# -- RED 7: deletion guard over Binding.model_provider_ref ----------------------


def test_delete_referenced_config_is_409_and_replacement_works(
    account_store, config_store
):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    make_config(config_store, config_id="hermes-gw", harness_type="hermes")
    store = FakeSessionStore(
        [("s-1", "t-1", _FakeTurn(_FakeBinding(config_store.get_ref("codex-gw", 1))))]
    )

    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.delete("codex-gw", session_store=store)
    assert _codes(excinfo) == (409, "CONFIG_IN_USE")
    assert config_store.get("codex-gw")["config_id"] == "codex-gw"

    # replacement must be a different, live config
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.delete(
            "codex-gw", session_store=store, replacement_config_id="codex-gw"
        )
    assert excinfo.value.code == "REPLACEMENT_CONFIG_INVALID"
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.delete(
            "codex-gw", session_store=store, replacement_config_id="ghost"
        )
    assert excinfo.value.code == "REPLACEMENT_CONFIG_NOT_FOUND"

    config_store.delete(
        "codex-gw", session_store=store, replacement_config_id="hermes-gw"
    )
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.get("codex-gw")
    assert excinfo.value.code == "CONFIG_NOT_FOUND"
    # unreferenced configs delete freely
    config_store.delete("hermes-gw", session_store=store)


def test_delete_unreferenced_config_is_free(account_store, config_store):
    make_config(
        config_store,
        config_id="lonely",
        harness_type="codex",
        credential_ref="gateway/lonely",
        provider_account_ref=None,
    )
    config_store.delete("lonely", session_store=FakeSessionStore())
    with pytest.raises(ProviderAuthorityError):
        config_store.get("lonely")


# -- RED 8: bare id / wrong digest / unknown revision / unknown model -----------


def test_bare_config_id_is_rejected(config_store):
    with pytest.raises(ProviderAuthorityError) as excinfo:
        make_config(config_store, config_id="Bad_Id", provider_account_ref=None)
    assert excinfo.value.http_status == 422
    assert excinfo.value.code == "VALIDATION_ERROR"
    for bad in ("-leading", "has_underscore", "x" * 65, "has space", ""):
        with pytest.raises(ProviderAuthorityError):
            make_config(config_store, config_id=bad, provider_account_ref=None)


def test_wrong_digest_fails_closed(config_store):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    ref = config_store.get_ref("codex-gw", 1)
    tampered = Ref(
        RefType.ARTIFACT,
        ref.provider,
        ref.native_id,
        metadata={**ref.metadata, "digest": "0" * 64},
    )
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.resolve(tampered)
    assert _codes(excinfo) == (409, "CONFIG_DIGEST_MISMATCH")


def test_unknown_config_and_revision_are_typed_404(config_store):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    ref = config_store.get_ref("codex-gw", 1)
    stranger = Ref(RefType.ARTIFACT, ref.provider, "ghost/revisions/1", metadata=ref.metadata)
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.resolve(stranger)
    assert _codes(excinfo) == (404, "CONFIG_NOT_FOUND")

    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.get("codex-gw", 99)
    assert _codes(excinfo) == (404, "CONFIG_REVISION_NOT_FOUND")
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.get_ref("codex-gw", 99)
    assert _codes(excinfo) == (404, "CONFIG_REVISION_NOT_FOUND")
    with pytest.raises(ProviderAuthorityError):
        config_store.get("nope")


def test_unknown_model_is_typed_reject(config_store):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.require_model("codex-gw", "unknown-model")
    assert _codes(excinfo) == (404, "MODEL_NOT_FOUND")
    assert config_store.require_model("codex-gw", GOOD_MODEL)


# -- RED 9 (extra): CAS conflicts ------------------------------------------------


def test_update_cas_conflict(account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    config_store.update("codex-gw", 1, base_url="https://v2.example.com")
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.update("codex-gw", 1, base_url="https://v3.example.com")
    assert _codes(excinfo) == (409, "CONFIG_REVISION_CONFLICT")
    assert config_store.get("codex-gw")["revision"] == 2


def test_update_cannot_change_harness_type(account_store, config_store):
    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.update("codex-gw", 1, harness_type="hermes")
    assert excinfo.value.http_status == 409
    assert excinfo.value.code == "CONFIG_HARNESS_IMMUTABLE"
    assert config_store.get("codex-gw")["harness_type"] == "codex"


# -- RED 10: the scan reads ONLY binding.model_provider_ref ---------------------


def test_scan_reads_only_binding_model_provider_ref(config_store):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    ref = config_store.get_ref("codex-gw", 1)

    # provider-ish keys in binding.extra do NOT count (P2-era extras)
    legacy = FakeSessionStore(
        [
            (
                "s-1",
                "t-1",
                _FakeTurn(
                    _FakeBinding(
                        model_provider_ref=None,
                        extra={
                            "provider_id": "codex-gw",
                            "credential_locator": "gateway/gateway-main",
                        },
                    )
                ),
            )
        ]
    )
    assert config_store.find_references("codex-gw", session_store=legacy) == []

    live = FakeSessionStore(
        [("s-2", "t-2", _FakeTurn(_FakeBinding(model_provider_ref=ref)))]
    )
    found = config_store.find_references("codex-gw", session_store=live)
    assert found == [{"session_id": "s-2", "turn_id": "t-2"}]

    # a different config's ref does not match
    other = FakeSessionStore(
        [("s-3", "t-3", _FakeTurn(_FakeBinding(model_provider_ref=ref)))]
    )
    assert config_store.find_references("hermes-gw", session_store=other) == []

    # an unreadable reference surface fails closed (destructive delete refused)
    broken = FakeSessionStore(fail_listing=True)
    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.find_references("codex-gw", session_store=broken)
    assert excinfo.value.http_status == 503


# -- credentials: 0600 staging, secret never leaks, sandbox registration --------


def test_credential_staging_is_0600_and_mount_registers(
    home, credential_authority
):
    credential_authority.set("gateway-main", FAKE_SECRET)

    from agent_box_model_providers.resource import GatewayCredentialSource

    source = GatewayCredentialSource(agent_box_home=home)
    value_ref = CredentialRefV1(
        provider="gateway-provider", native_locator="gateway/gateway-main", harness_scope="gateway"
    )
    prepared = source.prepare_mount(
        value_ref, "execution:exec-1", "/runtime/home/.credential/secret", "ro"
    )

    assert prepared.credential_ref == value_ref
    assert prepared.execution_scope == "execution:exec-1"
    assert prepared.guest_target == "/runtime/home/.credential/secret"
    assert prepared.access == "ro"
    assert prepared.token
    assert FAKE_SECRET not in repr(prepared)
    # NO prepare_launch_env: the value never returns to any caller.
    assert not hasattr(source, "prepare_launch_env")

    sandbox = FakeSandboxPort()
    source.bind_to_sandbox(prepared, sandbox)
    mounted, staged_path = sandbox.registered
    assert mounted is prepared
    assert mounted.execution_scope == "execution:exec-1"
    assert staged_path.is_file()
    assert stat.S_IMODE(staged_path.stat().st_mode) == 0o600
    assert staged_path.read_text(encoding="utf-8") == FAKE_SECRET
    staging_dir = home / "credentials-staging" / "execution:exec-1"
    assert staged_path.parent == staging_dir

    source.cleanup(prepared)
    assert not staging_dir.exists()

    # re-preparing after cleanup stages a fresh copy (the copy happens ONCE
    # per prepare; the value never returns to any caller)
    again = source.prepare_mount(
        value_ref, "execution:exec-2", "/runtime/home/.credential/secret", "ro"
    )
    assert again.token != prepared.token
    source.cleanup(again)
    assert not (home / "credentials-staging" / "execution:exec-2").exists()


def test_prepare_mount_rejects_bad_scope_target_access(home, credential_authority):
    credential_authority.set("gateway-main", FAKE_SECRET)
    from agent_box_model_providers.resource import GatewayCredentialSource

    source = GatewayCredentialSource(agent_box_home=home)
    value_ref = CredentialRefV1(
        provider="gateway-provider", native_locator="gateway/gateway-main", harness_scope="gateway"
    )
    with pytest.raises(ValueError):
        source.prepare_mount(value_ref, "not-execution", "/runtime/home/.credential/secret", "ro")
    with pytest.raises(ValueError):
        source.prepare_mount(value_ref, "execution:e-1", "/etc/passwd", "ro")
    with pytest.raises(ValueError):
        source.prepare_mount(value_ref, "execution:e-1", "/runtime/home/.credential/secret", "rw")


def test_secret_never_in_any_resolve_result_repr(account_store, config_store, home):
    from agent_box_model_providers.resource import HarnessModelProviderConfigResolver

    make_account(account_store)
    make_config(config_store, config_id="codex-gw", harness_type="codex")
    credential_authority = config_store.credentials
    credential_authority.set("gateway-main", FAKE_SECRET)

    resolver = HarnessModelProviderConfigResolver(config_store)
    ref = config_store.get_ref("codex-gw", 1)
    value = resolver.resolve(HarnessModelProviderV1.contract_id, ref)

    # the resolved contract value is locator-only: never any secret material
    assert FAKE_SECRET not in repr(value)
    assert FAKE_SECRET not in json.dumps(value.projection)
    assert value.credential_ref == "gateway/gateway-main"

    # the registry-facing resolve of the gateway source is locator-only too
    from agent_box_model_providers.resource import GatewayCredentialSource

    source = GatewayCredentialSource(agent_box_home=home)
    credential_value = source.resolve(
        CredentialRefV1.contract_id,
        Ref(RefType.ARTIFACT, "gateway-provider", "gateway/gateway-main"),
    )
    assert isinstance(credential_value, CredentialRefV1)
    assert FAKE_SECRET not in repr(credential_value)
    assert credential_value.native_locator == "gateway/gateway-main"


def test_gateway_source_rejects_duck_typed_refs(home, credential_authority):
    from agent_box_model_providers.resource import GatewayCredentialSource

    source = GatewayCredentialSource(agent_box_home=home)
    with pytest.raises(ValueError):
        source.validate(
            SimpleNamespace(provider="other-provider", native_locator="gateway/x")
        )
    with pytest.raises(ValueError):
        source.validate({"provider": "gateway-provider", "native_locator": "codex/x"})
    source.validate({"provider": "gateway-provider", "native_locator": "gateway/x"})


# -- bounds ----------------------------------------------------------------------


def test_config_store_is_bounded_to_64(config_store):
    for index in range(64):
        make_config(
            config_store,
            config_id=f"cfg-{index:02d}",
            harness_type="codex",
            credential_ref=f"gateway/k{index}",
            provider_account_ref=None,
        )
    with pytest.raises(ProviderAuthorityError) as excinfo:
        make_config(
            config_store,
            config_id="cfg-overflow",
            harness_type="codex",
            credential_ref="gateway/overflow",
            provider_account_ref=None,
        )
    assert _codes(excinfo) == (409, "CONFIG_LIMIT_EXCEEDED")


def test_account_store_is_bounded_to_32(account_store):
    for index in range(32):
        make_account(account_store, account_id=f"account-{index:02d}")
    with pytest.raises(ProviderAuthorityError) as excinfo:
        make_account(account_store, account_id="account-overflow")
    assert _codes(excinfo) == (409, "ACCOUNT_LIMIT_EXCEEDED")


def test_account_store_is_atomic_0600(home, account_store):
    make_account(account_store)
    path = home / "model-provider-accounts.json"
    assert path.is_file()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    body = json.loads(path.read_text())
    assert body["schema_version"] == 1
    assert body["accounts"][0]["account_id"] == "gateway-main"
    assert FAKE_SECRET not in path.read_text()


def test_config_store_file_is_atomic_0600(home, config_store):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    path = home / "harness-provider-configs.json"
    assert path.is_file()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_accounts_have_no_execution_binding_surface(account_store):
    # Accounts NEVER enter Execution Bindings: the store exposes no Ref/Ref
    # factory and no registry-resolvable contract.
    assert not hasattr(account_store, "get_ref")
    assert not hasattr(account_store, "resolve")
    assert not hasattr(account_store, "ref")


# -- probe runner (migrated unchanged; value wired at probe time) ----------------


def test_probe_wires_credential_value_at_probe_time(config_store, monkeypatch):
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    config_store.credentials.set("gateway-main", FAKE_SECRET)

    from agent_box_model_providers import configs as configs_module

    captured = {}

    def fake_run_probe(protocol_family, base_url, *, model, credential_value):
        captured.update(
            {
                "protocol_family": protocol_family,
                "base_url": base_url,
                "model": model,
                "credential_value": credential_value,
            }
        )
        return {
            "at": "2026-01-01T00:00:00+00:00",
            "outcome": "ok",
            "model_id": model,
            "latency_ms": 1,
            "detail_class": "http-200",
        }

    monkeypatch.setattr(configs_module, "run_probe", fake_run_probe)
    evidence = config_store.probe("codex-gw", model=GOOD_MODEL)
    assert evidence["outcome"] == "ok"
    assert captured["protocol_family"] == "openai-completions"
    assert captured["base_url"] == "https://gateway.example.com/v1"
    assert captured["model"] == GOOD_MODEL
    assert captured["credential_value"] == FAKE_SECRET
    # evidence carries no secret
    assert FAKE_SECRET not in json.dumps(evidence)

    with pytest.raises(ProviderAuthorityError) as excinfo:
        config_store.probe("codex-gw", model="unknown-model")
    assert excinfo.value.code == "MODEL_NOT_FOUND"


# -- plugin registration surface --------------------------------------------------


def test_plugin_registration_resolves_through_registry(home):
    from agent_box.extensions import PluginContext, PluginDescriptor
    from agent_box.work_core.registry import ExtensionRegistry
    from agent_box_model_providers.entrypoints import create_model_providers

    plugin = create_model_providers()
    descriptor = plugin.descriptor()
    assert isinstance(descriptor, PluginDescriptor)
    context = PluginContext(
        agent_box_version="test",
        agent_box_home=home,
        plugin_data_dir=home / "plugins" / descriptor.id,
    )
    registration = plugin.build(context)

    registry = ExtensionRegistry()
    registry.register_components(
        contracts=registration.contracts,
        resource_providers=registration.resource_providers,
    )

    ids = [d.id for d in registry.resource_descriptors()]
    assert "harness-model-providers" in ids
    assert "gateway-provider" in ids
    resolver = registry.get_resource_provider("harness-model-providers")
    assert resolver.descriptor().id == PROVIDER_ID

    # descriptor id equals the ref provider: end-to-end exact-revision resolve
    config_store = resolver.store
    make_config(
        config_store,
        config_id="codex-gw",
        harness_type="codex",
        provider_account_ref=None,
    )
    ref = config_store.get_ref("codex-gw", 1)
    value = registry.get_resource_provider(PROVIDER_ID).resolve(
        HarnessModelProviderV1.contract_id, ref
    )
    assert isinstance(value, HarnessModelProviderV1)
    assert value.config_id == "codex-gw"
    assert value.revision == 1

    # the library contribution is reachable and lists the current revision
    from agent_box.protocols.host import RESOURCE_LIBRARY_KIND

    libraries = [
        contribution
        for contribution in registration.contributions
        if getattr(contribution.descriptor, "kind", "") == RESOURCE_LIBRARY_KIND
    ]
    assert len(libraries) == 1
    library = libraries[0].component
    rows = library.list_resources()
    assert [row["config_id"] for row in rows] == ["codex-gw"]
    fetched = library.get_resource(ref)
    assert fetched["config_id"] == "codex-gw"
    assert fetched["revision"] == 1
