# Work Order 093 — 原生配置落盘：阶段 1 逐家一手观测（写入点 / 键位层级 / 协议方言 / 限额字段）

终态：`NATIVE_CONFIG_MATERIALIZATION_PARTIAL`（**阶段 1 完成；阶段 2–5 接线一手阻塞于 092**）。
基线 `f6cbc113`；公告第 106 轮点名"`111` 先于 `093` 的前置已满足 ⇒ `093` 可以开工"。工单 §Notes/depends_on：
**092 未落地时只做阶段 1（观测）**——本文件即阶段 1；§8 已一手确认 `model_configs` 的 provider 记录**尚不带**
`protocols`/`endpoints`（只有 `configuration`＝controlId→value，`freeze_execution_configuration` `service.py:123-168`），
⇒ 阶段 2+「按记录事实写方言」需等 092 把 `protocols`/`endpoints` 补进记录与描述符 `wireProtocols`。§Spend：0 真调用。

## 0 111 前置核对（阶段 1 检查点要求）

`111`（claude `ask → permissions.ask`）已落 `2f46db5`、账 `a9048cc` ⇒ 落盘不会把错的 ask 映射写进原生配置。✓

## 1 逐家一手观测表（写点 / 键位层级 / 协议方言 / 限额字段）

| 家 | 原生落点文件 | **今天钉死的值**（一手行号） | 协议方言字段（canonical→该家） | 模型限额/思考字段 | 钉死状态 |
| --- | --- | --- | --- | --- | --- |
| **codex** | `deploy/codex/config.toml`（投影）+ `remote.py:172-182` 写 `/runtime/home/config.toml` | `model="deepseek-flash"`;`[model_providers.deepseek]` 下 `base_url`/`wire_api="responses"`;顶层 `model_reasoning_effort` | `wire_api ∈ {responses, chat}`（**层级：`[model_providers.<id>]` 下**，非顶层——G1 反例点） | `model_max_output_tokens`（v2；当前模板未写＝缺席） | **可钉** |
| **claude-code** | `deploy/claude/settings.json`（`env` 块）+ `production.py:55` | `env.ANTHROPIC_BASE_URL="…/anthropic"`;`model` | **仅 anthropic**（固定）；给 `openai-chat` ⇒ `PROTOCOL_UNSUPPORTED_BY_HARNESS` | `CLAUDE_CODE_MAX_OUTPUT_TOKENS`;`MAX_THINKING_TOKENS`;六槽 `ANTHROPIC_MODEL`/`_OPUS_`/`_SONNET_`/`_HAIKU_`/`_FABLE_`/`CLAUDE_CODE_SUBAGENT_MODEL` | **可钉**（env 名一手） |
| **opencode** | `deploy/opencode/opencode.json` + `production.py:48` | `provider.deepseek.npm="@ai-sdk/openai-compatible"`;`options.baseURL` | `npm` 值选方言（openai-compatible / anthropic） | `provider.<id>.models.<mid>.limit.{context,output}`;`model`/`small_model` | **可钉** |
| **kilo** | `deploy/kilo/kilo.json`（opencode fork）+ `production.py:45` | 同 opencode | 同 opencode（`npm`） | 同 opencode（`limit`） | **可钉**（fork 同形） |
| **pi** | `deploy/pi/models.json` + `settings.json` | `providers.deepseek.api="openai-completions"`;`baseUrl`;`apiKey:$DEEPSEEK_API_KEY` | `api ∈ {openai-completions, …}` | `models[].{contextWindow,maxTokens}`;settings `defaultProvider`/`defaultModel` | **可钉** |
| **hermes** | `deploy/hermes/config.yaml` + `production.py`（transport） | `providers.custom.transport="chat_completions"`;`model.base_url`;`model.max_tokens`（一手在 `model` 段） | `transport` 值选方言 | `model.max_tokens`（一手）；`context_length`＝v2 目标字段名，**待真机核 hermes 是否读**（不猜） | **可钉**（max_tokens）；`context_length` 层级待核 |
| **dsh** | `deploy/dsh/settings.yaml` | `llm-deepseek.baseURL`;`maxTokens`;`thinking`;`reasoningEffort` | **无独立协议字段**（vendor 键 `llm-<vendor>` 承载） ⇒ 非默认协议**类型化拒绝**（不猜 vendor 键方言） | `llm-<vendor>.maxTokens` | **半钉**：默认 vendor 可写；**协议方言钉不死 ⇒ 拒** |
| **qwen** | **无原生配置文件**（首启动归一化 settings ⇒ 只读投影 EBUSY）；配置走 env `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`（`production.py:79-80`） | env 三件套 | env 形态＝OpenAI-compat；**逐槽/限额无已证 env 名 ⇒ 类型化拒绝（不猜 env 名）**（v2 明列） | —（未钉死） | **钉不死**（env 名未一手 ⇒ 拒，除非补一手） |

## 2 复用通道（不新建第二条真相）

阶段 2 写入器**必须经这三条既有通道投放**，不得把冻结配置另序列化成 guest 新文件（工单「明确不做的诱人变体」）：
1. **guest 配置投影**：各家 `production.py::projection_files()` / `CONFIG_SOURCE`（read-only 只读投影，值现从模板常量）。
2. **远端一次性物化**：`codex/remote.py::materialize_remote_credential`（写 `/runtime/home/config.toml`，值现来自钉常量）——这是唯一"写 guest 配置"的既有实装。
3. **冻结执行形状**：`model_configs/service.py::freeze_execution_configuration`（`:123-168`，现出 `{provider,model,configuration}`；092 后带 `endpoints/protocols`）+ `subscriptionCredential` 凭据一次性投影（R-0012，本单**不碰凭据通道**）。

⇒ 写入器＝纯函数 `(冻结执行 + 记录事实) → (该家原生字节, guest 目标路径)`，再交给上面通道投放。**当前**通道里写的是常量；093 把它换成"有记录事实按事实、无事实保模板逐字节"（G3/无事实零回归）。

## 3 阶段 2+ 的一手阻塞（为何此刻不接线）

工单 depends_on 条件 + §8 一手：`model_configs` 记录**还没有** `protocols`/`endpoints`、描述符**还没有** `wireProtocols`
⇒ "把第二个上游（非 DeepSeek）的 base_url + 协议方言真落进原生文件"（Requirement 1 / G3）的**输入尚不存在**。
092 未落 ⇒ 接线阶段没有事实可写；硬接线＝从臆造的记录字段读值（违 R-0032⑤）。⇒ **等 092**。

## 4 逐家可钉性预判（阶段 3 接线顺序用；未跑真机前是观测不是结论）

- **可钉、待接线（记录一到位即可）**：codex、claude、opencode、kilo、pi、hermes（max_tokens）。
- **类型化拒绝家（键位钉不死，093 明确不猜）**：**qwen**（env 逐槽/限额名未一手）、**dsh 协议方言**（无独立协议字段）、**hermes `context_length`**（层级待真机核）。
  这些家按 085/093 纪律：**钉不死就不写、给 typed refusal，不写近似值**。

## 5 交回调度者（供 092 时一并考虑，非阻塞本观测）

093 接线要 092 的记录事实形如：provider 记录带 `protocols:[canonical…]` + `endpoints:{protocol→url}`；
描述符带 `wireProtocols`（该家会说哪些协议）。**这正是公告第 106 轮 settings 线 `P46`（8 家声明到不了组件）与
R-0022 串行点（A 105 → B 092）的下游**——092 一旦点名开工并落地，本单阶段 2 起可接线。

## 6 验证（本阶段）

阶段 1＝纯观测、零代码改动 ⇒ 无新门。变更面：仅本证据文件 + `status.md` 093 行（G/接线阶段未动 `src/plugins`）。
`git diff --stat` 应只含 docs/**。
