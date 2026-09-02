# Extension Kernel Boundary Repair

本轮将架构边界收口为：

`Work Core → Extension Kernel → Protocol Packs → Concrete Plugins → Optional Hosts`

Extension Kernel (`agent_box.extensions`) 只拥有插件描述、上下文、注册、通用
`CatalogContribution`、Catalog 所有权/重复检测、事务式 loader、诊断和 conformance。
它不识别 Profile、Harness、Runtime、Credential、Transport 或 Web 语义。

Protocol packs 位于 `agent_box.protocols.host`、`.runtime` 和 `.credentials`。
Host pack 定义 typed selector、finalization、control、continuation 和 Resource
Library；Runtime pack 保留原有 single-spawn/replay/START_AMBIGUOUS/Finish 语义；
Credential pack 只暴露 locator-only、execution-scoped SecretMount 协议。

官方 Harness Profile Store、envelope、native payload 校验和 HostControl adapter
均位于 `plugins/agent-box-harnesses`。Profile 和 Skill 都以 Resource Library
贡献被发现，Catalog 只按 kind/id 查询，不理解二者业务。

插件 API 升级为 v2：`PluginRegistration` 仅保留 `contracts`、providers 和
`contributions`。旧的按业务命名字段不再是 canonical API，也没有静默 READY
兼容路径。

API v2 是 breaking boundary；API v1 descriptor 在 build 前明确报告
`INCOMPATIBLE`，不会执行 build，也不会向 Registry/Catalog 提交半状态。Canonical
imports 是 `agent_box.protocols.runtime`、`agent_box.protocols.credentials` 和
`agent_box.protocols.host`。

Profile envelope/store/native validation 由 `agent-box-harnesses` 拥有；Profile 与
Skill 通过各自的 Resource Library contribution 发现。Host 只能根据
`ResourceLibraryDescriptor` 和 exact Ref/revision/digest 操作，不能隐式选择第一项。

Closure evidence：Root 与 8 个 official plugin wheels 均构建成功；Root-only clean
venv import、空 plugin discovery、degraded doctor 成功；Preview clean venv 加载
12 个 READY entry points、27 个 generic contributions，并发现 6 个 Resource
Libraries（5 个 Profile view + 1 个 Skill library）。Python closure suite 为 142
passed；frontend Vitest 6 passed、
lint 和 production build 成功；compileall、`git diff --check` 和正式源码边界扫描
通过。未执行真实模型请求。

本轮不启用 MCP Resource，也不开始 Resource Routing Phase 2 的具体资源能力。
