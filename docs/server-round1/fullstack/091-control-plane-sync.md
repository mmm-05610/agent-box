# Work Order 091 — 控制面同步集合、冲突规则与实现边界（阶段 1 契约文档）

> 依 R-0012（控制面＝Windows；执行侧＝WSL/被管理远端；密钥只在 Windows）。
> 本文件是 091 的**同步集合与冲突规则**权威口径（工单要求"写进文档并逐项实现"）。
> 现状澄清：AGENTS.md 与 45 §decision4 定"远程 Worker 持有**有界执行投影**，不是第二权威存储"；
> 091 只取代 45 §6 中"控制面记录也不同步"那一小段，**不**推翻"执行侧非权威、home/会话按平台"。
> ⇒ 首次部署＝**有界、派生、可重导**的投影 + 部署清单（逐项摘要），**不是**在 Worker 上建第二权威库。

## 1 同步集合（SYNC SET）——逐项、固定顺序

| kind | 来源 | 版本列 | 载体 | 备注 |
| --- | --- | --- | --- | --- |
| `profile` | 控制面 `server_profiles`（含 config_object_digest、permission_preset/rules、model 槽） | `version` ✓ | 正文经 ObjectStore 内容寻址 | 权限规则/配置随 profile 一起 |
| `provider-model` | `server_provider_models` | `version` ✓ | 同上 | 上游接入记录 |
| `workspace` | `server_workspaces` | `version` ✓ | 记录本身 | 工作区**记录**（放置事实），不含原生 home |

**明确不同步（NOT SYNCED，按平台/按设计）**：原生 home 与 checkpoint（45）、会话与转写（会话是跨平台执行的新原生会话）、
**凭据内容**（只 Windows 持有；执行期一次性投影，见 §3）。

未纳入版本化集合的 kind（**本轮剩余**，见 §5）：`asset binding`（`server_profile_assets` 无版本列、绑定即 upsert）、
`hook`（`server_hooks` 无版本列、删除是硬删无墓碑）、`subagent grant`、`account`、`asset catalogue`。
⇒ 增量"删除"语义对这几类暂不可表达（无墓碑/版本），本单只落地三类**有版本**记录的首部署+增量，其余登记为精确剩余。

## 2 冲突规则：Windows 胜

- 控制面（Windows）是**唯一可写权威**；执行侧对同步集合**只读**。
- 执行侧任何"本地改同步记录"的尝试 ⇒ **类型化拒绝**（`CONTROL_PLANE_AUTHORITY`，携带权威 version/digest，
  提示"在 Windows 侧改"）。静默接受本地改＝门红（G4）。
- 交付幂等：以 `(kind, id, version, digest)` 为幂等键；**同版本重投不重复应用**；改动（version↑ 或 digest 变）必达（G2）。
- 部署清单 `DeploymentManifest`：逐项 `{kind,id,version,digest}` + 整单 `manifest_digest`；
  逐项摘要复用既有 `records.digest`/`canonical`；结构复用 45 的 native-home manifest 惯用法（`sidecar_backend.py:492-506`）。

## 3 凭据：只在 Windows，每次执行一次性投影（G3）

- 记录只存 `secret_locator`；正文经 `records.reject_sensitive_keys`（`records.py:26`）——
  **同步集合正文里出现任何 secret 形键 ⇒ 类型化 `SECRET_FIELD_FORBIDDEN` 拒绝**，故凭据内容**结构上不可能**进入投影。
- 执行期一次性投影沿用既有链路（`runtime.py:827-830` 读 → `sidecar.py:406-410 secret.put` 一次写
  → 退出 `secret.cleanup`；`state_capture.py` 命中即 `SIDECAR_STATE_CONTAINS_SECRET` 删）。**本单不改这条链**。
- 反例（G3）：向执行侧投影灌含凭据正文的记录 ⇒ 部署规划拒绝；对投影落点扫注入值 ⇒ **零命中**。

## 4 派发/接线（不加新 wire，遵工单"不改方法数/形状"）

- 引擎 `src/agent_box/server/execution/control_plane_sync.py`＝纯逻辑（planner+投影+增量+冲突+secret 拒），
  与**传输无关**（无论下面裁决如何都不作废）。落点在 `server/execution/**`（本树主写面）。
- 逐执行枚举真记录：`collect_sync_snapshot(profiles, provider_models, workspaces)` 读三类仓储列表 ⇒ SyncItem。
- 与"连接建立/首次部署"缝合：`ServerRuntime.start()`（`_import_declared_credentials` 同款"声明→幂等 reconcile"槽）
  或 `probe()`（hello 后 close 前）——**取决于 §5 传输裁决**。

## 5 **交回调度者的架构裁决（阻塞项，非我可拍）**

工单要求"首次连接部署 + 之后增量到执行侧"，但执行侧的**持久记录传输**受两约束夹住：
1. 现有对执行侧的**持久**可写通道只有 `home.put`（落原生 home——本单明确**不同步 home**）；
   `view.put`/`secret.put` 都是 attempt 级、用完即清。要在执行侧**持久**留存同步记录，只能
   ① 走 `home.put`（与"不同步 home"冲突），或 ② **新增一个 Worker 控制协议 op（如 `records.put`）**。
2. 工单禁"改 wire 方法数/形状 ⇒ 停下交回"。`wire/**`（client↔Server）与 **Worker 控制协议**（`PROTOCOL_VERSION=5`，
   `protocols/worker/v1.schema.json`）是两套契约；**新增 Worker op 是否算本单所禁的"新 wire"？** 且它会撞
   `test_the_control_protocol_is_named_in_both_sources` 与 `Bootstrap(deny_unknown_fields)`。

⇒ **请拍**：(A) 授权新增 Worker 持久 op（我据此实现首部署+增量落到执行侧并接 G1 真机腿），或
(B) 判定执行侧持久记录属"有界投影、每执行重建"（则"首部署"= 逐执行幂等重建清单、无跨机持久库，G1 以进程内两库投影验），或
(C) 其他。在其拍定前，本单交付**传输无关**的引擎+冲突+凭据边界与进程内 G1–G4 门，**PARTIAL**：
精确剩余＝①跨机持久传输（待此裁决）②无版本 kind（binding/hook/grant/account）的增量含删除（需 schema 版本列/墓碑 + `PRODUCT_SCHEMA_VERSION` 18→19）③Windows↔WSL 真机一次部署+一次增量（本环境无 Windows 宿主）。
