"""Codex-first product vertical: harness-side RED tests.

- The generic execution provider must expose the registry-declared
  credential contract so the upper orchestrator (Studio) can dispatch the
  credential input; without it the production Studio chain never mounts
  the codex login into the sandbox (auth.json absent inside bwrap).
- The codex credential source must answer a bounded, content-free login
  preflight (status class only; the credential file is never opened).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.codex.credentials import CodexCredentialSource
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from helpers import definition_by_driver


def test_generic_provider_exposes_registry_credential_contract(tmp_path):
    # P5: the four launch-env harnesses now expose the gateway credential
    # contract (locator-only dispatch; the value is injected into the guest
    # launch environment by the provider).
    for harness_type, expected in (
        ("codex", "agent-box.credential@1"),
        ("pi", "agent-box.credential@1"),
    ):
        definition = definition_by_driver(harness_type)
        provider = GenericExecutionProvider(
            definition,
            ADAPTERS[definition.driver],
            staging_root=tmp_path / "staging",
            executable_resolver=lambda spec: None,
        )
        assert provider.credential_contract_id() == expected, harness_type


def _write_probe_binary(tmp_path: Path, body: str) -> str:
    binary = tmp_path / "codex"
    binary.write_text(body, encoding="utf-8")
    binary.chmod(0o755)
    return str(binary)


def test_login_preflight_reports_logged_in(tmp_path):
    binary = _write_probe_binary(tmp_path, "#!/bin/sh\nexit 0\n")
    source = CodexCredentialSource(home=tmp_path / "home", binary=binary)
    (tmp_path / "home/.codex").mkdir(parents=True)
    (tmp_path / "home/.codex/auth.json").write_text("{}\n", encoding="utf-8")
    preflight = source.login_preflight()
    assert preflight["status"] == "logged-in"
    # Content-free: no credential text, no host path in the report.
    rendered = repr(preflight)
    assert "auth.json" not in rendered.replace("'auth.json-exists'", "")


def test_login_preflight_classifies_failure_without_leaking_stderr(tmp_path):
    binary = _write_probe_binary(
        tmp_path, "#!/bin/sh\necho 'config missing: boom SECRET' >&2\nexit 1\n"
    )
    source = CodexCredentialSource(home=tmp_path / "home", binary=binary)
    (tmp_path / "home/.codex").mkdir(parents=True)
    (tmp_path / "home/.codex/auth.json").write_text("{}\n", encoding="utf-8")
    preflight = source.login_preflight()
    assert preflight["status"] == "config-missing"
    assert "SECRET" not in repr(preflight)


def test_login_preflight_honest_unknown_without_login_subcommand(tmp_path):
    binary = _write_probe_binary(tmp_path, "#!/bin/sh\nexec \"$0\" --unsupported\n")
    source = CodexCredentialSource(home=tmp_path / "home", binary=binary)
    (tmp_path / "home/.codex").mkdir(parents=True)
    (tmp_path / "home/.codex/auth.json").write_text("{}\n", encoding="utf-8")
    preflight = source.login_preflight()
    assert preflight["status"] in {"unknown", "process-error"}


def test_login_preflight_reports_unavailable_login_when_not_logged_in(tmp_path):
    binary = _write_probe_binary(
        tmp_path, "#!/bin/sh\necho 'Not logged in' >&2\nexit 1\n"
    )
    source = CodexCredentialSource(home=tmp_path / "home", binary=binary)
    (tmp_path / "home/.codex").mkdir(parents=True)
    (tmp_path / "home/.codex/auth.json").write_text("{}\n", encoding="utf-8")
    preflight = source.login_preflight()
    assert preflight["status"] in {"not-logged-in", "process-error"}


def test_one_shot_codex_launch_closes_child_stdin(tmp_path):
    """A launch whose stream capability is unavailable must close the
    spawned child's stdin write end: the official Codex CLI appends piped
    stdin to its prompt and waits for EOF forever ("Reading additional
    input from stdin..."), which hung every headless launch.  Driver-bound
    modes keep the duplex pipe (guarded by the opencode ACP verticals)."""
    from test_codex_vertical import _real_chain

    body = r"""#!/bin/sh
# With a closed parent write end the child's piped stdin is at EOF
# immediately: `head -c 1` returns 0 bytes instead of blocking forever.
head -c 1 > /workspace/stdin.txt; echo "eof:$?" >> /workspace/stdin.txt
printf '%s\n' '{"type":"thread.started","thread_id":"synth-thread-1"}'
printf '%s\n' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
"""
    provider, request, workspace = _real_chain(tmp_path, body)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    process = handle.runtime.transport
    assert provider.capabilities().get("stream") != "supported"
    # The parent side closed the write end: no live duplex stdin remains.
    stdin = getattr(process, "stdin", None)
    assert stdin is None or stdin.closed, "one-shot launch left the child stdin pipe open"
    exit_code = _wait_exit_local(process, timeout_s=10.0)
    assert exit_code is not None, "one-shot launch hung on an unterminated stdin pipe"
    assert exit_code == 0
    assert (workspace / "stdin.txt").read_text() == "eof:0\n"


def _wait_exit_local(process, timeout_s: float = 20.0):
    import time

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        code = process.poll()
        if code is not None:
            return code
        time.sleep(0.05)
    return None
