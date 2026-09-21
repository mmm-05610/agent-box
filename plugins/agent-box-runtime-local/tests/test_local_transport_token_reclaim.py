"""P-T3 / D9: spent transport tokens are reclaimed without weakening the replay guard."""
from __future__ import annotations

import json

import pytest

from agent_box.extensions import HostTransportOperation
from agent_box.extensions.runtime_composition.protocol import CompositionErrorCode, CompositionRejected
from agent_box_runtime_local.provider import LocalHostTransport


def _transport():
    calls: list = []

    def executor(argv, **kwargs):
        calls.append((argv, kwargs))
        return 42

    return LocalHostTransport(executor=executor), calls


def _pair(transport, tmp_path, environment=None):
    return (transport.issue_cwd_token(tmp_path),
            transport.issue_env_token(environment or {"PATH": "/usr/bin"}))


def _operation(transport, cwd, env, spawn="spawn:one", attempt="attempt-1"):
    return transport.make_operation(attempt_key=attempt, spawn_token=spawn, spec_digest="spec",
                                    argv=("/usr/bin/true", "--safe"), cwd_token=cwd, env_token=env)


def test_a_spent_pair_leaves_nothing_behind(tmp_path):
    transport, calls = _transport()
    cwd, env = _pair(transport, tmp_path)
    assert transport.submit(_operation(transport, cwd, env)).startswith("local:")
    assert calls, "the operation reached the executor"
    assert transport._paths == {} and transport._envs == {}


def test_many_operations_do_not_grow_the_binding_ledgers(tmp_path):
    # The defect was unbounded growth, so the pin is a loop rather than one round:
    # the payload maps stay empty while the replay ledger keeps its judgements.
    transport, _calls = _transport()
    for index in range(50):
        cwd, env = _pair(transport, tmp_path, {"N": str(index)})
        transport.submit(_operation(transport, cwd, env, spawn=f"spawn:{index}", attempt=f"attempt-{index}"))
    assert transport._paths == {} and transport._envs == {}
    assert len(transport._consumed) == 50


def test_reclaiming_a_pair_never_turns_a_consumed_spawn_token_back_into_a_live_one(tmp_path):
    # The hard constraint of this increment, pinned by its reason string: replay is
    # refused by the single-use ledger, not accidentally by a binding that happens
    # still to be there.
    transport, calls = _transport()
    cwd, env = _pair(transport, tmp_path)
    operation = _operation(transport, cwd, env)
    transport.submit(operation)
    with pytest.raises(CompositionRejected) as error:
        transport.submit(operation)
    assert error.value.code is CompositionErrorCode.SPAWN_TOKEN_INVALID
    assert "single-use" in str(error.value)
    assert len(calls) == 1


def test_a_reclaimed_token_cannot_be_spent_by_a_fresh_operation(tmp_path):
    # A reclaimed binding reads as expired, so the reclaim strictly narrows what
    # can be submitted: no second operation inherits the first one's directory or
    # environment.
    transport, calls = _transport()
    cwd, env = _pair(transport, tmp_path)
    transport.submit(_operation(transport, cwd, env, spawn="spawn:one"))
    with pytest.raises(CompositionRejected) as error:
        transport.submit(_operation(transport, cwd, env, spawn="spawn:two"))
    assert "expired" in str(error.value)
    assert len(calls) == 1


def test_an_operation_that_never_reached_the_executor_keeps_its_tokens_spendable(tmp_path):
    # Reclaim is tied to the spend, not attempted on every rejection: validation
    # runs before the single-use record is written, so a caller whose operation is
    # refused outright can still submit a corrected one with the bindings it was
    # given.  The operation is built by hand because make_operation would refuse the
    # same payload earlier, outside the window under test.
    transport, calls = _transport()
    cwd, env = _pair(transport, tmp_path)
    bad = HostTransportOperation("attempt-1", "spawn:one", "spec", transport.transport_kind,
                                 json.dumps({"argv": ["/usr/bin/true", ""], "cwd_token": cwd,
                                             "env_token": env}, sort_keys=True))
    with pytest.raises(CompositionRejected):
        transport.submit(bad)
    assert cwd in transport._paths and env in transport._envs
    assert transport._consumed == set()
    transport.submit(_operation(transport, cwd, env))
    assert len(calls) == 1


def test_a_failed_launch_still_releases_the_binding_it_was_shown(tmp_path):
    # An OSError is the ambiguous outcome: the operation is consumed and can never
    # be replayed, so keeping the environment alive would only retain it.
    def failing(argv, **kwargs):
        raise OSError("no such file or directory")
    transport = LocalHostTransport(executor=failing)
    cwd, env = _pair(transport, tmp_path, {"TOKEN": "SECRET_MUST_NEVER_APPEAR"})
    with pytest.raises(CompositionRejected) as error:
        transport.submit(_operation(transport, cwd, env))
    assert error.value.code is CompositionErrorCode.CAPABILITY_UNAVAILABLE
    assert transport._paths == {} and transport._envs == {}


def test_the_reclaim_reports_counts_and_never_the_values_it_dropped(tmp_path):
    host_environment = {"OPENAI_API_KEY": "SECRET_MUST_NEVER_APPEAR"}
    transport, _calls = _transport()
    cwd, env = _pair(transport, tmp_path, host_environment)
    transport.submit(_operation(transport, cwd, env))
    released = transport.release()
    assert released == {"paths": 0, "envs": 0}
    assert "SECRET_MUST_NEVER_APPEAR" not in repr(released)
    assert "SECRET_MUST_NEVER_APPEAR" not in str(transport._consumed)


def test_release_leaves_the_replay_ledger_ruling_over_tokens_it_already_spent(tmp_path):
    # Releasing the host must not resurrect a spawn token: the guard survives a
    # release precisely because release declines to touch it.
    transport, calls = _transport()
    cwd, env = _pair(transport, tmp_path)
    operation = _operation(transport, cwd, env)
    transport.submit(operation)
    transport.release()
    with pytest.raises(CompositionRejected) as error:
        transport.submit(operation)
    assert "single-use" in str(error.value)
    assert len(calls) == 1
