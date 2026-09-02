"""Shared offline fixtures for the Harness chain tests.

Everything here is synthetic: fake executables, fake runtime ports, a fake
process transport.  No real Harness CLI is spawned and no credential value
exists anywhere.
"""
from __future__ import annotations

import json
from pathlib import Path

from agent_box.protocols.runtime import (
    SandboxV1, RuntimeHostV1, TerminalSessionV1,
)
from agent_box.protocols.runtime.protocol import (
    IsolatedProcessSpec, MountPlan, RuntimeHostRef, SandboxRef,
    TerminalAllocation, TerminalRunHandle, TerminalSessionRef,
)
from agent_box.protocols.runtime.protocol import content_digest
from agent_box.resource_contracts import PromptFragmentV1, WorkspaceV1
from agent_box.work_core import ExecutionStartRequest, Ref, RefType, ResolvedExecutionInput

from agent_box_harnesses.registry import load_builtin_registry
from agent_box_harnesses.registry.schema import ExecutableSpec
from agent_box_harnesses.resources.executable import resolve_executable


def make_fake_executable(bin_dir: Path, identity: str, *, version: str = "1.2.3-fake", body: str | None = None) -> Path:
    bin_dir.mkdir(parents=True, exist_ok=True)
    binary = bin_dir / identity
    script = body if body is not None else f"#!/bin/sh\necho {identity} {version}\n"
    binary.write_text(script, encoding="utf-8")
    binary.chmod(0o755)
    return binary


def resolve_fake_executable(bin_dir: Path, definition, *, probe: bool = False):
    spec = definition.executable if isinstance(definition.executable, ExecutableSpec) else definition.executable
    return resolve_executable(spec, search_path=str(bin_dir), probe=probe)


def resolved_executable_for(tmp_path: Path, definition, *, probe: bool = False):
    """Create a synthetic executable for the definition and resolve it typed."""
    make_fake_executable(tmp_path / "bin", definition.executable.identity)
    return resolve_executable(definition.executable, search_path=str(tmp_path / "bin"), probe=probe)


class FakeHostPort:
    def __init__(self, ref: RuntimeHostRef):
        self.ref = ref
        self.capabilities = None
        self.transport = self
        self.submitted: list[object] = []

    def stage(self, bundle):
        return bundle

    def submit(self, operation):
        self.submitted.append(operation)
        return "native:fake"


class FakeSandboxPort:
    def __init__(self, ref: SandboxRef):
        self.ref = ref
        self.capabilities = None
        self.provider = self
        self.sources: dict[str, tuple[Path, str | None]] = {}
        self.wrapped: list[tuple[MountPlan, object]] = []

    def register_prepared_source(self, token, path, *, authorized_scope=None):
        self.sources[token] = (Path(path), authorized_scope)

    def register_prepared_secret_mount(self, mount, path):
        if not hasattr(self, "_secret_sources"):
            self._secret_sources = {}
        self._secret_sources[mount.token] = (Path(path), mount.execution_scope)

    def wrap(self, mount_plan: MountPlan, command, *, attempt_key: str) -> IsolatedProcessSpec:
        self.wrapped.append((mount_plan, command))
        return IsolatedProcessSpec("spawn:fake", attempt_key, "digest:fake", command.io_mode, local_argv=tuple(command.argv))


class FakeTerminalPort:
    def __init__(self, ref: TerminalSessionRef, transport: FakeHostPort):
        self.ref = ref
        self.capabilities = None
        self._transport = transport
        self._allocation = None
        self.specs: list[IsolatedProcessSpec] = []

    def allocate(self) -> TerminalAllocation:
        self._allocation = TerminalAllocation("allocation:fake", self.ref, "allocation-digest")
        return self._allocation

    def run(self, host_transport, spec, attempt_key):
        self.specs.append(spec)
        native = host_transport.submit({"spec_digest": spec.spec_digest, "attempt_key": attempt_key})
        return TerminalRunHandle(attempt_key, str(native), "running", self._allocation.allocation_id)


class FakeProcess:
    """A fake exited/live process transport for observation tests."""

    def __init__(self, stdout: str = "", exit_code: int | None = 0, alive: bool = False):
        self.stdout = _TextStream(stdout)
        self._exit_code = None if alive else exit_code

    def poll(self):
        return self._exit_code


class _TextStream:
    def __init__(self, text: str):
        self._text = text

    def read(self, size: int = -1) -> str:
        if size is None or size < 0:
            text, self._text = self._text, ""
        else:
            text, self._text = self._text[:size], self._text[size:]
        return text


def make_runtime_inputs(affinity: str = "local:test"):
    host_ref = RuntimeHostRef("host", "h", "digest-h", affinity)
    # network inherit: the five plans require model-API control-plane network
    sandbox_ref = SandboxRef("sandbox", "s", "digest-s", affinity, network_mode="inherit")
    terminal_ref = TerminalSessionRef("terminal", "t", "digest-t", affinity)
    host_port, sandbox_port, terminal_port = FakeHostPort(host_ref), FakeSandboxPort(sandbox_ref), FakeTerminalPort(terminal_ref, FakeHostPort(host_ref))
    # share one transport host so submitted operations are observable
    terminal_port._transport = host_port
    values = (
        (RuntimeHostV1.contract_id, RuntimeHostV1(host_ref, host_port)),
        (SandboxV1.contract_id, SandboxV1(sandbox_ref, sandbox_port)),
        (TerminalSessionV1.contract_id, TerminalSessionV1(terminal_ref, terminal_port)),
    )
    return values, host_port, sandbox_port, terminal_port


def make_request(tmp_path: Path, definition, *, executable, workspace_dir: Path | None = None,
                 profile=None, prompt: str = "do the task", execution_id: str = "exec_test",
                 dispatch_id: str = "dispatch_test", extra_inputs: tuple = (), affinity: str = "local:test"):
    workspace_dir = workspace_dir or tmp_path / "workspace"
    workspace_dir.mkdir(parents=True, exist_ok=True)
    workspace = WorkspaceV1(workspace_dir, content_digest(workspace_dir))
    runtime_values, host_port, sandbox_port, terminal_port = make_runtime_inputs(affinity)
    inputs = [ResolvedExecutionInput(WorkspaceV1.contract_id, Ref(RefType.WORKSPACE, "w", "w"), workspace)]
    if prompt:
        inputs.append(ResolvedExecutionInput(
            PromptFragmentV1.contract_id, Ref(RefType.ARTIFACT, "prompt", "p"),
            PromptFragmentV1("task", prompt, "sha256:" + "0" * 64),
        ))
    if profile is not None:
        inputs.append(ResolvedExecutionInput(
            profile.contract_id, Ref(RefType.ARTIFACT, "harness-profile", "main",
                                     metadata={"harness_type": definition.harness_type, "revision": str(profile.revision), "digest": profile.digest}),
            profile,
        ))
    inputs.extend(ResolvedExecutionInput(cid, Ref(RefType.ARTIFACT, "runtime", cid), value) for cid, value in runtime_values)
    inputs.extend(ResolvedExecutionInput(getattr(value, "contract_id", "opaque.extra"), Ref(RefType.ARTIFACT, "extra", "x"), value) for value in extra_inputs)
    request = ExecutionStartRequest(execution_id, dispatch_id, "inputs-digest", tuple(inputs))
    return request, host_port, sandbox_port, terminal_port


def registry_definitions():
    return load_builtin_registry().all()


def definition_by_driver(driver: str):
    registry = load_builtin_registry()
    for definition in registry.all():
        if definition.driver == driver:
            return definition
    raise KeyError(driver)
