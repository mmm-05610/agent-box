"""阶段 D 接缝测试：实际启动前的唯一能力强制门。

直接驱动 ``SidecarExecutionBackend._start_run`` 的真实代码路径（不经过 wire），
用哑 launcher/port 观测两件事：需求来自 launcher 的实际挂载面；任何不满足都在
``open_execution`` 之前类型化拒绝——零 launcher、零 spawn，且经既有 fail_turn
路径由调用方持久化（本测试只断言异常与零调用）。
"""
from __future__ import annotations

import pytest

from agent_box.extensions import capability
from agent_box.server.execution.sidecar import SidecarError
from agent_box.server.execution.sidecar_backend import SidecarExecutionBackend

BINDING = "ubuntu-24.04|conn-7|/srv/remote-view"


class _Objects:
    def read(self, digest: str) -> bytes:
        del digest
        return b"{}"


class _LauncherStub:
    def __init__(self, *, executable=(), projection=(), artifact=(), state=None):
        self.executable_mounts = tuple((f"/src{index}", target)
                                       for index, target in enumerate(executable))
        self.projection_mounts = tuple((f"/srcp{index}", target)
                                       for index, target in enumerate(projection))
        self.runtime_artifact_mounts = tuple((f"/srca{index}", target)
                                             for index, target in enumerate(artifact))
        self.state_target = state


class _PortStub:
    def __init__(self, launcher, **material):
        self.launcher = launcher
        self.prompt_result = {}
        self.opened: list[str] = []
        self.capability_documents = tuple(material.get("documents", ()))
        self.capability_grants = tuple(material.get("grants", ()))
        self.capability_authorized_providers = tuple(material.get("authorized", ()))
        self.capability_binding = material.get("binding")

    def open_execution(self, turn_id: str) -> str:
        self.opened.append(turn_id)
        return f"native-{turn_id}"

    def prompt(self, turn_id, content, attachments):  # pragma: no cover - shaped for _Run
        del turn_id, content, attachments
        return dict(self.prompt_result)


def _document(*, readonly=(), writable=()):
    from agent_box_sandbox_bwrap.declarations import sandbox_declaration_document

    return sandbox_declaration_document(
        readonly_targets=tuple(readonly), writable_targets=tuple(writable),
        environment_binding=BINDING, observed_at=1_768_000_000,
    )


def _grants(*, executable=(), projection=(), artifact=(), state=None):
    return capability.sidecar_grants(
        deployment_executable_targets=tuple(executable),
        deployment_projection_targets=tuple(projection),
        deployment_artifact_targets=tuple(artifact),
        deployment_state_target=state,
    )


def _backend(port) -> SidecarExecutionBackend:
    backend = SidecarExecutionBackend(
        _Objects(), _Objects(), None,
        port_factory=lambda context, on_event: port,
    )
    backend._turn_by_core["core-1"] = "turn-1"
    backend._contexts["turn-1"] = {"input_object_digest": "obj-1"}
    return backend


def _start(backend: SidecarExecutionBackend):
    return backend._start_run("core-1", "dispatch-1", None, _Prompt(), None)


class _Prompt:
    content = "hello"


def test_unsatisfied_requirements_refuse_before_any_launcher_contact():
    launcher = _LauncherStub(projection=("/runtime/home/auth.json",))
    port = _PortStub(launcher)  # no documents/grants/binding injected
    backend = _backend(port)

    with pytest.raises(SidecarError) as caught:
        _start(backend)
    assert caught.value.code == "CAPABILITY_REQUIREMENT_UNSATISFIED"
    assert port.opened == []  # zero launcher/spawn


def test_demands_come_from_the_launcher_plan_so_an_undeclared_face_is_refused():
    # Injected material covers only the executable face; the launcher will also
    # mount a projection file. That demand has no coverage → refused, zero spawn.
    launcher = _LauncherStub(
        executable=("/runtime/bin/worker",),
        projection=("/runtime/home/auth.json",),
    )
    port = _PortStub(
        launcher,
        documents=(_document(readonly=("/runtime/bin/worker",)),),
        grants=_grants(executable=("/runtime/bin/worker",)),
        authorized=("sandbox-bwrap",),
        binding=BINDING,
    )
    backend = _backend(port)

    with pytest.raises(SidecarError) as caught:
        _start(backend)
    assert caught.value.code == "CAPABILITY_REQUIREMENT_UNSATISFIED"
    assert port.opened == []


def test_satisfied_material_reaches_open_execution_once():
    launcher = _LauncherStub(
        executable=("/runtime/bin/worker",),
        projection=("/runtime/home/auth.json",),
        state="/runtime/home/state",
    )
    port = _PortStub(
        launcher,
        documents=(_document(
            readonly=("/runtime/bin/worker", "/runtime/home/auth.json"),
            writable=("/runtime/home/state",),
        ),),
        grants=_grants(
            executable=("/runtime/bin/worker",),
            projection=("/runtime/home/auth.json",),
            state="/runtime/home/state",
        ),
        authorized=("sandbox-bwrap",),
        binding=BINDING,
    )
    backend = _backend(port)

    run = _start(backend)
    assert port.opened == ["turn-1"]
    assert run.native_id == "native-turn-1"


def test_empty_authorized_set_refuses_instead_of_meaning_no_restriction():
    # D-001：空授权集不是“不限制”，而是材料未注入 → fail-closed 拒绝。
    launcher = _LauncherStub(executable=("/runtime/bin/worker",))
    port = _PortStub(
        launcher,
        documents=(_document(readonly=("/runtime/bin/worker",)),),
        grants=_grants(executable=("/runtime/bin/worker",)),
        authorized=(),  # 空集必须原样表达为“无候选获准”，不得改写为 None
        binding=BINDING,
    )
    backend = _backend(port)

    with pytest.raises(SidecarError) as caught:
        _start(backend)
    assert caught.value.code == "CAPABILITY_REQUIREMENT_UNSATISFIED"
    assert port.opened == []


def test_unauthorized_declarer_is_refused_even_with_a_valid_document():
    launcher = _LauncherStub(executable=("/runtime/bin/worker",))
    port = _PortStub(
        launcher,
        documents=(_document(readonly=("/runtime/bin/worker",)),),
        grants=_grants(executable=("/runtime/bin/worker",)),
        authorized=("some-other-provider",),  # 批准映射不含 sandbox-bwrap
        binding=BINDING,
    )
    backend = _backend(port)

    with pytest.raises(SidecarError) as caught:
        _start(backend)
    assert caught.value.code == "CAPABILITY_REQUIREMENT_UNSATISFIED"
    assert port.opened == []


def test_production_assembly_material_cross_checks_the_plugin_descriptor():
    """D-003: 生产装配路径的身份核验与批准映射。

    直接调用 `build_runtime_from_sidecar_deployment` 使用的
    `runtime._capability_material`：声明 provider 必须与已安装插件的 descriptor id
    一致且两者都在锁定批准集内；把批准集换成不含该身份时，材料必须为空（门随后
    拒绝），而不是继续按声明自报放行。
    """
    import agent_box.server.bootstrap.runtime as runtime_module

    context = {"distribution": "Ubuntu", "connection_id": "connection",
               "remote_path": "/srv/project"}
    deployment = {
        "_executable_mounts": (("/usr/bin/node", "/runtime/bin/node"),),
        "_projection_mounts": (("/host/settings.json", "/runtime/home/settings.json"),),
        "_runtime_artifact_mounts": (),
        "_state_target": "/runtime/home/state",
    }
    documents, grants, authorized, binding = runtime_module._capability_material(
        context, deployment,
    )
    assert binding == "Ubuntu|connection|/srv/project"
    assert len(documents) == 1
    assert documents[0].provider == "sandbox-bwrap"
    assert authorized == ("sandbox-bwrap",)
    # 声明与授权是独立推导：grant 覆盖同一批认证面。
    assert {grant.capability_id for grant in grants} == {
        "filesystem.readonly@1", "filesystem.writable@1",
    }

    original = runtime_module._APPROVED_CAPABILITY_DECLARERS
    try:
        runtime_module._APPROVED_CAPABILITY_DECLARERS = frozenset({"some-other-provider"})
        documents, _grants, authorized, _binding = runtime_module._capability_material(
            context, deployment,
        )
        assert documents == ()
        assert authorized == ("some-other-provider",)
    finally:
        runtime_module._APPROVED_CAPABILITY_DECLARERS = original


def test_post_open_sidecar_error_with_the_same_code_is_not_a_start_rejection():
    """D-R2-001 反例：同名错误码的 post-open 错误不得被误标为启动前拒绝。

    端口带齐材料（门通过）后 open_execution 抛出 code=CAPABILITY_REQUIREMENT_UNSATISFIED
    的普通 SidecarError（模拟 sidecar 响应错误）：类型必须是 SidecarError 基类而非
    门专用 CapabilityGateRefusal——生产包装（provider.start）只转换专用类型，post-open
    路径因此保持既有 ambiguous 语义。
    """
    from agent_box.server.execution.sidecar_backend import CapabilityGateRefusal

    launcher = _LauncherStub()
    port = _PortStub(
        launcher,
        documents=(_document(),),
        grants=(),
        authorized=("sandbox-bwrap",),
        binding=BINDING,
    )

    def impostor(execution_id):
        raise SidecarError("CAPABILITY_REQUIREMENT_UNSATISFIED", "post-open impostor")

    port.open_execution = impostor  # type: ignore[method-assign]
    backend = _backend(port)

    with pytest.raises(SidecarError) as caught:
        _start(backend)
    assert not isinstance(caught.value, CapabilityGateRefusal), (
        "post-open error must not be the gate's dedicated refusal type"
    )
    assert caught.value.code == "CAPABILITY_REQUIREMENT_UNSATISFIED"
