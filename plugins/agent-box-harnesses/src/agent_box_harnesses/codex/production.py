"""Codex 的能力声明座位（**最小**：只有能力声明，没有生产部署模板）。

为什么这个文件只有这一点内容：Codex 目前**没有**生产封装。它没有 `deploy/codex/`
下的原生配置、没有假端点全链门、没有任何一条真实运行证据。因此这里能诚实地写下来的
只有一件事——**静态声明**（它是产品层的能力上限，来自注册表 `harnesses.toml`，由
`registry.capability_claims` 派生），而不是任何"已观测/已支持"的结论。

本模块刻意**不**提供 `deployment_document()` / `harness_deployment()`：那会凭空发明
一份没有原生配置、没有工件、没有 gate 背书的部署形状，把"Codex 能跑生产链"写成事实。
等 Codex 真的有了工件闭包与链门证据，再由那个阶段补上它自己的模板。

与另外三家一致的地方：`capability_claims()` 是同一形状的接缝（四家同名），能力合同
测试用它逐项比对 `harnesses.toml`；`observed_capabilities()` 用来说清"已观测"这一栏
为什么是空的，并且它是**空集**而不是"等于声明"——两者差别就是本文件存在的理由。
"""
from __future__ import annotations

from ..registry.capability_claims import capability_claims as _derive_capability_claims

#: 注册表里的 `harness_type`。
HARNESS_ID = "codex"

#: 明确的否定事实，供测试与审计断言：本 Harness 还没有生产部署模板。
HAS_PRODUCTION_DEPLOYMENT = False


def capability_claims() -> dict[str, bool]:
    """本 Harness 的 canonical 静态声明（派生自注册表，不手写）。

    `attach` 与 `permissions` 在这里是**静态候选**，不是观测结论：Codex 有真实的
    `app_server` / `interactive` 执行 provider（`attach` 在 interactive provider 的
    能力表里确有其名），但那条路径没有被本阶段的假端点全链门跑过，而且它也不是本节
    四家封装所指的 generic sidecar 生产链。任何"已观测"都必须留空。
    """
    return _derive_capability_claims(HARNESS_ID)


def observed_capabilities() -> frozenset[str]:
    """**空集**：Codex 没有跑过真实假端点全链门，所以没有任何一项可以叫"已观测"。

    这里返回空集而不是 `capability_claims()` 的键，是本模块最重要的一行：只要 Codex
    还没有生产封装与链门证据，"已观测"就只能是空的；把静态候选折成观测结论正是任务
    禁止的静默升级。
    """
    return frozenset()
