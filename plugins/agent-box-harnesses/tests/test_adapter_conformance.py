"""Determined repair D: the five Adapters are no longer empty shells.

Conformance: each adapter implements the typed SPI, owns distinct native
facts, and reports unimplemented capabilities honestly.
"""
import inspect
from pathlib import Path

import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.base import HarnessAdapter
from agent_box_harnesses.adapters.start_context import build_start_context
from agent_box_harnesses.native_home.policy import policy_for
from agent_box_harnesses.registry import load_builtin_registry
from helpers import definition_by_driver, make_request, resolved_executable_for

FIVE = ("codex", "claude", "opencode", "hermes", "pi")


def test_all_five_adapters_are_registered_and_typed():
    registry = load_builtin_registry()
    assert {d.driver for d in registry.all()} == set(FIVE)
    for definition in registry.all():
        adapter = ADAPTERS[definition.driver]
        assert isinstance(adapter, HarnessAdapter), definition.driver
        assert adapter.harness_type == definition.harness_type


def test_no_adapter_is_an_empty_subclass():
    from agent_box_harnesses.adapters.generic_cli import GenericCliAdapter

    for driver in FIVE:
        adapter = ADAPTERS[driver]
        own_source = inspect.getsource(type(adapter))
        # every adapter must own real content beyond the shared import line
        assert "GenericCliAdapter): pass" not in own_source, driver
        assert own_source.count("def ") >= 2, driver


@pytest.mark.parametrize("driver", FIVE)
def test_adapters_implement_the_full_typed_surface(driver):
    adapter = ADAPTERS[driver]
    assert {"start", "observe", "finish"} <= adapter.implemented_capabilities
    # native payload validation
    adapter.validate_native_payload({})
    with pytest.raises(ValueError):
        adapter.validate_native_payload("not-an-object")
    # decoder exists and is harness-owned
    assert adapter.decoder.id and adapter.decoder.harness_type == adapter.harness_type
    # native home isolation facts
    assert adapter.native_home_env and adapter.native_home_guest.startswith("/runtime/home")
    # skill targets are owned by the NativeHomePolicy (not adapter decoration)
    policy = policy_for(adapter.harness_type)
    assert policy.skill_targets and policy.skill_targets[0]
    assert not policy.skill_targets[0].startswith("/")


@pytest.mark.parametrize("driver", FIVE)
def test_planning_produces_a_private_launch_plan(tmp_path, driver):
    definition = definition_by_driver(driver)
    executable = resolved_executable_for(tmp_path / driver, definition)
    request, *_ = make_request(tmp_path / driver, definition, executable=executable, prompt="plan it")
    context = build_start_context(definition, request, executable=executable)
    plan = ADAPTERS[definition.driver].plan(context)
    assert plan.argv[0] == f"/runtime/bin/{definition.executable.identity}"
    assert plan.argv[-1].endswith("plan it")
    assert plan.cwd_token == "/workspace"
    assert plan.launch_mode_name == "exec"
    assert plan.requires_control_plane_network is True
    kinds = {mount.kind for mount in plan.mounts}
    assert {"workspace", "profile-home"} <= kinds
    assert any(mount.access == "ro" and mount.kind == "executable" for mount in plan.mounts)
    assert plan.observation.decoder_id == ADAPTERS[driver].decoder.id


@pytest.mark.parametrize("driver,unimplemented", [
    ("codex", {"attach", "permissions", "steer"}),
    ("claude", {"attach", "permissions", "steer"}),
    ("opencode", {"attach", "permissions", "steer"}),
    ("hermes", {"attach", "permissions", "steer", "stream"}),
    ("pi", {"attach", "permissions", "steer"}),
])
def test_unimplemented_control_capabilities_are_not_claimed(driver, unimplemented):
    adapter = ADAPTERS[driver]
    overlap = unimplemented & set(adapter.implemented_capabilities)
    assert not overlap, f"{driver} fakes implementations for {sorted(overlap)}"


def test_permission_transport_and_attach_are_not_implemented_anywhere():
    for driver in FIVE:
        adapter = ADAPTERS[driver]
        assert "permissions" not in adapter.implemented_capabilities
        assert "attach" not in adapter.implemented_capabilities
        assert "steer" not in adapter.implemented_capabilities


def test_session_locator_capability_differs_where_native_facts_differ():
    # all five expose a session locator through their structured outputs
    for driver in FIVE:
        assert ADAPTERS[driver].decoder.id
    # hermes has no structured stdout event stream at all
    assert "stream" not in ADAPTERS["hermes"].implemented_capabilities


def test_native_facts_are_not_flattened_across_harnesses():
    home_facts = {driver: (ADAPTERS[driver].native_home_env, ADAPTERS[driver].native_home_guest) for driver in FIVE}
    assert len(set(home_facts.values())) == len(FIVE), home_facts
    config_paths = {ADAPTERS[d].config_guest_path for d in FIVE}
    assert len(config_paths) == len(FIVE)


def test_hermes_declares_site_packages_staging_gap(tmp_path):
    adapter = ADAPTERS["hermes"]
    assert any("SITE_PACKAGES" in warning for warning in adapter.executable_warnings)
    definition = definition_by_driver("hermes")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = adapter.plan(build_start_context(definition, request, executable=executable))
    assert any("HERMES_SITE_PACKAGES_NOT_STAGED" in warning for warning in plan.warnings)


def test_pi_declares_project_trust_gap(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS["pi"].plan(build_start_context(definition, request, executable=executable))
    assert "PI_PROJECT_TRUST_UNDECIDED_PROJECT_RESOURCES_IGNORED" in plan.warnings


def test_opencode_declares_preflight_risk_information(tmp_path):
    definition = definition_by_driver("opencode")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS["opencode"].plan(build_start_context(definition, request, executable=executable))
    assert "OPENCODE_NO_CREDENTIAL_HANG_HOST_TIMEOUT_REQUIRED" in plan.warnings
    assert "OPENCODE_PERMISSIONS_AUTO_REJECTED_WITHOUT_EXPLICIT_POLICY" in plan.warnings


def test_codex_continuation_plans_exec_resume(tmp_path):
    from agent_box_harnesses.codex.contracts import CodexContinuationV1

    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(
        tmp_path, definition, executable=executable,
        prompt="continue", extra_inputs=(CodexContinuationV1("thread-abc"),),
    )
    plan = ADAPTERS["codex"].plan(build_start_context(definition, request, executable=executable))
    assert plan.continuation is not None and plan.continuation.session_locator == "thread-abc"
    assert "resume" in plan.argv and "thread-abc" in plan.argv


def test_pi_continuation_plans_native_session_flag(tmp_path):
    from agent_box_harnesses.pi.contract import PiContinuationV1

    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    continuation = PiContinuationV1("e1", provider="deepseek")
    request, *_ = make_request(tmp_path, definition, executable=executable, extra_inputs=(continuation,))
    plan = ADAPTERS["pi"].plan(build_start_context(definition, request, executable=executable))
    assert plan.continuation is not None
    assert "--session" in plan.argv
