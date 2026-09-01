"""Architecture Repair Phase 2: ProjectionPlan / RuntimeBundle / Assembler.

Proves the generic assembler has no resource-contract or guest-path
knowledge, that every Harness projector declares its own layout through the
typed source model, that source integrity is fail closed, and that the
removed fallback paths stay removed.
"""
from __future__ import annotations

import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

from agent_box.extensions.runtime_composition import (
    HarnessCommandSpec,
    IsolatedProcessSpec,
    RuntimeHostRef,
    RuntimeSourceDeclaration,
    SandboxRef,
    SandboxV1,
    TerminalAllocation,
    TerminalRunHandle,
    TerminalSessionRef,
    TerminalSessionV1,
    RuntimeHostV1,
    assemble_runtime_composition,
    content_digest,
    declare_source,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
ASSEMBLER_PATH = REPO_ROOT / "src" / "agent_box" / "extensions" / "runtime_composition" / "assembler.py"


class _FakeSandboxPort:
    def __init__(self, ref: SandboxRef) -> None:
        self.ref = ref
        self.capabilities = {"isolation.wrap@1": "supported"}
        self.provider = self
        self._sources: dict[str, tuple[Path, str | None]] = {}

    def register_prepared_source(self, token: str, path: Path, *, authorized_scope: str | None = None) -> None:
        self._sources[token] = (Path(path), authorized_scope)

    def wrap(self, mount_plan, command, *, attempt_key: str) -> IsolatedProcessSpec:
        return IsolatedProcessSpec("spawn:" + attempt_key, attempt_key, "digest", command.io_mode, tuple(command.argv))


class _FakeHostPort:
    def __init__(self, ref: RuntimeHostRef) -> None:
        self.ref = ref
        self.capabilities = {"process.spawn.typed@1": "supported"}
        self.transport = SimpleNamespace(submit=lambda operation: "native")

    def stage(self, bundle):
        return bundle


class _FakeTerminalPort:
    def __init__(self, ref: TerminalSessionRef) -> None:
        self.ref = ref
        self.capabilities = {"terminal.run@1": "supported"}

    def allocate(self) -> TerminalAllocation:
        return TerminalAllocation("alloc-1", self.ref, "sha256:allocation")

    def run(self, transport, spec, attempt_key: str) -> TerminalRunHandle:
        return TerminalRunHandle(attempt_key, "native-correlation", "running", "alloc-1")


def _affinity() -> str:
    return "local:test:linux:x86_64:test-root"


def _runtime_request(affinity: str) -> tuple[SimpleNamespace, _FakeSandboxPort]:
    host = RuntimeHostV1(RuntimeHostRef("runtime-host-local", "h", "sha256:host", affinity), _FakeHostPort(RuntimeHostRef("runtime-host-local", "h", "sha256:host", affinity)))
    sandbox_port = _FakeSandboxPort(SandboxRef("fake-sandbox", "s", "sha256:policy", affinity))
    sandbox = SandboxV1(sandbox_port.ref, sandbox_port)
    terminal = TerminalSessionV1(TerminalSessionRef("direct-stdio", "t", "sha256:term", affinity), _FakeTerminalPort(TerminalSessionRef("direct-stdio", "t", "sha256:term", affinity)))
    request = SimpleNamespace(resolved_inputs=(
        # Deliberately no workspace/credential/profile input at all: the
        # assembler must not need any resource contract value.
        SimpleNamespace(contract_id=RuntimeHostV1.contract_id, value=host),
        SimpleNamespace(contract_id=SandboxV1.contract_id, value=sandbox),
        SimpleNamespace(contract_id=TerminalSessionV1.contract_id, value=terminal),
    ))
    return request, sandbox_port


# 1. The assembler knows no resource contract and no guest path convention.
def test_assembler_has_no_resource_contract_or_guest_path_knowledge():
    text = ASSEMBLER_PATH.read_text(encoding="utf-8")
    assert "agent-box.workspace@1" not in text
    assert "WorkspaceV1" not in text
    assert '"/workspace"' not in text
    assert "runtime/home" not in text
    assert "content_digest(path)" in text  # the single formal integrity helper


# 2 + 4. Any declared tree source assembles without a Git plugin or a
# workspace contract input; a fake harness may target a non-/workspace path.
def test_assembler_mounts_any_declared_tree_without_git_plugin(tmp_path):
    tree = tmp_path / "tree"
    tree.mkdir()
    (tree / "a.txt").write_text("x", encoding="utf-8")
    command = HarnessCommandSpec(
        ("run",), "/project",
        runtime_sources=(declare_source("workspace", tree, "/project", access="rw", provenance="workspace"),),
        projector_id="fake-harness",
    )
    request, sandbox_port = _runtime_request(_affinity())
    binding, coordinator = assemble_runtime_composition(request, command)
    resolved = coordinator._resolver(binding)
    assert resolved.sandbox is sandbox_port
    handle = coordinator.start(binding, command, execution_id="e1", dispatch_id="d1")
    receipt = coordinator.projection_receipt(handle.attempt_key)
    assert receipt["status"] == "PROJECTED"
    assert receipt["projector_id"] == "fake-harness"
    assert receipt["sandbox_provider"] == "fake-sandbox"
    sources = {s["guest_target"]: s for s in receipt["sources"]}
    assert sources["/project"]["kind"] == "workspace"
    assert sources["/project"]["access"] == "rw"
    assert sources["/project"]["expected_digest"] == content_digest(tree)
    assert receipt["warnings"] == ()


# 3. The real Codex projector declares the workspace explicitly.
def test_codex_projector_declares_workspace_layout(tmp_path):
    from agent_box_harnesses.codex.composition import command_from_plan

    executable = tmp_path / "codex"
    executable.write_text("#!/bin/sh\n", encoding="utf-8")
    executable.chmod(0o755)
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "file.txt").write_text("w", encoding="utf-8")
    command = command_from_plan(
        SimpleNamespace(argv=(str(executable), "app-server", "--stdio"), env={}, cwd=workspace),
        execution_id="e1", io_mode="stdio",
    )
    workspace_source = next(s for s in command.runtime_sources if s.kind == "workspace")
    assert workspace_source.guest_target == "/workspace"
    assert workspace_source.access == "rw"
    assert Path(workspace_source.source_path) == workspace
    assert workspace_source.expected_digest == content_digest(workspace)
    assert command.cwd_token == "/workspace"
    assert command.projector_id == "codex"


# 5. cwd outside the declared guest filesystem fails closed.
def test_cwd_outside_declared_guest_filesystem_fails_closed(tmp_path):
    tree = tmp_path / "tree"; tree.mkdir()
    command = HarnessCommandSpec(
        ("run",), "/elsewhere",
        runtime_sources=(declare_source("workspace", tree, "/project", access="rw"),),
        projector_id="fake-harness",
    )
    request, _ = _runtime_request(_affinity())
    with pytest.raises(ValueError, match="cwd is not inside"):
        assemble_runtime_composition(request, command)


# 6. Duplicate and parent/child overlapping guest targets fail closed.
def test_duplicate_and_overlapping_guest_targets_fail_closed(tmp_path):
    tree = tmp_path / "tree"; tree.mkdir(); (tree / "a").write_text("x", encoding="utf-8")
    other = tmp_path / "other"; other.mkdir(); (other / "b").write_text("y", encoding="utf-8")
    request, _ = _runtime_request(_affinity())
    duplicate = HarnessCommandSpec(
        ("run",), "/project",
        runtime_sources=(
            declare_source("workspace", tree, "/project", access="rw"),
            declare_source("extra", other, "/project", access="ro"),
        ),
        projector_id="fake-harness",
    )
    with pytest.raises(ValueError, match="overlapping"):
        assemble_runtime_composition(request, duplicate)
    nested = HarnessCommandSpec(
        ("run",), "/project",
        runtime_sources=(
            declare_source("workspace", tree, "/project", access="rw"),
            declare_source("extra", other, "/project/child", access="ro"),
        ),
        projector_id="fake-harness",
    )
    with pytest.raises(ValueError, match="overlapping"):
        assemble_runtime_composition(request, nested)


# 7. Source digest drift fails closed at assembly time.
def test_source_digest_drift_fails_closed(tmp_path):
    tree = tmp_path / "tree"; tree.mkdir(); (tree / "a").write_text("x", encoding="utf-8")
    stale = RuntimeSourceDeclaration("workspace", str(tree), "/project", "rw", "sha256:stale")
    command = HarnessCommandSpec(("run",), "/project", runtime_sources=(stale,), projector_id="fake-harness")
    request, _ = _runtime_request(_affinity())
    with pytest.raises(ValueError, match="digest drift"):
        assemble_runtime_composition(request, command)


# 8. Symlink and special-file sources fail closed (declaration and assembly).
def test_symlink_and_special_file_sources_fail_closed(tmp_path):
    real = tmp_path / "real"; real.write_text("x", encoding="utf-8")
    link = tmp_path / "link"
    link.symlink_to(real)
    with pytest.raises(ValueError, match="symlinked"):
        declare_source("workspace", link, "/project", access="rw")

    tree = tmp_path / "tree"; tree.mkdir()
    (tree / "ok").write_text("x", encoding="utf-8")
    (tree / "link").symlink_to(real)
    with pytest.raises(ValueError, match="symlink or special file"):
        declare_source("workspace", tree, "/project", access="rw")

    fifo = tmp_path / "fifo"
    os.mkfifo(fifo)
    with pytest.raises(ValueError):
        declare_source("workspace", fifo, "/project", access="rw")

    # A source that goes stale between declaration and assembly is caught.
    clean_tree = tmp_path / "clean"; clean_tree.mkdir(); (clean_tree / "a").write_text("x", encoding="utf-8")
    declaration = declare_source("workspace", clean_tree, "/project", access="rw")
    (clean_tree / "late-link").symlink_to(real)
    command = HarnessCommandSpec(("run",), "/project", runtime_sources=(declaration,), projector_id="fake-harness")
    request, _ = _runtime_request(_affinity())
    with pytest.raises(ValueError, match="symlink or special file"):
        assemble_runtime_composition(request, command)
    assert stat.S_ISFIFO(os.stat(fifo).st_mode)


# 12. The Codex composition has no second assembly path.
def test_codex_composition_has_no_fallback_bundle_factory():
    text = (REPO_ROOT / "plugins" / "agent-box-harnesses" / "src" / "agent_box_harnesses" / "codex" / "composition.py").read_text(encoding="utf-8")
    assert "bundle_factory" not in text
    assert "composition_from_resolved_inputs(request, command" in text or "assemble_runtime_composition(\n        request, command" in text
    assert "hasattr(coordinator" not in text


# 13. No coordinator capability sniffing anywhere in formal source.
def test_no_ledger_capability_sniffing_in_formal_source():
    offenders = []
    roots = [REPO_ROOT / "src" / "agent_box", *(sorted((REPO_ROOT / "plugins").glob("*/src")))]
    for root in roots:
        for path in sorted(root.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            if 'hasattr(coordinator, "ledger")' in path.read_text(encoding="utf-8"):
                offenders.append(str(path))
    assert offenders == []
