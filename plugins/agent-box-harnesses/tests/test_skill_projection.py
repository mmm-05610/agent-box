from pathlib import Path
from tempfile import TemporaryDirectory
from shutil import copytree

from agent_box.resource_contracts import WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.registry import load_builtin_registry
from agent_box_harnesses.adapters.skill_observation import observe_loaded_skill
from agent_box_skills.store import SkillStore


def test_all_five_registry_targets_are_lossless_and_read_only():
    with TemporaryDirectory() as directory:
        tree = Path(directory) / "tree"; tree.mkdir(); (tree / "SKILL.md").write_text("---\nname: review\ndescription: d\n---\n", encoding="utf-8")
        store = SkillStore(Path(directory) / "store")
        skill = store.import_directory(tree)
        resolved = store.resolve(skill.contract_id, store.ref("review"))
        workspace = WorkspaceV1(Path(directory), "sha256:" + "b" * 64)
        for definition in load_builtin_registry().all():
            request = ExecutionStartRequest("e", "d", "inputs", (
                ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "w", "w"), workspace),
                ResolvedExecutionInput(skill.contract_id, Ref(RefType.ARTIFACT, "agent-skills", "review", metadata={"revision": "1", "digest": skill.digest, "format": "agent-skills"}), resolved),
            ))
            command = ADAPTERS[definition.driver].build_command(definition, request, {})
            source = command.runtime_sources[-1]
            assert source.kind == "skill-tree" and source.access == "ro"
            assert source.guest_target == "/runtime/home/skills/review"
            # The offline Harness target really opens the projected manifest;
            # this is LOADED evidence, never CONSUMED evidence.
            projected = Path(directory) / definition.harness_type / "runtime" / "home" / "skills" / "review"
            copytree(tree, projected)
            loaded = observe_loaded_skill(skill_id=resolved.skill_id, revision=resolved.revision, digest=resolved.digest, guest_root=projected)
            assert loaded.level == "LOADED" and loaded.loaded is True
            assert "SKILL.md" not in loaded.marker and str(tree) not in loaded.marker
