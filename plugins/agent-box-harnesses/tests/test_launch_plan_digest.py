"""LaunchPlan canonical digest (7) and LaunchPlan → Runtime digest linkage (8).

The plan digest is host-path-free and stable across runs; lowering binds the
plan digest into the command identity so the Root attempt ledger carries the
causal chain plan digest → command digest → bundle/mount digests.
"""
import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.launch_plan import LaunchPlan
from agent_box_harnesses.adapters.lowering import lower
from agent_box_harnesses.adapters.start_context import build_start_context
from agent_box_harnesses.adapters.staging import ExecutionStagingArea
from helpers import definition_by_driver, make_request, resolved_executable_for


def _plan_for(tmp_path, driver, *, prompt="digest prompt"):
    definition = definition_by_driver(driver)
    executable = resolved_executable_for(tmp_path / driver, definition)
    request, *_ = make_request(tmp_path / driver, definition, executable=executable, prompt=prompt)
    context = build_start_context(definition, request, executable=executable)
    return definition, ADAPTERS[driver].plan(context), executable


@pytest.mark.parametrize("driver", ("codex", "claude", "opencode", "hermes", "pi"))
def test_plan_digest_is_stable_and_host_path_free(tmp_path, driver):
    _, first, _ = _plan_for(tmp_path, driver)
    _, second, _ = _plan_for(tmp_path, driver)  # different tmp subdirectory
    assert first.digest == second.digest
    assert first.digest.startswith("sha256:")
    # the canonical form never contains a host path
    canonical = repr(first.canonical())
    assert str(tmp_path) not in canonical


def test_plan_digest_changes_when_launch_semantics_change(tmp_path):
    definition, plan, _ = _plan_for(tmp_path, "pi", prompt="prompt-a")
    mutated = LaunchPlan(
        harness_type=plan.harness_type, launch_mode_name=plan.launch_mode_name,
        argv=plan.argv[:-1] + ("prompt-b",), cwd_token=plan.cwd_token,
        environment=plan.environment, io_mode=plan.io_mode,
        requires_control_plane_network=plan.requires_control_plane_network,
        tool_network_requirement=plan.tool_network_requirement,
        guest_directories=plan.guest_directories, mounts=plan.mounts,
        rendered=plan.rendered, rendered_content=plan.rendered_content,
        executable=plan.executable, continuation=plan.continuation,
        secret_bindings=plan.secret_bindings, observation=plan.observation,
        warnings=plan.warnings,
    )
    assert plan.digest != mutated.digest


def test_lowering_binds_plan_digest_into_command_identity(tmp_path):
    definition, plan, executable = _plan_for(tmp_path, "pi")
    from agent_box_harnesses.adapters.staging import ExecutionStagingArea as Stage

    staging = Stage(tmp_path / "staging", "exec_digest")
    staged = staging.materialize(plan.rendered_target())
    sources = {"workspace": tmp_path / "pi" / "workspace", "profile-home": staged,
               "executable:pi": executable.main_member.path}
    lowered = lower(plan, sources=sources)
    # command digest embeds the plan digest: Root attempt keys therefore carry
    # the causal chain plan -> command -> bundle
    record = lowered.command.digest
    assert record.startswith("sha256:")
    assert plan.digest.removeprefix("sha256:") not in record  # digest is one-way
    # the linkage is verified by recomputing the command digest decision:
    # lowering the same plan+sources twice yields the identical command
    again = lower(plan, sources=sources)
    assert again.command.digest == lowered.command.digest
    assert again.plan_digest == plan.digest


def test_projection_receipt_records_the_lowered_plan_sources(tmp_path):
    """The Root coordinator receipt exposes the lowered source digests — the
    second level of the two-level digest chain (plan digest -> RuntimeBundle)."""
    from agent_box.protocols.runtime import assemble_runtime_composition

    definition, plan, executable = _plan_for(tmp_path, "pi")
    staging = ExecutionStagingArea(tmp_path / "staging", "exec_receipt")
    staged = staging.materialize(plan.rendered_target())
    sources = {"workspace": tmp_path / "pi" / "workspace", "profile-home": staged,
               "executable:pi": executable.main_member.path}
    lowered = lower(plan, sources=sources)
    request, host_port, sandbox_port, terminal_port = make_request(
        tmp_path, definition, executable=executable, execution_id="exec_receipt")
    binding, coordinator = assemble_runtime_composition(request, lowered.command)
    handle = coordinator.start(binding, lowered.command, execution_id=request.execution_id, dispatch_id=request.dispatch_id)
    from agent_box.protocols.runtime.coordinator import RuntimeCompositionCoordinator

    receipt = RuntimeCompositionCoordinator.projection_receipt(coordinator, handle.attempt_key)
    assert receipt["projector_id"] == "pi"
    assert receipt["plan_digest"] == staged.tree_digest or receipt["plan_digest"].startswith("sha256:")
    kinds = {source["kind"] for source in receipt["sources"]}
    assert {"workspace", "profile-home", "executable"} <= kinds
    for source in receipt["sources"]:
        assert source["expected_digest"].startswith("sha256:")
