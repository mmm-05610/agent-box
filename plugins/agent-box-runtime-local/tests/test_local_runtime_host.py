from __future__ import annotations

import json
import pytest

from agent_box.extensions import PluginContext
from agent_box.protocols.runtime import HostTransportOperation
from agent_box.protocols.runtime import CompositionErrorCode, CompositionRejected
from agent_box.work_core import RefType
from agent_box_runtime_local.plugin import LocalRuntimeHostPlugin, LocalRuntimeHostSelector
from agent_box_runtime_local.provider import CONTRACT_ID, LocalHostTransport, LocalRuntimeHostProvider


def test_selector_returns_exact_frozen_ref_and_provider_resolves_without_spawn():
    provider = LocalRuntimeHostProvider(executor=lambda *args, **kwargs: pytest.fail("must not spawn"))
    selector = LocalRuntimeHostSelector(provider)
    selection = selector.prepare({"realm": "native-linux"}, execution_id="e1")
    assert selection.ref.type is RefType.ARTIFACT
    host = provider.resolve(CONTRACT_ID, selection.ref)
    assert host.ref.native_id == selection.ref.native_id
    assert host.transport.transport_kind == "local-exec@1"
    assert "spawn" not in dir(host)


def test_identity_drift_is_rejected(monkeypatch):
    provider = LocalRuntimeHostProvider()
    ref = provider.make_ref("native-linux")
    metadata = dict(ref.metadata)
    metadata["architecture"] = "drifted"
    from agent_box.work_core import Ref
    drifted = Ref(RefType.ARTIFACT, ref.provider, ref.native_id, metadata=metadata)
    with pytest.raises(CompositionRejected) as error:
        provider.resolve(CONTRACT_ID, drifted)
    assert error.value.code is CompositionErrorCode.AFFINITY_MISMATCH


def test_typed_transport_rejects_replay_and_free_shell_payload():
    calls = []
    transport = LocalHostTransport(executor=lambda argv, **kwargs: calls.append((argv, kwargs)) or 42)
    cwd = transport.issue_cwd_token(".")
    env = transport.issue_env_token({"PATH": "/usr/bin"})
    operation = transport.make_operation(
        attempt_key="attempt-1", spawn_token="spawn:one", spec_digest="spec",
        argv=("/usr/bin/true", "--safe"), cwd_token=cwd, env_token=env,
    )
    assert transport.submit(operation).startswith("local:")
    with pytest.raises(CompositionRejected) as error:
        transport.submit(operation)
    assert error.value.code is CompositionErrorCode.SPAWN_TOKEN_INVALID
    assert calls[0][0] == ["/usr/bin/true", "--safe"]
    assert "shell" not in json.dumps(operation.__dict__).lower()


def test_transport_rejects_untyped_or_unsafe_argv_and_unknown_tokens():
    transport = LocalHostTransport(executor=lambda *args, **kwargs: None)
    with pytest.raises(CompositionRejected):
        transport.submit({"spawn_token": "spawn:x"})
    with pytest.raises(ValueError):
        transport.make_operation(attempt_key="a", spawn_token="spawn:x", spec_digest="s", argv=("ok\0bad",), cwd_token="cwd:x", env_token="env:x")


def test_availability_is_explicit_and_windows_not_claimed():
    result = LocalRuntimeHostProvider().availability("wsl")
    assert result["status"] in {"available", "unavailable"}
    assert LocalRuntimeHostProvider().availability("unsupported")["status"] == "unavailable"


def test_plugin_discovery_registration_is_clean(tmp_path):
    plugin = LocalRuntimeHostPlugin()
    registration = plugin.build(PluginContext("2.0.0a1", tmp_path, tmp_path / "data"))
    assert registration.resource_providers[0].provider_id == "runtime-host-local"
    assert next(c.component for c in registration.contributions if c.descriptor.kind == "agent-box.host.resource-selector@1").contract_id == CONTRACT_ID
    assert next(c.component for c in registration.contributions if c.descriptor.kind == "agent-box.host.control@1").doctor()
