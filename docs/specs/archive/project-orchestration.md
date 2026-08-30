# 项目级编排（第二阶段）— Spec
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 状态：方向 + 技术摸底已完成，数据模型/协议待设计
> 日期：2026-08-16

## 1. 背景与方向

agent-box 现在做的是**系统级配置与编排**：在 `~/.agent-box/` 维护一个个「员工资料」（profile），逐个把他们喊起来干活（launch）。

第二阶段要扩展到**项目级配置与编排**：在项目目录里（`.agent-box/`，像 `.git/`）统一管理项目级 agent 数据（`.claude/` `.codex/` 等），并支持「分配几个不同 agent 一起干一个任务，管理他们的分工、状态、通信、共享知识」。

抽象地说：**从「系统级的配置与编排」到「项目级的配置与编排」**。

### 分工（保持现状，GUI 先不动）

- **web = 配置台**（GUI 暂不重构，维持 PyWebView 现状）
- **CLI/TUI = 操作台**（launch / 编排）
- 核心逻辑放共享库

## 2. 核心抽象

### 2.1 工作台，不是引擎

不设计「员工」，也不设计「编排范式」。而是**用配置打包**：

- 系统级：profile = 员工的配置包（identity + runtime + resources + sandbox）——已有。
- 项目级：`.agent-box/` = 组织 + 编排方式 + 知识的配置包——新增。

即：agent-box 提供**抽象 + schema + 运行时**，用户用配置把范式打包进来。参考 Coze：本地网关把 CLI agent 包成 MCP server，云端走 MCP 调（本地场景用 stdio transport）。

### 2.2 员工接口（标准契约）

```
invoke(agent, session_id, prompt) → (result, session_id)
```

四个抽象维度：

| 维度     | 内容                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| 员工接口 | wake / assign / permission / config / status / artifact（对应 MCP 的 list_tools/call_tool/resources） |
| 组织     | 谁在团队里、什么角色、什么结构（crew / 岗位 / 分层）                                                  |
| 编排方式 | 顺序 / 分层 / 群聊 / handoff                                                                          |
| 知识     | 共享上下文 / 产物 / 记忆                                                                              |

`session_id` 是编排者生成的 UUID（主键），不是 agent 自动生成的——编排者自己控制记忆的粒度。

## 3. 技术摸底结论

### 3.1 四工具能力（已实测/确认）

四个工具都能「无头执行 + resume by id + session 记忆」：

| 工具     | 无头 invoke        | resume by id             | 拿 session id                                    | json 输出              |
| -------- | ------------------ | ------------------------ | ------------------------------------------------ | ---------------------- |
| claude   | `claude -p "p"`    | `-r <id>`                | `--output-format json` 的 `session_id` ✅ 已实测 | `--output-format json` |
| codex    | `codex exec "p"`   | `codex exec resume <id>` | `--json` 待验证                                  | `--json`(JSONL)        |
| hermes   | `hermes -z "p"`    | `-z --resume <id>`       | `--pass-session-id` / `sessions list`            | `--usage-file`（弱）   |
| opencode | `opencode run "p"` | `run -s <id>`            | `--format json` 待验证                           | `--format json`        |

关键实测（claude）：`--session-id <uuid>`（建会话，须合法 UUID）+ `-r <uuid>`（续接），session 记忆跨调用保留。session 按目录存（`~/.claude/projects/<编码cwd>/<id>.jsonl`）。

### 3.2 bwrap + profile + 无头

机制现成：`launch.launch(name, extra_args=["-p", "--model", "sonnet", "--session-id", "<uuid>", "prompt"])` = bwrap 命名空间 + bind-mount profile 配置 + 跑命令。session 文件落到 profile 自己的 `.claude` 里（天然隔离）。`--share-net` 保证 agent 能连网关。

### 3.3 已知坑

- `[1M]`（大写）是 cc-switch 的 bug（issue #3679），Claude Code 只认 `[1m]`（小写）。去后缀或用 `CLAUDE_CODE_MAX_CONTEXT_TOKENS`。
- claude `-p` 默认走 haiku 模型，要显式 `--model sonnet` 才走主模型。

## 4. 待办

1. **registry 修正**：hermes `exec` 的 `-p` → `-z`（`-p` 大概率已废弃）；给 codex/hermes/opencode 补 `resume_by_id`。
2. **验证** codex/opencode 的 json 输出里有没有 session_id。
3. **`invoke()` 封装**：在 `launch.launch` 基础上，捕获 stdout + 返回 session id，不阻塞不 raise。
4. **项目级 `.agent-box/` 数据模型 + 通信协议**设计（下一阶段的核心，待从抽象维度展开）。

## 5. 未决（写数据模型前要定）

- 「角色」是 profile 的别名，还是独立抽象？（倾向：项目级引用系统级 profile）
- 编排状态用文件（git 友好）还是 DB？（倾向文件）
- 通信协议选「消息池 + 产物流转」（MetaGPT 式）还是「handoff」（Swarm 式）？（倾向产物流转）
