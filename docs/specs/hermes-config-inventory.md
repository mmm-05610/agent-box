# Hermes Agent Configuration Inventory

> 盘点 Nous Research Hermes Agent（v0.16.0）所有配置项、存储位置、读写方式
>
> 日期：2026-06-28
> 状态：verified（实验 + 官方文档交叉验证）
> 关联：Profile Tab 补全、Library Extension（mcp / skill / hooks / personality）

---

## 0. 方法论

每个结论标注来源：

| 标记 | 含义                                                                          |
| ---- | ----------------------------------------------------------------------------- |
| 🧪   | 实验验证（agent-box 创建 exp-hermes profile + 现有 hermes-main profile 观察） |
| 📖   | 官方文档（hermes-agent.nousresearch.com + GitHub NousResearch/hermes-agent）  |
| 🧪📖 | 实验 + 文档双重验证                                                           |

环境：Hermes Agent v0.16.0（Python 3.11，pip 安装），`~/.hermes/` host 目录，agent-box 模板在 `src/agent_box/templates/hermes/`。

---

## 1. 配置版图总览

### 1.1 用户可编辑配置（agent-box 应管理）

| #   | 配置项                   | Hermes 读取路径                            | Profile 内对应路径       | 写入方式                   | 验证 |
| --- | ------------------------ | ------------------------------------------ | ------------------------ | -------------------------- | ---- |
| 1   | **config.yaml**          | `~/.hermes/config.yaml` (YAML, ~139 lines) | `dot-hermes/config.yaml` | YAML 合并写入              | 🧪📖 |
| 2   | **.env**                 | `~/.hermes/.env` (dotenv)                  | `dot-hermes/.env`        | 文本覆盖（保留 # 注释）    | 🧪📖 |
| 3   | **SOUL.md**              | `~/.hermes/SOUL.md`                        | `dot-hermes/SOUL.md`     | Markdown 覆盖              | 🧪📖 |
| 4   | **MCP Servers**          | `config.yaml` → `mcp_servers:` 块          | 同 config.yaml           | YAML 内嵌，无独立文件      | 🧪📖 |
| 5   | **Skills**               | `~/.hermes/skills/` + `external_dirs`      | `dot-hermes/skills/`     | 目录拷贝                   | 🧪📖 |
| 6   | **Shell Hooks**          | `config.yaml` → `hooks:` 块                | 同 config.yaml           | YAML 内嵌 + allowlist 文件 | 🧪📖 |
| 7   | **Memories config**      | `config.yaml` → `memory:` 块               | 同 config.yaml           | YAML 写入                  | 📖   |
| 8   | **Compression**          | `config.yaml` → `compression:` 块          | 同 config.yaml           | YAML 写入                  | 🧪   |
| 9   | **Custom Personalities** | `config.yaml` → `agent.personalities`      | 同 config.yaml           | YAML 写入                  | 🧪   |
| 10  | **Auxiliary models**     | `config.yaml` → `auxiliary.*`              | 同 config.yaml           | YAML 写入                  | 📖   |
| 11  | **Skills external_dirs** | `config.yaml` → `skills.external_dirs`     | 同 config.yaml           | YAML 写入                  | 📖   |

### 1.2 Hermes 自动生成（agent-box 不管理，但需保留）

| #   | 路径                                               | 内容                                      | 验证 |
| --- | -------------------------------------------------- | ----------------------------------------- | ---- |
| 12  | `~/.hermes/.install_method`                        | 安装方式标记（git / pip）                 | 🧪   |
| 13  | `~/.hermes/.update_check`                          | 更新检查状态（JSON）                      | 🧪   |
| 14  | `~/.hermes/.env.bak.<timestamp>`                   | .env 的自动备份（每次编辑前生成）         | 🧪   |
| 15  | `~/.hermes/config.yaml.bak.<timestamp>`            | config.yaml 的自动备份                    | 🧪   |
| 16  | `~/.hermes/.hermes_history`                        | CLI 交互历史                              | 🧪   |
| 17  | `~/.hermes/auth.json`                              | OAuth 凭据池（credential_pool）           | 🧪📖 |
| 18  | `~/.hermes/auth.lock`                              | auth.json 写锁（OAuth 认证期间）          | 🧪   |
| 19  | `~/.hermes/audio_cache/`                           | TTS 音频缓存                              | 🧪   |
| 20  | `~/.hermes/bin/` (tirith, uv, uvx)                 | Hermes 自带的二进制依赖（预编译）         | 🧪   |
| 21  | `~/.hermes/cache/model_catalog.json`               | 模型目录缓存                              | 🧪   |
| 22  | `~/.hermes/lsp/` (含 node_modules, package.json)   | LSP 服务依赖（Node.js 包）                | 🧪   |
| 23  | `~/.hermes/sessions/request_dump_<ts>_<hash>.json` | 完整请求/响应 dump（按时间戳）            | 🧪   |
| 24  | `~/.hermes/memories/`                              | 持久化记忆文件目录                        | 📖   |
| 25  | `~/.hermes/skills/.bundled_manifest`               | 内置 skill 版本追踪（`name:hash` 行格式） | 🧪📖 |
| 26  | `~/.hermes/skills/.curator_backups/`               | skill curator 自动备份                    | 🧪   |
| 27  | `~/.hermes/skills/.curator_state`                  | curator 内部状态                          | 🧪   |
| 28  | `~/.hermes/skills/.usage.json` (+ `.lock`)         | skill 使用统计                            | 🧪   |
| 29  | `~/.hermes/skills/.skills_prompt_snapshot.json`    | 当前 prompt 中注入的 skills 快照          | 🧪   |
| 30  | `~/.hermes/shell-hooks-allowlist.json`             | shell hooks 一次性确认 allowlist          | 📖   |
| 31  | `~/.hermes/mcp-tokens/<server>.json`               | OAuth MCP 凭据缓存                        | 📖   |

### 1.3 项目级 / 扩展配置（不在 Profile 内，非 agent-box 管辖）

| #   | 配置项               | 路径                                                 | 备注                          | 验证 |
| --- | -------------------- | ---------------------------------------------------- | ----------------------------- | ---- |
| 32  | Skill bundles        | `~/.hermes/skill-bundles/<slug>.yaml`                | 优先级高于 individual skills  | 📖   |
| 33  | Gateway hooks        | `~/.hermes/hooks/<hook_name>/{HOOK.yaml,handler.py}` | Python-based，独立机制        | 📖   |
| 34  | External skills      | `config.yaml::skills.external_dirs` 列出的目录       | 支持 `~` 和 `${VAR}` 展开     | 📖   |
| 35  | Plugin hooks         | 通过 plugin 加载（`ctx.register_hook()`）            | 与 shell hooks 不同的注册机制 | 📖   |
| 36  | System-managed layer | `requirements.toml` 类机制（不存在，Hermes 无）      | n/a                           | 📖   |

---

## 2. 关键配置项详解

### 2.1 config.yaml 主要 sections

**路径**：`~/.hermes/config.yaml` → Profile `dot-hermes/config.yaml`

**优先级**（从高到低）：

```
CLI args (e.g., /model, --accept-hooks, --ignore-rules)
  > ~/.hermes/config.yaml
  > ~/.hermes/.env (仅用于 secrets)
  > built-in defaults
```

**Schema 顶层 sections**（📖 来自官方 configuration 文档 + 🧪 实际观察）：

```yaml
# ── 模型 ──
model:
  default: mimo-v2.5-pro           # 实际部署的模型
  provider: custom
  base_url: https://token-plan-cn.xiaomimimo.com/v1
  api_key: tp-...                  # ⚠️ 也常在 .env 中

# ── Terminal ──
terminal:
  backend: local                   # local|docker|ssh
  cwd: .
  timeout: 180
  docker_mount_cwd_to_workspace: false
  lifetime_seconds: 300
  container_cpu: 1
  container_memory: 5120
  container_disk: 51200
  container_persistent: true

# ── Browser ──
browser:
  inactivity_timeout: 120

# ── Tool loop guardrails ──
tool_loop_guardrails:
  warnings_enabled: true
  hard_stop_enabled: false
  warn_after:
    exact_failure: 2
    same_tool_failure: 3
    idempotent_no_progress: 2
  hard_stop_after:
    exact_failure: 5
    same_tool_failure: 8
    idempotent_no_progress: 5

# ── Compression ──
compression:
  enabled: true
  threshold: 0.5
  target_ratio: 0.2
  protect_last_n: 20
  protect_first_n: 3

# ── Prompt caching ──
prompt_caching:
  cache_ttl: 5m

# ── Memory ──
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200
  user_char_limit: 1375
  nudge_interval: 10
  flush_min_turns: 6
  write_approval: ...

# ── Session reset ──
session_reset:
  mode: both                       # both|idle|scheduled|none
  idle_minutes: 1440
  at_hour: 4

# ── Concurrency ──
max_concurrent_sessions: null
group_sessions_per_user: true

# ── Streaming ──
streaming:
  enabled: false

# ── Skills ──
skills:
  config: {}                       # 细粒度 skill 配置
  guard_agent_created: ...
  write_approval: ...
  external_dirs:                   # ⭐ 跨 agent 共享 skills
    - ~/.agents/skills

# ── Agent（行为 + personalities）──
agent:
  max_turns: 60
  api_max_retries: 3
  reasoning_effort: medium
  tool_use_enforcement: auto
  disabled_toolsets: []
  personalities:                   # 自定义 personalities
    helpful: You are a helpful...
    concise: ...
    # （14 个 built-in + 用户扩展）

# ── Auxiliary models（多模型）──
auxiliary:
  vision:        { model, provider, base_url, api_key }
  web_extract:   { ... }
  approval:      { ... }
  tts_audio_tags:{ ... }
  compression:   { ... }
  title_generation: { ... }
  skills_hub:    { ... }
  mcp:           { ... }
  triage_specifier: { ... }
  kanban_decomposer: { ... }
  profile_describer: { ... }
  delegation:    { ... }

# ── TTS / STT ──
tts:
  provider: openai
  voice: alloy
stt:
  provider: groq

# ── Display ──
display:
  compact: false
  streaming: true
  personality: null                # 当前激活的 personality

# ── Updates ──
updates:
  pre_update_backup: true
  backup_keep: 5
  non_interactive_local_changes: stash

# ── MCP Servers（嵌入 config.yaml）──
mcp_servers:
  my-server:
    command: npx
    args: ["-y", "@some/mcp-server"]
    env: { API_KEY: "..." }
  my-http-server:
    url: https://example.com/mcp
    auth: oauth                    # 或省略为匿名 HTTP
    headers: { X-Custom: "value" }

# ── Shell Hooks（嵌入）──
hooks:
  pre_tool_call:
    - matcher: "<regex>"
      command: "/path/to/hook.sh"
      timeout: 60
  post_tool_call:
    - matcher: ""
      command: "..."
hooks_auto_accept: false

# ── Code execution ──
code_execution: ...

# ── Worktree ──
worktree: ...

# ── Privacy ──
privacy: ...

# ── Other ──
quick_commands: ...
human_delay: ...
context_file_max_chars: ...
file_read_max_chars: ...
tool_output: ...
credential_pool_strategies: ...
providers.<id>: ...
unauthorized_dm_behavior: ...
```

### 2.2 .env 结构

**路径**：`~/.hermes/.env` (dotenv 格式)

**支持 keys**（部分确认，部分 📖 推测）：

```bash
# 主要 LLM providers
OPENROUTER_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=

# Auxiliary models
VOICE_TOOLS_OPENAI_KEY=
GROQ_API_KEY=
GROQ_BASE_URL=
STT_GROQ_MODEL=
STT_OPENAI_MODEL=
STT_OPENAI_BASE_URL=

# Search / web
EXA_API_KEY=
PARALLEL_API_KEY=
FIRECRAWL_API_KEY=
TAVILY_API_KEY=

# Browser
BROWSERBASE_API_KEY=
BROWSER_USE_API_KEY=

# Image / Video
FAL_API_KEY=

# LLM
ANTHROPIC_API_KEY=
GMI_API_KEY=
GOOGLE_API_KEY=

# Compute
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
DAYTONA_API_KEY=

# Terminal (SSH)
TERMINAL_SSH_HOST=
TERMINAL_SSH_PORT=
TERMINAL_SSH_USER=
TERMINAL_SSH_KEY=
TERMINAL_SSH_PERSISTENT=
TERMINAL_LOCAL_PERSISTENT=
TERMINAL_SCRATCH_DIR=
TERMINAL_SANDBOX_DIR=

# Internal
HERMES_API_TIMEOUT=
HERMES_API_CALL_STALE_TIMEOUT=
HERMES_STREAM_READ_TIMEOUT=
HERMES_STREAM_STALE_TIMEOUT=
HERMES_DOCKER_BINARY=
HERMES_HOME=
HERMES_REAL_HOME=
HERMES_LANGUAGE=
HERMES_FILE_MUTATION_VERIFIER=0
HERMES_ACCEPT_HOOKS=1
```

**Hermes 区分 secrets 与 config**：📖 docs 明确 "Secrets → `.env`. Everything else → `config.yaml`"。但 🧪 实际观察到 `config.yaml` 中也常包含 `api_key` 字段（如 host 中 `model.api_key`），这是一个潜在的**重复配置点**。

### 2.3 SOUL.md — Personality 文件

**路径**：`~/.hermes/SOUL.md`

📖 官方文档："Primary agent identity"，是 system prompt 的 **slot #1**。Hermes 只从 `$HERMES_HOME` 加载，不读 cwd。

**机制**：

- 文件不存在 → 自动创建默认模板（**永不覆盖已有**）
- 文件为空/不可读 → fallback 到 built-in 默认 identity
- 内容（去 comment 后）原样注入 prompt slot #1
- 14 个 built-in personalities：`helpful, concise, technical, creative, teacher, kawaii, catgirl, pirate, shakespeare, surfer, noir, uwu, philosopher, hype`
- 自定义 personalities 在 `agent.personalities.<name>: "..."` 中定义
- 与 `AGENTS.md`（项目约定）和 `/personality`（会话级 overlay）区分

**实验验证（🧪）**：host `~/.hermes/SOUL.md` 是 537 字节的注释模板（未定制），由 user 后续编辑启用。

### 2.4 MCP Servers — 嵌入 config.yaml

📖 Hermes **没有**独立的 MCP 文件。所有 MCP 配置都在 `config.yaml` 的 `mcp_servers:` 块下。Hermes 根据字段存在性推断 transport：

- 有 `command` → stdio
- 有 `url` → HTTP
- 有 `auth: oauth` → OAuth-authenticated HTTP
- 有 `client_cert`/`client_key` → mTLS

**Schema**：

```yaml
mcp_servers:
  my-stdio: # stdio
    command: npx
    args: ["-y", "@some/mcp"]
    env: { API_KEY: "..." }
    timeout: 30
    connect_timeout: 10
    enabled: true
    supports_parallel_tool_calls: true
    tools:
      include: ["tool1", "tool2"]
      exclude: ["tool3"]

  my-http: # anonymous HTTP
    url: https://example.com/mcp
    headers: { X-Custom: "value" }

  my-oauth: # OAuth
    url: https://api.example.com/mcp
    auth: oauth
    oauth:
      client_id: ...
      client_secret: ...

  my-mtls: # mTLS
    url: https://internal.example.com/mcp
    client_cert: |
      -----BEGIN CERTIFICATE-----
      ...
    client_key: |
      -----BEGIN PRIVATE KEY-----
      ...

# 高级：per-server sampling config
mcp_servers.my-server:
  sampling:
    enabled: true
    model: anthropic/claude-opus-4.6
    max_tokens_cap: 4096
    timeout: 30
    log_level: info
```

**OAuth token 缓存**：`~/.hermes/mcp-tokens/<server>.json`

**Catalog**：仓库 `optional-mcps/<name>/manifest.yaml`

**Per-server 命名规则**：工具以 `mcp_<server>_<tool>` 暴露给模型

**冲突规则**：include 与 exclude 同时存在时，**include wins**

**Hermes 作为 MCP server**：`hermes mcp serve`（stdio，~200ms 事件轮询，暴露 10 个工具如 `conversations_list`, `messages_send`, `permissions_respond`）

**CLI**：

- `hermes mcp add` — discovery-first install
- `hermes mcp list` / `ls`
- `hermes mcp test <server>` — 测试连接
- `hermes mcp configure` / `config` — 切换工具选择
- `hermes mcp login` — OAuth 强制重认证
- `hermes mcp picker` / `catalog` / `install`

### 2.5 Skills — `~/.hermes/skills/`

**Single source of truth**：`~/.hermes/skills/<name>/SKILL.md`（📖 官方明确）

**External dirs**（在 `config.yaml::skills.external_dirs`）：

```yaml
skills:
  external_dirs:
    - ~/.agents/skills # ⭐ 与 Claude Code / OpenCode 共享
    - /home/shared/team-skills
    - ${SKILLS_REPO}/skills # ${VAR} 展开
```

**优先级**：local (`~/.hermes/skills/`) > external（按 `external_dirs` 顺序）

**Bundled skills**：仓库 `skills/` → 首次安装时拷贝到 `~/.hermes/skills/`，版本追踪在 `.bundled_manifest`（格式：`name:hash` 行）

**Hub sources**（📖）：`official`, `skills-sh`, `well-known`, `github`（默认 taps: openai, anthropics, huggingface, NVIDIA, gstack）, `clawhub`, `claude-marketplace`, `lobehub`, `browse-sh`, `url`

**Trust levels**：`builtin` > `official` > `trusted` > `community`

**格式**：agentskills.io 兼容

**发现方式**：三层 progressive disclosure：`skills_list()` → `skill_view(name)` → `skill_view(name, path)`

**Skill bundles**（`~/.hermes/skill-bundles/<slug>.yaml`）：一组 skills 的集合定义，**优先级高于 individual skills**

**实验验证（🧪）**：host `~/.hermes/skills/` 包含：

- 多个真实目录：`apple/`, `autonomous-ai-agents/`, `creative/`, `data-science/`, `devops/`, `dogfood/`, `dw-handoff/`, `email/`, `github/`, `media/`, `mlops/`, `note-taking/`, `productivity/`, `red-teaming/`, `research/`, `smart-home/`, `social-media/`, `software-development/`, `yuanbao/`
- 多个**符号链接**到 `~/.agents/skills/`：`frontend-design`, `frontend-design-review`, `mmx-cli`, `pdf`, `skill-creator`, `slack-gif-creator`, `theme-factory`, `vercel-*`, `web-*`, `writing-guidelines`, `xlsx`
- 自动生成文件：`.bundled_manifest`（记录 50+ bundled skill hash）, `.curator_backups/`, `.curator_state`, `.usage.json` (+ lock), `.skills_prompt_snapshot.json`

> **Cross-agent 关系**：Hermes 通过 `skills.external_dirs` 读取 `~/.agents/skills/`，与 Claude Code 的 cross-tool 标准路径一致。agent-box 应确保 hermes profile 的 `config.yaml::skills.external_dirs` 包含 `~/.agents/skills`（如果 host 中存在）。

### 2.6 Hooks — 三种机制并存

📖 官方文档明确：**Hermes 有三种 hook 系统**，不是一种：

| 系统              | 注册位置                                        | 作用范围      | 实现   |
| ----------------- | ----------------------------------------------- | ------------- | ------ |
| **Gateway hooks** | `~/.hermes/hooks/<name>/{HOOK.yaml,handler.py}` | 仅 Gateway    | Python |
| **Plugin hooks**  | `ctx.register_hook()` in plugin                 | CLI + Gateway | Python |
| **Shell hooks**   | `config.yaml::hooks:` block                     | CLI + Gateway | Shell  |

**Shell hooks**（最常用，可被 agent-box 管理）：

```yaml
hooks:
  pre_tool_call:
    - matcher: "<regex>" # 工具名 regex 匹配
      command: "/path/to/hook.sh"
      timeout: 60
  post_tool_call:
    - matcher: ""
      command: "..."
  pre_llm_call:
  post_llm_call:
  on_session_start:
  on_session_end:
  on_session_finalize:
  on_session_reset:
  subagent_start:
  subagent_stop:
  pre_gateway_dispatch:
  pre_approval_request:
  post_approval_response:
  transform_tool_result:
  transform_terminal_output:
  transform_llm_output:

hooks_auto_accept: false # true 则跳过 allowlist 提示
```

**Wire protocol**：JSON via stdin/stdout

**Allowlist**：`~/.hermes/shell-hooks-allowlist.json`

```json
{
  "approvals": [
    {
      "event": "post_llm_call",
      "command": "/home/.../hook.py"
    }
  ]
}
```

每个唯一 `(event, command)` 对**首次**运行时提示用户确认，之后持久化在 allowlist。

**绕过机制**：

- CLI flag: `--accept-hooks`
- Env var: `HERMES_ACCEPT_HOOKS=1`
- Config: `hooks_auto_accept: true`

**CLI**：

- `hermes hooks list | ls` — 列出所有 hooks
- `hermes hooks test <event>` — 用合成 payload 测试
- `hermes hooks revoke` / `remove` / `rm` — 撤销 allowlist
- `hermes hooks doctor` — 检查 exec bit、allowlist、mtime drift、JSON validity、synthetic run timing

**Ordering**：Python plugin hooks 先 → shell hooks 后；首个 valid `{"action": "block", ...}` wins

**Gateway 事件**：`gateway:startup`, `session:start/end/reset`, `agent:start/step/end`, `command:*`

### 2.7 覆盖机制

**CLI 覆盖**：

```bash
hermes -m anthropic/claude-opus-4.6          # 短选模型
hermes --provider custom --base-url https://...
hermes --accept-hooks                        # 跳过 hooks allowlist
hermes --ignore-rules                        # 忽略项目 AGENTS.md
hermes --ignore-user-config                  # 完全跳过 ~/.hermes
hermes --resume <session-id>
hermes --continue                            # 继续上次
hermes --worktree
hermes --yolo                                # 跳过所有权限
hermes --pass-session-id
hermes --tui | --cli | --dev
```

**Slash commands**：`/new`, `/reset`, `/retry`, `/undo`, `/compress`, `/usage`, `/insights [--days N]`, `/stop`, `/platforms`, `/status`, `/sethome`, `/personality`, `/model`, `/skills`, `/reload-mcp`, `/learn`, `/skin`

**Env var override**：

- `HERMES_HOME` / `HERMES_REAL_HOME` — 覆盖 home dir
- `TERMINAL_<KEY_UPPERCASE>` — 覆盖 `terminal.*` 配置
- `AUXILIARY_VISION_*` / `AUXILIARY_WEB_EXTRACT_*` — 覆盖 auxiliary 模型
- `${VAR_NAME}` 在 config.yaml 中替换（undefined 时保留原样）

**Subcommands**（50+，agent-box 应通过 CLI 包装而非 GUI 覆盖）：

```
chat, model, fallback, secrets, migrate, gateway, proxy, lsp,
setup, postinstall, whatsapp, slack, send, login, logout, auth,
status, cron, webhook, portal, kanban, hooks, doctor, security,
dump, debug, backup, checkpoints, import, config, pairing, skills,
bundles, plugins, curator, memory, tools, computer-use, mcp,
sessions, insights, claw, version, update, uninstall, acp, profile,
completion, dashboard, desktop, gui, logs, prompt-size
```

### 2.8 备份机制（Hermes 自动）

📖 `updates.pre_update_backup: true` + `backup_keep: 5` + `non_interactive_local_changes: stash|discard`：

```
.env.bak.20260610_145143
.env.bak.20260610_150307
.env.bak.20260612_085832
...
config.yaml.bak.20260610_145143
...
```

⚠️ agent-box 复制模板到 profile 时，应**避免**携带这些 `.bak.*` 文件，或显式列出 ignore 规则。

### 2.9 Schema 版本化

📖 `hermes config migrate` 会自动添加缺失的配置项。`hermes doctor` 会报告 "Config version outdated (v0 → v28)" 提示用户升级。

---

## 3. 关键差异 vs Claude Code

| 维度                                          | Claude Code                               | Hermes                                                              | 影响                                                           |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| **配置格式**                                  | JSON                                      | YAML + dotenv (.env)                                                | agent-box config editor 需要 YAML reader/writer                |
| **MCP 文件**                                  | `~/.claude.json::mcpServers`              | `config.yaml::mcp_servers:`（嵌入）                                 | agent-box mcp.apply_hermes 直接修改 config.yaml                |
| **Hooks**                                     | JSON `hooks.PreToolUse[]`                 | YAML `hooks.pre_tool_call[]` + 3 种 hook 系统                       | agent-box hooks.apply_hermes 需要支持三种系统的不同入口        |
| **SOUL/personality**                          | 无对应                                    | `SOUL.md` + `agent.personalities` + 14 built-in                     | agent-box 可加 Personality tab                                 |
| **Skills 路径**                               | `~/.claude/skills/` + `~/.agents/skills/` | `~/.hermes/skills/` + `external_dirs`                               | agent-box skills.apply_hermes 复制到 `dot-hermes/skills/<id>/` |
| **Auxiliary models**                          | 无                                        | 11+ 独立模型（vision, web_extract, approval...）                    | agent-box 可选择性暴露                                         |
| **CLI 标志**                                  | `/model`, `/clear`                        | `/model`, `/personality`, `/skills`, `/learn` 等 18+ slash commands | agent-box 可命令包装                                           |
| **备份机制**                                  | 无                                        | `.env.bak.*` + `config.yaml.bak.*` 自动备份                         | agent-box profile copy 需 ignore `.bak.*`                      |
| **OAuth**                                     | 无对应                                    | `auth.json` credential_pool + 多 provider 支持                      | agent-box 可统一管理                                           |
| **Gateway / desktop / gui / dashboard / acp** | 无对应                                    | 内置 5 种 server mode                                               | agent-box 不应触碰（用户独立选择）                             |

---

## 4. agent-box 当前实现状态

### 4.1 ✅ 已实现

| 功能             | 实现                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **MCP 应用**     | `mcp.py::_apply_hermes` → 写入 `config.yaml::mcp_servers.<id>`，剥离 `type` 字段（Hermes 通过 command/url 推断 transport） |
| **Skills 应用**  | `skills.py` → 复制到 `dot-hermes/skills/<id>/`                                                                             |
| **Profile 模板** | `templates/hermes/` 包含 `config.yaml` + `.env`                                                                            |

### 4.2 ❌ 缺失 / 待实现

| 缺失项                               | 影响                                                         |
| ------------------------------------ | ------------------------------------------------------------ |
| **Shell hooks 应用**                 | 用户无法通过 GUI 配置 `hooks.pre_tool_call` 等               |
| **Shell hooks allowlist 管理**       | 用户首次运行新 hook 时卡在 stdin 提示                        |
| **SOUL.md 编辑**                     | 用户无法通过 GUI 编辑 personality                            |
| **Personalities 管理**               | 14 个 built-in + 自定义 personalities 无 GUI 入口            |
| **Auxiliary models 配置**            | 11+ 独立模型的 GUI 缺失                                      |
| **`.env` 多 key 管理**               | 30+ API keys 无统一管理                                      |
| **Skills external_dirs 注入**        | 用户无法通过 GUI 启用 `~/.agents/skills` 共享                |
| **OAuth credential pool 视图**       | `auth.json` 中的 `credential_pool` 不可见                    |
| **Backup ignore**                    | profile copy 携带 `.bak.*` 文件                              |
| **Bundled manifest 保护**            | `dot-hermes/skills/.bundled_manifest` 可能被覆盖             |
| **Config version migration**         | `hermes config migrate` 不在 GUI 触发                        |
| **50+ subcommand 集成**              | 用户必须跳出 agent-box 才能用 `cron`, `webhook`, `kanban` 等 |
| **LSP / Bundles / Plugins / Memory** | 用户无法通过 GUI 配置                                        |

---

## 5. Template 改进建议

`src/agent_box/templates/hermes/` 当前内容：

```
config.yaml  — 17 行（model, terminal, memory, compression, display 等）
.env         — 1 行（HERMES_API_KEY=）
```

**建议补全**：

```yaml
# config.yaml additions
skills:
  external_dirs:
    - ~/.agents/skills # 启用 cross-tool skills 共享

hooks_auto_accept: false # 强制 allowlist 流程

agent:
  max_turns: 60
  reasoning_effort: medium

streaming:
  enabled: false

memory:
  memory_enabled: true
  user_profile_enabled: true

session_reset:
  mode: both
  idle_minutes: 1440

updates:
  pre_update_backup: true
  backup_keep: 5
  non_interactive_local_changes: stash
```

新增文件：

- `SOUL.md` — 默认 personality 模板（537 字节，Hermes 自动创建默认模板）
- `skills/.gitkeep` — 让 skills 目录在 profile 落地时存在
- `memories/.gitkeep` — 让 memories 目录存在

**Profile copy 时 ignore**：

- `.bak.*`（Hermes 自动备份）
- `.usage.json`、`.usage.json.lock`、`.curator_backups/`、`.curator_state`（runtime 状态）
- `.skills_prompt_snapshot.json`（运行时快照）
- `auth.json` 中的 credential_pool（运行时会刷新）
- `bin/`（tirith, uv, uvx，Hermes 自带二进制）
- `lsp/node_modules/`（LSP 包依赖，体积大）
- `sessions/request_dump_*`（请求 dump，体积大且可能含敏感信息）

---

## 6. Profile Tab 设计建议

Hermes profile 应包含以下 tab（基于本 inventory 的用户可编辑配置项）：

| Tab             | 包含项                                                                | 编辑方式               |
| --------------- | --------------------------------------------------------------------- | ---------------------- |
| **General**     | display_name, description, agent_type                                 | 表单                   |
| **Provider**    | model.default, model.provider, model.base_url, api_key                | 表单 + 文本            |
| **API Keys**    | 30+ `.env` keys（OpenRouter, OpenAI, Exa, Parallel...）               | Key-value editor       |
| **Auxiliary**   | auxiliary.vision, web_extract, approval, tts, stt 等 11+ 模型         | 表单                   |
| **Terminal**    | terminal.backend, timeout, cwd, docker_* 配置                         | 表单                   |
| **Memory**      | memory.* 全字段, compression.*                                        | 表单                   |
| **MCP Servers** | 启用/禁用 mcp_servers 条目                                            | Library 引用           |
| **Skills**      | 启用/禁用 skills（来自 Library），external_dirs 配置                  | Library 引用           |
| **Hooks**       | shell hooks（按 event 分组）                                          | YAML editor + 测试按钮 |
| **Personality** | SOUL.md 编辑, personalities 列表, 当前激活 personality                | Markdown + 表单        |
| **Session**     | session_reset, max_concurrent_sessions, group_sessions_per_user       | 表单                   |
| **Updates**     | updates.pre_update_backup, backup_keep, non_interactive_local_changes | 表单                   |
| **OAuth**       | credential_pool 中各 provider 状态                                    | 只读 + 重新认证        |
| **Advanced**    | raw config.yaml + raw .env                                            | YAML / dotenv editor   |

---

## 7. 待验证 / 已知缺口

| 项                                       | 状态                                                                                                                                          | 备注                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `~/.hermes/memory/` 是否独立目录         | 📖 推测但 🧪 未观察到                                                                                                                         | docs 说有 `memories/` 但 host 中无               |
| 14 built-in personalities 完整列表       | 🧪 部分（kawaii, catgirl, pirate, shakespeare, surfer, noir, uwu, philosopher, hype, helpful, concise, technical, creative, teacher — 共 14） | 🧪 host config.yaml 中找到全部                   |
| 所有 `.env` keys 完整性                  | 📖 部分                                                                                                                                       | docs 列举一些，host 中 `.env` 还含 OPENROUTER 等 |
| LSP / Bundles / Plugins / Curator 子系统 | 📖 未深入                                                                                                                                     | 子命令存在但详细 schema 未文档化                 |
| `gateway` / `proxy` / `portal` 配置      | 📖 未深入                                                                                                                                     | 子命令存在但与 agent-box 关系不明确              |
| `dashboards` / `desktop` / `gui` 启动    | 📖 未深入                                                                                                                                     | 推测为 Hermes 自己的 server 模式                 |
| `acp` (Agent Client Protocol) server     | 📖 未深入                                                                                                                                     | 与 opencode acp 类似                             |

---

## 8. Sources

| 类型      | URL                                                                        |
| --------- | -------------------------------------------------------------------------- |
| 📖 官方   | https://hermes-agent.nousresearch.com/docs/user-guide/configuration        |
| 📖 官方   | https://hermes-agent.nousresearch.com/docs/user-guide/features/skills      |
| 📖 官方   | https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks       |
| 📖 官方   | https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp         |
| 📖 官方   | https://hermes-agent.nousresearch.com/docs/user-guide/features/personality |
| 📖 GitHub | https://github.com/NousResearch/hermes-agent                               |
| 🧪 实验   | `~/.hermes/` host 目录结构（2026-06-28）                                   |
| 🧪 实验   | `~/.agent-box/profiles/hermes-main/dot-hermes/` 已运行 profile             |
| 🧪 实验   | `agent-box create exp-hermes --type hermes`（本次创建的 test profile）     |
