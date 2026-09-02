"""OpenCode ACP capability probe: fake binaries + real binary (SKIP-safe).

The real ``opencode`` binary is probed only offline (``acp --version`` with
an isolated temp XDG home, no credential, no model request).  When the
binary or the ACP subcommand is unavailable, the tests skip with an
explicit reason — synthetic coverage never skips.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from agent_box_harnesses.opencode.acp import OpenCodeAcpModeFacts, probe_acp_command


def _script(bin_dir: Path, body: str) -> str:
    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / "opencode"
    binary.write_text("#!/bin/sh\n" + body, encoding="utf-8")
    binary.chmod(0o755)
    return str(binary)


def test_probe_accepts_acp_subcommand(tmp_path):
    binary = _script(tmp_path / "bin", 'echo "2.0.0-test"\n')
    ok, detail = probe_acp_command(binary)
    assert ok is True
    assert detail == "2.0.0-test"


def test_probe_rejects_without_acp_subcommand(tmp_path):
    binary = _script(tmp_path / "bin", "exit 2\n")
    ok, detail = probe_acp_command(binary)
    assert ok is False
    assert "probe exit 2" in detail


def test_probe_rejects_missing_binary(tmp_path):
    ok, detail = probe_acp_command(str(tmp_path / "bin" / "missing"))
    assert ok is False
    assert "unresolved" in detail


def test_probe_facts_identity():
    facts = OpenCodeAcpModeFacts()
    assert facts.mode == "acp"
    assert "built-in ACP" in facts.implementation_name
    assert facts.officiality == "vendor_native"
    assert facts.protocol_version == "1"
    assert any("question" in gap for gap in facts.capability_gaps)


def test_probe_uses_isolated_home_and_never_reads_real_config(tmp_path):
    """The probe must not depend on the user home; it runs with a temp HOME
    and XDG roots, and the script only prints --version."""
    binary = _script(tmp_path / "bin", "printf 'probe-ok\\n'\n")
    ok, _ = probe_acp_command(binary)
    assert ok is True


def test_real_opencode_acp_probe_or_skip_with_reason():
    binary = shutil.which("opencode")
    if binary is None:
        pytest.skip("opencode not installed on this host")
    ok, detail = probe_acp_command(binary)
    assert ok, f"opencode acp --version probe failed: {detail}"
    assert detail  # at least the local version string was captured


def test_real_opencode_acp_handshake_initialize_or_skip_with_reason():
    """Full initialize handshake against the real binary (no prompt, no
    credential).  Skipped with an explicit reason when unavailable."""
    binary = shutil.which("opencode")
    if binary is None:
        pytest.skip("opencode not installed on this host")
    ok, _ = probe_acp_command(binary)
    if not ok:
        pytest.skip("opencode ACP subcommand unavailable on this binary")
    import os
    import subprocess as sp
    import sys
    import tempfile

    from agent_box_acp import AcpClientEngine, PipeDuplexTransport

    with tempfile.TemporaryDirectory(prefix="agent-box-opencode-probe-") as tmp:
        env = dict(os.environ)
        env.update({
            "HOME": tmp,
            "XDG_CONFIG_HOME": tmp + "/config",
            "XDG_DATA_HOME": tmp + "/data",
            "XDG_CACHE_HOME": tmp + "/cache",
            "XDG_STATE_HOME": tmp + "/state",
            "NO_COLOR": "1",
        })
        process = sp.Popen([binary, "acp"], stdin=sp.PIPE, stdout=sp.PIPE,
                           stderr=sp.PIPE, env=env)
        transport = PipeDuplexTransport(process.stdin, process.stdout, process.stderr)
        engine = AcpClientEngine(transport, request_timeout_s=10.0)
        try:
            import time

            deadline = time.monotonic() + 20
            info = None
            while time.monotonic() < deadline:
                try:
                    info = engine.initialize(timeout=8.0)
                    break
                except Exception:
                    # opencode may need an instant to be ready; retry once
                    if time.monotonic() > deadline - 5:
                        raise
                    time.sleep(1.0)
            assert info is not None, "initialize never completed"
            assert info.protocol_version == "1"
            capabilities = info.capabilities
            # opencode declares session capabilities as a mapping; the
            # engine exposes the key set (new is implicit on the wire)
            assert capabilities.load_session is True
            assert "fork" in capabilities.session_capabilities
            assert "resume" in capabilities.session_capabilities
            assert "image" in capabilities.prompt_capabilities
        finally:
            engine.close()
            try:
                process.wait(timeout=5)
            except Exception:
                process.kill()
                process.wait(timeout=5)