"""Determined repair C: executable resolution, bundle staging and drift.

Synthetic executables/bundles only; the optional bwrap vertical is skipped
when the real sandbox capability probe does not pass.
"""
from pathlib import Path

import pytest

from agent_box.protocols.runtime import content_digest
from agent_box_harnesses.adapters.failures import MaterializationFailed
from agent_box_harnesses.adapters.launch_plan import LaunchPlan
from agent_box_harnesses.adapters.lowering import lower
from agent_box_harnesses.adapters.start_context import build_start_context
from agent_box_harnesses.adapters.staging import ExecutionStagingArea
from agent_box_harnesses.registry.schema import ExecutableSpec
from agent_box_harnesses.resources.executable import (
    ExecutableResolutionError, resolve_executable,
)
from helpers import (
    definition_by_driver, make_fake_executable, make_request,
    resolved_executable_for,
)


def test_resolution_is_typed_and_version_probed(tmp_path):
    binary = make_fake_executable(tmp_path / "bin", "codex", version="9.9.9-test")
    spec = ExecutableSpec(identity="codex", resolver_kind="PATH", version_probe=["--version"])
    resolved = resolve_executable(spec, search_path=str(tmp_path / "bin"), probe=True)
    assert resolved.identity == "codex"
    assert resolved.version == "codex 9.9.9-test"
    assert resolved.digest.startswith("sha256:") and resolved.digest == content_digest(binary)
    assert resolved.main_member.path == binary
    assert resolved.guest_target() == "/runtime/bin/codex"


def test_resolution_never_depends_on_the_host_path_environment(tmp_path):
    make_fake_executable(tmp_path / "bin", "pi")
    spec = ExecutableSpec(identity="pi", resolver_kind="PATH", version_probe=())
    resolved = resolve_executable(spec, search_path=str(tmp_path / "bin"), probe=False)
    assert resolved.source_path == tmp_path / "bin" / "pi"
    with pytest.raises(ExecutableResolutionError):
        resolve_executable(ExecutableSpec(identity="pi", resolver_kind="PATH", version_probe=()), search_path=str(tmp_path / "empty"))


def test_bundle_members_are_verified_and_staged(tmp_path):
    make_fake_executable(tmp_path / "bin", "synthetic")
    make_fake_executable(tmp_path / "bin", "synthetic-companion")
    spec = ExecutableSpec(identity="synthetic", resolver_kind="PATH_OR_BUNDLE",
                          bundle_members=("synthetic-companion",), version_probe=())
    resolved = resolve_executable(spec, search_path=str(tmp_path / "bin"), probe=False)
    assert {member.name for member in resolved.members} == {"synthetic", "synthetic-companion"}
    with pytest.raises(ExecutableResolutionError, match="BUNDLE_MEMBER_MISSING"):
        resolve_executable(ExecutableSpec(identity="synthetic", resolver_kind="PATH_OR_BUNDLE",
                                          bundle_members=("missing-companion",), version_probe=()),
                           search_path=str(tmp_path / "bin"), probe=False)


def test_lowering_declares_the_full_bundle_read_only(tmp_path):
    definition = definition_by_driver("codex")
    make_fake_executable(tmp_path / "bin", "codex")
    make_fake_executable(tmp_path / "bin", "codex-companion")
    spec = ExecutableSpec(identity="codex", resolver_kind="PATH_OR_BUNDLE",
                          bundle_members=("codex-companion",), version_probe=())
    from agent_box_harnesses.resources.executable import resolve_executable as resolve

    executable = resolve(spec, search_path=str(tmp_path / "bin"), probe=False)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS_PLAN(definition, request, executable)
    sources = {f"executable:{member.name}": member.path for member in executable.members}
    sources["workspace"] = tmp_path / "workspace"
    # profile-home must come from a staged home; use an empty staging pass
    staging = ExecutionStagingArea(tmp_path / "staging", "exec_exe")
    staged = staging.materialize(plan.rendered_target())
    sources["profile-home"] = staged
    lowered = lower(plan, sources=sources)
    executable_sources = [s for s in lowered.command.runtime_sources if s.kind == "executable"]
    assert {s.guest_target for s in executable_sources} == {"/runtime/bin/codex", "/runtime/bin/codex-companion"}
    assert all(s.access == "ro" for s in executable_sources)


def ADAPTERS_PLAN(definition, request, executable) -> LaunchPlan:
    from agent_box_harnesses.adapters import ADAPTERS
    from agent_box_harnesses.adapters.start_context import build_start_context as build

    return ADAPTERS[definition.driver].plan(build(definition, request, executable=executable))


def test_lowering_drift_fail_closed(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS_PLAN(definition, request, executable)
    # mutate the executable after planning: the digest must drift
    executable_path = tmp_path / "bin" / "pi"
    executable_path.write_text("#!/bin/sh\necho tampered\n")
    sources = {"workspace": tmp_path / "workspace", "profile-home": _staged(tmp_path, plan),
               "executable:pi": executable_path}
    with pytest.raises(MaterializationFailed, match="SOURCE_DIGEST_DRIFT"):
        lower(plan, sources=sources)


def _staged(tmp_path, plan):
    staging = ExecutionStagingArea(tmp_path / "staging2", plan and "exec_drift")
    return staging.materialize(plan.rendered_target())


def test_workspace_digest_drift_fail_closed(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS_PLAN(definition, request, executable)
    fake_workspace = tmp_path / "other"; fake_workspace.mkdir(); (fake_workspace / "x.txt").write_text("different")
    sources = {"workspace": fake_workspace, "profile-home": _staged(tmp_path, plan),
               "executable:pi": tmp_path / "bin" / "pi"}
    with pytest.raises(MaterializationFailed, match="SOURCE_DIGEST_DRIFT"):
        lower(plan, sources=sources)


def test_unresolved_source_key_fail_closed(tmp_path):
    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(tmp_path, definition, executable=executable)
    plan = ADAPTERS_PLAN(definition, request, executable)
    with pytest.raises(MaterializationFailed, match="SOURCE_UNRESOLVED"):
        lower(plan, sources={})


def test_synthetic_executable_reaches_the_real_sandbox_projection(tmp_path):
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    from agent_box.protocols.runtime import assemble_runtime_composition
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider
    from agent_box.work_core import ResolvedExecutionInput

    provider = BwrapSandboxProvider(tmp_path / "sandbox")
    if provider.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")

    definition = definition_by_driver("pi")
    executable = resolved_executable_for(tmp_path, definition)
    request, _host, _sandbox, terminal = make_request(tmp_path, definition, executable=executable, affinity="local:bwrap")
    plan = ADAPTERS_PLAN(definition, request, executable)
    staging = ExecutionStagingArea(tmp_path / "staging", "exec_bwrap")
    staged = staging.materialize(plan.rendered_target())
    sources = {"workspace": tmp_path / "workspace", "profile-home": staged,
               "executable:pi": executable.main_member.path}

    sandbox_ref = provider.make_ref("bwrap-cloud-harness")  # network inherit: these plans require model network
    resolved_sandbox = provider.resolve("agent-box.sandbox@1", sandbox_ref)
    spliced_inputs = tuple(
        ResolvedExecutionInput(item.contract_id, resolved_sandbox.ref, resolved_sandbox)
        if item.contract_id == "agent-box.sandbox@1" else item
        for item in request.resolved_inputs
    )
    spliced = type(request)(request.execution_id, request.dispatch_id, request.inputs_digest, spliced_inputs)

    lowered = lower(plan, sources=sources)
    binding, coordinator = assemble_runtime_composition(spliced, lowered.command)
    registered = {str(path) for path, _ in resolved_sandbox.port.provider._sources.values()}
    assert str(executable.main_member.path) in registered   # synthetic binary staged read-only
    assert str(staged.root) in registered                   # rendered home staged
    coordinator.start(binding, lowered.command, execution_id=request.execution_id, dispatch_id=request.dispatch_id)
    # the real bwrap wrap compiled a guest argv whose binary is the read-only
    # staged synthetic executable
    assert terminal.specs, "sandbox wrap must have produced an isolated spec"
    argv = terminal.specs[-1].local_argv
    assert argv[argv.index("--") + 1] == "/runtime/bin/pi"
    assert any("--ro-bind" == argv[i] and argv[i + 2] == "/runtime/bin/pi" for i in range(len(argv) - 2))
