from __future__ import annotations

from pathlib import Path
import secrets
import shutil
import subprocess


SCRIPT = Path(__file__).parents[2] / "scripts/server-round1/cleanup-worker-projection.sh"
PS_SCRIPT = Path(__file__).parents[2] / "scripts/server-round1/accept-e.ps1"


def _instance_root() -> tuple[str, Path]:
    instance = "server_" + secrets.token_hex(16)
    root = Path("/tmp/agentbox-worker-r1") / instance
    root.mkdir(parents=True)
    return instance, root


def _child(root: Path, name: str = "project") -> Path:
    child = root / name
    child.mkdir()
    (child / ".agentbox-worker-root").write_text("agentbox-worker-r1\n")
    return child


def test_cleanup_accepts_only_owned_projection_and_removes_it():
    instance, root = _instance_root()
    _child(root)
    try:
        result = subprocess.run([str(SCRIPT), instance], text=True, capture_output=True)
        assert result.returncode == 0, result.stderr
        assert not root.exists()
    finally:
        if root.exists():
            for path in root.iterdir():
                if path.is_dir() and not path.is_symlink():
                    for nested in path.iterdir():
                        nested.unlink()
                    path.rmdir()
            root.rmdir()


def test_cleanup_rejects_old_projection_marker_without_deleting():
    instance, root = _instance_root()
    child = _child(root)
    (child / ".agentbox-worker-root").write_text("agentbox-worker-r0\n")
    result = subprocess.run([str(SCRIPT), instance], text=True, capture_output=True)
    assert result.returncode != 0
    assert root.exists() and child.exists()
    (child / ".agentbox-worker-root").write_text("agentbox-worker-r1\n")
    shutil.rmtree(root)


def test_cleanup_rejects_instance_owner_marker_mismatch():
    instance, root = _instance_root()
    _child(root)
    (root / ".agentbox-worker-instance").write_text("server_00000000000000000000000000000000")
    result = subprocess.run([str(SCRIPT), instance], text=True, capture_output=True)
    assert result.returncode != 0
    assert root.exists()
    shutil.rmtree(root)


def test_cleanup_accepts_matching_instance_owner_marker():
    instance, root = _instance_root()
    _child(root)
    (root / ".agentbox-worker-instance").write_text(instance + "\n")
    result = subprocess.run([str(SCRIPT), instance], text=True, capture_output=True)
    assert result.returncode == 0, result.stderr
    assert not root.exists()


def test_accept_e_requires_locked_schema_and_proves_cleanup():
    text = PS_SCRIPT.read_text(encoding="utf-8")
    assert "[Parameter(Mandatory = $true)][string]$WireSchemaPath" in text
    assert "$env:AGENT_BOX_WIRE_SCHEMA = $WireSchemaPath" in text
    assert "$wireMethods.Count -ne 28" in text
    assert "Workspace cleanup left residual data" in text
    assert "Server port remains reachable after cleanup" in text
