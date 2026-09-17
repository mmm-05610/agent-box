"""G5 守卫：语义三元组 ↔ 具体能力的关系登记与 id 形状。

锁三件事：
1. 声明侧与需求侧出现的能力 id 全部登记在对应槽位（拼出来的 id 会被守卫拒绝）；
2. ``isolation.wrap@1`` 组与 sandbox 插件的 ``_CAPS`` 逐项一致（登记表与实现同步）；
3. host 槽位组与 runtime-local 的实际声明一致。
"""
from __future__ import annotations

import pytest

from agent_box.extensions.capability import COMPONENT_SLOT_CAPABILITIES, slot_of_capability
from agent_box.extensions.capability.errors import CapabilityIdInvalid
from agent_box.extensions.capability.ids import require_capability_id
from agent_box.extensions.capability.requirements import sidecar_requirements


SANDBOX_SLOT = "isolation.wrap@1"
HOST_SLOT = "process.spawn.typed@1"


def test_every_registered_id_has_a_slot():
    for slot, capabilities in COMPONENT_SLOT_CAPABILITIES.items():
        for capability_id in capabilities:
            assert slot_of_capability(capability_id) == slot


def test_invented_ids_have_no_slot():
    # 拼出来的 id 不属于任何槽位：守卫返回 None，调用方测试应当失败。
    assert slot_of_capability("filesystem.bogus@1") is None
    assert slot_of_capability("made.up@1") is None
    assert slot_of_capability("network.none") is None  # 没有主版本
    # 形状错误的能力 id 在登记入口就被拒绝（不允许静默放行）。
    with pytest.raises(CapabilityIdInvalid):
        require_capability_id("network.none")


def test_sandbox_declarations_are_registered_under_the_isolation_slot():
    from agent_box_sandbox_bwrap.declarations import sandbox_declaration_document

    document = sandbox_declaration_document(
        readonly_targets=("/runtime/bin/tool",),
        writable_targets=("/runtime/home/role/.pi",),
        environment_binding="fixture|binding",
        observed_at=1789000000,
    )
    for declaration in document.declarations:
        assert declaration.capability_id in COMPONENT_SLOT_CAPABILITIES[SANDBOX_SLOT]
        assert slot_of_capability(declaration.capability_id) == SANDBOX_SLOT


def test_sidecar_requirements_are_registered_under_the_isolation_slot():
    requirements = sidecar_requirements(
        executable_targets=("/runtime/bin/tool",),
        projection_targets=("/runtime/home/role/.pi/agent",),
        artifact_targets=("/runtime/artifacts/dep",),
        state_target="/runtime/home/role/.pi/sessions",
    )
    for requirement in requirements:
        assert slot_of_capability(requirement.capability_id) == SANDBOX_SLOT


def test_isolation_slot_matches_the_sandbox_cross_template_union():
    """登记表不是第二套词汇：它与 sandbox 的 ``_CAPS`` 必须逐项对齐。

    47 起 ``_CAPS`` 同时含槽位 id 本身（``isolation.wrap@1``，表示"本 provider
    真的提供这个机制"）与具体能力面；登记表只登记具体面，槽位 id 由槽位键表达。
    """
    from agent_box_sandbox_bwrap.provider import _CAPS

    assert set(_CAPS) - {SANDBOX_SLOT} == set(COMPONENT_SLOT_CAPABILITIES[SANDBOX_SLOT])
    assert SANDBOX_SLOT in _CAPS


def test_host_slot_matches_the_runtime_local_declaration():
    """登记表的 host 组必须覆盖 runtime-local 的具体能力声明。

    host provider 的声明里混有两层：具体能力 id（``argv.safe@1`` 等）与它认领的
    槽位 id（``process.spawn.typed@1``）。前者必须登记在 host 组；后者只允许是它
    自己的槽位——host provider 声明 ``isolation.wrap@1`` 或 ``terminal.run@1``
    就在这里失败（不允许越位认领别人的槽位）。
    """
    import inspect
    import re

    from agent_box_runtime_local.provider import LocalRuntimeHostProvider

    source = inspect.getsource(LocalRuntimeHostProvider.capabilities_for)
    declared = set(re.findall(r"\"([a-z][a-z0-9.-]+@[1-9][0-9]*)\"", source))
    assert declared, "the host provider declares no versioned capability ids"
    slots = set(COMPONENT_SLOT_CAPABILITIES)
    concrete = declared - slots
    assert concrete <= set(COMPONENT_SLOT_CAPABILITIES[HOST_SLOT]), (
        concrete - set(COMPONENT_SLOT_CAPABILITIES[HOST_SLOT]),
    )
    assert (declared & slots) == {HOST_SLOT}, declared & slots
