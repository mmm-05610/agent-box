---
id: 093
slug: native-config-materialization
batch: c2
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: [{"order": "092", "condition": "provider 记录带 protocols/endpoints 与描述符 wireProtocols；否则本单只能做观测阶段"}]
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["NATIVE_CONFIG_MATERIALIZATION_DONE", "NATIVE_CONFIG_MATERIALIZATION_PARTIAL"]
waive: []
parallel_units: ["claude-code","codex","opencode","hermes","dsh","qwen","kilo","pi"]
revisions: [{"at": "27fd2a8", "what": "转录正文已有的修订：R-0013 追加「逐槽落盘 + 逐模型限额」。", "after_stage": 0, "ruling": "R-0013"}]
---
> **顺序硬约束（R-0032 ①，2026-09-19）**：**先落 `111`（claude 的 `ask → permissions.ask` 修正）再落盘**；
> 093 的阶段 1 检查点里必须核到 111 的提交——否则落盘会把错的映射写进原生配置。


# Work Order 093 — 冻结的 provider/model 落进各家原生配置（R-0013 第 1 层的执行侧）

## Objective

让第 1 层配的上游事实**真的被执行使用**：把冻结执行（`{provider, model, credentialId, configuration}`）经
**逐家写入器**落进该家原生配置，替换掉"每家 `production.py` 里 `OFFICIAL_BASE_URL` 是唯一可能"的现状。

用户的判据（R-0013 设计 §4）：harness 各家的原生形态差异极大，**钉不死键位就类型化拒绝**——沿用 085 的纪律
（先第一手钉键，再实现写入；钉不死的家不写）。逐家终态在 status 逐行登记（DONE / 类型化拒绝 + 缺什么证据）。

**明确不做**：任何前端改动（P28/P29）、转译代理、上游目录同步、改凭据通道（R-0012 的一次性投影仍是唯一凭据路径）。
本单也不碰 092 的 wire 参数。

## Current state

| 家 | 原生文件 | 今天钉死的值 | 出处（第一手） |
| --- | --- | --- | --- |
| codex | `config.toml` | `base_url = "https://api.deepseek.com/"`、`wire_api = "responses"` | `plugins/agent-box-harnesses/deploy/codex/config.toml`；`codex/production.py:71,123` |
| opencode | `opencode.json` | `provider.deepseek.npm = "@ai-sdk/openai-compatible"`、`options.baseURL` | `deploy/opencode/opencode.json`；`opencode/production.py:48` |
| kilo | `kilo.json` | 同 opencode（fork） | `deploy/kilo/kilo.json`；`kilo/production.py:45` |
| pi | `models.json` | `providers.deepseek.api = "openai-completions"`、`baseUrl`、`apiKey: $DEEPSEEK_API_KEY` | `deploy/pi/models.json` |
| hermes | `config.yaml` | `providers.custom.transport = "chat_completions"`、`model.base_url` | `deploy/hermes/config.yaml`；`hermes/production.py:123` |
| dsh | `settings.yaml` | `llm-deepseek.baseURL` | `deploy/dsh/settings.yaml`；`dsh/production.py:62` |
| claude-code | `settings.json` | `env.ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic"` | `deploy/claude/settings.json`；`claude/production.py:55` |
| qwen | 环境变量 | `OPENAI_BASE_URL = "https://api.deepseek.com"` | `qwen/production.py:49,79` |

现有写入点（**复用，不新建第二条通道**）：
- guest 内的配置投影（`CONFIG_SOURCE` 一类：`codex/production.py:123`、`opencode/production.py` 等）；
- 远端 worker 侧的一次性物化（`codex/remote.py` 的 `RemoteCodexCredentialProjection` 写 `/runtime/home/config.toml`，值来自钉住的常量）；
- 冻结执行的形状：`model_configs/service.py:161`。

```text
before/
├── <family>/production.py: OFFICIAL_BASE_URL = 常量        ⚠ 选中的上游只可能是 DeepSeek
├── deploy/<family>/<file>: 模板里写死 base_url/方言        ⚠ 与记录脱节
└── 记录（092 后）: protocols/endpoints/models 事实          ◀ 无人消费

after/
├── 逐家 materialization：冻结执行 + 记录事实 → 原生配置字节  ◀ 093
├── 协议 canonical → 该家方言（wire_api/npm/api/transport/env）◀ 093
├── 未钉死的家：类型化拒绝，不写近似值                        ◀ 093
└── 既有投影通道与凭据一次性投影保持不变                       ✓
```

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 逐家 `production.py` 的钉死常量 | 变成"模板默认"：有冻结事实时按事实写，无事实时保持今天的字节 | 记录优先 |
| 新增逐家写入器 | 输入 = 冻结执行 + 记录（`endpoints`/`protocols`/模型 id）；输出 = 该家原生配置字节 + guest 目标路径；**通过既有投影通道投放** | 落盘 |
| 协议翻译 | canonical → 方言：codex `wire_api`、opencode/kilo `npm`、pi `api`、hermes `transport`、claude 固定 anthropic、qwen env 形态、dsh vendor 键 | 一套词，各家说方言 |
| 不支持的组合 | **类型化拒绝**（`PROTOCOL_UNSUPPORTED_BY_HARNESS`），绝不写近似值或静默降级 | 85 的纪律 |
| 凭据 | 不改通道；内容仍只在调用期/一次性投影里，绝不进记录、日志、证据、argv | R-0012 |
| 逐家终态 | 写进本树 `status.md`：DONE 或"类型化拒绝 + 缺哪条第一手证据" | 可审计 |

**必须保持不变**：既有 loopback 假端点的门（把 base_url 换成 `127.0.0.1` 的替换能力）继续可跑；
各家 native home/会话边界、`deploy/**` 的 reviewed 内容语义、凭据纪律、宿主绝对路径不进记录。

**明确不做的诱人变体**：为省事把冻结配置序列化进 guest 的一个新文件（那是第二条真相）；
"顺手"支持转译（不是本单的产品决定）；给未声明协议的家猜一个方言值。

## Requirements

### Requirement: 逐家写对键位

#### Scenario: 非 DeepSeek 的上游真的落到原生文件

**WHEN** 建一条**第二个上游**（例如 `provider=custom-loopback`、`endpoints={openai-chat:"http://127.0.0.1:<port>/v1"}`、一个模型），把它挂到某家 profile 上跑一轮
**THEN** 该家 guest 内原生文件里出现**该** base URL 与**该协议对应的方言值**（codex 是 `[model_providers.<id>]` 下的 `base_url`+`wire_api`），且执行轮次用的是它

#### Scenario: 键位写错必须门红

**WHEN** 把 codex 的 `wire_api` 写到顶层（而非 `[model_providers.<id>]`）的变体被合入
**THEN** 该家的门失败（键位断言），不允许"能跑就算过"

### Requirement: 协议翻译与类型化拒绝

#### Scenario: 支持的协议逐家翻成方言

**WHEN** 记录声明 `protocols=["openai-chat","anthropic-messages"]`，分别给 codex / opencode / pi / hermes / claude 用
**THEN** 各家写出的方言值分别为 `chat` / `@ai-sdk/openai-compatible` / `openai-completions` / `chat_completions` / 不适用（claude 只用 anthropic，此时拒 `openai-chat`）

#### Scenario: 不会说的协议拒绝

**WHEN** 给 claude 配一个只有 `openai-chat` 的 provider
**THEN** 类型化拒绝 `PROTOCOL_UNSUPPORTED_BY_HARNESS`（指名该家与该协议），**不产生**任何配置文件改动

### Requirement: 无事实时零回归

#### Scenario: 老路径字节不变

**WHEN** 在没有冻结 provider 事实的情况下跑各家既有的生产链门（假端点）
**THEN** guest 内配置与今天的 reviewed 模板**逐字节一致**（缺席 ⇒ 保持模板，不写空值）

### Requirement: 幂等与半写

#### Scenario: 重复物化与失败重试

**WHEN** 同一轮冻结配置物化两次；以及在被写路径不可写时物化一次
**THEN** 第二次结果与第一次逐字节相同；失败时目标文件**保持原状**（要么完整新内容、要么完整旧内容），并给出类型化错误

## Stages

- [ ] 1. 观测：逐家定位"谁在什么时候写原生配置"，把写入点、键位、方言值列成表（第一手，含未钉死的家）（提交）
- [ ] 2. 写入器骨架 + 协议翻译表 + 类型化拒绝（含反例测试）（提交）
- [ ] 3. 逐家接线：钉死的家逐个接上（每家具名提交或分组提交，逐家在 status 记终态）（提交）
- [ ] 4. 端到端：非 DeepSeek 上游 + 至少两家跑真轮（假端点即可；真实端点按 R-0011 可选）（提交）
- [ ] 5. 门与账：全套件 + 反例 + 证据 + status 分账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 键位 | 逐家断言键在**该家正确层级**，且值来自冻结事实 | 把某一家的键挪一层必须让该家门失败 | fail (typed) |
| G2 翻译 | canonical → 方言逐家正确（表格驱动断言） | 给 claude 配 chat-only 上游必须 `PROTOCOL_UNSUPPORTED_BY_HARNESS` | fail (typed)，绝不降级 |
| G3 真跑 | 第二个上游 + 至少两家在假端点上跑通一轮，配置来自记录 | 不接线（走模板）时该门必须失败 | fail (typed) |
| G4 凭据/路径 | 配置里只有 env/locator 引用；记录与证据里 grep 不到凭据内容与宿主绝对路径 | 把 key 字面量写进配置必须让门失败 | fail (typed) |
| G5 幂等/半写 | 二次物化字节相同；不可写时保持原状 | 让写路径只读必须看到半写为零 | fail (typed) |
| G6 回归与登记 | 既有各家生产链门（loopback 假端点）继续绿；逐家终态在 status 逐行 | 摘掉一家接线必须让它那行变 PARTIAL 而不是静默通过 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/ -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
python3 scripts/server-round1/<某家>-production-chain-gate.py --loopback   # 逐家既有门，至少两家
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（写入器 + 翻译 + 逐家接线）· 2. 定向测试**与反例** · 3. 真实证据（至少两家端到端假端点轮 + 非 DeepSeek 上游）
· 4. 回归计数与退出码 · 5. 账务与清理证据（临时 guest/临时端点零残留）· 6. status 分账（逐家终态）。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`NATIVE_CONFIG_MATERIALIZATION_DONE`
- 否则：`NATIVE_CONFIG_MATERIALIZATION_PARTIAL` + 逐家剩余（哪家、缺什么证据、下一步入口）

## Notes for the executor

- 本单在 **b4**，接在 092 之后；092 未落地时只做阶段 1（观测）并如实登记等待。
- ⚠ 别把"能跑"当成"钉死了"：085 的教训是**键位钉不死就不写**；dsh/qwen 这类没有独立协议字段的家，
  要么给出第一手证据（该家文档/源码/实测），要么类型化拒绝。
- 凭据只作 locator；真实模型调用按 R-0011（本单不必需）。
- 需要人拍的事 → 本树 status §Questions；契约问题交回调度者。
- 自检：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py . --strict`。

---

## 修订 v2（2026-09-19，R-0013 追加：逐槽落盘 + 逐模型限额）

092 已扩为**多模型槽**（主模型 / opus / sonnet / haiku / fable / 子代理…）。本单相应扩为：**每个槽各自写进它自己的原生字段**，
以及**每模型限额**（上下文/输出）的落盘。槽表与一手字段名见主树设计文档 §4。

### 追加 Scope

| 家 | 要写的槽/限额（一手字段名） |
| --- | --- |
| claude-code | `ANTHROPIC_MODEL` · `ANTHROPIC_DEFAULT_OPUS_MODEL` · `…_SONNET_MODEL` · `…_HAIKU_MODEL`（旧名 `ANTHROPIC_SMALL_FAST_MODEL` 只在需要时保留兼容读）· `…_FABLE_MODEL` · `CLAUDE_CODE_SUBAGENT_MODEL`；上限 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`、思考 `MAX_THINKING_TOKENS` |
| codex | `model` / `wire_api` / `model_reasoning_effort` / `model_max_output_tokens` |
| opencode / kilo | `model` / `small_model` / `provider.<id>.models.<mid>.limit{context,input?,output}`（条目本就吃 models.dev 形状的事实：`cost`/`modalities`/`tool_call`/`reasoning`） |
| pi | `settings.json` 的 `defaultProvider`/`defaultModel`；`models.json` 的 `models[].{contextWindow,maxTokens,…}` |
| hermes | `model.default`；`models.<id>.{context_length,max_tokens}` |
| dsh | `llm-<vendor>.{maxTokens,thinking,reasoningEffort}` |
| qwen | 未钉死 ⇒ 钉死或类型化拒绝（不猜 env 名） |

- **"跟随主模型"**：槽声明 `allowFollow` 且用户选了跟随 ⇒ **不写该键**（缺席就是缺席，不写等于主模型的值）。
- **限额来源标注**：写进原生文件的是**生效值**；profile 里"你的覆盖"与"上游声明"的区分由 092 保证，本单不重复实现。
- 钉不死键位的家（当前已知：qwen 的 env 形态、dsh 的模型 id 键若要按 provider 变）⇒ 类型化拒绝 + status 记剩余。

### 追加 Requirements

#### Requirement: 逐槽写对位置

##### Scenario: claude-code 六槽逐条

**WHEN** profile 填了主模型 + opus + haiku + 子代理（sonnet/fable 走"跟随主模型"）
**THEN** guest 内 `settings.json` 的 `env` 恰有 `ANTHROPIC_MODEL`/`ANTHROPIC_DEFAULT_OPUS_MODEL`/`ANTHROPIC_DEFAULT_HAIKU_MODEL`/`CLAUDE_CODE_SUBAGENT_MODEL` 四键，**没有** sonnet/fable 两键；值来自记录的 model id
**反例**：把"跟随"写成空串或写上与主模型相同的值必须让门失败（缺席必须真的是缺席）

##### Scenario: opencode/kilo 的两槽与限额

**WHEN** 主模型 + `small_model` 都选，且主模型带 `context`/`output` 覆盖
**THEN** `opencode.json`（或 `kilo.json`）里 `model`、`small_model` 与 `provider.<id>.models.<mid>.limit.{context,output}` 三处都对；未覆盖时 `limit` 取**上游声明的事实值**（无事实 ⇒ 不写该子键并如实记 unknown）

#### Requirement: 限额覆盖不是猜测

##### Scenario: 覆盖生效、缺席不写

**WHEN** 某模型无上游限额事实、用户也没覆盖
**THEN** 原生文件里**不出现** `limit`/`contextWindow`/`context_length` 之类的键（不补默认值），且 status 记"该模型限额 unknown"

### 追加 Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G7 逐槽 | claude-code 六槽逐条断言（写了哪些、**没写哪些**） | 把跟随槽写成空值必须门红 | fail (typed) |
| G8 限额 | 覆盖 → 写覆盖值；无覆盖有事实 → 写事实；都无 → 不写键 | 给"都无"补默认值必须门红 | unknown，不写键 |

### 追加 Validation

```bash
python3 -m pytest plugins/agent-box-harnesses/tests/ -q -k claude
python3 scripts/server-round1/claude-production-chain-gate.py --loopback   # 逐家既有门
```
