# 四家 Harness 能力矩阵（统一合同）

日期：2026-09-14。分支 `feature/server-harness-extension-v1`。本文件登记统一后的 canonical 能力词汇、
合并规则、四家矩阵与逐项证据，以及本阶段消除的多源漂移。**这一层只是能力来源收敛**：它不登记
`BACKEND_IMPLEMENTATION_READY`，不提高 `workbench_model_verified_count`，也不替代四家真实模型门。

## 1. 唯一的事实来源

canonical id 固定为 8 个，scope 与"观测来源类型"一并版本化在
`src/agent_box/resource_contracts/harness_capabilities.py`（`CAPABILITY_SCHEMA_VERSION = 1`）：

| id | scope | 类别 | 观测来源 |
| --- | --- | --- | --- |
| `start` | execution | 实现级 | 已注册且被真实调用的 sidecar/driver 操作合同（`sidecar.operation.start`） |
| `observe` | execution | 实现级 | 同上（`sidecar.operation.create/open`） |
| `finish` | execution | 实现级 | 同上（`sidecar.operation.prompt`） |
| `stream` | message | 实现级 | 真实收到消息增量（`sidecar.event.message.delta`，ACP 与 native driver 同一串） |
| `attach` | message | 语义级 | 原生播发 `promptCapabilities.image` |
| `steer` | message | 语义级 | 本阶段无任何家声明，永不观测 |
| `permissions` | execution | 语义级 | **真实**发生 permission round-trip 且静态声明过 |
| `native_continuation` | session | 语义级 | 原生播发 `sessionCapabilities.resume`（空对象 `{}` 也算已播发） |

分布在五处的声明现在通过**受校验的单一来源**连起来：

```text
harnesses.toml（静态声明，registry 校验）
   == runtime/capability_declarations.json（JS 侧只读投影，逐项等值测试）
   == 四家 production 模板的 capabilityClaims（逐项等值测试）
   ⊆ runtime/profile_extensions.mjs 的 canonical 映射（Node 测试断言不超过上限）
```

`deployment.capabilityClaims` 不再是自由字典：键必须 ∈ canonical id、值必须是真 bool，未知键、漂移别名
（`streaming`/`approvals`/`attachments`/`sessions`/`resume`/`prompt`/`abort`…）、字符串真值、null、数组
全部类型化拒绝。Server/Core/Worker/bwrap 仍然只处理数据，没有任何品牌分支。

## 2. 声明、观测与有效能力

```json
{"schemaVersion": 1, "harnessType": "pi",
 "capabilities": [{"id": "native_continuation", "scope": "session", "declared": true,
                   "observed": true, "supported": true, "reason": null,
                   "nativeEvidence": "sessionCapabilities.resume"}]}
```

- `declared`：插件静态能力**上限**（来自 registry，经 deployment 校验后进入 Server）；
- `observed`：本次执行的真实观测，三态 `true` / `false` / `null`（not-observed）；
- `supported`：最终有效能力，**永不超过 `declared`**；
- `reason`：稳定原因码（`CAPABILITY_NOT_DECLARED`、`CAPABILITY_OBSERVED_UNSUPPORTED`、
  `CAPABILITY_NOT_OBSERVED`、`CAPABILITY_CONFLICT_OBSERVED_WITHOUT_DECLARATION`）；
- `nativeEvidence`：可选的非秘密证据串。

合并规则（`merge_capabilities`，逐条参数化测试）：

| declared | observed | supported | reason |
| --- | --- | --- | --- |
| true | true | true | — |
| true | false | false | `CAPABILITY_OBSERVED_UNSUPPORTED` |
| true | not-observed（实现级） | true | —（操作合同即观测） |
| true | not-observed（语义级） | **false** | `CAPABILITY_NOT_OBSERVED` |
| false | true | **false**（fail closed，runtime 不得抬高产品能力） | `CAPABILITY_CONFLICT_OBSERVED_WITHOUT_DECLARATION` |
| false | false / not-observed | false | `CAPABILITY_NOT_DECLARED` |

运行时观测**只影响当前 execution 的有效能力**，绝不回写全局 Profile 静态声明（有专门断言）。

## 3. 向上投影的三个边界（不得混用）

| 层 | 内容 | 来源 | 本阶段是否改变 |
| --- | --- | --- | --- |
| `hello.capabilities` | 仅 wire 方法与可用性，`{id, supported, reason?}` | wire 方法表（28 项） | **未改**（不塞入任何单家 Harness 能力，测试断言两个命名空间不相交） |
| Profile capability view | 角色能力上限 | canonical 静态声明（registry），**不读数据库旧快照** | 内部来源收敛，外部形状兼容 |
| Session/execution effective capabilities | 静态上限 ∩ 本次观测 | 合并后的有效视图 | 新增；checkpoint 的 `resumable`、附件门、审批行为都从这里读 |

`config.describe` / `config.resolve` 仍只负责配置控件，不与能力视图混为一体。

## 4. 四家矩阵（逐项证据，不预填）

| 家 | start | observe | finish | stream | attach | steer | permissions | native_continuation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Codex** | 声明 T / 未观测 | T / 未观测 | T / 未观测 | T / 未观测 | T / 未观测 | F | T / 未观测 | T / 未观测 |
| **Pi** | T / **已观测** | T / **已观测** | T / **已观测** | T / **已观测** | T / **未观测** | F | F | T / **已观测** |
| **Hermes** | T / **已观测** | T / **已观测** | T / **已观测** | T / **已观测** | F | F | F | T / **已观测** |
| **OpenCode** | T / **已观测** | T / **已观测** | T / **已观测** | T / **已观测** | F | F | F | T / **已观测** |

逐项证据：

- **Codex**：静态候选来自 registry（`start/observe/finish/attach/stream/permissions/native_continuation`）。
  **尚无生产封装**，没有任何动态观测，因此 `observed` 一律未观测；`codex/production.py` 只有能力声明，
  明确 `HAS_PRODUCTION_DEPLOYMENT = False`，不发明部署形状。
- **Pi**：`pi-production-chain-gate.py` 的两轮证据——`deltaSeq 4<7`、`completedSeq`、同一 `nativeSessionId`
  （`nativeSessionIdStable=true`）→ start/observe/finish/stream/native_continuation 已观测。`attach` 只有
  一半证据：真实握手确实播发 `promptCapabilities.image`，投递链路在代码上成立，但**没有任何一次运行送过
  非空附件**，故 `observed=null` → 有效 `supported=false`（保守）。
- **Hermes**：全链门直接观测 ACP `new_session → resume_session`、同一 native id、`state.db`(+WAL) 回投
  → `native_continuation` 已观测（本轮把静态 `continuation.kind` 从 `transcript_handoff` 收口为
  `native_session` 并加入 `native_continuation`）。不得声称 `attach`/`permissions`。
- **OpenCode**：重开相位 `createsInsideReopenPhase=[]`、`hostStarts ≥ 2`、同一 session id、第二轮上下文
  → `native_continuation` 已观测（静态 kind 同步收口）。驱动对附件显式 `OPENCODE_ATTACHMENTS_UNSUPPORTED`
  且 `image:false`，附件保持 F；不得声称 `permissions`。

## 5. 本阶段消除的多源漂移

1. **别名漂移**：`streaming`/`approvals`/`attachments` 曾同时存在于 Windows 验收部署与 Server 测试里；
   现在一律 canonical（`stream`/`permissions`/`attach`），出现在声明里即类型化拒绝。
2. **JS 与 TOML 各写一套**：`profile_extensions.mjs` 的原生词汇现在有显式 canonical 映射，并由
   `capability_declarations.json`（TOML 的受校验投影）作为上限，Node 测试断言不得超过。
3. **deployment 自由字典**：`capabilityClaims` 之前只做 `dict(...)` 透传，现在与 registry 同源同校验，
   测试断言四家模板与 TOML **逐项相等**。
4. **"能不能续接"的双重事实**：`resumable` 曾由 `_advertised(resume)` 单点决定并只看运行时播发；现在
   由有效 `native_continuation`（声明 ∩ 观测）决定——未声明 `native_continuation` 的部署其 checkpoint
   诚实地变成不可续接，而不是靠运行时猜测。
5. **附件静默丢弃**：有效 `attach=false` 时，Server 在派发前以 `ATTACHMENT_UNSUPPORTED` 类型化拒绝
   （且不留下没有归属的原生会话），不再把附件带进已经打开的会话。
6. **审批的虚假支持**：未声明 `permissions` 时，原生 permission 请求不会变成"支持"，而是保持
   unsupported 并把请求如实暴露。
7. **Server 品牌残留**：`SidecarHarnessPort` 的 `profile: str = "codex"` 默认值改为中立空值，调用方必须
   显式给出部署声明的 harness 类型（16/16 调用点已显式传值）。

## 6. Wire 不变式

本阶段**未改** wire：仍 `wire/1`、28 方法，TS 摘要
`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、生成工件摘要
`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`，与锁定值一致（Windows 验收脚本在
启动前校验生成工件；本阶段两次 Windows 运行均通过）。

## 7. 验证（本会话串行复跑）

```text
plugins/agent-box-harnesses/tests（registry + 四家模板 + 能力合同）        → 112 passed / 3 skipped
node --test plugins/.../harness_remote/*.test.mjs                          → 25 passed / 0 failed
node --test plugins/agent-box-harnesses/tests/capability_claims.test.mjs   → 13 passed / 0 failed
tests/server 能力合同 + 跨层集成 + 投影 + sidecar                          → 见下
Python 全量（tests + 全部插件 tests）                                      → 664 passed / 4 skipped / 0 failed
Pi / Hermes / OpenCode 三条假端点全链门（串行）                            → 全部 exit 0
runtime-artifact gate                                                      → exit 0
Rust `cargo fmt --check` / `cargo test --locked --release`                 → 干净 / 10 passed
Windows c4 r4（未重建，`sha256:31e92959…`）+ `-PostCheck`                  → exit 0 / POSTCHECK_CLEAN
```

Windows 证据要点：8 秒静默在**默认 5 秒租约**下完成（`elapsed_ms=8831`、`turn_state=completed`、
`lease_override=false`）；有状态 harness 在声明 `native_continuation` 后仍是
`session/new → session/resume`、delta `9 < completed 12`、checkpoint 可续接。

## 8. 未完成与残余

- **真实模型门仍未执行**：本层只是无模型的能力来源收敛；四家仍 `MODEL_NOT_VERIFIED`，
  `workbench_model_verified_count = 0`。
- **Codex 生产封装仍未完成**：其能力只有静态候选，没有任何动态观测。
- **Pi 的 `attach`**：静态候选保留，有效能力为 false，直到有一次真实附件运行。
- **Profile HOME 隔离**：`PROFILE_NATIVE_HOME_ISOLATION_DESIGN_LOCKED` /
  `implementation=PENDING_HARDENING`，与本文件无关但同属后续工作。
- **`_CoreSidecarProvider.capabilities()`** 仍是 Work Core 自己的 operation 词汇
  （`streaming`/`cancel`/`approvals` 字符串 map），无消费方，本阶段**故意未动**；若要全量收口需另开一轮。
