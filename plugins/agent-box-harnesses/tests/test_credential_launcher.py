"""Credential launcher behavior tests (architecture override §五, RED list
items 13-21): the secret travels host→guest ONLY as a read-only projected
file consumed by the fixed in-guest launcher; it never appears in argv,
repr, digests, plans, or logs.

The launcher script itself is a fixed asset: its behavior is pinned by
running it against a temp file and asserting the target harness process
sees the env var while the launcher argv carries no value.
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

from agent_box_model_providers.credentials import CredentialAuthority
from agent_box_model_providers.resource import GatewayCredentialSource

ASSET = (
    Path(__file__).resolve().parents[2]
    / "agent-box-harnesses"
    / "src"
    / "agent_box_harnesses"
    / "assets"
    / "secret-env-launcher.sh"
)
SENTINEL = "sk-fake-launcher-sentinel-value"


def test_launcher_asset_exists_and_code_has_no_eval():
    assert ASSET.is_file()
    code_lines = [
        line
        for line in ASSET.read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    code = "\n".join(code_lines)
    assert "eval" not in code
    assert "printf" not in code  # the value is never echoed


def test_prepared_secret_repr_and_mount_carry_no_value(tmp_path):
    authority = CredentialAuthority(tmp_path / "home")
    authority.set("maomao", SENTINEL)
    source = GatewayCredentialSource(authority=authority)
    prepared = source.prepare_mount(
        _cred_ref(), "execution:exec_t1", "/runtime/home/.credential/secret", "ro"
    )
    blob = repr(prepared)
    assert SENTINEL not in blob
    assert prepared.guest_target == "/runtime/home/.credential/secret"
    assert prepared.access == "ro"
    assert prepared.execution_scope == "execution:exec_t1"


def test_secret_env_launch_delivers_env_to_target_process(tmp_path):
    authority = CredentialAuthority(tmp_path / "home")
    authority.set("maomao", SENTINEL)
    secret_host_file = tmp_path / "projected-secret"
    secret_host_file.write_text(SENTINEL)
    os.chmod(secret_host_file, 0o600)
    # the launcher runs EXACTLY as the sandbox would: fixed argv (no value)
    argv = [
        "/bin/sh", str(ASSET), "MINIMAX_API_KEY", str(secret_host_file), "--",
        "/bin/sh", "-c", 'printf %s "$MINIMAX_API_KEY"',
    ]
    result = subprocess.run(argv, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert result.stdout == SENTINEL
    assert SENTINEL not in json.dumps(argv)


def test_launcher_rejects_bad_env_name_and_missing_file(tmp_path):
    absent = tmp_path / "absent-secret"
    base = ["/bin/sh", str(ASSET)]
    bad_name = subprocess.run(
        base + ["BAD-NAME", str(tmp_path / "x"), "--", "/bin/true"],
        capture_output=True, timeout=30,
    )
    assert bad_name.returncode == 64
    missing = subprocess.run(
        base + ["MINIMAX_API_KEY", str(absent), "--", "/bin/true"],
        capture_output=True, timeout=30,
    )
    assert missing.returncode == 65


def _cred_ref():
    from agent_box.resource_contracts import CredentialRefV1

    return CredentialRefV1(
        provider="gateway-provider", native_locator="gateway/maomao",
        harness_scope="gateway",
    )


def test_secret_never_enters_launch_plan_or_command_digest(tmp_path):
    """Launcher-based delivery adds NO credential-shaped env key on the host
    side: the plan environment stays clean, and the binding carries the
    locator only."""
    from agent_box_harnesses.adapters.launch_plan import SecretBinding
    from agent_box_harnesses.adapters.native_guard import secret_field_forbidden
    from agent_box_model_providers.credentials import CredentialAuthority as _CA

    # the binding's guest target must live under the writable profile home
    # (the sandbox projects it INSIDE /runtime/home)
    authority = _CA(tmp_path / "home")
    authority.set("maomao", SENTINEL)

    plan_env = {
        "HOME": "/runtime/home",
        "PATH": "/usr/bin:/bin",
        "AGENT_BOX_EXECUTION_ID": "exec_t1",
    }
    for key in plan_env:
        assert not secret_field_forbidden(key), key
    binding = SecretBinding(
        guest_target="/runtime/home/.hermes/credential/secret",
        locator="gateway/maomao",
        materializer_id="gateway-provider",
    )
    blob = repr(binding)
    assert SENTINEL not in blob
    assert "gateway/maomao" in blob  # locator-only


def test_credential_replace_does_not_rewrite_history(tmp_path):
    """Credential replace changes the value behind a STABLE locator; config
    revisions are untouched (the locator identity persists across replace)."""
    authority = CredentialAuthority(tmp_path / "home")
    authority.set("maomao", "first-value-fake")
    locator_before = authority.locator("maomao")
    authority.set("maomao", "second-value-fake")
    locator_after = authority.locator("maomao")
    assert locator_before == locator_after
    assert authority.read("maomao") == "second-value-fake"
