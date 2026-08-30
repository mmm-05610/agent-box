import subprocess
from pathlib import Path

import pytest

from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.resources import profile
from agent_box.work_core.providers.resources import (
    AgentBoxProfileResourceProvider,
    ArtifactPromptResourceProvider,
    GitWorktreeResourceProvider,
)


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        text=True,
        capture_output=True,
    ).stdout.strip()


def _repo(path: Path) -> Path:
    path.mkdir()
    _git(path, "init", "-b", "main")
    _git(path, "config", "user.name", "Agent-Box Test")
    _git(path, "config", "user.email", "agent-box@example.invalid")
    (path / "README.md").write_text("one\n", encoding="utf-8")
    _git(path, "add", "README.md")
    _git(path, "commit", "-m", "initial")
    return path


def test_git_provider_freezes_selector_and_validates_materialized_head(tmp_path):
    repo = _repo(tmp_path / "repo")
    provider = GitWorktreeResourceProvider(repo, tmp_path / "worktrees")
    ref = provider.make_ref("main", materialization_key="exec-one")

    workspace = provider.resolve(WorkspaceV1.contract_id, ref)

    assert workspace.path.is_dir()
    assert _git(workspace.path, "rev-parse", "HEAD^{commit}") == ref.native_id
    assert workspace.source_digest == f"git:{ref.native_id}"
    assert provider.resolve(WorkspaceV1.contract_id, ref) == workspace
    provider.cleanup(workspace)
    assert not workspace.path.exists()


def test_artifact_provider_rejects_content_changed_after_ref_creation(tmp_path):
    path = tmp_path / "context.md"
    path.write_text("fixed context\n", encoding="utf-8")
    provider = ArtifactPromptResourceProvider()
    ref = provider.make_ref(path, title="Execution context")
    value = provider.resolve(PromptFragmentV1.contract_id, ref)
    assert value.content == "fixed context\n"

    path.write_text("changed\n", encoding="utf-8")
    with pytest.raises(ValueError, match="digest"):
        provider.resolve(PromptFragmentV1.contract_id, ref)


def test_profile_provider_excludes_credentials_but_pins_launch_config(
    tmp_agent_box_home,
):
    profile.create("author", "codex")
    config_dir = tmp_agent_box_home / "profiles" / "author" / "dot-codex"
    (config_dir / "config.toml").write_text("model = 'gpt-5'\n", encoding="utf-8")
    (config_dir / "auth.json").write_text('{"token":"one"}\n', encoding="utf-8")
    provider = AgentBoxProfileResourceProvider()
    ref = provider.make_ref("author")

    first = provider.resolve("agent-box.profile@1", ref)
    (config_dir / "auth.json").write_text('{"token":"two"}\n', encoding="utf-8")
    (config_dir / "models_cache.json").write_text(
        '{"models":["runtime-refresh"]}\n', encoding="utf-8"
    )
    assert provider.resolve("agent-box.profile@1", ref) == first

    (config_dir / "config.toml").write_text("model = 'gpt-6'\n", encoding="utf-8")
    with pytest.raises(ValueError, match="differs"):
        provider.resolve("agent-box.profile@1", ref)
