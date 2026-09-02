"""Synthetic credential binding through the formal chain.

No real credential value exists anywhere here: the fixture materializer
serves a synthetic file.  The chain must carry only an opaque locator, bind
it as a read-only secret mount under the writable profile home, and never
place the secret value in the plan, the environment, or the argv.
"""
from pathlib import Path

import pytest

from agent_box.protocols.credentials import PreparedSecretMount
from agent_box.protocols.runtime import assemble_runtime_composition
from agent_box.resource_contracts import CredentialRefV1
from agent_box.work_core import Ref, RefType, ResolvedExecutionInput
from agent_box_harnesses.adapters import ADAPTERS
from agent_box_harnesses.generic.execution_provider import GenericExecutionProvider
from helpers import definition_by_driver, make_request, resolved_executable_for

SYNTHETIC_SECRET = b"SYNTHETIC-SECRET-NEVER-A-REAL-CREDENTIAL\n"
SYNTHETIC_DIGEST = "sha256:" + __import__("hashlib").sha256(SYNTHETIC_SECRET).hexdigest()


class SyntheticCodexMaterializer:
    """Fixture materializer: locator-only, synthetic source, typed boundary."""

    provider_id = "codex-login"
    supported_contract_ids = frozenset({"agent-box.credential@1"})

    def __init__(self, source: Path) -> None:
        self._source = source

    def prepare_mount(self, ref: CredentialRefV1, execution_scope: str, guest_target: str, access: str) -> PreparedSecretMount:
        assert access == "ro" and guest_target == "/runtime/home/auth.json"
        assert execution_scope.startswith("execution:")
        assert ref.native_locator == "codex-login/default"
        # the source is registered with the sandbox by bind_to_sandbox below
        return PreparedSecretMount("synthetic-secret:" + ref.native_locator, ref, execution_scope, guest_target, access)

    def bind_to_sandbox(self, prepared: PreparedSecretMount, sandbox_port) -> None:
        register = getattr(getattr(sandbox_port, "provider", None), "register_prepared_secret_mount", None)
        assert callable(register), "sandbox must expose the typed secret-mount boundary"
        register(prepared, self._source)

    def cleanup(self, prepared: PreparedSecretMount) -> None:
        pass


def _credential_ref() -> CredentialRefV1:
    return CredentialRefV1("codex-login", "codex-login/default", "codex")


def _request_with_credential(tmp_path, definition, executable, *, affinity: str = "local:test"):
    request, host_port, sandbox_port, terminal_port = make_request(
        tmp_path, definition, executable=executable, execution_id="exec_cred",
        prompt="use the synthetic credential", affinity=affinity)
    credential_input = ResolvedExecutionInput(
        CredentialRefV1.contract_id,
        Ref(RefType.ARTIFACT, "codex-login", "codex-login/default", metadata={"schema_version": "1", "revision": "1"}),
        _credential_ref(),
    )
    spliced = tuple(item for item in request.resolved_inputs) + (credential_input,)
    from agent_box.work_core import ExecutionStartRequest

    spliced_request = ExecutionStartRequest(request.execution_id, request.dispatch_id, request.inputs_digest, spliced)
    return spliced_request, sandbox_port


def test_credential_binding_is_locator_only_and_reaches_the_sandbox(tmp_path):
    source = tmp_path / "synthetic-auth.json"
    source.write_bytes(SYNTHETIC_SECRET)
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    materializer = SyntheticCodexMaterializer(source)
    provider = GenericExecutionProvider(definition, ADAPTERS["codex"], staging_root=tmp_path / "staging",
                                        executable_resolver=lambda spec: executable,
                                        credential_materializer=materializer)
    request, sandbox_port = _request_with_credential(tmp_path, definition, executable)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    # the plan carries only the opaque locator binding
    assert len(handle.plan.secret_bindings) == 1
    assert handle.plan.secret_bindings[0].locator == "codex-login/default"
    assert handle.plan.secret_bindings[0].guest_target == "/runtime/home/auth.json"
    # the sandbox registered the synthetic source for the read-only bind
    registered = sandbox_port._secret_sources
    assert any(path == source for path, _ in registered.values())


def test_secret_value_never_appears_in_plan_environment_or_argv(tmp_path):
    source = tmp_path / "synthetic-auth.json"
    source.write_bytes(SYNTHETIC_SECRET)
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    materializer = SyntheticCodexMaterializer(source)
    provider = GenericExecutionProvider(definition, ADAPTERS["codex"], staging_root=tmp_path / "staging2",
                                        executable_resolver=lambda spec: executable,
                                        credential_materializer=materializer)
    request, _ = _request_with_credential(tmp_path, definition, executable)
    receipt = provider.start(request)
    handle = receipt.runtime_handle
    canonical = repr(handle.plan.canonical()) + repr(dict(handle.command.environment)) + repr(handle.command.argv)
    assert "SYNTHETIC-SECRET" not in canonical
    assert "NEVER-A-REAL-CREDENTIAL" not in canonical


def test_credential_without_materializer_is_plan_rejected(tmp_path):
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    provider = GenericExecutionProvider(definition, ADAPTERS["codex"], staging_root=tmp_path / "staging3",
                                        executable_resolver=lambda spec: executable)
    from agent_box_harnesses.adapters.failures import PlanRejected

    request, _ = _request_with_credential(tmp_path, definition, executable)
    with pytest.raises(PlanRejected, match="CREDENTIAL_MATERIALIZER"):
        provider.start(request)


def test_real_bwrap_binds_the_synthetic_secret_read_only(tmp_path):
    pytest.importorskip("agent_box_sandbox_bwrap", reason="bwrap plugin not installed")
    from agent_box_sandbox_bwrap.provider import BwrapSandboxProvider

    sandbox_plugin = BwrapSandboxProvider(tmp_path / "sandbox")
    if sandbox_plugin.probe()["status"] != "available":
        pytest.skip("real bwrap unavailable: binary missing or namespace capability denied")

    source = tmp_path / "synthetic-auth.json"
    source.write_bytes(SYNTHETIC_SECRET)
    definition = definition_by_driver("codex")
    executable = resolved_executable_for(tmp_path, definition)
    materializer = SyntheticCodexMaterializer(source)
    provider = GenericExecutionProvider(definition, ADAPTERS["codex"], staging_root=tmp_path / "staging4",
                                        executable_resolver=lambda spec: executable,
                                        credential_materializer=materializer)
    request, _ = _request_with_credential(tmp_path, definition, executable, affinity="local:bwrap")
    sandbox_ref = sandbox_plugin.make_ref("bwrap-cloud-harness")
    resolved_sandbox = sandbox_plugin.resolve("agent-box.sandbox@1", sandbox_ref)
    spliced = tuple(
        ResolvedExecutionInput(item.contract_id, sandbox_ref, resolved_sandbox)
        if item.contract_id == "agent-box.sandbox@1" else item
        for item in request.resolved_inputs
    )
    from agent_box.work_core import ExecutionStartRequest

    spliced_request = ExecutionStartRequest(request.execution_id, request.dispatch_id, request.inputs_digest, spliced)
    receipt = provider.start(spliced_request)
    handle = receipt.runtime_handle
    # find the fake terminal that received the wrapped spec
    terminal_value = next(item.value for item in request.resolved_inputs if item.contract_id == "agent-box.terminal-session@1")
    assert terminal_value.specs, "the real sandbox must have wrapped the command"
    argv = terminal_value.specs[-1].local_argv
    assert any(argv[i] == "--ro-bind" and argv[i + 1] == "<secret-source>" and argv[i + 2] == "/runtime/home/auth.json"
               for i in range(len(argv) - 2))
    # the public argv redacts the secret source path
    assert str(source) not in argv
