# Work Order 51 阶段 A —— 逐家用量/上下文事实的可得性观察

执行：2026-09-17，env-provider 工作树。**零模型调用、零代码改动**——这是工单 51 的
阶段 A（观察）：对每个家族回答"用量（分子）与上下文窗口（分母）从哪里来、协议层
给不给"，用本机真实的 native 存储做第一手证据（**只读：目录名、键名、SQLite 表/列名；
未读任何凭据内容，未读消息正文**）。

## 逐家观察

| 家族 | native 会话载体 | 用量痕迹（第一手） | 分母（上下文窗口）来源 | 协议层（ACP/driver） |
| --- | --- | --- | --- | --- |
| codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | rollout 行含 **`total_token_usage`** 键（样本计数 ≥1/文件）✓ | `$CODEX_HOME` 内模型目录（部署携带的 models.json 有窗口值） | codex-acp 适配器未透传 usage（见下 ACP 更正） |
| hermes | `~/.hermes/state.db`（SQLite） | **最完整**：`sessions.input_tokens / output_tokens / cache_read_tokens / cache_write_tokens / reasoning_tokens` + `session_model_usage.{input,output,cache_read,cache_write}_tokens` + `messages.token_count` ✓ | Hermes 内建表/回退值（42 记录过 128K 回退） | 同上 |
| claude-code | `~/.claude/projects/*/<uuid>.jsonl` | 行含 `input_tokens` / `output_tokens` / `cache_creation_input_tokens` 键（样本值 0，键存在）✓ | Anthropic 模型目录（各模型窗口不同，需按模型 id 查） | 同上 |
| pi | `~/.pi/agent/sessions/<project>/*.jsonl` | 本机该项目目录为空（无样本）；载体是逐项目 jsonl | pi 的 models-store.json（模型条目） | pi-acp 是 ACP over stdio——ACP schema **无 usage/contextWindow 字段**（工单撰写时已核 vendored 定义） |
| dsh | `~/.dsh/sessions/<project>/session-<uuid>/` | 样本仅有 `session.lock`（本机该会话无内容样本）；载体为目录式 | dsh 模型目录 | ACP（kilo 同构 fork 系）——同上 |
| opencode | `opencode.db`：`message.data` / `part.data`（JSON blob） | **无 usage/token 专用列**；用量（若有）藏在 `data` JSON 内（需逐行解析，未读） | opencode models（供应商模型自带窗口） | 非 ACP：ManagedOpenCodeHost + 中立 driver——**driver 是否透传待 B 阶段实现时核实** |
| kilo | `kilo.db`（同 opencode 结构） | 同 opencode（表结构同构） | kilo models | 同 opencode |
| qwen | 无本机实例 | 待验证 | 待验证 | ACP |

## 结论（阶段 A 的产出）

1. **ACP 结论更正（2026-09-17，按工单 §1 的自我更正）**：早先"ACP 协议无 usage"的说法
   **是错的**（grep 路径不存在、错误被吞）。按 vendored schema 第一手核对：
   `PromptResponse.usage` **存在**，标 UNSTABLE/optional/可 null。⇒ 协议位置有，但
   各家 adapter **是否真的填**仍是阶段 A 的第一手问题。**实现期第一手（pi 门，
   c10，假端点响应注入 usage 11/7/18）**：pi-acp 把它**记进自己的 journal**
   （assistant 行 `message.usage`，数值与注入一致），但**未在 ACP 事件流中播发**——
   即 pi 的用量路径是 native 回读（51 B/C 已按此实现）。其余 ACP 家族待同法观测。
2. **来源三分**：
   - native state 内有结构化用量：codex / hermes / claude-code（各自字段名不同，
     hermes 最完整——含缓存与 reasoning 细分）；
   - native state 无结构化用量、需逐行解析 JSON blob：opencode / kilo（`data` 列）；
   - 本机无样本：pi（空项目）、dsh（仅 lock）、qwen（无实例）——**如实标注"待验证"**，
     不编造。
3. **分母**：各家都在自己的模型目录/内建表里带窗口值，但**没有跨家族的统一字段名**；
   阶段 C 落账本时需要"按模型 id 查窗口"的注册面（provider-model 记录是现成的挂点），
   查不到就如实报"上下文未知"。
4. **对 §1 范围的输入**：51 的 neutral fact 不能假设"每轮都有"——Codex 的
   `total_token_usage` 是**会话累计**（需要差分出每轮），hermes 的 `session_model_usage`
   按会话+模型，claude 的逐条消息。落账本时按"最新值 + 累计值"两个面各自如实。

## 对阶段 B–E 的输入（不实现，仅记录）

- B（neutral fact）：字段面建议 `usage: {inputTokens, outputTokens, cacheReadTokens?,
  cacheWriteTokens?, reasoningTokens?, totalTokens?}` + `contextWindow?: number`，
  全部可选、缺失即不出现（估算禁止）。
- C（账本）：turn 级 best-effort + session 级最新值；来源与来源键（rollout 行号/db 行）
  作为可审计出处记录。
- D（wire 重锁）：与 52 共享一次重锁（工单已定）；本阶段确认 wire 现状无 usage 字段。
- E（前端交接）：前端 P08 容器消费"到达的内容"；ACP 家族在 native 回读落地前显示未知。

## 阶段 B 增量（2026-09-18）：opencode / kilo 的 data blob 解析器落地

**代码**：`usage.py` 新增 `parse_opencode_db` / `parse_kilo_db`，注册名
`opencode-state-db` / `kilo-state-db`；三家 SQLite 载体（hermes/opencode/kilo）收敛到
同一个 `_scratch_sqlite` 助手（bytes 落盘唯一临时名 → `mode=ro` 打开 → 用后删除；
绝不打开活库）。hermes 解析器重写到该助手，**语义零改动**（其两条既有测试原样通过）。

**第一手形状（本机真库只读观测，零模型调用）**：

- opencode.db（sha256 `94eda077e98be340…`，2,273,280 B）：`message.data` 的 assistant
  行自带 `tokens` blob（`total/input/output/reasoning` + `cache.read/write`）与
  `modelID/providerID`——与 kilo 的 `part` 行 `step-finish` blob 同构。解析器取
  **最新一条 assistant 行**（与 pi 的"最后一条 usage 行获胜"同一约定）。
- kilo.db（sha256 `6e99dd55d67f0c82…`，307,200 B）：`session` 表有**专用列**
  `tokens_input/output/reasoning/cache_read/cache_write`（另有 `cost`——成本不进
  neutral fact，工单 53 的"无真实单价来源即未知"照旧）。解析器按 `time_updated`
  取最新会话，**列缺失即字段缺失**（有老库列子集的反例测试）。

**真机映射证据（逐字节复制，未编造）**：

- opencode 最新 assistant 行是**诚实全零 blob**（被中止的调用如实报 0）——解析器
  输出全零 fact，这是"最新值=0"的事实而非解析失败；同一库中一条**逐字复制的非零行**
  （session `ses_…76Rof0H`，total 10587 = 10446 in + 110 out + 31 reasoning）映射出
  完整 neutral fact `10446/110/cacheRead 0/cacheWrite 0/reasoning 31/total 10587`。
- kilo 最新会话（`time_updated=1789514895767`）列值 12/10 → fact
  `{inputTokens:12, outputTokens:10}`，与库逐字段一致。

**测试与回归**：解析器套件 17 passed（新增 4 条：blob 映射、缺表=None、非 SQLite
bytes=None、kilo 列子集）；全量 **784 passed / 0 failed**（loopback probe 的既有
抖动本次以 socket 就绪等待根治，此前该测试在全量下偶发连接拒绝）。

**51 剩余（不变）**：hermes/claude 的门级观测轮（43 代门 marker 维护债）、
dsh/qwen 仍无本地样本。
