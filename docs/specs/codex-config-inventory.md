# Codex CLI Configuration Inventory

> 盘点 OpenAI Codex CLI（v0.142.1）所有配置项、存储位置、读写方式
>
> 日期：2026-06-28
> 状态：verified（实验 + 官方文档交叉验证）
> 关联：Profile Tab 补全、Library Extension（mcp / skill / hooks / plugins）

---

## 0. 方法论

每个结论标注来源：

| 标记 | 含义                                                                        |
| ---- | --------------------------------------------------------------------------- |
| 🧪   | 实验验证（agent-box 创建 exp-codex profile + 现有 codex-main profile 观察） |
| 📖   | 官方文档（developers.openai.com/codex + GitHub openai/codex）               |
| 🧪📖 | 实验 + 文档双重验证                                                         |

环境：Codex CLI 0.142.1（Rust 二进制，npm 安装），`~/.codex/` host 目录，agent-box 模板在 `src/agent_box/templates/codex/`。

---

## 1. 配置版图总览

### 1.1 用户可编辑配置（agent-box 应管理）

| #   | 配置项            | Codex 读取路径                            | Profile 内对应路径                       | 写入方式                         | 验证 |
| --- | ----------------- | ----------------------------------------- | ---------------------------------------- | -------------------------------- | ---- |
| 1   | **config.toml**   | `~/.codex/config.toml` (TOML)             | `dot-codex/config.toml`                  | 合并/追加条目                    | 🧪📖 |
| 2   | **auth.json**     | `~/.codex/auth.json` (JSON)               | `dot-codex/auth.json`                    | JSON 覆盖                        | 🧪📖 |
| 3   | **MCP Servers**   | `config.toml` → `[mcp_servers.*]`         | 同 config.toml                           | TOML 内嵌，无独立文件            | 🧪📖 |
| 4   | **Plugins**       | `config.toml` → `[plugins.*]`             | 同 config.toml + `.tmp/plugins/plugins/` | TOML 配置 + CLI marketplace 安装 | 🧪📖 |
| 5   | **Skills**        | `~/.codex/skills/` + `[skills.config]`    | `dot-codex/skills/`                      | 目录拷贝                         | 🧪📖 |
| 6   | **Rules**         | `~/.codex/rules/` (e.g. `default.rules`)  | `dot-codex/rules/`                       | 文件覆盖                         | 🧪📖 |
| 7   | **Hooks**         | `config.toml` → `[hooks]` 或 `hooks.json` | `dot-codex/config.toml` 或 `hooks.json`  | TOML 内嵌或独立文件              | 📖   |
| 8   | **Memories**      | `~/.codex/memories/` + `[memories.*]`     | `dot-codex/memories/`                    | 文件 + TOML 配置                 | 📖   |
| 9   | **Project trust** | `config.toml` → `[projects.<path>]`       | 同 config.toml                           | TOML 写入                        | 🧪   |

### 1.2 Codex 自动生成（agent-box 不管理，但需保留）

| #   | 路径                                    | 内容                                                  | 验证 |
| --- | --------------------------------------- | ----------------------------------------------------- | ---- |
| 10  | `~/.codex/.personality_migration`       | 一次性迁移标记                                        | 🧪   |
| 11  | `~/.codex/installation_id`              | 安装标识符                                            | 🧪   |
| 12  | `~/.codex/version.json`                 | 更新检查状态                                          | 🧪   |
| 13  | `~/.codex/goals_1.sqlite`               | 用户目标（用户级 settings）                           | 🧪   |
| 14  | `~/.codex/history.jsonl`                | 对话历史（受 `[history].persistence` 控制）           | 🧪📖 |
| 15  | `~/.codex/log/`                         | Codex 日志目录（受 `log_dir` 控制）                   | 🧪📖 |
| 16  | `~/.codex/logs_2.sqlite*` (含 shm/wal)  | 遥测/rollout 数据                                     | 🧪   |
| 17  | `~/.codex/memories/`                    | 持久化记忆文件目录                                    | 🧪📖 |
| 18  | `~/.codex/memories_1.sqlite`            | 记忆 SQLite（受 `[memories.*]` 配置控制）             | 🧪📖 |
| 19  | `~/.codex/session_index.jsonl`          | 会话索引                                              | 🧪   |
| 20  | `~/.codex/sessions/`                    | 会话目录（按年/月组织）                               | 🧪   |
| 21  | `~/.codex/shell_snapshots/`             | Shell 环境快照（受 `[features].shell_snapshot` 控制） | 🧪📖 |
| 22  | `~/.codex/skills/.system/`              | Codex 内置 skills（**不可编辑**）                     | 🧪📖 |
| 23  | `~/.codex/state_5.sqlite*` (含 shm/wal) | 运行时状态数据库（受 `[sqlite_home]` 控制）           | 🧪📖 |
| 24  | `~/.codex/.tmp/`                        | 临时目录（含 `.tmp/plugins/` plugin 缓存）            | 🧪   |
| 25  | `~/.codex/tmp/`                         | 运行时临时文件                                        | 🧪   |

### 1.3 项目级配置（不在 Profile 内，非 agent-box 管辖）

| #   | 配置项          | 路径                             | 是否提交 git      | 验证 |
| --- | --------------- | -------------------------------- | ----------------- | ---- |
| 26  | Project config  | `<repo>/.codex/config.toml`      | 是（trust-gated） | 📖   |
| 27  | Profile overlay | `$CODEX_HOME/<name>.config.toml` | 否（host-only）   | 📖   |
| 28  | System config   | `/etc/codex/config.toml`         | n/a（系统级）     | 📖   |
| 29  | Managed layer   | `requirements.toml`              | 否（管理员部署）  | 📖   |
| 30  | AGENTS.md       | `<repo>/AGENTS.md`               | 是                | 📖   |
| 31  | Project skills  | `<repo>/.codex/skills/`          | 是                | 📖   |

---

## 2. 关键配置项详解

### 2.1 config.toml 完整结构（已验证）

**路径**：`~/.codex/config.toml` → Profile `dot-codex/config.toml`

**优先级**（从高到低）：

```
CLI flags (-c, --enable, --disable)
  > project .codex/config.toml (trust-gated)
  > --profile <name> overlay
  > user ~/.codex/config.toml
  > system /etc/codex/config.toml
  > built-in defaults
```

**Project config 不可覆盖的键**（限制 list，由 [config-reference](https://developers.openai.com/codex/config-reference) 确认）：

```
openai_base_url, chatgpt_base_url, apps_mcp_product_sku,
model_provider, model_providers, notify, profile, profiles,
experimental_realtime_ws_base_url, otel
```

**主要 schema sections**（按 category 组织，📖 来源 config-reference）：

```toml
# ── 模型 ──
model = "MiniMax-M3"
model_provider = "custom"
model_reasoning_effort = "high"  # minimal|low|medium|high|xhigh
model_reasoning_summary = "auto" # auto|concise|detailed|none
model_verbosity = "medium"
review_model = "..."

# ── Provider ──
[model_providers.custom]
name = "minimax"
base_url = "https://api.minimaxi.com/v1"
wire_api = "responses"
requires_openai_auth = true

# ── Sandbox / Approvals ──
sandbox_mode = "workspace-write"  # read-only|workspace-write|danger-full-access
approval_policy = "never"          # untrusted|on-request|never

[sandbox_workspace_write]
exclude_tmpdir_env_var = false
exclude_slash_tmp = false
writable_roots = []
network_access = false

# ── MCP（嵌入！无独立文件）──
[mcp_servers.my-server]
command = "npx"
args = ["-y", "@some/mcp-server"]
env = { API_KEY = "..." }

[mcp_servers.http-server]
url = "https://example.com/mcp"
bearer_token_env_var = "MCP_TOKEN"

# ── Plugins ──
[plugins.my-plugin.mcp_servers.some-server]
command = "..."

[tool_suggest.discoverables]
"some-tool" = { type = "plugin", id = "my-plugin" }

# ── Skills ──
[[skills.config]]
enabled = true
path = "/path/to/skill"

# ── Hooks（嵌入或独立 hooks.json）──
[hooks.PreToolUse]
hooks = [{ type = "command", command = "/path/to/hook.sh" }]

# ── Memories ──
[features]
memories = true

[memories]
max_raw_memories_for_consolidation = 256
max_rollout_age_days = 30

# ── 项目信任 ──
[projects."/path/to/project"]
trust_level = "trusted"

# ── History ──
[history]
persistence = "save-all"  # save-all|none
max_bytes = 52428800
```

**关键 schema sections**（完整 key 列表见 [config-reference](https://developers.openai.com/codex/config-reference)）：

- Model：`model`, `model_provider`, `model_reasoning_effort`, `model_reasoning_summary`, `model_verbosity`, `review_model`, `plan_mode_reasoning_effort`, `service_tier`
- Sandbox：`sandbox_mode`, `approval_policy`, `[sandbox_workspace_write]`, `[permissions.<name>]`
- Network/MCP：`mcp_servers.*`, `mcp_oauth_callback_port`, `mcp_oauth_callback_url`, `mcp_oauth_credentials_store`（`auto|file|keyring`）
- TUI：`[tui]`（animations, notifications, vim_mode_default, theme, status_line, keymap）
- Notifications：`notify`（array）, `[analytics]`, `[feedback]`
- Shell：`[shell_environment_policy]`（inherit, exclude, include_only, set）
- Multi-agent：`[agents.<name>]`, `agents.max_depth`, `agents.max_threads`
- Permissions profile：`[permissions.<name>]`（filesystem, network, workspace_roots）— **modern**, 替换已废弃的 `[profiles.*]`（0.134.0 移除）
- Features：`[features]` — apps, code_mode, codex_git_commit, hooks, memories, multi_agent, personality, shell_snapshot, skill_mcp_dependency_install, undo, unified_exec

### 2.2 auth.json 结构

**路径**：`~/.codex/auth.json` (mode 600)

```json
{
  "OPENAI_API_KEY": "sk-..."
}
```

📖 新增配置项：`cli_auth_credentials_store = "file" | "keyring" | "auto"`（config.toml 顶层），控制凭据存储后端。

### 2.3 MCP Servers — 嵌入 config.toml

📖 Codex **没有**独立的 MCP 文件（如 `.mcp.json`）。所有 MCP 配置都在 `config.toml` 的 `[mcp_servers.*]` 下。

**Schema**（按 transport 分）：

```toml
# stdio
[mcp_servers.fs]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
env = { LOG_LEVEL = "info" }
cwd = "/srv"
env_vars = [{ name = "API_KEY", source = "local" }]  # local|remote

# HTTP (streamable)
[mcp_servers.http-server]
url = "https://api.example.com/mcp"
bearer_token_env_var = "MCP_TOKEN"
http_headers = { X-Custom = "value" }
oauth_resource = "..."
scopes = ["read", "write"]

# 通用
[mcp_servers.x]
startup_timeout_sec = 10       # default 10
tool_timeout_sec = 60          # default 60
enabled = true
required = false               # fail startup/resume if unavailable
enabled_tools = ["tool1"]
disabled_tools = ["tool2"]
default_tools_approval_mode = "ask"  # ask|allow|deny
[mcp_servers.x.tools.some-tool]
approval_mode = "allow"
```

**OAuth**：

- 凭据存储：`mcp_oauth_credentials_store` 控制（`file`/`keyring`/`auto`）
- 回调：`mcp_oauth_callback_port` + `mcp_oauth_callback_url`

**CLI**：

- `codex mcp list` — 列出已配置 servers
- `codex mcp get <name>` — 查看 JSON
- `codex mcp add <name> (--url <URL> | -- <COMMAND>...)` — 添加
- `codex mcp remove <name>` — 删除
- `codex mcp login <name>` / `logout <name>` — OAuth 认证

**实验验证（🧪）**：`codex mcp list` 在默认 host 配置下返回 "No MCP servers configured"，确认 Claude 的 `~/.claude.json::mcpServers` 与 Codex 的 `[mcp_servers.*]` 完全分离，没有自动合并。

### 2.4 Plugins — TOML + Marketplace 双层

**Plugin 来源**：

1. **Marketplace**：`codex plugin marketplace add <url>` → 从市场拉取 plugin 清单到 `.tmp/plugins/plugins/`
2. **TOML**：直接编辑 `config.toml` 的 `[plugins.<name>.mcp_servers.<server>.*]` 声明 plugin 自带的 MCP servers
3. **Tool suggestion**：`[tool_suggest.{discoverables,disabled_tools}]` 配置插件的发现行为

**已知 marketplace**：`openai-api-curated`（Codex 内置市场，host 中存在 `.tmp/plugins/.agents/plugins/api_marketplace.json`）

**CLI**：

- `codex plugin marketplace list/add/upgrade/remove` — 管理市场
- `codex plugin list` — 列出可用 plugins
- `codex plugin add <name>` — 从市场安装
- `codex plugin remove <name>` — 卸载

**注意**：plugin 安装的副本存储在 `.tmp/plugins/plugins/<plugin>/`，是 scratch 目录，不应手工编辑。

### 2.5 Skills — `~/.codex/skills/`

**两层结构**：

- `~/.codex/skills/<skill-name>/SKILL.md` — 用户/项目安装
- `~/.codex/skills/.system/<bundled>/SKILL.md` — Codex 内置（**不可编辑**）

**TOML 配置**：`[[skills.config]]` (array of `{enabled, path}`)

**项目 skills**（📖）：解析时支持 `.codex/skills/` 项目相对路径

**Skill 格式**：每个 skill 是一个目录，包含 `SKILL.md`（必填）+ 可选 `references/`, `templates/`, `scripts/`, `assets/`

**实验验证（🧪）**：host `~/.codex/skills/` 中 `.system/` 子目录包含 `imagegen`, `openai-docs`, `skill-creator`, `plugin-creator`, `skill-installer` 五个内置 skills，根目录 `ctf-writeup-search` 是用户安装。

### 2.6 Rules — `~/.codex/rules/`

**路径**：`~/.codex/rules/<name>.rules`

**默认文件**：`default.rules`（host 中 19KB）

**TOML 控制**：`[project_doc_fallback_filenames]`（默认 `AGENTS.md`），`[project_doc_max_bytes]`

### 2.7 Hooks — config.toml 或独立 hooks.json

**事件**（📖 来自 config-reference）：`PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SessionStart`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`

**Schema**：

```toml
[hooks.PreToolUse]
hooks = [{ type = "command", command = "/path/to/hook.sh" }]
```

或 `[[hooks.PreToolUse.hooks]]`（数组式）

**Feature gate**：`[features].hooks`（alias of legacy `features.codex_hooks`）

**⚠️ Managed-mode 陷阱**：`allow_managed_hooks_only = true` **只在 `requirements.toml` 生效**；放在 `config.toml` 是 no-op（📖 来自 `docs/config.md`）。

### 2.8 覆盖机制

**CLI 一次性覆盖**：

```bash
codex -c model="gpt-5"                          # dot-path set
codex -c 'sandbox_permissions=["disk-full-read-access"]'
codex --enable feature_a --enable feature_b     # feature flags
codex --profile my-preset                      # 加载 ~/.codex/my-preset.config.toml
codex --model gpt-5.4                          # 简短 model 切换
```

**env 变量**：`CODEX_HOME` 覆盖 `~/.codex` 根目录

---

## 3. 关键差异 vs Claude Code

| 维度              | Claude Code                               | Codex CLI                                            | 影响                                                         |
| ----------------- | ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **配置格式**      | JSON                                      | TOML                                                 | agent-box mcp.apply / hooks.apply 需要 TOML reader/writer    |
| **MCP 文件**      | `~/.claude.json::mcpServers`              | `config.toml::[mcp_servers.*]`（嵌入）               | agent-box mcp.apply_codex 直接修改 config.toml，无独立文件   |
| **Plugins**       | `enabledPlugins` 字段                     | marketplace + `[plugins.*]` TOML                     | agent-box 目前只管理 MCP，需要新增 plugin 应用逻辑           |
| **Hooks 格式**    | JSON 对象数组                             | TOML 表 + 数组                                       | hooks.apply 需要按 agent_type 分发到不同格式                 |
| **本地 override** | `settings.local.json`                     | `--profile` 加载 `$CODEX_HOME/<name>.config.toml`    | agent-box 可为每个 profile 创建 `<profile>.config.toml` 副本 |
| **Skills 路径**   | `~/.claude/skills/` + `~/.agents/skills/` | `~/.codex/skills/`（含 `.system/`）                  | agent-box skills.apply_codex 复制到 `dot-codex/skills/<id>/` |
| **Rules 机制**    | 无对应                                    | `~/.codex/rules/<name>.rules` + `AGENTS.md` fallback | agent-box 可加 Rules tab                                     |
| **Memories**      | 自动（无显式控制）                        | `[features].memories` + `[memories.*]` 细粒度        | agent-box 可选择性暴露 memories 开关                         |

---

## 4. agent-box 当前实现状态

### 4.1 ✅ 已实现

| 功能             | 实现                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| **MCP 应用**     | `mcp.py::_apply_codex` → 写入 `[mcp_servers.<id>]` 到 config.toml     |
| **Skills 应用**  | `skills.py` → 复制到 `dot-codex/skills/<id>/`                         |
| **Profile 模板** | `templates/codex/` 包含 `auth.json` + `config.toml`                   |
| **Provider**     | `providers.py` 支持写入 `model_provider` + `[model_providers.<name>]` |

### 4.2 ❌ 缺失 / 待实现

| 缺失项                  | 影响                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| **Hooks 应用**          | 用户无法通过 GUI 配置 Codex hooks                                       |
| **Plugins 应用**        | 用户无法通过 GUI 管理 Codex plugins                                     |
| **Rules 应用**          | 用户无法通过 GUI 管理 `~/.codex/rules/`                                 |
| **Memories 开关**       | 用户无法通过 GUI 切换 `[features].memories`                             |
| **Override flag**       | GUI launch 时无法注入 `-c key=value`                                    |
| **`--profile` overlay** | 无 profile overlay 机制                                                 |
| **Skills .system 保护** | apply 时可能覆盖 `.system/` 内置 skills，需要黑名单                     |
| **Template 补全**       | 当前模板只有 `auth.json` + `config.toml`，缺少 `rules/`, `skills/` 骨架 |

---

## 5. Template 改进建议

`src/agent_box/templates/codex/` 当前内容：

```
auth.json       — { "OPENAI_API_KEY": "" }
config.toml     — 17 行（model, provider, sandbox_mode, approval_policy 等）
```

**建议补全**：

```toml
# config.toml additions
[history]
persistence = "none"      # 避免 profile 写入 host history

[projects."<host cwd>"]
trust_level = "trusted"

[[skills.config]]
enabled = true
path = "~/.codex/skills"  # 占位，让 Codex 扫描用户 skills
```

新增文件：

- `rules/default.rules` — 模板默认 rules（可与 agent-box agent guidance 对齐）
- `skills/.gitkeep` — 让 skills 目录在 profile 落地时即存在
- `hooks.json` — 空骨架 `{ }`，让 GUI hooks.apply 有目标文件

---

## 6. Profile Tab 设计建议

Codex profile 应包含以下 tab（基于本 inventory 的用户可编辑配置项）：

| Tab             | 包含项                                                           | 编辑方式           |
| --------------- | ---------------------------------------------------------------- | ------------------ |
| **General**     | display_name, description, agent_type                            | 表单               |
| **Provider**    | model, model_provider, model_reasoning_effort, base_url, api_key | 表单 + JSON view   |
| **Sandbox**     | sandbox_mode, approval_policy, writable_roots, network_access    | 表单               |
| **MCP Servers** | 启用/禁用 mcp_servers 条目                                       | Library 引用       |
| **Skills**      | 启用/禁用 skills（来自 Library）                                 | Library 引用       |
| **Rules**       | rules/ 目录文件管理                                              | File editor / 模板 |
| **Hooks**       | hooks 事件配置                                                   | JSON/TOML editor   |
| **Plugins**     | plugin marketplace + enabled plugins                             | 表单（CLI 包装）   |
| **Memories**    | `[features].memories` + `[memories.*]` 高级参数                  | 表单               |

---

## 7. 待验证 / 已知缺口

| 项                                 | 状态        | 备注                                           |
| ---------------------------------- | ----------- | ---------------------------------------------- |
| `[permissions.*]` schema           | 🧪 待验证   | 来自 docs，需在 host 上实测一组权限定义        |
| `requirements.toml` 实际生效路径   | 📖 部分确认 | 需在测试环境部署 managed layer 验证            |
| Hooks 的 `hooks.json` 独立文件路径 | 📖 未确认   | docs 提及独立 hooks.json，但具体路径未明       |
| Plugin marketplace 离线安装        | 📖 未确认   | `codex plugin add` 是否支持本地路径不明        |
| `[notice.*]` 自动迁移标记位置      | 📖 未实验   | 0.142 版本是否产生实际 `.notice` 文件待验证    |
| `goals_1.sqlite` 用途              | 📖 未文档化 | docs 只提及 `state_*.sqlite` / `logs_*.sqlite` |

---

## 8. Sources

| 类型      | URL                                                                              |
| --------- | -------------------------------------------------------------------------------- |
| 📖 官方   | https://developers.openai.com/codex/config-basic                                 |
| 📖 官方   | https://developers.openai.com/codex/config-advanced                              |
| 📖 官方   | https://developers.openai.com/codex/config-reference                             |
| 📖 GitHub | https://github.com/openai/codex/blob/main/docs/config.md                         |
| 📖 GitHub | https://github.com/openai/codex/blob/main/docs/skills.md                         |
| 🧪 实验   | `~/.codex/` host 目录结构（2026-06-28）                                          |
| 🧪 实验   | `~/.agent-box/profiles/codex-main/dot-codex/` 已运行 profile（v0.5 之前的 copy） |
| 🧪 实验   | `agent-box create exp-codex --type codex`（本次创建的 test profile）             |
