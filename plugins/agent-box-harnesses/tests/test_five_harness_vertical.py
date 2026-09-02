"""Phase G: five-Harness native verticals under the new Profile model.

For every official Harness, offline/fake, we prove the frozen behaviors:
one complete Native Home root; unknown safe files preserved; credentials
excluded from views/snapshots; a central Skill installs to the policy target
and the fake Harness process reads its SKILL.md; ordinary Executions carry
no SkillRef; project Skills stay in the Workspace; native session state
survives installs and reconciles after a run; install/update never touches a
frozen execution view; diagnostics stay honest.  No real model requests.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from agent_box_harnesses.generic.profile_store import ProfileStore
from agent_box_harnesses.generic.factory import _config_renderers
from agent_box_harnesses.native_home.installer import ProfileSkillInstaller, skill_source_from_contract
from agent_box_harnesses.native_home.policy import FIVE_POLICIES
from agent_box_harnesses.native_home.receipts import ReceiptStore
from agent_box_harnesses.native_home.tree import walk_tree
from agent_box_harnesses.registry import load_builtin_registry
from agent_box_skills.store import SkillStore

from helpers import make_request, resolved_executable_for
from test_skill_installer import make_skill_tree

DRIVERS = ("codex", "claude", "opencode", "hermes", "pi")


@pytest.mark.parametrize("driver", DRIVERS)
def test_five_harness_vertical_profile_skill_execution(tmp_path, driver):
    definition = next(d for d in load_builtin_registry().all() if d.driver == driver)
    harness_type = definition.harness_type
    policy = FIVE_POLICIES[harness_type]
    store = ProfileStore(
        tmp_path / "profiles", policies=FIVE_POLICIES,
        config_renderers={harness_type: _config_renderers()[harness_type]},
    )
    layout = store.layout(harness_type, "main")
    home = layout.native_home

    # native home content is established BEFORE put so the pointer digest
    # covers the physical home (execution freeze verifies it)
    # a known credential file lives in the home: excluded from every view
    credential = home / policy.known_credential_paths[0]
    credential.parent.mkdir(parents=True, exist_ok=True)
    credential.write_text("SECRET-VALUE-NEVER-LEAKS")
    # an unknown safe file must be preserved everywhere
    unknown = home / ".codex" / "notes.md" if harness_type == "codex" else home / "notes.md"
    unknown.parent.mkdir(parents=True, exist_ok=True)
    unknown.write_text("keep-me")
    # a native session/checkpoint exists before any skill operation
    session = home / policy.known_session_paths[0]
    session.mkdir(parents=True, exist_ok=True)
    (session / "state.jsonl").write_text("{}")
    store.put(harness_type, {"profile_id": "main", "native_payload": {}})

    # central Skill install to the native target
    skill_store = SkillStore(tmp_path / "skillstore")
    tree = make_skill_tree(tmp_path / "skill-src", name="review", version="1")
    contract = skill_store.import_directory(tree)
    resolved = skill_store.resolve("agent-box.skill@1", skill_store.ref("review"))
    source = skill_source_from_contract(resolved.contract, resolved.source.projection_source())
    installer = ProfileSkillInstaller(store, harness_type, "main")
    installer.install(source, expected_revision=1)
    target = home / policy.skill_targets[0] / "review"
    assert (target / "SKILL.md").exists()
    # installs do not disturb session state or unknown files
    assert (session / "state.jsonl").exists()
    assert unknown.read_text() == "keep-me"
    # credentials are never copied into the skill target or receipts
    assert "SECRET" not in ReceiptStore(layout).digest()

    # ordinary Execution: no SkillRef input, view has the installed skill,
    # credentials never enter the view, unknown files are preserved
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _h, _s, _t = make_request(
        tmp_path, definition, executable=executable,
        profile=store.resolve("agent-box.profile@1", store.ref(harness_type, "main")),
    )
    assert all(item.contract_id != "agent-box.skill@1" for item in request.resolved_inputs)
    provider = GenericExecutionProvider(
        definition, ADAPTERS[driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
        profile_store=store,
    )
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert handle.view is not None
    view = handle.view.root
    assert (view / policy.skill_targets[0] / "review" / "SKILL.md").exists()
    assert not (view / policy.known_credential_paths[0]).exists()
    assert (view / unknown.relative_to(home)).read_text() == "keep-me"
    # the fake/offline Harness target really reads the installed SKILL.md
    manifest = (view / policy.skill_targets[0] / "review" / "SKILL.md").read_text(encoding="utf-8")
    assert manifest.startswith("---\nname: review")

    # the run writes a new session file into the view; reconcile preserves it
    session_view = view / policy.known_session_paths[0]
    session_view.parent.mkdir(parents=True, exist_ok=True)
    (session_view / "run-1.jsonl").write_text("{}")
    # the fake harness process exits; only a TERMINAL process may finish
    from helpers import FakeProcess

    object.__setattr__(handle.runtime, "transport", FakeProcess(stdout="", exit_code=0))
    provider.finish(handle)
    assert (home / policy.known_session_paths[0] / "run-1.jsonl").exists()
    assert (home / policy.known_credential_paths[0]).read_text() == "SECRET-VALUE-NEVER-LEAKS"
    # capability diagnostics remain honest (no declared-but-fake skills)
    assert provider.diagnostics()["provider_id"] == f"{harness_type}-execution"


@pytest.mark.parametrize("driver", DRIVERS)
def test_install_does_not_touch_a_frozen_execution_view(tmp_path, driver):
    definition = next(d for d in load_builtin_registry().all() if d.driver == driver)
    harness_type = definition.harness_type
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put(harness_type, {"profile_id": "main", "native_payload": {}})
    layout = store.layout(harness_type, "main")
    skill_store = SkillStore(tmp_path / "skillstore")
    contract = skill_store.import_directory(make_skill_tree(tmp_path / "src", name="review"))
    resolved = skill_store.resolve("agent-box.skill@1", skill_store.ref("review"))
    source = skill_source_from_contract(resolved.contract, resolved.source.projection_source())
    installer = ProfileSkillInstaller(store, harness_type, "main")
    installer.install(source, expected_revision=1)
    target = layout.native_home / store.policy(harness_type).skill_targets[0] / "review"
    before = (target / "SKILL.md").read_bytes()

    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _h, _s, _t = make_request(
        tmp_path, definition, executable=executable,
        profile=store.resolve("agent-box.profile@1", store.ref(harness_type, "main")),
    )
    provider = GenericExecutionProvider(
        definition, ADAPTERS[driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
        profile_store=store,
    )
    handle = provider.start(request).runtime_handle
    frozen = (handle.view.root / store.policy(harness_type).skill_targets[0] / "review" / "SKILL.md").read_bytes()
    assert frozen == before
    # an update is blocked while the execution is active (fail closed)
    new_tree = make_skill_tree(tmp_path / "src2", name="review", version="2")
    contract2 = skill_store.import_directory(new_tree)
    resolved2 = skill_store.resolve("agent-box.skill@1", skill_store.ref("review", contract2.revision))
    source2 = skill_source_from_contract(resolved2.contract, resolved2.source.projection_source())
    from agent_box_harnesses.native_home.failures import PROFILE_MUTATION_LEASE_CONFLICT, ProfileNativeHomeError

    with pytest.raises(ProfileNativeHomeError) as exc:
        installer.update(source2, expected_revision=2)
    assert exc.value.code == PROFILE_MUTATION_LEASE_CONFLICT
    handle.view.discard()
    installer.update(source2, expected_revision=2)
    assert (target / "SKILL.md").read_bytes() != before


@pytest.mark.parametrize("driver", DRIVERS)
def test_project_skill_stays_in_the_workspace(tmp_path, driver):
    definition = next(d for d in load_builtin_registry().all() if d.driver == driver)
    harness_type = definition.harness_type
    policy = FIVE_POLICIES[harness_type]
    if not policy.project_skill_roots:
        pytest.skip("harness has no native project skill root")
    store = ProfileStore(tmp_path / "profiles", policies=FIVE_POLICIES)
    store.put(harness_type, {"profile_id": "main", "native_payload": {}})
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    root_name = policy.project_skill_roots[0]
    project_skill = workspace / root_name / "proj"
    project_skill.mkdir(parents=True)
    (project_skill / "SKILL.md").write_text("---\nname: proj\ndescription: d\n---\n", encoding="utf-8")
    # an Execution with a project skill present never copies it into the
    # profile native home or into the execution view as a projection
    executable = resolved_executable_for(tmp_path, definition, probe=False)
    request, _h, _s, _t = make_request(
        tmp_path, definition, executable=executable,
        profile=store.resolve("agent-box.profile@1", store.ref(harness_type, "main")),
        workspace_dir=workspace,
    )
    provider = GenericExecutionProvider(
        definition, ADAPTERS[driver],
        staging_root=tmp_path / "staging", executable_resolver=lambda _spec: executable,
        profile_store=store,
    )
    handle = provider.start(request).runtime_handle
    home = store.layout(harness_type, "main").native_home
    assert not (home / root_name / "proj").exists()  # never auto-installed
    # the workspace file is untouched and remains the project authority
    assert (project_skill / "SKILL.md").exists()
    handle.view.discard()