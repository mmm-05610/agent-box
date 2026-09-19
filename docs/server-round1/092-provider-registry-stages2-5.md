# Work Order 092 — 阶段 2–5 落地账（runtime 半；wire 半路由 A/settings）

状态：runtime 侧（存储 / service / 描述符 / 派生 / 冻结 / 逐家声明）**全部落地并带反例**；
跨写权边界的 wire 半（`server/wire/handlers.py` providerModels 白名单 + `wireApi` 枚举 + 生成
工件）按 §阶段1 观测 §4「拆分执行」路由交 A/settings + 两仓重锁，不在本执行者「不碰
`server/wire/**`」边界内。§Spend：0 真调用（全合成输入 / 本机回环）。

基线：阶段 1 `f57b3ee`（before 表 + 109 passed）。提交链：
`b192a5f`（阶段 2 中立化）· `826d079`（阶段 3 词汇+事实）· `8e6fa44`（阶段 4 派生+冻结+描述符）·
`56af017`（阶段 4b 六家声明）。

## 1 after 表（对照阶段 1 before）

| 面 | 092 目标 | 落地 | 一手出处（本树） |
| --- | --- | --- | --- |
| `server_provider_models.harness_type` | 允许 NULL＝共享 | ✅ | `storage/database.py` `PRODUCT_SCHEMA_VERSION=20`、`_migrate_19_to_20`（表重建、显式列名、前向 only、幂等） |
| service 引用/冻结 harness 判定 | NULL＝任意家；绑定家跨界仍拒 | ✅ | `model_configs/service.py` `validate_references`、`freeze_execution_configuration` |
| canonical 协议词汇（四值 + 方言归一 + 未知拒） | 一套词 | ✅（service 层） | `model_configs/provider_protocols.py` `normalize_protocol(s)`、`_DIALECT_TO_CANONICAL` |
| `endpoints{}` 键⊆protocols + URL 纪律 | 复用 probe | ✅ | `provider_protocols.validate_endpoints`→`probe._validate_endpoint`（https/loopback/私网拒） |
| `capabilities{}` 严格模式 + 缺席保持缺席 | 不静默吞 | ✅ | `provider_protocols.validate_capabilities`、`normalize_model_facts` |
| 描述符 `wire_protocols`（canonical→方言，装配校验） | harness 侧声明 | ✅ | `execution/__init__.py` `HarnessDescriptor.wire_protocols`、`_validate_wire_protocols`、`execution/protocols.py`（canonical 单一真相） |
| 逐家 `wireProtocols`（只写已钉家） | 兼容性判据 | ✅ 六家 | `codex/claude/pi/hermes/opencode/kilo production.py`；dsh/qwen 省略＝未声明 |
| list 派生 `compatibility` + `protocolsDeclared`（不落库） | 读时派生 | ✅ | `service._derive_compatibility`、`project()` |
| 冻结 `PROTOCOL_INCOMPATIBLE`（两侧声明且不相交才拒） | 执行侧强制 | ✅ | `service.freeze_execution_configuration` |

## 2 门（G1–G7，runtime 射程）

| 门 | 正例 | 反例（真跑） | 结果 |
| --- | --- | --- | --- |
| G1 中立化 | 无 harness 记录可建、被任意声明兼容家冻结（`test_provider_neutralization_092.py` repository+service） | 老 `harness=pi` 记录给 claude 冻结 ⇒ 422 | 定向过 |
| G2 词汇 | `openai-completions/chat/chat_completions`→`openai-chat`；`anthropic_messages/claude`→去重 `anthropic-messages`；`generateContent/GEMINI`→`gemini-generate` | `martian-wire` ⇒ `PROTOCOL_UNKNOWN` 且**记录不建**（`svc.list()==[]`） | 定向过 |
| G3 模型事实 | 逐字段往返；`limits/capabilities` 原样 | 去掉 `capabilities` ⇒ 读回**无该键**（非 `{}`/非全 false）；`toolCall:"yes"` ⇒ `PROVIDER_MODEL_INVALID` | 定向过 |
| G4 派生 | codex{chat,responses} + claude{anthropic} vs provider{chat,anthropic} ⇒ `[{claude,anthropic-messages},{codex,openai-chat}]` 稳定序 | 改 claude 声明⇒compatibility 随之变（不落库）；未声明⇒`protocolsDeclared:false`+`compatibility:[]`（不出"不可用"） | 定向过 |
| G5 冻结强制 | provider{chat} vs claude{anthropic} ⇒ `PROTOCOL_INCOMPATIBLE`；codex{chat} ⇒ 通过 | 补 `anthropic-messages` 后同一引用通过（反例正跑）；某家未声明 wire_protocols ⇒ 不拦 | 定向过 |
| G6 零退化 | 098/wire_v1/stage_a/harness_sidecar 全绿 | 凭据内容不可从记录读出（既有纪律未动）；`freeze` 输出**未增键**（compatibility 只在 list 读侧，不动发布摘要） | 回归见 §4 |
| G7 relock 材料 | wire-review.md 记本次越界方法/字段 | — | 见 §3 |

定向计数：`test_provider_neutralization_092`（5）+`test_provider_protocols_092`（12）+
`test_provider_compatibility_092`（6）＝ **23 passed**；阶段 3 回归 `098+wire_v1+stage_a+092` **80 passed**。

## 3 wire 半（越界·交回 A / settings 重锁）

本单在 runtime 侧把 `protocols/endpoints/capabilities` 与记录级 `protocols` 做成 service
入参并全测；但**从 wire 让客户端发得出这些字段**要三处（都不在本执行者写权边界内）：

1. `server/wire/handlers.py`：`providerModels.create/update` 参数白名单——`harness` 改可选、
   加 `protocols[]`/`endpoints{}`/`models[].{protocols,capabilities}`；`handlers.py:1323`
   `wireApi` 枚举扩 canonical 四值 + 接受 `chat_completions/responses` 旧值归一。
2. 生成 wire-v1 schema/工件（桌面 settings 树 `contracts/wire-v1/generated/**`）＋ P28 重生成
   ＋ 两仓重锁（本树证据副本登记，见 `wire-review.md` 092 节）。
3. **v2 多槽（R-0013 追加：一家多模型槽）**：`config.describe` 逐槽 `model_slot` 投影与 profile
   槽表引用形状落在 `server/wire/handlers.py::config_describe/_controls`（A 线）＋生成工件。
   描述符侧 `model_controls` 声明可随后半单独在本树补（不依赖 wire），但其端到端门须等 wire。

后果与整单终态：**runtime 半 DONE、wire 半路由** ⇒ 092 终态记 `PROVIDER_REGISTRY_PARTIAL`
（与 097/098 把 wire/schema 项交 102 同型），精确剩余＝上面 1/2/3。093 的接线输入
（记录 `protocols`/`endpoints`、描述符 `wire_protocols`、冻结透传）在 runtime 半已具备，
093 阶段 3/4 可据本树内部面接线（不经 wire 亦可用），逐家真轮随 wire/relock。

## 4 回归计数（全套件）

见本文件提交时的运行；计数与退出码在下（**待 QA 复算**）。
