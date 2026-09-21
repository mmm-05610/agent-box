"""P-T2 / D7: a `wrap` that rejects a plan releases the attempt bindings it made."""
from __future__ import annotations

from dataclasses import replace

import pytest

from agent_box.extensions.credentials import PreparedSecretMount
from agent_box.extensions.sandbox import ProjectionRejected
from agent_box.resource_contracts import CredentialRefV1
from agent_box.extensions.runtime_composition import HarnessCommandSpec, MountPlan, PreparedMountSource
from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider, _tree_digest


def _provider(tmp_path):
    # An explicit binary path keeps the compiler running without real bwrap; the
    # defect is in plan validation, not in execution.
    provider = BwrapSandboxProvider(tmp_path / "data", binary=tmp_path / "missing")
    return provider, provider.resolve("agent-box.sandbox@1", provider.make_ref())


def _profile(tmp_path, provider):
    profile = tmp_path / "profile"
    profile.mkdir()
    (profile / "config.toml").write_text("safe")
    provider.register_prepared_source("profile", profile, authorized_scope="execution")
    return PreparedMountSource("profile", _tree_digest(profile), "profile", "execution")


def _secret(tmp_path, provider, token, name, scope="execution:E1"):
    path = tmp_path / name
    path.write_text("SECRET_MUST_NEVER_APPEAR")
    ref = CredentialRefV1("codex-login", "codex-login/default", "codex")
    mount = PreparedSecretMount(token, ref, scope, f"/runtime/home/{name}.json", "ro")
    provider.register_prepared_secret_mount(mount, path)
    return mount, path


def _command():
    return HarnessCommandSpec(("/runtime/bin/codex",), "/runtime/home")


def test_a_rejected_second_secret_rolls_back_the_first_ones_binding(tmp_path):
    # Acceptance case: two secrets, the second source stops being usable.  The
    # first token was already bound to this attempt and no lease receipt exists
    # yet, so cleanup() can never reclaim it - only the failure path can.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    mount_one, _path_one = _secret(tmp_path, provider, "token-one", "auth-one")
    mount_two, path_two = _secret(tmp_path, provider, "token-two", "auth-two")
    path_two.unlink()                                    # unavailable at wrap time

    with pytest.raises(ProjectionRejected, match="secret source is unavailable"):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount_one, mount_two)),
                      _command(), attempt_key="attempt-E1")

    assert "token-one" not in provider._secret_attempts  # rolled back (regression)
    assert "token-two" not in provider._secret_attempts
    assert provider._secret_leases == {}                 # no receipt was ever written
    assert provider._secret_sources.keys() >= {"token-one", "token-two"}


def test_a_retry_after_the_failure_succeeds(tmp_path):
    # The rollback must leave the registration intact, or a token prepared by the
    # credential layer would be un-usable for the very next attempt.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    mount_one, _one = _secret(tmp_path, provider, "token-one", "auth-one")
    mount_two, path_two = _secret(tmp_path, provider, "token-two", "auth-two")
    path_two.unlink()
    with pytest.raises(ProjectionRejected):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount_one, mount_two)),
                      _command(), attempt_key="attempt-E1")
    path_two.write_text("restored")

    spec = resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount_one, mount_two)),
                         _command(), attempt_key="attempt-E2")
    assert provider._secret_attempts["token-one"] == "attempt-E2"
    assert resolved.cleanup(spec)["status"] == "cleaned"
    assert provider._secret_attempts == {}               # T1 reclamation still holds


def test_an_ordinary_configuration_mistake_leaks_no_binding(tmp_path):
    # The binding happens before the collision is judged, so this is not a narrow
    # race: a secret target that simply collides with a plain mount strands the
    # token in _secret_attempts on every attempt.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    mount, _path = _secret(tmp_path, provider, "token-one", "auth-one")
    colliding = replace(mount, guest_target="/runtime/home")

    with pytest.raises(ProjectionRejected, match="target collides"):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(colliding,)),
                      _command(), attempt_key="attempt-E1")
    assert provider._secret_attempts == {}


def test_an_attempt_binding_from_a_prior_attempt_is_not_erased(tmp_path):
    # Rollback restores the previous value rather than deleting unconditionally: a
    # token that legitimately belonged to an earlier attempt is still theirs.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    mount, path = _secret(tmp_path, provider, "token-one", "auth-one")
    provider._secret_attempts["token-one"] = "attempt-E0"      # a prior owner's binding
    path.unlink()

    with pytest.raises(ProjectionRejected):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)),
                      _command(), attempt_key="attempt-E1")
    assert provider._secret_attempts["token-one"] == "attempt-E0"


def test_rollback_leaves_an_unrelated_successful_spec_untouched(tmp_path):
    # Collateral-damage pin: the rollback is keyed to *this* attempt's tokens, so a
    # spec that already wrapped successfully must keep both its lease and its
    # token binding.  A rollback that swept the ledgers wholesale would silently
    # un-protect a live sandbox's secrets.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    live, _live_path = _secret(tmp_path, provider, "token-live", "auth-live", scope="execution:E9")
    spec = resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(live,)),
                         _command(), attempt_key="attempt-E9")
    before = dict(provider._secret_leases)
    assert before, "the successful wrap must have written a lease"

    doomed, doomed_path = _secret(tmp_path, provider, "token-doomed", "auth-doomed")
    doomed_path.unlink()
    with pytest.raises(ProjectionRejected):
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(doomed,)),
                      _command(), attempt_key="attempt-E1")

    assert provider._secret_leases == before                        # live lease intact
    assert provider._secret_attempts["token-live"] == "attempt-E9"   # live binding intact
    assert "token-doomed" not in provider._secret_attempts
    assert resolved.cleanup(spec)["status"] == "cleaned"


def test_the_rejection_does_not_carry_secret_content_or_its_host_path(tmp_path):
    # The failure path is the one place a provider is tempted to explain itself by
    # naming what it could not read.  Every message on this path is a constant
    # literal, so neither the secret bytes nor their host location may appear.
    provider, resolved = _provider(tmp_path)
    source = _profile(tmp_path, provider)
    mount, path = _secret(tmp_path, provider, "token-one", "auth-one")
    path.unlink()

    with pytest.raises(ProjectionRejected) as caught:
        resolved.wrap(MountPlan(((source, "/runtime/home", "rw"),), secret_mounts=(mount,)),
                      _command(), attempt_key="attempt-E1")
    assert "SECRET_MUST_NEVER_APPEAR" not in str(caught.value)
    assert path.parent.name not in str(caught.value)
    assert "SECRET_MUST_NEVER_APPEAR" not in repr(caught.value)
    assert path.name not in repr(provider._secret_attempts)         # ledger keys stay opaque
