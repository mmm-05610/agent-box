"""Effective capability truth table (determined adjudication 9).

Effective Capability = Registry declared ∩ Adapter implemented ∩ Runtime
available.  The provider exposes four states and never echoes the registry.
"""
import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.generic.execution_provider import CapabilityState, GenericExecutionProvider
from agent_box_harnesses.registry.schema import definition_from_dict
from helpers import definition_by_driver, resolved_executable_for


@pytest.mark.parametrize("driver", ("codex", "claude", "opencode", "hermes", "pi"))
def test_start_is_available_with_a_resolvable_executable(tmp_path, driver):
    definition = definition_by_driver(driver)
    provider = GenericExecutionProvider(
        definition, ADAPTERS[driver],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: resolved_executable_for(tmp_path / driver, definition),
    )
    truth = provider.capability_truth()
    assert truth["start"][0] is CapabilityState.AVAILABLE
    assert provider.capabilities()["start"] == "supported"


@pytest.mark.parametrize("driver", ("codex", "claude", "opencode", "hermes", "pi"))
def test_start_is_unavailable_when_the_executable_cannot_resolve(tmp_path, driver):
    definition = definition_by_driver(driver)
    provider = GenericExecutionProvider(
        definition, ADAPTERS[driver],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: (_ for _ in ()).throw(ExecutableNotFound()),
    )
    truth = provider.capability_truth()
    assert truth["start"][0] is CapabilityState.UNAVAILABLE
    assert provider.capabilities()["start"] == "unavailable"
    diagnostics = provider.diagnostics()
    assert diagnostics["executable"]["status"] == "unavailable"
    assert diagnostics["executable"]["error"]


class ExecutableNotFound(Exception):
    pass


def test_declared_but_unimplemented_capability_is_not_implemented(tmp_path):
    """A registry entry that declares permissions must surface NOT_IMPLEMENTED,
    never a silent 'supported' echo."""
    raw = {
        "schema_version": 1, "driver": "pi", "capabilities": ["start", "observe", "finish", "permissions"],
        "identity": {"harness_type": "pi", "display_name": "Pi", "description": "test", "version": "2.0"},
        "executable": {"identity": "pi", "resolver_kind": "PATH", "version_probe": ["--version"]},
        "profile": {"native_home": ".pi", "guest_home": "/runtime/home", "config_format": "json",
                    "payload_schema": "pi-profile-v1"},
        "launch_modes": [{"name": "exec", "argv": ["pi", "--mode", "json"], "io": "stdio"}],
        "runtime": {"network": "required"},
        "inputs": [],
        "continuation": {"kind": "none"},
    }
    definition = definition_from_dict(raw)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["pi"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: resolved_executable_for(tmp_path, definition),
    )
    truth = provider.capability_truth()
    assert truth["permissions"][0] is CapabilityState.NOT_IMPLEMENTED
    assert provider.capabilities()["permissions"] == "not_implemented"


def test_stream_capability_is_unavailable_with_explicit_diagnostics(tmp_path):
    definition = definition_by_driver("codex")
    provider = GenericExecutionProvider(
        definition, ADAPTERS["codex"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: resolved_executable_for(tmp_path, definition),
    )
    state, detail = provider.capability_truth()["stream"]
    assert state is CapabilityState.UNAVAILABLE
    assert "pump" in detail
    assert provider.diagnostics()["capabilities"]["stream"]["state"] == "unavailable"


def test_implemented_but_undeclared_capability_surfaces_as_implemented(tmp_path):
    """native_continuation is implemented by every adapter; a definition that
    does not declare it must still surface the implementation honestly."""
    raw = {
        "schema_version": 1, "driver": "pi", "capabilities": ["start", "observe", "finish"],
        "identity": {"harness_type": "pi", "display_name": "Pi", "description": "test", "version": "2.0"},
        "executable": {"identity": "pi", "resolver_kind": "PATH", "version_probe": ["--version"]},
        "profile": {"native_home": ".pi", "guest_home": "/runtime/home", "config_format": "json",
                    "payload_schema": "pi-profile-v1"},
        "launch_modes": [{"name": "exec", "argv": ["pi", "--mode", "json"], "io": "stdio"}],
        "runtime": {"network": "required"},
        "inputs": [],
        "continuation": {"kind": "none"},
    }
    definition = definition_from_dict(raw)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["pi"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: resolved_executable_for(tmp_path, definition),
    )
    state, detail = provider.capability_truth()["native_continuation"]
    assert state is CapabilityState.IMPLEMENTED
    assert provider.diagnostics()["capabilities"]["native_continuation"]["state"] == "implemented"


def test_diagnostics_are_bounded_and_credential_free(tmp_path):
    definition = definition_by_driver("hermes")
    provider = GenericExecutionProvider(
        definition, ADAPTERS["hermes"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: resolved_executable_for(tmp_path, definition),
    )
    rendered = repr(provider.diagnostics())
    assert len(rendered) < 4000
    for banned in ("api_key", "password", "token_value", "secret"):
        assert banned not in rendered.lower()
