"""P-T2 / D8a + P-T3 / D9: the local host answers a release, and means it."""
from __future__ import annotations

from agent_box_runtime_local.provider import (CONTRACT_ID, LocalRuntimeHost, LocalRuntimeHostProvider)


def _host():
    provider = LocalRuntimeHostProvider(executor=lambda *args, **kwargs: (_ for _ in ()).throw(
        AssertionError("release must not spawn anything")))
    return provider.resolve(CONTRACT_ID, provider.make_ref("native-linux")).port


def test_the_host_declares_a_release_verb_that_takes_no_arguments():
    # CompositionCoordinator.cleanup() probes `getattr(host, "cleanup", None)` and
    # calls it with no argument when the component is absent of a spec.  A verb that
    # demanded one would be worse than no verb at all: it would turn a silent skip
    # into a swallowed error inside the release loop.
    host = _host()
    action = getattr(host, "cleanup", None)
    assert callable(action)
    assert action.__self__ is host
    assert action() == {"released": True, "destroyed": False, "managed": False,
                        "reclaimed": {"paths": 0, "envs": 0}}


def test_the_receipt_is_the_published_three_state_shape():
    # C-RUNTIME@v1 §2 admits exactly two receipt families.  A host release is
    # reported in the three-state one, with no key invented for it: `owned` was
    # P-T2's local vocabulary and belonged to neither family.
    receipt = _host().cleanup()
    assert {"released", "destroyed", "managed"} <= set(receipt)
    assert set(receipt) == {"released", "destroyed", "managed", "reclaimed"}
    assert all(isinstance(receipt[key], bool) for key in ("released", "destroyed", "managed"))


def test_the_answer_is_repeatable_and_mutates_nothing():
    host = _host()
    before = (host.ref, host.staging_tokens, host.path_tokens, host.transport.transport_kind)
    assert host.cleanup() == host.cleanup()
    assert (host.ref, host.staging_tokens, host.path_tokens, host.transport.transport_kind) == before


def test_the_host_still_owns_no_process_session_or_mount():
    # If this ever stops being true, `managed: False` becomes a false statement and
    # the host has to release the new resource from cleanup() above.
    host = _host()
    assert isinstance(host, LocalRuntimeHost)
    assert host.staging_tokens == ()
    assert host.path_tokens == ()
    assert not any(name in dir(host) for name in ("process", "handle", "session_id", "pane_id"))


def test_releasing_the_host_releases_the_bindings_its_transport_issued(tmp_path):
    # P-T3 overturns P-T2's deliberate boundary here, on purpose: that boundary was
    # recorded as "the ledger's own growth is raised as D9", and D9 is now approved.
    # An unspent environment binding can hold secret values for the whole lifetime
    # of the process, so a release that left them in place released nothing.
    host = _host()
    cwd = host.transport.issue_cwd_token(tmp_path)
    env = host.transport.issue_env_token({"PATH": "/usr/bin"})
    assert cwd in host.transport._paths and env in host.transport._envs

    receipt = host.cleanup()
    assert receipt["reclaimed"] == {"paths": 1, "envs": 1}
    assert host.transport._paths == {} and host.transport._envs == {}
    assert host.cleanup()["reclaimed"] == {"paths": 0, "envs": 0}   # idempotent
