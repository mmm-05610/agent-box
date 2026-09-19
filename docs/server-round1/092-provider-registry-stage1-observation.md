# Work Order 092 — Provider 记录中立化 + 协议词汇 + 兼容派生：阶段 1 一手观测 + 边界交回

状态：**阶段 1 完成；阶段 2+ 有一处写权边界冲突需调度者路由**（见 §4）。
基线 `f6cbc113`；R-0051①（charter `a33688f`）已解除 092 的串行等待（104 DONE、105 DONE+重锁）⇒ 092 开工，不等点名。§Spend：0 真调用。

## 1 before 表（一手行号）

| 面 | 今天 | 出处（一手） | 092 目标 |
| --- | --- | --- | --- |
| provider 记录 harness | `harness_type TEXT NOT NULL` | `storage/database.py:69`（`server_provider_models` DDL） | 允许 NULL＝共享上游 |
| schema 版本 | `PRODUCT_SCHEMA_VERSION = 19` | `storage/database.py:11`；迁移链 `_migrate_18_to_19` | →20（harness 可空迁移 + 新列） |
| 记录端点事实 | 已有 `base_url/auth_style/wire_api/fields_source` 列（**Order 47/51 时代**） | `database.py:78-80`；`repository.py:39/55/86`；`service.py:68/90/203` | 复用并扩 protocols[]/endpoints{} |
| wire 参数白名单 | `providerModels.create/update` 必填含 `harness` | `server/wire/handlers.py`（PARAM 表，~:85 区）＋生成 schema | harness 可选；加 protocols/endpoints/models[].{protocols,capabilities} |
| wireApi 枚举 | `{chat_completions, responses}` 两值 | `handlers.py:1323`；`_PROVENANCE_FIELDS` :1326 | 扩 canonical 四值 + 接受旧两值归一 |
| 模型形状 | `{modelId, displayName, availability, unavailableReason}` | 生成 schema + `service._models` | 加 protocols[]/capabilities{}（严格） |
| 描述符 | 有 `credential_kind/model_control_id/...`；**无协议声明、无多槽** | `execution/__init__.py:33-56` | 加 `wire_protocols` +（v2）`model_controls` |
| 冻结 | 校验记录 harness==profile harness | `service.py:144/146/159-160`；`freeze_execution_configuration` :123-169（**当前只出 provider/model/credential/configuration，未透 base_url/wire_api**） | 兼容派生 + `PROTOCOL_INCOMPATIBLE` 强制 |
| 探针边界 | https-only/loopback/上限/不落记录 | `model_configs/probe.py`（order 55/070） | 端点纪律沿用，不改 |

**基线计数**（092 触面定向）：`pytest tests/server -k "model or profile or freeze or provider or wire_v1"` → **109 passed / 616 deselected**（188s）。
**Worker 工件：不在**（本树缺 git-ignore 的 `.acceptance-bundle-*`/`target/debug/agent-box-worker`）⇒ 全量类计数天然红，交 QA 归因（QA-007）；全量只在批末跑并标 `待 QA 复算`（R-0040⑥）。

## 2 词汇与方言（消费 093 已一手核过的方言，不新发明）

canonical 四值 `openai-chat/openai-responses/anthropic-messages/gemini-generate`（092 §Scope:22）；方言归一表（:67）与各家原生方言值
一手在 `deploy/*`（093 阶段 1 已落表，并已在 `native_materialization._FAMILY_DIALECTS` 里以 canonical→方言形式钉住）。
⇒ 092 的输入侧归一表与 093 的输出侧方言表**共用同一份事实**，避免两套真相。

## 3 逐阶段写权归类（关键：哪些在 runtime 边界内、哪些越界）

**runtime 边界内（092 write_paths `src/agent_box/**` + `plugins/**`，不碰 wire/schema/生成工件）**：
- 阶段 2：`storage/database.py`（harness_type 可空迁移 + 新列 + 迁移测试）；`model_configs/service.py` 与 `repository.py`（记录字段、校验、`reference`）。
- 阶段 3：`model_configs/service.py` 的 canonical 归一 helper、`capabilities` 严格校验、`endpoints` 键⊆protocols、URL 私网拒（复用 probe 纪律）。
- 阶段 4：`execution/__init__.py` 描述符 `wire_protocols`（+ v2 `model_controls`）；各 `plugins/.../*/production.py` 加 `wireProtocols`（只写已钉家）；list 派生 `compatibility`（不落库）。
- 冻结强制 `PROTOCOL_INCOMPATIBLE`（service.py 内，声明不相交才拒）。

**越界——属 A 线 / 触发两仓重锁，不在本执行者「不碰 `server/wire/**`」边界内**：
- `server/wire/handlers.py` 的 `providerModels.create/update` **参数白名单**（让 harness 可选、加 protocols/endpoints/models[].* 字段）＋ `handlers.py:1323` `wireApi` 枚举。
- 生成的 **wire-v1 schema/工件**（`contracts/wire-v1/generated/**` 在桌面 settings 树；本树证据副本登记）——新字段到得了 wire 要靠它 + P28 重生成 + 两仓重锁（092 §"前端工件落后要如实记" / G7）。

**后果**：092 的 runtime 侧（服务/存储/描述符/派生）能独立做并测（用内部调用面，不经 wire），但"从 wire 建一条带 protocols 的共享记录"（Requirement 共享 provider / G1 端到端）
要经 `handlers.py` 白名单 + 生成 schema 才可达。二者是**同一张单的两半、跨写权边界**。

## 4 交回调度者路由（不擅改 wire、不半拉子、不越界猜）

请二选一（或给第三个口径）：
1. **拆分执行**：runtime 线（本树）做 §3「边界内」那半（存储迁移 + service 字段/校验/派生 + 描述符 wireProtocols/modelControls，含反例），
   A 线做 `server/wire/handlers.py` providerModels 白名单 + wireApi 枚举，settings 线做 `wire-v1.ts`/工件重生成 + 两仓重锁——三方按序，本单合账。
2. **一次性写权例外**：像 108 对 `scripts/server-round1/**` 那样，给本单破例放行 `server/wire/handlers.py`（+ 本树 wire schema 证据副本），
   由我一次做完 runtime+wire，relock 仍按公告次序交 settings/A；请明确例外文件集与是否含 `handlers.py:1323`。
3. 其他你定的路由。

**未拍前**：不动 `server/wire/**`、不改生成工件；可先做纯 runtime 侧里**不依赖 wire 可达**的部分（迁移 + service helper + descriptor），
但那半的 G1/Requirement-共享-provider 端到端必须等 wire 那半落地才可跑——故整单终态在路由定前记 **PARTIAL（阶段 1 完成，阶段 2+ 边界待拍）**。

## 5 验证（本阶段）

阶段 1＝观测、零代码改动 ⇒ 变更面仅 docs/**。`git diff --stat` 只含本证据文件 + status。基线 109 passed（092 触面，工件不在）。
