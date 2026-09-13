# Work Order 40-A — 复用底座：固定闭包抽取与离线锁

日期：2026-09-14。状态：A 阶段门通过。零模型、零凭据、零真实 Harness 进程
（全部 fake native peer）。

## 固定源与来源账

- 上游：`https://github.com/giuliastro/harness-remote.git`，tag `v3.0.2`，
  commit `21ce6db49af708c4c7c3f96ef6a50f62dced8dab`（`Release Harness Remote 3.0.2`，
  clone 后 git log 核对一致）。
- 许可：Apache-2.0；`LICENSE` 原文随闭包保留；`PATCHES.md` 记录修改通告。
- 快照落点：`plugins/agent-box-harnesses/third_party/harness_remote/`（324 KiB）。
- `SOURCE.json`：逐文件 sha256（上游哈希 + 当前哈希；补丁文件记录 patched 哈希）。
  20 个上游文件中仅 `acp-client.js` 有改动（权限补丁），其余全部 byte-identical。

## 闭包清单（20 + 1 机械补丁文件，导入自闭合，零外部 npm 依赖）

第一 ACP 切片（15）：acp-client / acp-prompt-echo-filter / acp-service /
agent-model-catalog / transcript-cache / bounded-lru / harness-profiles /
harness-capability-contract / codex-session-history / omp-session-history /
pi-session-history / backward-line-scan / extension-actions /
omp-extension-action-state / launcher。
第二 OpenCode 切片（5）：opencode-host / managed-event-fanout / agent-router /
http-policy / task-model。
机械补丁新文件（1）：acp-registration.js（daemon-cli 注册块的原样上移，见下）。

未采纳（38 边界禁止项）：machine-daemon、daemon-cli、machine-registry、task-*、
worktree-*、work-thread-*、session-link-store、session-operation-ledger、
task-run-store、server.js、cli.js、config.js、project-catalog.js、
session-claim-server.js、agent-model-server.js 等控制面文件。

## 补丁账（PATCHES.md 的摘要）

1. `acp-client.js` 异步权限解析器：新增 `permissionResolver` /
   `permissionTimeoutMs` 构造参数。注入时以 await 决策取代静态 allow 快捷路径；
   未回答/超时/抛错/断连一律 `cancelled`（默认拒绝）；决策返回的 optionId 必须
   匹配 options，伪造 id 拒绝；await 后复核子进程身份防跨连接写答案。未注入时
   与上游 byte-for-byte 行为一致（有测试锁定该回退路径）。
2. `acp-registration.js`：daemon-cli.js 内联注册块（AcpClient + AcpAgentModelCatalog +
   capability contract + AcpService options）机械上移为导出工厂 `createAcpRegistration`，
   允许嵌入方构造单 profile 而不采纳 daemon 控制面。38 边界明文允许该机械补丁。

## AgentBox 胶水（runtime/worker-entry.mjs）

- provenance 校验：启动即对 SOURCE.json 逐文件验哈希，不匹配拒启
  （`PROVENANCE_MISMATCH` 测试在案）。
- 隔离强制：无 `AGENTBOX_SIDECAR_ISOLATED=1` 拒启（`SIDECAR_ISOLATION_REQUIRED`），
  环境由 Worker 注入（HOME/XDG 清空的测试即用该通道）。
- NDJSON stdio envelope：register/start/open/create/prompt/abort/status/close +
  `permission_decision` 往返；`acp_notification`/`service`/`stderr`/`adapter_exit`/
  `permission_request` 事件上行。无品牌分支：profile id 透传上游注册表
  （omp/pi/claude/codex）；OpenCode 走其独立 HTTP host 闭包（后续阶段接线）。
- 权限审批桥：envelope 向上发 `permission_request`，超时（permissionTimeoutMs）
  默认拒绝，不落任何静态 allow。

## 离线锁与 SBOM（runtime/）

- `package.json`：精确 `@agentclientprotocol/codex-acp@1.1.14`、
  `@automatalabs/pi-acp@0.5.0`；overrides 固定 `@agentclientprotocol/sdk@1.3.0`
  （防 ^1.3.0 浮动到 1.4.0）、`@openai/codex@0.147.0`。
- `package-lock.json`：349 个生产包全部带 sha512 integrity（含 codex 六平台二进制
  0.147.0、Pi `@earendil-works/*` 0.84.2 族）。`artifacts/SBOM.json` 逐包记录
  name/version/integrity/resolved/license。
- `vendor/`：两个顶层适配器 tarball 原样入库存档；全闭包用
  `npm ci --ignore-scripts` 按锁重建（任何提供同 integrity 的镜像可离线复现），
  完整 node_modules（约百 MB 平台二进制）不入 git。
- 运行时 `npx` 回退永不触达：envelope 强制显式 `launch.command`（绝对路径审查过的
  适配器可执行件），否则 register 报 `ADAPTER_LAUNCH_REQUIRED`。

## 验证记录（fake native peer，全部零凭据）

```text
node --test plugins/agent-box-harnesses/tests/harness_remote/snapshot_seams.test.mjs
→ tests 12, pass 12, fail 0
  （38 实验 harness_remote_stage_b.test.mjs 全部6个场景适配快照重跑通过 +
   权限补丁5个新门：grant/deny/无resolver回退/timeout/未知optionId）

node --test plugins/agent-box-harnesses/tests/harness_remote/sidecar_envelope.test.mjs
→ tests 4, pass 4, fail 0
  （隔离拒启、快照篡改拒启、register/start/create/prompt 纵切含终止前
   acp_notification 事件、二次 open 保持 native id、未知op/重复注册类型化错误）
```

## 本阶段遗留

- OpenCode HTTP host 的 sidecar 接线（第二闭包文件已在快照内， ManagedOpenCodeHost
  fake 行为已验证）归入 40-C OpenCode 家。
- Worker(Python) ↔ sidecar 通道、bwrap 投影、进程树回收 = 40-B。
- 各家组件矩阵与原生差异证明 = 40-C；汇总矩阵 = 40-D。
