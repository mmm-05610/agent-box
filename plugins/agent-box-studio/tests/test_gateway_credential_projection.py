"""Gateway credential dispatch over the FORMAL model_provider_ref authority.

Architecture override §二/§五: when the frozen Binding carries
``model_provider_ref`` (the exact HarnessProviderConfig Ref), the dispatch
includes the pinned configuration's credential locator (resolved from the
EXACT revision); without a pin, launch-env harnesses dispatch no credential
at all.  Binding.extra carries no provider authority facts.
"""
from __future__ import annotations

import os
from pathlib import Path
from types import SimpleNamespace
import unittest.mock as mock

from agent_box.resource_contracts import CredentialRefV1
from agent_box.work_core.db import _reset_connection_for_tests

from agent_box_model_providers.configs import HarnessProviderConfigStore

from agent_box_studio.service import StudioService
from agent_box_studio.testing import FAKE_PROVIDER_ID


def _environment(tmp_path):
    from agent_box.extensions.bootstrap import build_extension_environment

    monkeyhome = tmp_path / "authority-home"
    monkeyhome.mkdir(parents=True, exist_ok=True)
    os.environ["AGENT_BOX_HOME"] = str(monkeyhome)
    _reset_connection_for_tests()
    environment = build_extension_environment()
    store = environment.catalog.query(
        "agent-box.session.store@1", "official-session-store"
    )
    return environment, store


def _seed_config(tmp_path, harness: str = "fake-harness", model: str = "MiniMax-M3"):
    home = Path(os.environ["AGENT_BOX_HOME"])
    configs = HarnessProviderConfigStore(home)
    row = configs.create(
        config_id="hermes-maomao",
        harness_type=harness,
        protocol_family="openai-completions",
        base_url="https://maomaokingdom.top/v1",
        models=[{"model_id": model}],
        credential_ref="gateway/maomao-credentials",
        projection={"credential_env_var": "MINIMAX_API_KEY"},
    )
    return configs.get_ref("hermes-maomao", row["revision"])


def _launch_env_provider() -> SimpleNamespace:
    from agent_box_harnesses.registry.schema import CredentialSpec

    definition = SimpleNamespace(
        credential=CredentialSpec(
            contract=CredentialRefV1.contract_id,
            locator_provider="gateway-provider",
            guest_target_class="launch-env",
            materializer="gateway-provider",
            required=False,
            env_var="MINIMAX_API_KEY",
        )
    )
    return SimpleNamespace(
        descriptor=lambda: SimpleNamespace(id=FAKE_PROVIDER_ID, version="1"),
        input_limits=lambda: {CredentialRefV1.contract_id: (0, 1)},
        credential_contract_id=lambda: CredentialRefV1.contract_id,
        definition=definition,
    )


def _binding(model_provider_ref) -> SimpleNamespace:
    return SimpleNamespace(
        harness_provider_id=FAKE_PROVIDER_ID,
        harness_provider_version="1",
        workspace_mode="live",
        model_selection="MiniMax-M3",
        model_provider_ref=model_provider_ref,
        session_watermark=0,
        capability_digest="sha256:x",
        profile_ref=None,
        runtime_host_ref=None,
        sandbox_ref=None,
        extra={},
    )


def _service(tmp_path, monkeypatch, environment):
    from agent_box.work_core.repository import CoreRepository

    monkeypatch.setenv("AGENT_BOX_HOME", str(tmp_path / "authority-home"))
    return StudioService(
        environment.catalog.query("agent-box.session.store@1", "official-session-store"),
        next(
            p for p in environment.registry.resource_providers()
            if p.descriptor().id == "local-live-workspace"
        ),
        environment.registry,
        CoreRepository(),
        worker_mode="inline",
        turn_timeout_seconds=30,
        poll_interval=0.01,
    )


def _session_double():
    return SimpleNamespace(
        session_id="sess_1",
        workspace_mode="live",
        workspace_ref=SimpleNamespace(native_id="proj_1"),
    )


def test_frozen_ref_dispatches_pinned_credential_locator(tmp_path, monkeypatch):
    environment, _store = _environment(tmp_path)
    service = _service(tmp_path, monkeypatch, environment)
    ref = _seed_config(tmp_path)
    provider = _launch_env_provider()
    with mock.patch.object(service._store, "get_turn", return_value=SimpleNamespace(binding=_binding(ref))), \
         mock.patch.object(service._store, "get_session", return_value=_session_double()):
        inputs = service._build_dispatch_inputs(provider, "turn_1", "exec_1", _session_double())
    creds = [r for _, r in inputs if getattr(r, "provider", "") == "gateway-provider"]
    assert creds, inputs
    # the locator comes from the PINNED config's credential_ref (exact
    # revision), never from Binding.extra
    assert creds[0].native_id == "gateway/maomao-credentials", inputs


def test_no_frozen_ref_dispatches_no_gateway_credential(tmp_path, monkeypatch):
    environment, _store = _environment(tmp_path)
    service = _service(tmp_path, monkeypatch, environment)
    provider = _launch_env_provider()
    with mock.patch.object(service._store, "get_turn", return_value=SimpleNamespace(binding=_binding(None))), \
         mock.patch.object(service._store, "get_session", return_value=_session_double()):
        inputs = service._build_dispatch_inputs(provider, "turn_1", "exec_1", _session_double())
    creds = [r for _, r in inputs if getattr(r, "provider", "") == "gateway-provider"]
    assert not creds, inputs
