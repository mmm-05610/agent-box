from __future__ import annotations

from agent_box.extensions.credentials import PreparedSecretMount
from agent_box.resource_contracts import CredentialRefV1
from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest


def test_cleanup_reclaims_secret_attempt_binding(tmp_path):
    # P-T1 / D1: cleanup pops _secret_leases and _secret_sources; it must also
    # reclaim _secret_attempts, or that map grows unbounded across wraps.
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())

    profile = tmp_path / "profile"
    profile.mkdir()
    (profile / "config.toml").write_text("safe")
    secret = tmp_path / "private-auth"
    secret.write_text("SECRET_MUST_NEVER_APPEAR")
    provider.register_prepared_source("profile", profile, authorized_scope="execution")

    ref = CredentialRefV1("codex-login", "codex-login/default", "codex")
    mount = PreparedSecretMount("opaque-secret-token", ref, "execution:E1", "/runtime/home/auth.json", "ro")
    provider.register_prepared_secret_mount(mount, secret)
    source = PreparedMountSource("profile", _tree_digest(profile), "profile", "execution")

    spec = resolved.wrap(
        MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)),
        HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home"),
        attempt_key="attempt-E1",
    )
    assert "opaque-secret-token" in provider._secret_attempts        # bound during wrap
    assert resolved.cleanup(spec)["status"] == "cleaned"
    assert "opaque-secret-token" not in provider._secret_attempts    # reclaimed (regression)
    assert "opaque-secret-token" not in provider._secret_sources
    assert spec.spec_digest not in provider._secret_leases
