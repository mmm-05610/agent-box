"""OpenCode mode selection: explicit, declared-only, never implicit.

Native (exec) is the default; acp is an OPTIONAL second mode.  A requested
mode that is not declared fails closed at PLAN_REJECTED; a failed ACP
session never silently falls back to native inside the same attempt.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import PlanRejected
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.registry import load_builtin_registry
from helpers import definition_by_driver, make_request, resolved_executable_for

from agent_box_harnesses.adapters.opencode import OpenCodeAdapter


def opencode_provider(tmp_path: Path) -> tuple[GenericExecutionProvider, object]:
    definition = definition_by_driver("opencode")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, OpenCodeAdapter("opencode"),
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    return provider, executable


def test_registry_declares_native_default_and_acp_optional():
    registry = load_builtin_registry()
    definition = registry.get("opencode")
    names = [mode.name for mode in definition.launch_modes]
    assert names == ["exec", "acp"]
    adapter = OpenCodeAdapter("opencode")
    assert adapter.default_session_mode == "exec"
    assert set(adapter.session_mode_drivers) == {"exec", "acp"}
    assert adapter.session_mode_drivers["acp"] == "acp"


def test_default_start_selects_exec_explicitly(tmp_path):
    provider, executable = opencode_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "exec"
    assert handle.plan.argv[:2] == ("/runtime/bin/opencode", "run")


def test_explicit_acp_mode_plans_acp_argv_without_prompt(tmp_path):
    provider, executable = opencode_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable, prompt="solve it")
    receipt = provider.start_mode(request, launch_mode="acp")
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "acp"
    assert handle.plan.argv == ("/runtime/bin/opencode", "acp")
    # the prompt travels over the protocol, never in argv
    assert "solve it" not in handle.plan.argv
    assert "OPENCODE_ACP_PROMPT_SENT_VIA_PROTOCOL" in handle.plan.warnings


def test_undeclared_mode_fails_closed_no_first_fallback(tmp_path):
    provider, executable = opencode_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable)
    with pytest.raises(PlanRejected) as exc:
        provider.start_mode(request, launch_mode="interactive-missing")
    assert exc.value.code == "LAUNCH_MODE_UNDECLARED"


def test_invalid_mode_argument_rejected(tmp_path):
    provider, executable = opencode_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable)
    with pytest.raises(PlanRejected) as exc:
        provider.start_mode(request, launch_mode="")
    assert exc.value.code == "LAUNCH_MODE_INVALID"


def test_acp_mode_plans_protocol_continuation_without_argv_injection(tmp_path):
    from agent_box_harnesses.opencode.provider import OpenCodeContinuationV1

    definition = definition_by_driver("opencode")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    provider = GenericExecutionProvider(
        definition, ADAPTERS["opencode"], staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    continuation = OpenCodeContinuationV1("session-abc")
    request, *_ = make_request(tmp_path, provider.definition, executable=executable, extra_inputs=(continuation,))
    receipt = provider.start_mode(request, launch_mode="acp")
    handle = receipt.runtime_handle
    assert handle.plan.launch_mode_name == "acp"
    # continuation is carried for the driver (protocol resume), never as argv
    assert handle.plan.continuation is not None
    assert handle.plan.continuation.kind == "driver_resume"
    assert "-s" not in handle.plan.argv and "session-abc" not in handle.plan.argv
    assert handle.plan.continuation.argv == ()


def test_attach_failure_never_falls_back_to_native(tmp_path):
    """Unknown-mode attach raises; the handle keeps no driver and native is unchanged."""
    provider, executable = opencode_provider(tmp_path)
    request, *_ = make_request(tmp_path, provider.definition, executable=executable)
    receipt = provider.start(request)  # exec mode
    handle = receipt.runtime_handle
    assert handle.session_driver is None
    with pytest.raises(Exception):
        provider.attach_session_driver("no-such-dispatch")
    observations = provider.observe(handle)  # legacy native path unchanged
    assert len(observations) > 0


def test_session_driver_capability_truth_opencode_acp():
    from agent_box_harnesses.opencode.acp import opencode_acp_driver_factory
    from agent_box_harnesses.session.spi import SessionCapability

    definition = definition_by_driver("opencode")
    adapter = ADAPTERS["opencode"]
    driver = opencode_acp_driver_factory(adapter, definition)
    capabilities = driver.capabilities()
    assert capabilities["streaming"] is SessionCapability.SUPPORTED
    assert capabilities["permission"] is SessionCapability.SUPPORTED
    assert capabilities["question"] is SessionCapability.UNSUPPORTED
    assert capabilities["plan"] is SessionCapability.UNSUPPORTED
    assert capabilities["usage_cost"] is SessionCapability.SUPPORTED