from pathlib import Path
import pytest

from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource
from agent_box.extensions.sandbox import ProjectionRejected, SandboxRequirements, SandboxUnavailable, SandboxUnsupported
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest


def stack(tmp_path, binary=None):
    provider = BwrapSandboxProvider(tmp_path / "data", binary=binary or tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())
    return provider, resolved


def source(provider, resolved, tmp_path, token="source-1", text="ok"):
    path = tmp_path / "workspace"; path.mkdir(); (path / "input.txt").write_text(text)
    provider.register_prepared_source(token, path, authorized_scope="execution-scope")
    return PreparedMountSource(token, _tree_digest(path), "harness-provenance", "execution-scope")


def plan(src):
    return MountPlan(((src, "/workspace", "rw"),), ("/tmp",))


def command(**env):
    return HarnessCommandSpec(("/bin/true",), "/workspace", env or {"HOME": "/home/agent"})


def test_registration_ref_and_negotiation_are_immutable_policy_only(tmp_path):
    provider, resolved = stack(tmp_path)
    assert resolved.ref.policy_digest and not hasattr(resolved.ref, "execution_id")
    assert not hasattr(resolved, "native_pid")
    assert resolved.negotiate(SandboxRequirements(required=("filesystem.mounts@1",))).digest
    assert resolved.negotiate({"network": "none"}).digest


def test_wrap_is_argv_safe_and_target_creation_zero(tmp_path):
    provider, resolved = stack(tmp_path)
    spec = resolved.wrap(plan(source(provider, resolved, tmp_path)), command(), attempt_key="attempt-1")
    assert spec.local_argv and "--" in spec.local_argv
    assert all(";" not in value for value in spec.local_argv)
    assert resolved.observe(spec)["target_creation_count"] == 0
    assert not hasattr(resolved, "start")


def test_mount_path_scope_symlink_and_digest_guards(tmp_path):
    provider, resolved = stack(tmp_path); src = source(provider, resolved, tmp_path)
    with pytest.raises(ProjectionRejected): resolved.wrap(MountPlan(((src, "../escape", "ro"),)), command(), attempt_key="a")
    with pytest.raises(ProjectionRejected): resolved.wrap(MountPlan(((src, "/workspace", "ro"), (src, "/workspace/input", "ro"))), command(), attempt_key="a")
    drift = PreparedMountSource(src.source_token, "sha256:drift", src.provenance_digest, src.authorized_scope)
    with pytest.raises(ProjectionRejected, match="digest"): resolved.wrap(plan(drift), command(), attempt_key="a")
    provider.register_prepared_source("symlink", tmp_path / "link", authorized_scope="execution-scope")
    (tmp_path / "link").symlink_to(tmp_path / "workspace")
    link = PreparedMountSource("symlink", src.content_digest, src.provenance_digest, src.authorized_scope)
    with pytest.raises(ProjectionRejected, match="symlink"): resolved.wrap(plan(link), command(), attempt_key="a")


def test_bounded_env_home_workspace_and_cleanup_idempotency(tmp_path):
    provider, resolved = stack(tmp_path); src = source(provider, resolved, tmp_path)
    with pytest.raises(ProjectionRejected): resolved.wrap(plan(src), command(API_TOKEN="secret"), attempt_key="a")
    with pytest.raises(ProjectionRejected): resolved.wrap(plan(src), HarnessCommandSpec(("/bin/true",), "/outside"), attempt_key="a")
    spec = resolved.wrap(plan(src), command(), attempt_key="a")
    assert resolved.cleanup(spec)["status"] == "cleaned"
    assert resolved.cleanup(spec)["status"] == "already_cleaned"


def test_native_probe_is_availability_only(tmp_path):
    provider, _ = stack(tmp_path)
    assert provider.probe()["code"] == "binary_missing"
    with pytest.raises(SandboxUnavailable): provider.availability()


def test_minimal_root_includes_proc_namespace_not_host_directory(tmp_path):
    provider, _ = stack(tmp_path)
    from agent_box_sandbox_bwrap.provider import _minimal_rootfs_argv
    argv = _minimal_rootfs_argv(provider.binary or Path("/usr/bin/bwrap"))
    assert argv[argv.index("--proc") + 1] == "/proc"


def test_network_templates_compile_distinct_immutable_modes(tmp_path):
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    offline = provider.resolve("agent-box.sandbox@1", provider.make_ref("bwrap-offline"))
    cloud = provider.resolve("agent-box.sandbox@1", provider.make_ref("bwrap-cloud-harness"))
    from agent_box_sandbox_bwrap.provider import _minimal_rootfs_argv
    binary = provider.binary or Path("/usr/bin/bwrap")
    assert "--unshare-net" in _minimal_rootfs_argv(binary, offline.ref.network_mode)
    assert "--unshare-net" not in _minimal_rootfs_argv(binary, cloud.ref.network_mode)
    assert offline.ref.policy_digest != cloud.ref.policy_digest


def test_resolve_returns_the_canonical_sandbox_v1_registry_value(tmp_path):
    from agent_box.extensions.runtime_composition import SandboxRef, SandboxV1
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    resolved = provider.resolve("agent-box.sandbox@1", provider.make_ref())
    assert isinstance(resolved, SandboxV1)
    assert isinstance(resolved.ref, SandboxRef)
    assert hasattr(resolved.port, "wrap")
    # The port object is not itself a contract type.
    assert not hasattr(resolved.port, "contract_id")
