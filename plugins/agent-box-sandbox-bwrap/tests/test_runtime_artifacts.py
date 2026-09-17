"""Runtime artifact tree authorization: digest parity, bounds and refusals.

The digest is a cross-language identity, so the golden fixtures under
`protocols/worker/golden/` are the contract: this module asserts the Python
reference implementation against them, and the Worker's Rust test asserts the
same fixtures against its own implementation.
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import re
import socket

import pytest

from agent_box_sandbox_bwrap import (
    MAX_RUNTIME_ARTIFACT_BYTES,
    MAX_RUNTIME_ARTIFACT_ENTRIES,
    RuntimeArtifactRejected,
    runtime_artifact_name,
    runtime_artifact_tree_digest,
    runtime_artifact_tree_summary,
    validate_runtime_artifact_target,
)


REPO = Path(__file__).resolve().parents[3]
GOLDEN = REPO / "protocols" / "worker" / "golden"
GOLDEN_FIXTURES = ("runtime-artifact-tree-v1.json", "runtime-artifact-tree-v1-single.json")


def materialize(root: Path, document: dict) -> Path:
    """Recreate a fixture tree exactly as its `tree` list describes."""
    root.mkdir()
    for entry in document["tree"]:
        target = root / entry["path"]
        if entry["kind"] == "dir":
            target.mkdir(parents=True, exist_ok=True)
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(base64.b64decode(entry["content_base64"]))
    return root


@pytest.mark.parametrize("name", GOLDEN_FIXTURES)
def test_golden_fixture_digest_and_encoding_match(tmp_path, name):
    document = json.loads((GOLDEN / name).read_text(encoding="utf-8"))
    assert document["algorithm"] == "agentbox-runtime-artifact-tree-v1"
    root = materialize(tmp_path / "tree", document)
    summary = runtime_artifact_tree_summary(root)
    assert summary["digest"] == document["digest"]
    assert summary["entries"] == document["entries"]
    assert summary["bytes"] == document["bytes"]
    assert runtime_artifact_tree_digest(root) == document["digest"]


def test_golden_encoding_is_byte_exact_and_ordered(tmp_path):
    """The digest is over a canonical byte encoding, not a JSON serialization.

    A second implementation can therefore be checked against the recorded
    bytes without guessing at JSON escaping, key order or number formatting.
    """
    document = json.loads((GOLDEN / GOLDEN_FIXTURES[0]).read_text(encoding="utf-8"))
    root = materialize(tmp_path / "tree", document)
    from agent_box.resource_contracts.runtime_artifacts import _encode

    encoding, entries, total = _encode(root, MAX_RUNTIME_ARTIFACT_ENTRIES, MAX_RUNTIME_ARTIFACT_BYTES)
    assert encoding.hex() == document["canonical_encoding_hex"]
    assert encoding.startswith(b"agentbox-runtime-artifact-tree-v1\n")
    assert entries == document["entries"] and total == document["bytes"]
    # The fixture deliberately creates its entries out of path order, so a
    # matching encoding proves both implementations sort rather than trust the
    # order the filesystem happened to return.
    created = [entry["path"] for entry in document["tree"]]
    assert created != sorted(created)


def test_identity_ignores_creation_order_and_root_location(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "elsewhere" / "second"
    (first / "nested").mkdir(parents=True)
    second.mkdir(parents=True)
    (first / "nested" / "b.txt").write_bytes(b"b")
    (first / "a.txt").write_bytes(b"a")
    # Same tree, opposite creation order, different absolute root.
    (second / "a.txt").write_bytes(b"a")
    (second / "nested").mkdir()
    (second / "nested" / "b.txt").write_bytes(b"b")
    assert runtime_artifact_tree_digest(first) == runtime_artifact_tree_digest(second)


def test_identity_changes_with_content_addition_removal_and_path(tmp_path):
    root = tmp_path / "tree"
    (root / "dir").mkdir(parents=True)
    (root / "dir" / "dep.mjs").write_bytes(b"export const V = 1\n")
    baseline = runtime_artifact_tree_digest(root)

    (root / "dir" / "dep.mjs").write_bytes(b"export const V = 2\n")
    changed = runtime_artifact_tree_digest(root)
    assert changed != baseline

    (root / "dir" / "extra.txt").write_bytes(b"x")
    added = runtime_artifact_tree_digest(root)
    assert added not in {baseline, changed}

    (root / "dir" / "extra.txt").unlink()
    assert runtime_artifact_tree_digest(root) == changed

    (root / "dir" / "dep.mjs").rename(root / "dir" / "renamed.mjs")
    renamed = runtime_artifact_tree_digest(root)
    assert renamed != changed

    # A pure directory entry also carries identity.
    (root / "empty").mkdir()
    assert runtime_artifact_tree_digest(root) != renamed


def test_identity_empty_and_single_entry_trees_are_defined(tmp_path):
    empty = tmp_path / "empty"
    empty.mkdir()
    summary = runtime_artifact_tree_summary(empty)
    assert summary["entries"] == 0 and summary["bytes"] == 0
    assert summary["digest"].startswith("sha256:")
    # The empty tree is still domain-separated from any other digest.
    assert summary["digest"] != "sha256:" + "0" * 64

    single = tmp_path / "single"
    single.mkdir()
    (single / "zero.txt").write_bytes(b"")
    one = runtime_artifact_tree_summary(single)
    assert one["entries"] == 1 and one["bytes"] == 0
    assert one["digest"] not in {summary["digest"], "sha256:" + "0" * 64}


def test_root_must_be_a_real_directory(tmp_path):
    missing = tmp_path / "missing"
    with pytest.raises(RuntimeArtifactRejected) as absent:
        runtime_artifact_tree_digest(missing)
    assert absent.value.code == "RUNTIME_ARTIFACT_ROOT_INVALID"

    plain = tmp_path / "file.txt"
    plain.write_bytes(b"x")
    with pytest.raises(RuntimeArtifactRejected) as not_directory:
        runtime_artifact_tree_digest(plain)
    assert not_directory.value.code == "RUNTIME_ARTIFACT_ROOT_INVALID"

    target = tmp_path / "real"
    target.mkdir()
    (target / "a").write_bytes(b"a")
    link = tmp_path / "link"
    link.symlink_to(target, target_is_directory=True)
    with pytest.raises(RuntimeArtifactRejected) as linked:
        runtime_artifact_tree_digest(link)
    assert linked.value.code == "RUNTIME_ARTIFACT_ROOT_INVALID"
    assert "symlink" in linked.value.message


def test_inner_symlink_is_refused_and_never_followed(tmp_path):
    root = tmp_path / "tree"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_bytes(b"not-part-of-the-artifact")
    (root / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(RuntimeArtifactRejected) as linked:
        runtime_artifact_tree_digest(root)
    assert linked.value.code == "RUNTIME_ARTIFACT_ENTRY_INVALID"
    assert "symlink" in linked.value.message

    (root / "link").unlink()
    (root / "file-link").symlink_to(outside / "secret.txt")
    with pytest.raises(RuntimeArtifactRejected) as file_link:
        runtime_artifact_tree_digest(root)
    assert file_link.value.code == "RUNTIME_ARTIFACT_ENTRY_INVALID"


def test_special_files_are_refused(tmp_path):
    root = tmp_path / "tree"
    root.mkdir()
    fifo = root / "pipe"
    os.mkfifo(fifo)
    with pytest.raises(RuntimeArtifactRejected) as refused:
        runtime_artifact_tree_digest(root)
    assert refused.value.code == "RUNTIME_ARTIFACT_ENTRY_INVALID"
    assert "special" in refused.value.message

    fifo.unlink()
    listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        listener.bind(str(root / "socket"))
        with pytest.raises(RuntimeArtifactRejected) as socket_refused:
            runtime_artifact_tree_digest(root)
        assert socket_refused.value.code == "RUNTIME_ARTIFACT_ENTRY_INVALID"
    finally:
        listener.close()


def test_paths_must_be_portable_and_collision_free(tmp_path):
    colliding = tmp_path / "colliding"
    colliding.mkdir()
    (colliding / "A.txt").write_bytes(b"one")
    (colliding / "a.txt").write_bytes(b"two")
    with pytest.raises(RuntimeArtifactRejected) as collision:
        runtime_artifact_tree_digest(colliding)
    assert collision.value.code == "RUNTIME_ARTIFACT_PATH_COLLISION"

    unicode_root = tmp_path / "unicode"
    unicode_root.mkdir()
    (unicode_root / "café.txt").write_bytes(b"one")
    with pytest.raises(RuntimeArtifactRejected) as non_ascii:
        runtime_artifact_tree_digest(unicode_root)
    assert non_ascii.value.code == "RUNTIME_ARTIFACT_PATH_INVALID"

    spaced = tmp_path / "spaced"
    spaced.mkdir()
    (spaced / "with space.txt").write_bytes(b"one")
    with pytest.raises(RuntimeArtifactRejected) as space:
        runtime_artifact_tree_digest(spaced)
    assert space.value.code == "RUNTIME_ARTIFACT_PATH_INVALID"


def test_bounds_reject_entry_count_and_total_size(tmp_path):
    root = tmp_path / "tree"
    root.mkdir()
    for name in ("a.txt", "b.txt", "c.txt"):
        (root / name).write_bytes(b"one")
    with pytest.raises(RuntimeArtifactRejected) as entries:
        runtime_artifact_tree_digest(root, max_entries=2)
    assert entries.value.code == "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"
    with pytest.raises(RuntimeArtifactRejected) as total:
        runtime_artifact_tree_digest(root, max_bytes=2)
    assert total.value.code == "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"
    # Exactly at both bounds is still accepted.
    assert runtime_artifact_tree_digest(root, max_entries=3, max_bytes=9)

    # The production bounds are the work order's ceiling, not something looser.
    assert MAX_RUNTIME_ARTIFACT_ENTRIES == 32_768
    assert MAX_RUNTIME_ARTIFACT_BYTES == 1024 * 1024 * 1024


def test_hard_limits_reject_the_real_sizes_without_hashing_them(tmp_path):
    """A tree over the byte ceiling is refused before its content is read."""
    root = tmp_path / "tree"
    root.mkdir()
    oversized = root / "huge.bin"
    with oversized.open("wb") as stream:
        stream.truncate(MAX_RUNTIME_ARTIFACT_BYTES + 1)
    with pytest.raises(RuntimeArtifactRejected) as refused:
        runtime_artifact_tree_digest(root)
    assert refused.value.code == "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"

    crowded = tmp_path / "crowded"
    crowded.mkdir()
    for index in range(MAX_RUNTIME_ARTIFACT_ENTRIES + 1):
        (crowded / f"f{index:06d}").touch()
    with pytest.raises(RuntimeArtifactRejected) as count:
        runtime_artifact_tree_digest(crowded)
    assert count.value.code == "RUNTIME_ARTIFACT_OUTSIDE_BOUNDS"


def test_target_shape_is_restricted_to_the_artifact_namespace():
    assert runtime_artifact_name("/runtime/artifacts/pi-node-modules") == "pi-node-modules"
    assert validate_runtime_artifact_target("/runtime/artifacts/hermes-python") == (
        "/runtime/artifacts/hermes-python"
    )
    for target in (
        "/runtime/artifacts/",
        "/runtime/artifacts",
        "/runtime/artifacts/../escape",
        "/runtime/artifacts/a/b",
        "/runtime/artifacts/.hidden",
        "/runtime/artifacts/-flag",
        "/runtime/bin/node",
        "/runtime/view/agentbox-sidecar",
        "/runtime/secret/credential",
        "/tmp/agentbox-home/x",
        "/tmp/agentbox-sidecar-state",
        "/workspace",
        "/home/tester/site-packages",
        "/",
        "",
        None,
        7,
    ):
        with pytest.raises(RuntimeArtifactRejected) as refused:
            validate_runtime_artifact_target(target)
        assert refused.value.code == "RUNTIME_ARTIFACT_TARGET_INVALID"

    with pytest.raises(RuntimeArtifactRejected):
        runtime_artifact_name("/runtime/bin/node")
