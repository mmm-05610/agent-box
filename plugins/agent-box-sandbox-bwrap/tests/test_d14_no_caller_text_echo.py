"""P-T4 / D14 (bwrap): a cleanup/observe receipt must not echo caller-controlled text.

`observe`/`cleanup` accept either an IsolatedProcessSpec or a bare string. When a string
is passed, the old code echoed `str(spec)` straight into the `spec_digest` field of a
receipt that may reach a log — caller-controlled text in a loggable field. The fix folds
that field through `_receipt_digest`, which passes a genuine `sha256:` digest through
unchanged (so the normal spec path is byte-identical) and hashes anything else. The
record-path lookup and the lease key still use the raw value, so a hostile string simply
misses the lease and reports already_cleaned — the digest change is display-only.
"""
from __future__ import annotations

import json
from pathlib import Path

from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, ResolvedBwrapSandbox, _tree_digest


def _stack(tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())
    return provider, resolved


def _source(provider, tmp_path):
    path = tmp_path / "workspace"; path.mkdir(); (path / "input.txt").write_text("ok")
    provider.register_prepared_source("source-1", path, authorized_scope="execution-scope")
    return PreparedMountSource("source-1", _tree_digest(path), "harness-provenance", "execution-scope")


def _wrap_spec(provider, resolved, tmp_path):
    src = _source(provider, tmp_path)
    plan = MountPlan(((src, "/workspace", "rw"),), ("/tmp",))
    command = HarnessCommandSpec(("/bin/true",), "/workspace", {"HOME": "/home/agent"})
    return resolved.wrap(plan, command, attempt_key="attempt-1")


def test_a_real_spec_digest_passes_through_the_receipt_unchanged(tmp_path):
    # Normal path is byte-identical: a genuine sha256: digest is echoed as itself, so this
    # fix does not alter what a real spec's receipts already showed.
    provider, resolved = _stack(tmp_path)
    spec = _wrap_spec(provider, resolved, tmp_path)
    assert spec.spec_digest.startswith("sha256:")
    assert resolved.observe(spec)["spec_digest"] == spec.spec_digest
    assert resolved.cleanup(spec)["spec_digest"] == spec.spec_digest


def test_observe_of_a_raw_string_does_not_echo_the_caller_text(tmp_path):
    provider, resolved = _stack(tmp_path)
    hostile = "caller-SECRET-暗-text"
    receipt = resolved.observe(hostile)
    blob = json.dumps(receipt, ensure_ascii=False)
    assert receipt["spec_digest"] != hostile
    assert receipt["spec_digest"].startswith("sha256:")
    assert "SECRET" not in blob and "暗" not in blob and hostile not in blob


def test_cleanup_of_a_raw_string_reports_already_cleaned_without_echoing_it(tmp_path):
    provider, resolved = _stack(tmp_path)
    hostile = "caller-SECRET-暗-text"
    receipt = resolved.cleanup(hostile)
    blob = json.dumps(receipt, ensure_ascii=False)
    # The raw string is still what drives the (missed) record lookup, so it is not cleaned,
    # but the echoed digest field no longer carries the caller text.
    assert receipt["status"] == "already_cleaned"
    assert receipt["spec_digest"].startswith("sha256:")
    assert hostile not in blob and "SECRET" not in blob and "暗" not in blob


def test_receipt_digest_passes_a_valid_sha256_through_and_folds_everything_else():
    valid = "sha256:" + "a" * 64
    assert ResolvedBwrapSandbox._receipt_digest(valid) == valid
    folded = ResolvedBwrapSandbox._receipt_digest("anything-else")
    assert folded.startswith("sha256:") and len(folded) == len("sha256:") + 64
    assert folded != "anything-else"
    # A near-miss is still folded, not trusted as a digest.
    assert ResolvedBwrapSandbox._receipt_digest("sha256:" + "a" * 63) != "sha256:" + "a" * 63
    assert ResolvedBwrapSandbox._receipt_digest("Z" + "0" * 64).startswith("sha256:")


def test_receipt_digest_is_stable_so_repeated_observe_does_not_drift():
    # Digest-only change must still be deterministic across calls; otherwise a receipt used
    # as a correlation handle would be worthless.
    first = ResolvedBwrapSandbox._receipt_digest("same-input")
    second = ResolvedBwrapSandbox._receipt_digest("same-input")
    assert first == second
