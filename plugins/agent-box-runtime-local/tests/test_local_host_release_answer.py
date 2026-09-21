"""P-T2 / D8a: the local host answers a release instead of being silently skipped."""
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
    assert action() == {"released": True, "destroyed": False, "owned": False}


def test_the_answer_is_repeatable_and_mutates_nothing():
    host = _host()
    before = (host.ref, host.staging_tokens, host.path_tokens, host.transport.transport_kind)
    assert host.cleanup() == host.cleanup()
    assert (host.ref, host.staging_tokens, host.path_tokens, host.transport.transport_kind) == before


def test_the_host_still_owns_no_process_session_or_mount():
    # If this ever stops being true, `owned: False` becomes a false statement and
    # the host has to release the new resource from cleanup() above.
    host = _host()
    assert isinstance(host, LocalRuntimeHost)
    assert host.staging_tokens == ()
    assert host.path_tokens == ()
    assert not any(name in dir(host) for name in ("process", "handle", "session_id", "pane_id"))


def test_releasing_the_host_does_not_clear_the_transport_token_ledgers():
    # Deliberate boundary: the token maps live on LocalHostTransport, a separate
    # object with its own lifetime, so a host-level answer must not quietly clear
    # another object's state (that ledger's own growth is raised as D9).
    host = _host()
    token = host.transport.issue_cwd_token(".")
    host.cleanup()
    assert token in host.transport._paths
