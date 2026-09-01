from pathlib import Path
import pytest

from agent_box.extensions.credentials import PreparedSecretMount
from agent_box.resource_contracts import CredentialRefV1
from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource
from agent_box.extensions.sandbox import ProjectionRejected
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest


def test_nested_readonly_secret_is_private_and_execution_scoped(tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())
    profile = tmp_path / "profile"; profile.mkdir(); (profile / "config.toml").write_text("safe")
    secret = tmp_path / "private-auth"; secret.write_text("SECRET_MUST_NEVER_APPEAR")
    provider.register_prepared_source("profile", profile, authorized_scope="execution")
    ref = CredentialRefV1("codex-login", "codex-login/default", "codex", metadata={"purpose": "official"})
    mount = PreparedSecretMount("opaque-secret-token", ref, "execution:E1", "/runtime/home/auth.json", "ro")
    provider.register_prepared_secret_mount(mount, secret)
    source = PreparedMountSource("profile", _tree_digest(profile), "profile", "execution")
    spec = resolved.wrap(
        MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)),
        HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home"),
        attempt_key="attempt-E1",
    )
    assert "SECRET_MUST_NEVER_APPEAR" not in repr(spec)
    assert str(secret) not in repr(resolved.observe(spec))
    assert str(secret) not in spec.local_argv
    assert any(spec.carrier_argv[i:i + 2] == ("--ro-bind", str(secret)) for i in range(len(spec.carrier_argv) - 1))
    assert spec.local_argv[-1] == "/runtime/bin/codex"
    assert resolved.cleanup(spec)["status"] == "cleaned"
    with pytest.raises(ProjectionRejected): resolved.wrap(
        MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)),
        HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home"), attempt_key="attempt-E1"
    )
    provider.register_prepared_secret_mount(mount, secret)
    with pytest.raises(ProjectionRejected, match="another attempt"):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)), HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home"), attempt_key="attempt-E2")


@pytest.mark.parametrize("target", ["/workspace/auth.json", "/runtime/bin/codex", "/runtime/home/../auth.json"])
def test_secret_target_is_narrow(target, tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())
    profile = tmp_path / "profile"; profile.mkdir()
    secret = tmp_path / "auth"; secret.write_text("SECRET_MUST_NEVER_APPEAR")
    provider.register_prepared_source("profile", profile, authorized_scope="execution")
    provider.register_prepared_secret_mount(PreparedSecretMount("t", CredentialRefV1("codex-login", "codex-login/default", "codex"), "execution:E1", target, "ro"), secret)
    source = PreparedMountSource("profile", _tree_digest(profile), "profile", "execution")
    with pytest.raises(ProjectionRejected):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(PreparedSecretMount("t", CredentialRefV1("codex-login", "codex-login/default", "codex"), "execution:E1", target, "ro"),)), HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home"), attempt_key="a")
