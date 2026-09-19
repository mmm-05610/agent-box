---
id: 092
slug: provider-registry-and-protocols
batch: b4
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["PROVIDER_REGISTRY_DONE", "PROVIDER_REGISTRY_PARTIAL"]
waive: []
parallel_units: ["record-fields","protocol-vocabulary","compatibility-derivation"]
revisions: [{"at": "27fd2a8", "what": "转录正文已有的修订：R-0013 追加「一个 harness 多个模型槽」——逐槽模型事实与描述符声明。", "after_stage": 0, "ruling": "R-0013"}]
---

# Work Order 092 — Provider 记录中立化 + 协议词汇 + 兼容派生（R-0013 第 1 层）

## Objective

把"上游接入"变成一等记录，让设置里的 Provider 页（前端 P28）有真东西可配。三件事变真：

1. **provider 记录可以不带 harness**：`harness` 从必填改为可选（缺席 = 共享上游，任何 harness 都能引用）；
2. **协议收敛成 canonical 词汇**：`openai-chat` / `openai-responses` / `anthropic-messages` / `gemini-generate` 四值，
   wire 上的 `provenance.wireApi`、记录上的 `protocols`、模型上的 `protocols`、harness 描述符上的 `wireProtocols` **共用同一套词**（方言串在边界归一，见 §Scope）；
3. **模型带事实、harness 声明协议、兼容性派生**：模型可带 `protocols` 与 `capabilities`；描述符声明
   `wireProtocols`（canonical → 该家原生方言值）；读记录时派生 `compatibility`（能被哪些 harness、经由哪个协议用），
   **永不落库**。

**明确不做**：把配置写进各家原生文件（那是 **093**）、任何前端改动（P28/P29）、本地转译代理、上游模型目录同步
（本轮模型列表来源 = 用户按 §probe 拉取 + 手填）。设计全文见主树
`docs/server-round1/model-settings-two-layer-design.md`。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 记录的 harness 是 **NOT NULL** | `src/agent_box/storage/database.py:71`（`harness_type TEXT NOT NULL`） |
| `providerModels.create/update` 的**必填**参数含 `harness` | `src/agent_box/server/wire/handlers.py:85`（参数白名单）与生成的 schema |
| 校验要求 harness 已注册；冻结要求记录 harness == profile harness | `src/agent_box/server/model_configs/service.py:146`、`:219` |
| 模型形状只有四键 | 生成 schema：`models[{modelId, displayName, availability, unavailableReason}]` |
| 协议词只有两值 | 生成 schema：`provenance.wireApi ∈ [chat_completions, responses]` |
| 描述符没有协议声明 | `src/agent_box/server/execution/__init__.py:33-56`（有 `credential_kind`/`model_control_id`/`credential_environment`/`control_options`/`security_locked_controls`） |
| 探测已有且经真实端点验证 | `src/agent_box/server/model_configs/probe.py`（order 55/070：`pull_models`、`probe_connection`、https-only + loopback 例外、超时/大小/条数上限、结果不写进记录） |
| 各家原生方言已在本仓钉住 | `plugins/agent-box-harnesses/deploy/*`（codex `wire_api="responses"`、opencode/kilo `npm`、pi `api="openai-completions"`、hermes `transport="chat_completions"`、claude `ANTHROPIC_BASE_URL=…/anthropic`、qwen `OPENAI_BASE_URL`、dsh `llm-deepseek`） |

```text
before/
├── server_provider_models(harness_type NOT NULL)   ⚠ 一个上游 N 家 harness 要建 N 条
├── provenance.wireApi ∈ {chat_completions, responses}   ⚠ 词汇不足；方言无处归一
├── models[]: {modelId, displayName, availability}       ⚠ 无协议、无能力
└── descriptor: 无 wireProtocols                          ⚠ 兼容性无法判

after/
├── server_provider_models(harness_type NULL = 共享)     ◀ 092
├── protocols[] / endpoints{}（canonical 四值）           ◀ 092
├── models[].protocols / models[].capabilities            ◀ 092
├── descriptor.wire_protocols（canonical → 原生方言）      ◀ 092
└── list 结果派生 compatibility[]（不落库）               ◀ 092
```

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| `server_provider_models.harness_type` | 允许 NULL（表重建或等价迁移，附迁移测试与回滚说明） | 共享上游 |
| `providerModels.create/update` 参数表 | `harness` 变可选；新增可选 `protocols[]`、`endpoints{}`；`models[]` 项新增可选 `protocols[]`、`capabilities{}` | 第 1 层字段 |
| `provenance.wireApi` | 枚举扩为 canonical 四值，**并接受既有两值**（`chat_completions`→`openai-chat`、`responses`→`openai-responses`）归一 | 一套词 |
| 方言归一表 | 输入侧接受现实方言并归一到 canonical（`chat`/`chat_completions`/`openai-completions`→`openai-chat`；`responses`/`openai-responses`→`openai-responses`；`anthropic`/`anthropic_messages`/`messages`/`claude`→`anthropic-messages`；`gemini`/`generateContent`→`gemini-generate`）；**未知串类型化拒绝** | cc-switch / mcode / pi / hermes 的现实输入 |
| `endpoints{}` | 键必须是 `protocols` 的子集；URL 沿用 probe 的纪律（https；loopback 例外；非 loopback 私网拒绝） | 端点按协议分开 |
| `capabilities{}` 严格模式 | 只接受**文档化键**（见 §Requirements R3）；未知键或错类型 ⇒ 类型化拒绝 | 不静默吞 |
| 描述符 | 新增 `wire_protocols: Mapping[str, str]`；装配期校验（键 ∈ canonical、值非空、条数上限），违规 ⇒ `SIDECAR_DEPLOYMENT_INVALID` | harness 侧声明 |
| sidecar deployment 文档 `harnesses[]` | 各家加 `wireProtocols`（**只写本仓已钉死方言的家**；钉不死的家**省略**=未声明） | 兼容性判据 |
| `providerModels.list` 结果 | 记录带 `protocols`/`endpoints`/`models[].protocols`/`models[].capabilities`；派生 `compatibility: [{harness, protocol}]` 与 `protocolsDeclared: bool` | 读时派生 |
| `freeze_execution_configuration` | 双方都声明且不相交 ⇒ 类型化拒绝 `PROTOCOL_INCOMPATIBLE`；任一侧未声明 ⇒ **不拦**（未知不是不可用） | 执行侧强制点 |
| 本仓 schema 证据副本 + `docs/server-round1/wire-review.md` | 记本次扩参的方法/字段与摘要，写明"前端工件落后，待 P28 重生成后两仓重锁" | 两仓重锁材料 |

**必须保持不变**：
- 既有 harness 绑定记录的语义与拒绝行为（老客户端建带 harness 的记录照旧；A 家的记录对 B 家仍类型化拒绝）；
- 探针的全部边界（order 55 的 https-only/loopback/上限/不落记录）与凭据纪律（只作 locator，值只在调用期）；
- 对象发布（digest + canonical JSON）无敏感键、无宿主绝对路径；
- `model_slot` 控件与 `config.describe/resolve` 的既有形状（P25/P29 依赖它们）。

**明确不做的诱人变体**：把 `compatibility` 写进记录（会漂移）；给未声明的模型补默认协议（等于猜）；
把 `endpoints` 展开成"每 harness 一个 URL"（那是把消费者写回上游）；本轮引入转译（不是本单的产品决定）。

## Requirements

### Requirement: 共享 provider（harness 可缺席）

#### Scenario: 不带 harness 建记录并被执行采纳

**WHEN** `providerModels.create` 不带 `harness`（带 `provider`、`credentialId`、`protocols`、`models`），并按该 provider 的声明协议建一个 profile 的模型引用
**THEN** 记录建立成功且 `harness` 读回为 null；该 profile 冻结执行配置**成功**，冻结结果里的 provider/model/credential 与记录一致

#### Scenario: 老记录的边界不松

**WHEN** 一条老的 `harness=pi` 记录被 `harness=claude` 的 profile 引用并冻结
**THEN** 类型化拒绝（`PROFILE_CONFIGURATION_INVALID`），措辞与今天一致

### Requirement: canonical 协议词汇

#### Scenario: 方言归一

**WHEN** 输入 `wireApi="openai-completions"`（或 `"chat"`、`"chat_completions"`）、`protocols=["anthropic_messages","claude"]`
**THEN** 读回的是 `openai-chat` 与 `["anthropic-messages"]`（去重、canonical、稳定排序）

#### Scenario: 未知串被拒

**WHEN** 输入 `protocols=["openai-chat","martian-wire"]`
**THEN** 类型化拒绝（`PROTOCOL_UNKNOWN`，指名该串），记录**不建立**

### Requirement: 模型事实（缺席保持缺席）

#### Scenario: 带事实的模型

**WHEN** 输入 `models=[{modelId, displayName, availability:"available", unavailableReason:null, protocols:["openai-chat"], capabilities:{toolCall:true, reasoning:true, reasoningOptions:[{type:"effort", values:["low","medium","high"]}], modalities:{input:["text","image"],output:["text"]}, limits:{context:1000000,output:131072}, cost:{input:3,output:15,cacheRead:0.3}}}]`
**THEN** 读回逐字段一致

#### Scenario: 未验证的事实不得被伪造

**WHEN** 模型条目**不带** `capabilities`
**THEN** 读回该模型的 `capabilities` 键**缺席**（不是 `{}`、不是全 false）；gate 里的反例证明"补默认值"会让门失败

#### Scenario: 错形状被拒

**WHEN** `capabilities={toolCall:"yes"}` 或 `capabilities={unknownField:1}`
**THEN** 类型化拒绝（`PROVIDER_MODEL_INVALID`），不许静默丢弃

### Requirement: 兼容性派生（不落库）

#### Scenario: 双方都声明

**WHEN** 一家 provider 声明 `protocols=["openai-chat","anthropic-messages"]`，harness `codex` 的 deployment 声明 `wireProtocols={"openai-chat":"chat","openai-responses":"responses"}`，`claude` 声明 `{"anthropic-messages":"anthropic"}`
**THEN** `providerModels.list` 的该条 `compatibility` 恰为 `[{harness:"claude", protocol:"anthropic-messages"}, {harness:"codex", protocol:"openai-chat"}]`（稳定排序），且数据库里**没有**任何 compatibility 列

#### Scenario: 未声明 ≠ 不可用

**WHEN** provider 没给 `protocols`（或该 harness 的 deployment 没给 `wireProtocols`）
**THEN** `protocolsDeclared=false` 且 `compatibility=[]`；**不**输出"不可用"结论，**不**阻止该组合的冻结

### Requirement: 执行侧强制与 relock 材料

#### Scenario: 声明且不相交必须拒绝

**WHEN** provider 只声明 `["openai-chat"]`，harness `claude` 只声明 `{"anthropic-messages":"anthropic"}`，该 profile 引用这个 provider 的模型
**THEN** 冻结时类型化拒绝 `PROTOCOL_INCOMPATIBLE`（指名两侧协议）；把 provider 的 `protocols` 改成含 `anthropic-messages` 后，同一引用**通过**（反例正跑）

#### Scenario: 前端工件落后要如实记

**WHEN** 用**前端当前** `contracts/wire-v1/generated/wire-v1.schema.json` 跑 `AGENT_BOX_WIRE_SCHEMA=<工件> pytest tests/server/test_wire_v1.py`
**THEN** 新参数/新字段的失败被**如实**记为该工件落后（不修改工件、不跳过测试），`wire-review.md` 写明待 P28 的重生成与两仓重锁

## Stages

- [ ] 1. 观测：读 DDL/参数表/service/descriptor/probe 与 deploy 方言表，落 before 表与基线计数（提交）
- [ ] 2. 迁移与中立化：`harness_type` 可空 + create/update/validate/freeze/reference 逐处对齐 + 迁移测试与回滚说明（提交）
- [ ] 3. 词汇与模型事实：canonical 归一表 + `endpoints` + `capabilities` 严格校验 + 反例测试（提交）
- [ ] 4. harness 侧声明与兼容派生：描述符 `wire_protocols` + 装配校验 + deployment 文档逐家声明（只写钉死的家）+ list 派生（提交）
- [ ] 5. 门与账：跑全套件与反例、写证据到 `docs/server-round1/`、更新本树 `status.md`（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 中立化 | 不带 harness 的记录可建、可被任意声明兼容的 harness 冻结；老记录跨界仍拒 | 把老记录（`harness=pi`）给 claude profile 冻结必须失败 | fail (typed) |
| G2 词汇 | 方言串归一到 canonical 四值；读回稳定 | 输入 `"martian-wire"` 必须被 `PROTOCOL_UNKNOWN` 拒 | fail (typed)，绝不归一成最近值 |
| G3 模型事实 | 事实逐字往返；缺席保持缺席 | 去掉 `capabilities` 后读回必须**无该键**（补默认值即门红） | unknown 保持 unknown |
| G4 派生 | `compatibility` 与两侧声明逐项相等且排序稳定；库里无该列 | 改一侧声明后 `compatibility` 必须随之变（不缓存、不落库） | declared=false，不给结论 |
| G5 冻结强制 | 声明不相交 ⇒ `PROTOCOL_INCOMPATIBLE`；补上协议后通过 | 反向：把 provider 协议改回不相交必须再拒 | 未声明 ⇒ 不拦（记录为 unknown） |
| G6 既有面零退化 | 探针行为、凭据纪律、对象发布摘要规则、`config.describe` 形状不变 | 从记录里读出凭据内容必须不可能（gate 里给出反例） | fail (typed) |
| G7 relock 材料 | 本仓 schema 证据副本与 `wire-review.md` 记下方法/字段与摘要 | 手工改生成工件必须让登记门失败 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/ -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
AGENT_BOX_WIRE_SCHEMA=<前端当前工件> python3 -m pytest tests/server/test_wire_v1.py -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（迁移 + 参数 + 描述符 + 派生）· 2. 定向测试**与反例** · 3. 真实证据（用真实记录跑一次 list/freeze，
   探针可按 070 的真实端点方式复跑一次）· 4. 回归计数与退出码 · 5. 账务与清理证据（临时库/临时目录零残留）·
6. 本树 status 分账。缺一项 ⇒ 终态 `PROVIDER_REGISTRY_PARTIAL` 并逐条列剩余。

## Acceptance

- 绿：`PROVIDER_REGISTRY_DONE`
- 否则：`PROVIDER_REGISTRY_PARTIAL` + 精确剩余项与证据

## Notes for the executor

- 本单在 **b4**；批末照章程打 `checkpoint/b4` tag 并把检查点报告写进本树 status，然后继续 093，不为它停下。
- 需要人拍的事 → 本树 `status.md §Questions`（问题 / 选项与代价 / 我的建议），继续做不受影响的其它面。
- 契约有问题 → 不改契约，交回调度者；纳入修订后在 status 记 `已纳入 work order 092 修订 @<sha>`。
- 凭据只作 locator；**不得**把任何 key 值写进测试、日志、证据或 argv。真实调用按 R-0011 授权并逐笔记账；
  本单不**需要**真实模型调用（探针可复用 070 的复跑方式）。
- 自检：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py . --strict`。

---

## 修订 v2（2026-09-19，R-0013 追加：一个 harness 多个模型槽）

用户指认：profile 侧的模型配置**不是一个槽**——claude-code 要能配 主模型 / opus / sonnet / haiku / **fable** / **子代理**，
还要能配上下文与输出长度。设计全文（含逐家槽表）见主树 `docs/server-round1/model-settings-two-layer-design.md` §3b/§4/§6。

### 追加 Scope

| From | To / action | Reason |
| --- | --- | --- |
| 描述符的单一 `model_control_id` | **多槽声明 `model_controls`**：每槽 `{controlId, role, label, required, protocols?, requires?, allowFollow?}`；老的单 id 声明读为 `[{role:"default"}]` | 多角色 |
| profile 的模型引用 | 从单一 `{providerId, modelId}` 变**槽表**（每槽一个引用 + 可选 `context`/`output` 覆盖）；老形状按 `role=default` 兼容读入 | 逐槽选择 |
| `config.describe` 的 `model_slot` 投影 | 逐槽输出一个 `model_slot`（带 role/label/required/该槽的协议与能力要求） | 界面按槽渲染 |
| `freeze_execution_configuration` | **逐槽**解析并校验（协议/能力要求逐槽判），拒绝时指名槽 | 一处真相 |

一手的槽与原生字段（**票源**：cc-switch 的写入器/预设、opencode 官方 `config.json` schema、本仓 deploy 模板、
`docs/specs/archive/provider-form-gap-analysis.md`）——claude-code：`ANTHROPIC_MODEL` / `ANTHROPIC_DEFAULT_OPUS_MODEL` /
`…_SONNET_MODEL` / `…_HAIKU_MODEL`（旧名 `ANTHROPIC_SMALL_FAST_MODEL`）/ `…_FABLE_MODEL` / `CLAUDE_CODE_SUBAGENT_MODEL`，
上限 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`；opencode/kilo：`model` / `small_model` / `provider.<id>.models.<mid>.limit{context,input?,output}`；
其余家见设计 §4。**描述符只声明槽的语义与要求，原生字段名属 093。**

### 追加 Requirements

#### Requirement: 多槽声明与投影

##### Scenario: 每家按声明出槽

**WHEN** 某家 deployment 声明 `modelControls=[{controlId:"model",role:"default",required:true},{controlId:"subagent",role:"subagent",label:"子代理",allowFollow:true},…]`
**THEN** `config.describe` 为**每个槽**输出一个 `model_slot` 控件（含 role/label/required/要求），顺序与声明一致；控件 id 与 profile 配置里的键一一对应

##### Scenario: 单槽声明不退化（兼容）

**WHEN** 某家仍只声明老的 `modelControlId="model"` + `controlOptions={"model":[]}`
**THEN** 读为 `[{controlId:"model", role:"default", required:false}]`，投影与冻结行为与今天**逐字一致**（F2 修过的"空枚举→model_slot"路径不变）

#### Requirement: 逐槽冻结与逐槽兼容

##### Scenario: 槽各自校验

**WHEN** 主模型槽填了兼容的上游，子代理槽填了一个**不兼容**的上游（例如只声明 `openai-chat` 而该家子代理槽要求 `anthropic-messages`）
**THEN** 冻结**类型化拒绝**并**指名槽**（`PROTOCOL_INCOMPATIBLE` 携带 `controlId`）；把该槽换成兼容上游后通过

##### Scenario: 未声明不拦

**WHEN** 某槽的 `requires` 未声明、或上游没声明协议
**THEN** 该槽**不被拦**（未知不是不可用），冻结成功且不猜值

#### Requirement: 每槽的限额覆盖（缺席即不写）

##### Scenario: 覆盖与事实分开

**WHEN** 某槽带 `overrides={context:200000, output:32000}`
**THEN** 冻结产物里该槽有这两个覆盖值；**模型事实本身不被改写**；另一槽无覆盖 ⇒ 产物里**没有**覆盖键（读时用事实，不猜）
**反例**：把"缺席"渲染成 `context:0`/默认值必须让门失败

### 追加 Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G8 多槽 | 逐槽投影 + 逐槽冻结；拒绝带 `controlId` | 只投影/只校验第一个槽必须门红 | fail (typed) |
| G9 兼容读入 | 老单槽声明与老引用形状行为逐字不变 | 老形状被拒或被改写必须门红 | fail (typed) |
| G10 覆盖 | 覆盖与事实分离；缺席不写键 | 给缺席槽补默认值必须门红 | fail (typed) |

### 追加 Validation

```bash
python3 -m pytest tests/server -q -k "model or profile or freeze"
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
```
