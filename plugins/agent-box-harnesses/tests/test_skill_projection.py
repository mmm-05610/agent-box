"""Central Skill installation closure: installed skills reach the Harness
through the Profile Native Home, and ordinary Executions carry no SkillRef.

The SkillRef is a management/install identity only.  The five native skill
targets are evidence-backed by the NativeHomePolicy, and an installed skill
is byte-identical in the execution view where the fake/offline Harness reads
its SKILL.md (LOADED evidence, never CONSUMED).
"""
from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

import pytest

from agent_box.protocols.runtime import content_digest
from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.skill_observation import observe_loaded_skill
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.native_home.policy import FIVE_POLICIES, SKILL
from agent_box_harnesses.native_home.tree import classify_path
from agent_box_harnesses.registry import load_builtin_registry
from agent_box_skills.store import SkillStore

from helpers import make_request, resolved_executable_for


def _install_into_home(store, harness_type, profile_id, skill_id: str, source: Path):
    """Copy one central skill tree into the policy skill target of a profile,
    then RECORD it durably in the profile (new revision + refreshed native
    tree digest) so the execution freeze can verify the physical home."""
    layout = store.layout(harness_type, profile_id)
    policy = store.policy(harness_type)
    target = layout.native_home / policy.skill_targets[0] / skill_id
    target.mkdir(parents=True)
    for item in source.rglob("*"):
        if item.is_dir():
            continue
        destination = target / item.relative_to(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(item.read_bytes())
    current = store.get(harness_type, profile_id)
    store.put(harness_type, {
        "profile_id": profile_id,
        "native_payload": current["native_payload"],
    }, expected_revision=current["revision"])
    return target


def test_installed_skill_is_visible_in_the_execution_view_and_readable(tmp_path):
    """A central skill installed into the Profile native home appears in the
    execution view (no projection step, no SkillRef) and the offline Harness
    reads its SKILL.md: this is LOADED evidence."""
    from agent_box_harnesses.generic.factory import _config_renderers

    skill_source = tmp_path / "tree"
    skill_source.mkdir()
    (skill_source / "SKILL.md").write_text("---\nname: review\ndescription: d\n---\n# Review\n", encoding="utf-8")
    store = SkillStore(tmp_path / "skillstore")
    skill = store.import_directory(skill_source)
    resolved = store.resolve(skill.contract_id, store.ref("review"))
    definition = load_builtin_registry().get("claude-code")
    profile_store = ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={"claude-code": _config_renderers()["claude-code"]},
    )
    profile_store.put("claude-code", {"profile_id": "main", "native_payload": {"model": "claude-sonnet"}})
    installed = _install_into_home(profile_store, "claude-code", "main", "review", skill_source)
    assert (installed / "SKILL.md").exists()

    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _host, _sandbox, _terminal = make_request(
        tmp_path, definition, executable=executable,
        profile=profile_store.resolve("agent-box.profile@1", profile_store.ref("claude-code", "main")),
        prompt="do the task",
    )
    provider = GenericExecutionProvider(
        definition, ADAPTERS[definition.driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
        profile_store=profile_store,
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.view is not None
    view_manifest = handle.view.root / ".claude/skills/review/SKILL.md"
    assert view_manifest.read_text(encoding="utf-8") == (skill_source / "SKILL.md").read_text(encoding="utf-8")
    # the fake/offline Harness reads the native target: LOADED evidence only
    evidence = observe_loaded_skill(
        skill_id=resolved.skill_id, revision=resolved.revision, digest=resolved.digest,
        guest_root=handle.view.root / ".claude/skills/review",
    )
    assert evidence.level == "LOADED" and evidence.loaded is True
    handle.view.discard()


def test_ordinary_execution_does_not_project_skillref_inputs(tmp_path):
    """A SkillRef input on an ordinary Execution is not a projection request:
    it is ignored by the launch chain (management identity only) and the
    plan/view carry no skill copies."""
    skill_source = tmp_path / "tree"
    skill_source.mkdir()
    (skill_source / "SKILL.md").write_text("---\nname: review\ndescription: d\n---\n", encoding="utf-8")
    store = SkillStore(tmp_path / "skillstore")
    skill = store.import_directory(skill_source)
    resolved = store.resolve(skill.contract_id, store.ref("review"))
    definition = load_builtin_registry().get("codex")
    profile_store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    profile_store.put("codex", {"profile_id": "main", "native_payload": {}})
    executable = resolved_executable_for(tmp_path, definition, probe=False)

    request, _h, _s, _t = make_request(
        tmp_path, definition, executable=executable,
        profile=profile_store.resolve("agent-box.profile@1", profile_store.ref("codex", "main")),
    )
    # attach a SkillRef input the chain MUST NOT project (management identity)
    request = ExecutionStartRequest(
        request.execution_id, request.dispatch_id, request.inputs_digest,
        (*request.resolved_inputs, ResolvedExecutionInput(
            resolved.contract.contract_id,
            Ref(RefType.ARTIFACT, "agent-skills", resolved.contract.skill_id,
                metadata={"revision": str(resolved.contract.revision), "digest": resolved.contract.digest}),
            resolved,
        )),
    )
    provider = GenericExecutionProvider(
        definition, ADAPTERS[definition.driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
        profile_store=profile_store,
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.view is not None
    policy = profile_store.policy("codex")
    assert not (handle.view.root / policy.skill_targets[0]).exists()
    # the plan carried no skill copies (no agent-box.skill input slots remain)
    assert all(mount.kind != "skill-tree" for mount in handle.plan.mounts)
    handle.view.discard()


def test_five_native_skill_targets_match_the_policy(tmp_path):
    """Each Harness owns exactly one evidence-backed skill target root; the
    target classifies as SKILL and is guest-home-relative."""
    for harness_type, policy in FIVE_POLICIES.items():
        assert policy.skill_targets, harness_type
        target = policy.skill_targets[0]
        assert classify_path(policy, target + "/review/SKILL.md") == SKILL
        assert not target.startswith("/")
        assert ".." not in target.split("/")
    # all five registry harness types have a policy
    for definition in load_builtin_registry().all():
        assert definition.harness_type in FIVE_POLICIES


def test_profileless_launch_uses_empty_staging_home(tmp_path):
    definition = load_builtin_registry().get("pi")
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _h, _s, _t = make_request(
        tmp_path, definition, executable=executable, profile=None,
    )
    provider = GenericExecutionProvider(
        definition, ADAPTERS[definition.driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.view is None
    assert handle.staged_home is not None
    assert handle.staged_home.root.is_dir()
    handle.staged_home.root.parent.exists()


__all__ = ["_install_into_home"]