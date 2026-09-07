"""C2.3/C2.4 Codex adapter authority guards.

All fixtures are locator-only and offline.  No credential value exists and no
model request or native Codex process is started.
"""
from __future__ import annotations

from dataclasses import replace

import pytest

from agent_box.protocols.credentials import PreparedSecretMount
from agent_box.resource_contracts import (
    AgentBoxProfileV1,
    CredentialRefV1,
    HarnessModelProviderV1,
)
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.adapters.failures import PlanRejected
from agent_box_harnesses.adapters.observation import (
    Observation,
    ObservationKind,
    TerminalCondition,
)
from agent_box_harnesses.codex.continuation import CodexContinuationResourceProvider
from agent_box_harnesses.codex.execution_authority import CodexExecutionAuthority
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from helpers import FakeProcess, definition_by_driver, make_request, resolved_executable_for


MODEL = "gpt-offline-contract"
LOCATOR = "provider-credential/opaque-7"


class LocatorOnlyMaterializer:
    provider_id = "gateway-provider"
    auth_guest_target = "/runtime/home/.codex/auth.json"

    def __init__(self) -> None:
        self.prepare_calls = 0

    def prepare_mount(self, ref, execution_scope, guest_target, access):
        self.prepare_calls += 1
        assert ref.native_locator == LOCATOR
        return PreparedSecretMount(
            "opaque-prepared-token", ref, execution_scope, guest_target, access
        )

    def bind_to_sandbox(self, prepared, sandbox_port):
        del prepared, sandbox_port


class CredentialAccessTrap:
    """Structurally credential-shaped; any locator access fails the test."""

    contract_id = CredentialRefV1.contract_id

    @property
    def native_locator(self):
        raise AssertionError("credential locator accessed before provider rejection")


def _provider_config(
    *,
    enabled=True,
    harness_type="codex",
    models=(MODEL,),
    protocol_family="openai-responses",
):
    return HarnessModelProviderV1(
        config_id="provider-config-7",
        harness_type=harness_type,
        revision=7,
        digest="sha256:" + "7" * 64,
        protocol_family=protocol_family,
        base_url="https://provider.invalid/v1",
        models=tuple({"model_id": item} for item in models),
        credential_ref=LOCATOR,
        projection={"native_provider_id": "agentbox-provider"},
        enabled=enabled,
    )


def _spliced_request(tmp_path, *, provider_config, credential):
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    request, *_ = make_request(
        tmp_path,
        definition,
        executable=executable,
        prompt="offline contract check",
    )
    inputs = request.resolved_inputs + (
        ResolvedExecutionInput(
            HarnessModelProviderV1.contract_id,
            Ref(
                RefType.ARTIFACT,
                "harness-model-provider",
                "provider-config-7/revisions/7",
                metadata={
                    "revision": "7",
                    "digest": provider_config.digest,
                    "harness_type": provider_config.harness_type,
                },
            ),
            provider_config,
        ),
        ResolvedExecutionInput(
            CredentialRefV1.contract_id,
            Ref(RefType.ARTIFACT, "gateway-provider", LOCATOR),
            credential,
        ),
    )
    return (
        ExecutionStartRequest(
            request.execution_id,
            request.dispatch_id,
            request.inputs_digest,
            inputs,
        ),
        definition,
        executable,
    )


def test_disabled_or_incompatible_provider_fails_before_credential_locator_access(tmp_path):
    for config, code in (
        (_provider_config(enabled=False), "MODEL_PROVIDER_DISABLED"),
        (_provider_config(harness_type="claude-code"), "MODEL_PROVIDER_HARNESS_MISMATCH"),
        (_provider_config(protocol_family="anthropic-messages"), "MODEL_PROVIDER_PROTOCOL_UNSUPPORTED"),
        (_provider_config(protocol_family="openai-completions"), "MODEL_PROVIDER_PROTOCOL_UNSUPPORTED"),
        (_provider_config(models=("other-model",)), "MODEL_NOT_ELIGIBLE"),
    ):
        request, definition, executable = _spliced_request(
            tmp_path / code, provider_config=config, credential=CredentialAccessTrap()
        )
        authority = CodexExecutionAuthority(selected_model=MODEL)
        with pytest.raises(PlanRejected) as caught:
            authority.freeze(request, executable)
        assert caught.value.code == code


def test_exact_launch_facts_freeze_before_designated_secret_projection(tmp_path):
    credential = CredentialRefV1("gateway-provider", LOCATOR, "codex", revision=3)
    config = _provider_config()
    request, definition, executable = _spliced_request(
        tmp_path, provider_config=config, credential=credential
    )
    materializer = LocatorOnlyMaterializer()
    provider = GenericExecutionProvider(
        definition,
        ADAPTERS["codex"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
        credential_materializer=materializer,
        launch_authority=CodexExecutionAuthority(selected_model=MODEL),
    )

    receipt = provider.start(request)
    handle = receipt.runtime_handle
    assert materializer.prepare_calls == 1
    assert handle.launch_facts.profile_revision is None
    assert handle.launch_facts.provider_revision == 7
    assert handle.launch_facts.provider_digest == config.digest
    assert handle.launch_facts.model == MODEL
    assert handle.launch_facts.executable_digest == executable.digest
    assert handle.launch_facts.credential_revision == 3
    assert handle.secret_delivery.credential_revision == 3
    assert handle.secret_delivery.guest_target == "/runtime/home/.codex/auth.json"
    rendered = repr((handle.launch_facts, handle.plan, handle.command))
    assert "credential_value" not in rendered
    assert LOCATOR not in repr(handle.launch_facts)
    assert all(LOCATOR not in item for item in handle.command.argv)
    assert LOCATOR not in repr(dict(handle.command.environment))
    assert LOCATOR not in repr(handle.secret_delivery)


def test_exact_profile_revision_and_digest_are_frozen_and_stale_ref_is_rejected(tmp_path):
    profile = AgentBoxProfileV1(
        "profile-4", "codex", "sha256:" + "4" * 64, revision=4
    )
    request, _, executable = _spliced_request(
        tmp_path,
        provider_config=_provider_config(),
        credential=CredentialRefV1("gateway-provider", LOCATOR, "codex", revision=3),
    )
    request = replace(
        request,
        resolved_inputs=request.resolved_inputs
        + (
            ResolvedExecutionInput(
                AgentBoxProfileV1.contract_id,
                Ref(
                    RefType.ARTIFACT,
                    "harness-profile",
                    "profile-4",
                    metadata={
                        "harness_type": "codex",
                        "revision": "4",
                        "digest": profile.digest,
                    },
                ),
                profile,
            ),
        ),
    )
    authority = CodexExecutionAuthority(selected_model=MODEL)
    facts = authority.freeze(request, executable)
    assert facts.profile_revision == 4
    assert facts.profile_digest == profile.digest

    stale = replace(
        request,
        resolved_inputs=tuple(
            replace(
                item,
                ref=replace(item.ref, metadata={**item.ref.metadata, "revision": "3"}),
            )
            if item.contract_id == AgentBoxProfileV1.contract_id
            else item
            for item in request.resolved_inputs
        ),
    )
    with pytest.raises(PlanRejected) as caught:
        authority.freeze(stale, executable)
    assert caught.value.code == "PROFILE_REF_STALE"


def test_secret_delivery_contract_is_designated_scoped_non_replayable_and_public_safe(tmp_path):
    credential = CredentialRefV1("gateway-provider", LOCATOR, "codex", revision=3)
    request, _, executable = _spliced_request(
        tmp_path, provider_config=_provider_config(), credential=credential
    )
    authority = CodexExecutionAuthority(selected_model=MODEL)
    facts = authority.freeze(request, executable)

    delivery = authority.secret_delivery(request, facts)

    assert delivery.execution_id == request.execution_id
    assert delivery.guest_target == "/runtime/home/.codex/auth.json"
    assert delivery.delivery_class == "designated-secret-file"
    assert delivery.access == "read-only"
    assert delivery.replayable is False
    assert delivery.cleanup_required is True
    assert delivery.credential_revision == 3
    assert delivery.public_facts() == {
        "delivery_class": "designated-secret-file",
        "guest_target": "/runtime/home/.codex/auth.json",
        "access": "read-only",
        "replayable": False,
        "cleanup_required": True,
        "credential_revision": 3,
    }
    assert LOCATOR not in repr(delivery)
    assert LOCATOR not in repr(delivery.public_facts())


def test_codex_exec_capability_contract_is_honest_about_interactions():
    contract = CodexExecutionAuthority.capability_contract()
    assert contract.streaming == "stdout-ndjson"
    assert contract.cancel == "runtime-process-tree-required"
    assert contract.permission == "unavailable-in-exec-json"
    assert contract.question == "unavailable-in-exec-json"
    assert contract.terminal == "observed-once-after-native-terminal-or-exit"


def test_live_decoder_streams_incrementally_bounds_unknown_and_emits_terminal_once():
    decoder = ADAPTERS["codex"].new_live_decoder()
    first = decoder.feed_lines(
        (
            '{"type":"thread.started","thread_id":"thread-live"}',
            '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}',
        )
    )
    assert [item.kind for item in first] == [
        ObservationKind.SESSION,
        ObservationKind.MESSAGE,
    ]

    second = decoder.feed_lines(
        (
            '{"type":"future.event","body":"' + "x" * 20000 + '"}',
            '{"type":"turn.completed","usage":{}}',
            '{"type":"turn.completed","usage":{}}',
        )
    )
    assert sum(item.kind is ObservationKind.UNKNOWN for item in second) == 1
    assert sum(item.kind is ObservationKind.TERMINAL for item in second) == 1
    assert len(repr(next(item for item in second if item.kind is ObservationKind.UNKNOWN).native)) < 10000
    third = decoder.feed_lines(('{"type":"turn.completed","usage":{}}',))
    assert all(item.kind is not ObservationKind.TERMINAL for item in third)


def test_remote_default_codex_login_is_never_a_fallback(tmp_path, monkeypatch):
    config = _provider_config()
    request, _, executable = _spliced_request(
        tmp_path,
        provider_config=config,
        credential=CredentialRefV1("gateway-provider", LOCATOR, "codex"),
    )
    without_credential = replace(
        request,
        resolved_inputs=tuple(
            item
            for item in request.resolved_inputs
            if item.contract_id != CredentialRefV1.contract_id
        ),
    )
    monkeypatch.setattr(
        "pathlib.Path.home",
        lambda: (_ for _ in ()).throw(AssertionError("remote home fallback attempted")),
    )
    with pytest.raises(PlanRejected) as caught:
        CodexExecutionAuthority(selected_model=MODEL).freeze(
            without_credential, executable
        )
    assert caught.value.code == "CREDENTIAL_REF_REQUIRED"


def test_only_exact_committed_parent_output_ref_can_resolve_for_resume():
    provider = CodexContinuationResourceProvider()
    output_ref = provider.make_ref("thread-7", "codex")
    other_ref = provider.make_ref("thread-other", "codex")

    resolved = provider.resolve_committed_parent(
        next(iter(provider.supported_contract_ids)),
        output_ref,
        parent_execution_id="execution-7",
        committed_execution_id="execution-7",
        committed_output_ref=output_ref,
    )
    assert resolved.thread_id == "thread-7"
    for kwargs in (
        {"committed_execution_id": "execution-other", "committed_output_ref": output_ref},
        {"committed_execution_id": "execution-7", "committed_output_ref": other_ref},
        {"committed_execution_id": "execution-7", "committed_output_ref": None},
    ):
        with pytest.raises(ValueError, match="COMMITTED_PARENT_OUTPUT_REF_REQUIRED"):
            provider.resolve_committed_parent(
                "agent-box.codex-continuation@1",
                output_ref,
                parent_execution_id="execution-7",
                **kwargs,
            )


def test_native_checkpoint_capture_and_committed_parent_resume_state():
    provider = CodexContinuationResourceProvider()
    observations = (
        Observation(
            ObservationKind.SESSION,
            "codex",
            session_locator="thread-7",
        ),
        Observation(
            ObservationKind.TERMINAL,
            "codex",
            terminal_condition=TerminalCondition.TURN_COMPLETED,
        ),
    )
    checkpoint = provider.capture_checkpoint(
        source_execution_id="execution-7",
        source_provider="codex",
        observations=observations,
        artifact_digest="sha256:" + "a" * 64,
    )
    output_ref = provider.output_ref(checkpoint)

    assert output_ref.native_id == "thread-7"
    assert output_ref.metadata == {
        "source_provider": "codex",
        "source_execution_id": "execution-7",
        "checkpoint_digest": "sha256:" + "a" * 64,
    }
    state = provider.resolve_resume_state(
        next(iter(provider.supported_contract_ids)),
        output_ref,
        parent_execution_id="execution-7",
        committed_execution_id="execution-7",
        committed_output_ref=output_ref,
        locally_frozen_checkpoint=checkpoint,
    )
    assert state.continuation.thread_id == "thread-7"
    assert state.official_exec_argv == ("resume", "thread-7")
    assert state.materialization_required is True
    assert state.checkpoint_digest == "sha256:" + "a" * 64

    with pytest.raises(ValueError, match="COMMITTED_NATIVE_CHECKPOINT_REQUIRED"):
        provider.resolve_resume_state(
            "agent-box.codex-continuation@1",
            output_ref,
            parent_execution_id="execution-7",
            committed_execution_id="execution-7",
            committed_output_ref=output_ref,
            locally_frozen_checkpoint=replace(
                checkpoint, artifact_digest="sha256:" + "b" * 64
            ),
        )


def test_native_checkpoint_capture_requires_exact_successful_terminal_and_one_locator():
    provider = CodexContinuationResourceProvider()
    session = Observation(
        ObservationKind.SESSION, "codex", session_locator="thread-7"
    )
    success = Observation(
        ObservationKind.TERMINAL,
        "codex",
        terminal_condition=TerminalCondition.TURN_COMPLETED,
    )
    failed = Observation(
        ObservationKind.TERMINAL,
        "codex",
        terminal_condition=TerminalCondition.FAILED,
        is_error=True,
    )
    for observations, code in (
        ((success,), "NATIVE_SESSION_LOCATOR_REQUIRED"),
        ((session,), "SUCCESSFUL_TERMINAL_REQUIRED"),
        ((session, failed), "SUCCESSFUL_TERMINAL_REQUIRED"),
        ((session, replace(session, session_locator="thread-other"), success),
         "NATIVE_SESSION_LOCATOR_AMBIGUOUS"),
    ):
        with pytest.raises(ValueError, match=code):
            provider.capture_checkpoint(
                source_execution_id="execution-7",
                source_provider="codex",
                observations=observations,
                artifact_digest="sha256:" + "a" * 64,
            )


def test_unknown_events_are_bounded_and_terminal_is_emitted_once_per_handle(tmp_path):
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    provider = GenericExecutionProvider(
        definition,
        ADAPTERS["codex"],
        staging_root=tmp_path / "staging",
        executable_resolver=lambda spec: executable,
    )
    request, *_ = make_request(tmp_path, definition, executable=executable)
    handle = provider.start(request).runtime_handle
    native = (
        '{"type":"future.event","body":"' + "x" * 20000 + '"}\n'
        '{"type":"turn.completed","usage":{}}\n'
        '{"type":"turn.completed","usage":{}}\n'
    )
    object.__setattr__(handle.runtime, "transport", FakeProcess(native, exit_code=0))

    first = provider.observe(handle)
    second = provider.observe(handle)
    unknown = next(item for item in first if item.kind is ObservationKind.UNKNOWN)
    assert len(repr(unknown.native)) < 10000
    assert sum(item.kind is ObservationKind.TERMINAL for item in first) == 1
    assert all(item.kind is not ObservationKind.TERMINAL for item in second)
