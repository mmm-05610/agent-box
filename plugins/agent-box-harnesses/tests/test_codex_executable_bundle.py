from pathlib import Path
import os
import shutil
import pytest

from agent_box_harnesses.codex.executable import CodexExecutableResolutionError, CodexExecutableResolver, classify_login_status_failure


NATIVE = Path("/home/maoqh/.npm-global/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex")
LAUNCHER = Path("/home/maoqh/.npm-global/lib/node_modules/@openai/codex/bin/codex.js")


def test_official_native_bundle_is_bounded_and_publicly_path_free():
    if not NATIVE.is_file(): pytest.skip("official Codex native binary unavailable")
    bundle = CodexExecutableResolver(NATIVE).resolve("login-status")
    assert bundle.version == "unknown"
    assert [m.guest_target for m in bundle.members] == ["/runtime/bin/codex"]
    assert str(NATIVE) not in repr(bundle)
    assert bundle.members[0].source_path == NATIVE


def test_official_npm_launcher_resolves_native_without_projecting_node():
    if not LAUNCHER.is_file(): pytest.skip("official Codex npm launcher unavailable")
    bundle = CodexExecutableResolver(LAUNCHER).resolve("app-server")
    assert bundle.version == "0.149.0"
    assert all(not m.guest_target.endswith(".js") for m in bundle.members)
    assert "/runtime/bin/codex" == bundle.members[0].guest_target
    assert "/runtime/bin/codex-code-mode-host" in [m.guest_target for m in bundle.members]
    assert "/runtime/codex-path" in [m.guest_target for m in bundle.members]
    assert "/runtime/codex-resources" in [m.guest_target for m in bundle.members]
    assert bundle.members[0].purpose == "native Codex executable"
    assert "node_modules" not in " ".join(m.guest_target for m in bundle.members)
    assert str(LAUNCHER) not in repr(bundle)


def test_official_npm_bin_symlink_resolves_the_official_launcher():
    bin_link = Path("/home/maoqh/.npm-global/bin/codex")
    if not bin_link.is_symlink(): pytest.skip("official Codex npm bin link unavailable")
    bundle = CodexExecutableResolver(bin_link).resolve("login-status")
    assert bundle.members[0].guest_target == "/runtime/bin/codex"


def test_unrecognized_symlink_layout_and_drift_fail_closed(tmp_path):
    native = tmp_path / "codex"; shutil.copy2(NATIVE, native); native.chmod(0o755)
    arbitrary = tmp_path / "launcher"; arbitrary.symlink_to(native)
    with pytest.raises(CodexExecutableResolutionError, match="SYMLINK"):
        CodexExecutableResolver(arbitrary).resolve("login-status")
    bad = tmp_path / "bad.js"; bad.write_text("#!/usr/bin/env node\n"); bad.chmod(0o755)
    with pytest.raises(CodexExecutableResolutionError): CodexExecutableResolver(bad).resolve()


def test_login_status_failure_classifier_is_stable_and_non_secret():
    assert classify_login_status_failure("Error loading configuration: no /proc/self/exe available", 1) == "required-system-root-missing"
    assert classify_login_status_failure("auth.json permission denied", 1) == "credential-not-readable"
    assert classify_login_status_failure("Logged in using ChatGPT", 0) == "logged-in"
    assert "SECRET_MUST_NEVER_APPEAR" not in classify_login_status_failure("SECRET_MUST_NEVER_APPEAR", 1)
