"""Pi chain gate cleanup gates.

The gate runs a real chain and then has to retire everything it created,
including the read-only Pi runtime artifact it builds inside its own temporary
root. Reporting success while a 0555 tree survives is the exact false green
these tests exist to prevent, so each cleanup outcome is asserted against the
filesystem rather than against the report alone.
"""
from __future__ import annotations

import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile

import pytest

from agent_box_sandbox_bwrap import runtime_artifact_tree_summary


GATE = Path(__file__).resolve().parents[2] / "scripts" / "server-round1" / "pi-production-chain-gate.py"
WORKER = (Path(__file__).resolve().parents[2] / "workers" / "agent-box-worker"
          / ".acceptance-bundle-c4" / "agent-box-worker")


def load_gate():
    spec = importlib.util.spec_from_file_location("pi_gate_under_test", GATE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def gate(monkeypatch):
    module = load_gate()
    saved = dict(module.REPORT)
    yield module
    module.REPORT.clear()
    module.REPORT.update(saved)


def temporary_roots():
    """Every gate temporary root currently on disk, by name."""
    root = Path(tempfile.gettempdir())
    return {path.name for path in root.glob("agentbox-pi-gate-*")}


def write_read_only_artifact(destination: Path, *, marker: bool = True) -> Path:
    """A stand-in for the read-only tree the Pi builder publishes."""
    nested = destination / "node_modules" / "@automatalabs" / "pi-acp"
    nested.mkdir(parents=True)
    (nested / "index.js").write_text("export default 1\n", encoding="utf-8")
    if marker:
        write_marker(destination)
    for directory, _subdirectories, files in os.walk(destination, topdown=False):
        for name in files:
            os.chmod(Path(directory) / name, 0o444)
        os.chmod(directory, 0o555)
    os.chmod(destination, 0o555)
    return destination


def write_marker(destination: Path) -> None:
    (destination / ".agentbox-pi-runtime-artifact").write_text(
        "agentbox-pi-runtime-artifact-r1\n", encoding="utf-8")


def write_manifest(artifact: Path) -> None:
    summary = runtime_artifact_tree_summary(artifact)
    Path(f"{artifact}.manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "kind": "agentbox-pi-runtime-artifact",
        "treeDigest": summary["digest"], "entries": summary["entries"],
        "bytes": summary["bytes"],
        "adapter": {"package": "@automatalabs/pi-acp", "version": "0.5.0",
                    "entry": "node_modules/@automatalabs/pi-acp/dist/index.js"},
    }), encoding="utf-8")


def stub_chain(gate, monkeypatch, *, failure=None, audit=True):
    """Replace the expensive parts of the run, keeping the gate's own flow."""

    def build_artifact(destination, report):
        write_read_only_artifact(destination)
        write_manifest(destination)
        report.setdefault("artifact", {})
        return destination

    def run_chain(temporary, workspace, worker, artifact, digest, endpoint, production,
                  token_path, *, live=False):
        if failure is not None:
            raise gate.GateFailure(*failure)
        if audit:
            (workspace / gate.AUDIT_NAME).write_text("guard-loaded pid=1\n", encoding="utf-8")
        return {"rounds": {"first": {"state": "completed"}, "second": {"state": "completed"}}}

    monkeypatch.setattr(gate, "build_artifact", build_artifact)
    monkeypatch.setattr(gate, "run_chain", run_chain)
    monkeypatch.setattr(gate, "observe_reopen",
                        lambda *arguments, **_keywords: {"replayedStoredTurn": True})


def run_gate(gate, monkeypatch, capsys, *arguments):
    monkeypatch.setattr(sys, "argv", ["pi-production-chain-gate.py", *arguments])
    code = gate.main()
    captured = capsys.readouterr()
    # The report is the whole stdout, indented when --json is used.
    return code, json.loads(captured.out)


def assert_temporary_root_gone(report):
    path = Path(report["run"]["temporary"])
    assert report["run"]["removed"] is True, report["run"]
    assert not path.exists(), f"{path} survived a successful run"
    assert not any(
        child.name == path.name for child in Path(tempfile.gettempdir()).glob("agentbox-pi-gate-*")
    ), "a gate temporary root is still on disk"


def test_default_run_removes_a_read_only_nested_artifact(gate, monkeypatch, capsys):
    """The reported defect: a 0555/0444 artifact inside the temporary root."""
    stub_chain(gate, monkeypatch)
    before = temporary_roots()
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    assert code == 0, report
    assert report["result"] == "PI_PRODUCTION_CHAIN_GATE_OK"
    assert_temporary_root_gone(report)
    assert report["cleanup"]["madeWritable"] > 0, "the read-only artifact had to be made writable"
    assert temporary_roots() - before == set(), "cleanup left a new temporary root behind"


def test_keep_retains_the_tree_and_never_claims_removal(gate, monkeypatch, capsys):
    stub_chain(gate, monkeypatch)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--keep", "--json")
    try:
        assert code == 0, report
        kept = Path(report["kept"])
        assert report["run"]["removed"] is False, report["run"]
        assert report["run"]["kept"] == str(kept)
        assert kept.is_dir(), "--keep must retain the tree it reports"
        assert (kept / "artifacts").is_dir()
    finally:
        # The retained tree is read-only; this is the same helper the gate uses.
        if "kept" in report and Path(report["kept"]).exists():
            gate.cleanup_root(Path(report["kept"]), created=Path(report["kept"]))
    assert not Path(report["kept"]).exists()


def test_an_external_artifact_is_neither_deleted_nor_chmodded(gate, monkeypatch, capsys, tmp_path):
    stub_chain(gate, monkeypatch)
    external = write_read_only_artifact(tmp_path / "user-artifact")
    write_manifest(external)
    before_digest = runtime_artifact_tree_summary(external)["digest"]
    before_modes = (stat.S_IMODE(external.stat().st_mode),
                    stat.S_IMODE((external / "node_modules").stat().st_mode))
    code, report = run_gate(gate, monkeypatch, capsys,
                            "--worker", str(WORKER), "--artifact", str(external), "--json")
    assert code == 0, report
    assert report["artifact"]["external"] is True
    assert report["artifact"]["preservedAfterCleanup"] is True
    assert external.is_dir(), "the caller's artifact must survive cleanup"
    assert runtime_artifact_tree_summary(external)["digest"] == before_digest
    assert (stat.S_IMODE(external.stat().st_mode),
            stat.S_IMODE((external / "node_modules").stat().st_mode)) == before_modes
    assert_temporary_root_gone(report)


def test_an_external_artifact_inside_the_temporary_root_is_refused(gate, tmp_path):
    """A caller path under our own root would blur who owns what."""
    temporary = tmp_path / "agentbox-pi-gate-owned"
    (temporary / "artifacts" / "pi-runtime").mkdir(parents=True)
    inside = temporary / "artifacts" / "pi-runtime"
    with pytest.raises(gate.GateFailure) as refused:
        gate.assert_external_artifact_separate(inside, temporary)
    assert refused.value.code == "PI_GATE_ARTIFACT_INSIDE_TEMPORARY_ROOT"
    assert inside.is_dir(), "the refusal must not touch the path"
    # A path that merely shares a prefix or lives beside it is fine.
    gate.assert_external_artifact_separate(tmp_path / "elsewhere", temporary)
    gate.assert_external_artifact_separate(temporary.parent / "sibling", temporary)


@pytest.mark.parametrize("case", ["different_path", "symlink", "world_accessible", "wrong_prefix", "a_file"])
def test_cleanup_refuses_a_path_it_did_not_create(gate, tmp_path, case):
    created = Path(tempfile.mkdtemp(prefix=gate.TEMPORARY_PREFIX))
    user_directory = tmp_path / "user-data"
    user_directory.mkdir()
    (user_directory / "keep-me").write_text("mine", encoding="utf-8")
    try:
        if case == "different_path":
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(user_directory, created=created)
            assert refused.value.code == "PI_GATE_CLEANUP_NOT_OWNED"
            assert (user_directory / "keep-me").read_text(encoding="utf-8") == "mine"
        elif case == "symlink":
            link = Path(tempfile.gettempdir()) / f"{gate.TEMPORARY_PREFIX}link"
            if link.exists():
                link.unlink()
            link.symlink_to(user_directory)
            try:
                with pytest.raises(gate.GateFailure) as refused:
                    gate.cleanup_root(link, created=link)
                assert refused.value.code == "PI_GATE_CLEANUP_NOT_OWNED"
                assert link.is_symlink()
            finally:
                link.unlink(missing_ok=True)
        elif case == "world_accessible":
            os.chmod(created, 0o755)
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(created, created=created)
            assert refused.value.code == "PI_GATE_CLEANUP_NOT_OWNED"
            assert created.exists()
        elif case == "wrong_prefix":
            other = Path(tempfile.mkdtemp(prefix="not-our-prefix-"))
            try:
                with pytest.raises(gate.GateFailure) as refused:
                    gate.cleanup_root(other, created=other)
                assert refused.value.code == "PI_GATE_CLEANUP_NOT_OWNED"
                assert other.exists()
            finally:
                shutil.rmtree(other)
        else:
            a_file = tmp_path / "a-file"
            a_file.write_text("x", encoding="utf-8")
            with pytest.raises(gate.GateFailure) as refused:
                gate.cleanup_root(a_file, created=a_file)
            assert refused.value.code == "PI_GATE_CLEANUP_NOT_OWNED"
            assert a_file.is_file()
    finally:
        if created.exists():
            os.chmod(created, 0o700)
            gate.cleanup_root(created, created=created)


def test_an_injected_removal_failure_exits_nonzero(gate, monkeypatch, capsys):
    stub_chain(gate, monkeypatch)

    def broken_rmtree(*_arguments, **_keywords):
        raise OSError("injected removal failure")

    monkeypatch.setattr(gate.shutil, "rmtree", broken_rmtree)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    leftover = Path(report["run"]["temporary"])
    try:
        assert code == 1, report
        assert report["result"] == "PI_PRODUCTION_CHAIN_GATE_FAILED"
        assert report["code"] == "PI_GATE_CLEANUP_FAILED", report
        assert report["run"]["removed"] is False, report["run"]
        assert leftover.exists()
    finally:
        monkeypatch.undo()
        if leftover.exists():
            gate.remove_tree(leftover)
    assert not leftover.exists()


def test_a_primary_failure_is_not_masked_by_a_cleanup_failure(gate, monkeypatch, capsys):
    stub_chain(gate, monkeypatch, failure=("PI_GATE_STUB_PRIMARY", "the stub chain failed first"))

    def broken_rmtree(*_arguments, **_keywords):
        raise OSError("injected removal failure")

    monkeypatch.setattr(gate.shutil, "rmtree", broken_rmtree)
    code, report = run_gate(gate, monkeypatch, capsys, "--worker", str(WORKER), "--json")
    leftover = Path(report["run"]["temporary"])
    try:
        assert code == 1, report
        assert report["code"] == "PI_GATE_STUB_PRIMARY", report
        assert report["error"] == "the stub chain failed first"
        assert report["cleanupFailure"]["code"] == "PI_GATE_CLEANUP_FAILED"
        # The primary failure's own evidence is still in the report.
        assert report["template"]["officialBaseUrl"] == "https://api.deepseek.com"
        assert report["run"]["removed"] is False
    finally:
        monkeypatch.undo()
        if leftover.exists():
            gate.remove_tree(leftover)


def test_the_gate_never_swallows_a_removal_failure_in_source():
    """No cleanup path may hide a failure behind ignore_errors."""
    source = GATE.read_text(encoding="utf-8")
    assert "ignore_errors" not in source
    assert "assert_owned_root" in source and "TEMPORARY_PREFIX" in source
