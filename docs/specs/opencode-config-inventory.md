# OpenCode Configuration Inventory

> 盘点 OpenCode（sst / anomalyco, v1.17.11）所有配置项、存储位置、读写方式
>
> 日期：2026-06-28
> 状态：verified（实验 + 官方文档交叉验证）
> 关联：Profile Tab 补全、Library Extension（mcp / skill / agents / plugins）

---

## 0. 方法论

每个结论标注来源：

| 标记 | 含义                                                                              |
| ---- | --------------------------------------------------------------------------------- |
| 🧪   | 实验验证（agent-box 创建 exp-opencode profile + 现有 opencode-main profile 观察） |
| 📖   | 官方文档（opencode.ai/docs + GitHub sst/opencode / anomalyco/opencode）           |
| 🧪📖 | 实验 + 文档双重验证                                                               |

环境：OpenCode 1.17.11（Go 二进制，npm 安装），配置 `~/.config/opencode/`，数据 `~/.local/share/opencode/`，agent-box 模板在 `src/agent_box/templates/opencode/` + `templates/opencode-data/`。

---

## 1. 配置版图总览

### 1.1 用户可编辑配置（agent-box 应管理）

| #   | 配置项                                         | OpenCode 读取路径                                                                              | Profile 内对应路径                | 写入方式                    | 验证 |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------- | ---- |
| 1   | **opencode.jsonc**                             | `~/.config/opencode/opencode.jsonc` (JSONC)                                                    | `dot-opencode/opencode.jsonc`     | JSON 合并                   | 🧪📖 |
| 2   | **auth.json**                                  | `~/.local/share/opencode/auth.json`                                                            | `dot-opencode-data/auth.json`     | JSON 覆盖                   | 🧪📖 |
| 3   | **Provider config**                            | `opencode.jsonc` → `provider.<id>`                                                             | 同 opencode.jsonc                 | JSON 写入                   | 🧪📖 |
| 4   | **MCP Servers**                                | `opencode.jsonc` → `mcp`                                                                       | 同 opencode.jsonc                 | JSON 内嵌，无独立文件       | 🧪📖 |
| 5   | **MCP OAuth**                                  | `~/.local/share/opencode/mcp-auth.json`                                                        | `dot-opencode-data/mcp-auth.json` | JSON 覆盖（auto-generated） | 📖   |
| 6   | **Agents**                                     | `opencode.jsonc` → `agent.<name>` + `agents/` 目录                                             | `dot-opencode/agents/`            | Markdown 文件 + JSON        | 📖   |
| 7   | **Skills**                                     | `~/.config/opencode/skills/` + `.opencode/skills/` + `~/.agents/skills/` + `~/.claude/skills/` | `dot-opencode/skills/`            | 目录拷贝                    | 📖   |
| 8   | **Commands**                                   | `opencode.jsonc` → `command` + `commands/` 目录                                                | `dot-opencode/commands/`          | Markdown + JSON             | 📖   |
| 9   | **Plugins**                                    | `opencode.jsonc` → `plugin` 数组 + `plugins/` 目录                                             | `dot-opencode/node_modules/`      | npm install + 文件          | 📖   |
| 10  | **Tools permission**                           | `opencode.jsonc` → `permission`                                                                | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 11  | **Tools enabled/disabled**                     | `opencode.jsonc` → `tools`                                                                     | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 12  | **LSP**                                        | `opencode.jsonc` → `lsp`                                                                       | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 13  | **Formatter**                                  | `opencode.jsonc` → `formatter`                                                                 | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 14  | **Instructions paths**                         | `opencode.jsonc` → `instructions`                                                              | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 15  | **Compaction / Snapshot / Autoupdate / Share** | `opencode.jsonc` 顶层 keys                                                                     | 同 opencode.jsonc                 | JSON 写入                   | 📖   |
| 16  | **Server / Watcher**                           | `opencode.jsonc` 顶层 keys                                                                     | 同 opencode.jsonc                 | JSON 写入                   | 📖   |

### 1.2 OpenCode 自动生成（agent-box 不管理，但需保留）

| #   | 路径                                                           | 内容                                         | 验证 |
| --- | -------------------------------------------------------------- | -------------------------------------------- | ---- |
| 17  | `~/.local/share/opencode/opencode.db*` (db + shm + wal)        | 运行时状态数据库（sessions, messages, etc.） | 🧪📖 |
| 18  | `~/.local/share/opencode/log/opencode.log`                     | 运行日志                                     | 🧪📖 |
| 19  | `~/.local/share/opencode/repos/`                               | 已克隆的 git 仓库缓存                        | 🧪   |
| 20  | `~/.local/share/opencode/snapshot/<hash>/`                     | 文件快照（受 `snapshot` config 控制）        | 🧪📖 |
| 21  | `~/.local/share/opencode/tool-output/<id>/`                    | 大工具输出临时文件                           | 🧪   |
| 22  | `~/.local/share/opencode/auth.json` (除手动添加的 provider 外) | OAuth / 自动刷新的凭据                       | 🧪   |
| 23  | `~/.local/share/opencode/mcp-auth.json`                        | MCP OAuth tokens                             | 📖   |
| 24  | `~/.config/opencode/node_modules/` (npm plugin 安装)           | plugin npm 包                                | 🧪📖 |
| 25  | `~/.config/opencode/package.json` + `package-lock.json`        | plugin 依赖 manifest                         | 🧪   |
| 26  | `~/.config/opencode/.gitignore`                                | 自动生成（避免 node_modules 等进 git）       | 🧪   |

### 1.3 项目级配置（不在 Profile 内，非 agent-box 管辖）

| #   | 配置项             | 路径                                  | 备注                            | 验证 |
| --- | ------------------ | ------------------------------------- | ------------------------------- | ---- |
| 27  | Project config     | `<repo>/opencode.json` / `.opencode/` | 项目根 opencode.json 优先于全局 | 📖   |
| 28  | Project agents     | `<repo>/.opencode/agents/`            | 项目级 subagents                | 📖   |
| 29  | Project skills     | `<repo>/.opencode/skills/`            | 项目级 skills                   | 📖   |
| 30  | Project commands   | `<repo>/.opencode/commands/`          | 项目级 slash commands           | 📖   |
| 31  | Project plugins    | `<repo>/.opencode/plugins/`           | 项目级 JS/TS plugins            | 📖   |
| 32  | Project modes      | `<repo>/.opencode/modes/`             | 项目级 modes                    | 📖   |
| 33  | Project tools      | `<repo>/.opencode/tools/`             | 项目级自定义 tools              | 📖   |
| 34  | Project themes     | `<repo>/.opencode/themes/`            | 项目级主题                      | 📖   |
| 35  | Remote .well-known | `<remote>/.well-known/opencode`       | 远程默认配置（最低优先级）      | 📖   |
| 36  | MDM plist          | (macOS MDM managed)                   | 最高优先级，管理员部署          | 📖   |

---

## 2. 关键配置项详解

### 2.1 opencode.jsonc 完整 schema

**路径**：`~/.config/opencode/opencode.jsonc` → Profile `dot-opencode/opencode.jsonc`

**优先级**（从低到高，📖 官方）：

```
Remote .well-known/opencode
  > global ~/.config/opencode/opencode.jsonc
  > custom OPENCODE_CONFIG env
  > project opencode.json (项目根)
  > .opencode/ directory
  > inline content
  > managed files
  > MDM plist
```

**主要 schema**：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  // ── Provider ──
  "provider": {
    "custom-provider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Custom Provider",
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "{env:CUSTOM_API_KEY}", // {env:VAR} 或 {file:path}
        "setCacheKey": true,
        "headers": { "X-Custom": "value" },
      },
      "models": {
        "model-id": {
          "name": "Display Name",
          "limit": { "context": 128000, "output": 4096 },
        },
      },
      "blacklist": ["bad-model-id"],
      "whitelist": ["allowed-model-id"],
    },
  },

  // ── Model ──
  "model": "custom-provider/model-id",
  "small_model": "custom-provider/cheaper-model",

  // ── Agent 覆盖 ──
  "agent": {
    "build": {
      "description": "...",
      "model": "...",
      "prompt": "{file:./prompts/build.txt}",
      "tools": { "bash": true, "edit": true },
      "permission": { "edit": "allow", "bash": "ask" },
      "temperature": 0.7,
      "steps": 100,
      "mode": "primary",
      "hidden": false,
      "color": "#FF0000",
      "top_p": 0.9,
    },
  },

  // ── Default agent ──
  "default_agent": "build", // "plan" | "build"

  // ── MCP Servers（嵌入，无独立文件）──
  "mcp": {
    "my-server": {
      "type": "local", // local|remote
      "command": ["npx", "-y", "@some/mcp"],
      "cwd": "/srv",
      "environment": { "API_KEY": "..." },
      "enabled": true,
      "timeout": 30000,
    },
    "my-http": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "..." },
      "oauth": {/* ... */},
      "enabled": true,
      "timeout": 30000,
    },
  },

  // ── Plugins（npm 包名数组）──
  "plugin": ["@opencode/plugin-foo", "@opencode/plugin-bar"],

  // ── Tools 控制 ──
  "tools": {
    "bash": true,
    "edit": true,
    "webfetch": true,
    "my-mcp-*": false, // 通配符禁启用
  },

  // ── Permission（每工具）──
  "permission": {
    "edit": "allow", // allow|ask|deny
    "bash": "ask",
    "webfetch": "allow",
  },

  // ── Command（自定义 slash commands）──
  "command": {
    "my-command": {
      "template": "Do something with $ARGUMENTS",
      "description": "My custom command",
      "agent": "build",
    },
  },

  // ── LSP ──
  "lsp": {
    "tsserver": { "enabled": true },
    "pyright": { "disabled": true },
  },

  // ── Formatter ──
  "formatter": {
    "prettier": { "disabled": false },
  },

  // ── Instructions paths ──
  "instructions": ["./AGENTS.md", "**/.opencode/instructions.md"],

  // ── Behavior ──
  "compaction": { "enabled": true, "max_tokens": 80000 },
  "snapshot": true, // 文件变更追踪
  "autoupdate": "notify", // true|false|"notify"
  "share": "manual", // "manual"|"auto"|"disabled"
  "watcher": { "ignore": ["node_modules/**", ".git/**"] },

  // ── Provider enable/disable ──
  "enabled_providers": ["anthropic", "openai"],
  "disabled_providers": ["cohere"],

  // ── Server ──
  "server": {
    "port": 0,
    "hostname": "127.0.0.1",
    "mdns": false,
    "mdnsDomain": "opencode.local",
    "cors": [],
  },

  // ── Shell ──
  "shell": { "path": "/bin/bash", "alias": {} },

  // ── Experimental ──
  "experimental": { "policies": true },

  // ── Attachment ──
  "attachment": {
    "image": { "auto_resize": true, "max_width": 2048 },
  },
}
```

**变量替换**（📖）：`{env:VAR_NAME}`（环境变量）和 `{file:path}`（相对 config dir 或绝对路径）

**Subdirectory naming**：`.opencode/` 和 `~/.config/opencode/` 下用**复数**目录：`agents/`, `commands/`, `modes/`, `plugins/`, `skills/`, `tools/`, `themes/`。单数形式为向后兼容保留。

### 2.2 auth.json 结构

**路径**：`~/.local/share/opencode/auth.json` → Profile `dot-opencode-data/auth.json`

```json
{
  "Provider Name": {
    "api_key": "sk-...",
    "base_url": "https://api.example.com/v1"
  },
  "Another Provider": {
    "api_key": "...",
    "base_url": "..."
  }
}
```

**管理方式**：

- TUI `/connect` 命令
- CLI `opencode auth`（alias `providers`）
- `opencode auth list` — 列出已认证 providers

### 2.3 MCP Servers — 嵌入 opencode.jsonc

📖 OpenCode **没有**独立的 MCP 文件（如 `.mcp.json`）。MCP 在 `opencode.jsonc` 的 `mcp` 顶层 key 下。

**Local (stdio) schema**：

```jsonc
{
  "mcp": {
    "filesystem": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/tmp",
      ],
      "cwd": "/srv",
      "environment": { "LOG_LEVEL": "info" },
      "enabled": true,
      "timeout": 30000,
    },
  },
}
```

**Remote (HTTP/SSE) schema**：

```jsonc
{
  "mcp": {
    "my-http": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": { "X-Custom": "value" },
      "oauth": { "clientId": "...", "clientSecret": "..." },
      "enabled": true,
      "timeout": 30000,
    },
  },
}
```

**OAuth 凭据缓存**：`~/.local/share/opencode/mcp-auth.json`（独立于 `auth.json`）

**全局禁用 MCP**：用 `tools` 配置 glob：

```jsonc
{
  "tools": { "my-mcp-*": false }
```

**CLI**：

- `opencode mcp add [name]` — 添加（交互或 stdin）
- `opencode mcp list | ls` — 列出
- `opencode mcp auth [name]` — OAuth 认证
- `opencode mcp logout [name]` — 删除 OAuth
- `opencode mcp debug <name>` — 调试 OAuth 连接

**实验验证（🧪）**：host `opencode mcp list` 返回 "No MCP servers configured"，确认 host 配置（仅 `$schema`）未设置任何 MCP。

### 2.4 Skills — 多路径发现

📖 OpenCode 沿 6 个路径搜索 skills（按顺序）：

| 顺序 | 路径                                        | Scope                   |
| ---- | ------------------------------------------- | ----------------------- |
| 1    | `.opencode/skills/<name>/SKILL.md`          | project                 |
| 2    | `~/.config/opencode/skills/<name>/SKILL.md` | global                  |
| 3    | `.claude/skills/<name>/SKILL.md`            | project (Claude compat) |
| 4    | `~/.claude/skills/<name>/SKILL.md`          | global (Claude compat)  |
| 5    | `.agents/skills/<name>/SKILL.md`            | project (Agent compat)  |
| 6    | `~/.agents/skills/<name>/SKILL.md`          | global (Agent compat)   |

**Walk-up behavior**：从 cwd 向上 walk 到 git worktree boundary，加载所有匹配的 `SKILL.md`

**格式要求**：

```markdown
---
name: my-skill # required, must match directory name
description: My skill # required
license: MIT # optional
compatibility: opencode>=1.0 # optional
metadata: # optional, string → string map
  author: someone
---

# Skill content

...
```

**命名规则**（regex）：`^[a-z0-9]+(-[a-z0-9]+)*$`，长度 1-64 字符。

### 2.5 Agents — Built-in + Custom

**Built-in primary agents**（📖）：

- `build` — 完整工具访问
- `plan` — 只读

**Built-in subagents**：

- `general` — 通用子代理
- `explore` — 代码探索（专门）
- `scout` — 搜索（专门）

**Hidden system agents**（不可 UI 选择）：`compaction`, `title`, `summary`

**配置位置**：

1. **JSON in opencode.jsonc**：`agent.<name>` 顶层 key
2. **Markdown file**：
   - Global: `~/.config/opencode/agents/<name>.md`
   - Project: `.opencode/agents/<name>.md`

**Markdown frontmatter schema**：

```yaml
---
description: Brief description for picker
model: provider/model-id
temperature: 0.7
steps: 100
mode: primary # primary|subagent|all
hidden: false
color: "#FF0000"
top_p: 0.9
permission:
  edit: allow # allow|ask|deny
  bash: ask
  webfetch: allow
tools:
  bash: true
  edit: true
---
```

**CLI**：

- `opencode agent create` — 交互式创建（flags: `--path`, `--description`, `--mode`, `--permissions`/`--tools`, `--model`/`-m`）
- `opencode agent list` — 列出可用 agents

**Permission tools**（按 last-match wins）：
`read`, `edit`, `bash`, `glob`, `grep`, `list`, `task`, `webfetch`, `websearch`, `lsp`, `skill`, `question`, `external_directory`

**Task permissions**：用 glob 控制哪些 subagent 可以被调用。

### 2.6 Plugins — npm 或本地

**两种来源**：

1. **npm package**：在 `opencode.jsonc` 的 `plugin` 数组中列出

```jsonc
{
  "plugin": ["@opencode/plugin-foo", "@opencode/plugin-bar"],
}
```

OpenCode 会在 `~/.config/opencode/` 下 `bun install` 安装这些包到 `node_modules/`。

2. **Local JS/TS files**：
   - Global: `~/.config/opencode/plugins/*.ts` 或 `*.js`
   - Project: `.opencode/plugins/*.ts` 或 `*.js`

**加载顺序**（📖）：global config → project config → global plugins dir → project plugins dir

**Plugin shape**：

```typescript
import type { Plugin } from "@opencode-ai/plugin";

export const myPlugin: Plugin = async ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return {
    // Hook categories: Tool, Session, File, Message, Shell,
    //                  Permission, LSP, TUI, Todo, Server, Command, Installation
    "tool.execute.before": async (input, output) => {
      /* ... */
    },
    "session.start": async (session) => {
      /* ... */
    },
  };
};
```

**依赖管理**：在 config dir 下加 `package.json`，OpenCode 启动时自动 `bun install`。

### 2.7 Commands — 自定义 slash commands

**配置位置**：

1. **JSON in opencode.jsonc**：`command.<name>` 顶层 key

```jsonc
{
  "command": {
    "my-cmd": {
      "template": "Run $ARGUMENTS with my-custom logic",
      "description": "What this command does",
      "agent": "build",
    },
  },
}
```

2. **Markdown files**：
   - Global: `~/.config/opencode/commands/<name>.md`
   - Project: `.opencode/commands/<name>.md`

### 2.8 覆盖机制（CLI flags）

**`opencode run` flags**（📖）：

```bash
opencode run [message..]
  --command, --continue/-c, --session/-s, --fork, --share
  --model/-m, --agent, --file/-f, --format, --title
  --attach, --password, --username, --dir
  --port, --variant, --thinking
  --dangerously-skip-permissions
```

**Global flags**：

```bash
--print-logs                 # logs to stderr
--log-level DEBUG|INFO|WARN|ERROR
--pure                       # 不加载 external plugins
--port, --hostname           # server 模式
```

**Subcommand flags**：

- `upgrade --method curl/npm/pnpm/bun/brew`
- `uninstall --keep-config/--keep-data/--dry-run/--force`
- `serve` + `web` 都支持 `--port`, `--hostname`, `--mdns`, `--mdns-domain`, `--cors`

**Env vars**：

- `OPENCODE_CONFIG` — 覆盖 config 路径
- `OPENCODE_CONFIG_DIR` — 覆盖 config 目录
- `XDG_CONFIG_HOME` / `XDG_DATA_HOME` — 覆盖 XDG 根

### 2.9 重要子命令

| 子命令              | 用途                                                            |
| ------------------- | --------------------------------------------------------------- |
| `completion`        | 生成 shell completion 脚本                                      |
| `acp`               | 启动 ACP (Agent Client Protocol) server（stdin/stdout nd-JSON） |
| `mcp`               | 管理 MCP servers（add/list/auth/logout/debug）                  |
| `[project]`         | 默认 — 启动 TUI                                                 |
| `attach <url>`      | attach 到运行中的 opencode server                               |
| `run [message..]`   | headless 运行                                                   |
| `debug`             | 调试和故障排查                                                  |
| `providers`         | 管理 AI providers（alias `auth`）                               |
| `agent`             | 管理 agents（create/list）                                      |
| `upgrade`           | 升级到最新版本                                                  |
| `uninstall`         | 卸载 + 清理                                                     |
| `serve`             | 启动 headless server                                            |
| `web`               | 启动 server + web UI                                            |
| `models [provider]` | 列出所有可用模型                                                |
| `stats`             | token 使用 + 成本统计                                           |
| `export`            | 导出会话为 JSON                                                 |
| `import`            | 从 JSON 文件/URL 导入会话                                       |
| `github`            | 管理 GitHub agent                                               |
| `pr <number>`       | 拉取并 checkout PR, 然后运行 opencode                           |
| `session`           | 管理 sessions                                                   |
| `plugin`            | 安装 plugin 并更新 config                                       |
| `db [query]`        | 数据库工具（`db path` 看 SQLite 路径，query 支持 `--format json | tsv`） |

---

## 3. 关键差异 vs Claude Code

| 维度                | Claude Code                                                     | OpenCode                                                                   | 影响                                                                     |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **配置格式**        | JSON                                                            | JSONC（带注释）                                                            | agent-box JSON reader/writer 直接可用                                    |
| **双目录分割**      | 单目录 `~/.claude/`                                             | 双目录 `~/.config/opencode/` + `~/.local/share/opencode/`                  | agent-box 用两个 bind-mount（已有 `dot-opencode` + `dot-opencode-data`） |
| **MCP 文件**        | `~/.claude.json::mcpServers`                                    | `opencode.jsonc::mcp`（嵌入）                                              | agent-box mcp.apply_opencode 写入 `opencode.jsonc::mcp.servers.<id>`     |
| **MCP schema**      | `{type, command, args, env, url, headers}`                      | `{type: local                                                              | remote, command[], environment, url, headers}`                           | agent-box unified format → OpenCode format 转换（stdio→local, sse/http→remote, command+args → command array） |
| **Skills 路径**     | `~/.claude/skills/` + `~/.agents/skills/`                       | 6 路径（含 `~/.agents/skills/` 和 `~/.claude/skills/`）                    | agent-box skills.apply_opencode 复制到 `dot-opencode/skills/<id>/`       |
| **Plugins**         | marketplace-based (`enabledPlugins` + `extraKnownMarketplaces`) | npm package 数组 + 本地 plugins 目录                                       | 不同的 plugin 机制，需独立实现                                           |
| **Agents**          | 无对应（只有 subagents via markdown）                           | built-in (build, plan, general, explore, scout) + custom via markdown/JSON | agent-box 可加 Agents tab                                                |
| **Commands**        | `~/.claude/commands/*.md`                                       | `~/.config/opencode/commands/*.md` 或 JSON                                 | 类似 markdown 文件                                                       |
| **MCP OAuth 存储**  | 无对应                                                          | `~/.local/share/opencode/mcp-auth.json`                                    | agent-box 可加 OAuth 凭据管理                                            |
| **DB 存储**         | 无 SQLite（jsonl 会话）                                         | SQLite (`opencode.db`)                                                     | agent-box profile copy 时**必须**忽略 `*.db`, `*.db-shm`, `*.db-wal`     |
| **Snapshot 系统**   | 无对应                                                          | `~/.local/share/opencode/snapshot/<hash>/`                                 | profile copy 必须忽略                                                    |
| **node_modules**    | 无                                                              | `~/.config/opencode/node_modules/` (npm plugins)                           | profile copy 必须忽略（每个 profile 都重新 `bun install` 即可）          |
| **built-in agents** | 无对应（用户写 subagent markdown）                              | 5 个（build, plan, general, explore, scout）                               | agent-box 可选择性暴露 built-in agent 切换                               |

---

## 4. agent-box 当前实现状态

### 4.1 ✅ 已实现

| 功能             | 实现                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP 应用**     | `mcp.py::_apply_opencode` → 写入 `opencode.jsonc::mcp.servers.<id>`，unified→OpenCode 转换（stdio→local, sse/http→remote, command+args→command array, env→environment） |
| **Skills 应用**  | `skills.py` → 复制到 `dot-opencode/skills/<id>/`                                                                                                                        |
| **Profile 模板** | `templates/opencode/` + `templates/opencode-data/` 双目录                                                                                                               |
| **双目录 mount** | `launch.py` 通过 `profile_agent_data_dir` 挂载 `dot-opencode-data` 到 `~/.local/share/opencode/`                                                                        |
| **Provider**     | `providers.py` 支持写入 `provider.<id>` + `model`                                                                                                                       |

### 4.2 ❌ 缺失 / 待实现

| 缺失项                                              | 影响                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| **Plugin 应用**                                     | 用户无法通过 GUI 管理 npm plugins 或 local plugins          |
| **Agent 应用**                                      | 用户无法通过 GUI 创建/管理 custom agents                    |
| **Command 应用**                                    | 用户无法通过 GUI 创建/管理 custom slash commands            |
| **LSP 应用**                                        | 用户无法通过 GUI 切换 LSP server                            |
| **Tools permission 应用**                           | 用户无法通过 GUI 设置每工具的 allow/ask/deny                |
| **Snapshot / Compaction / Autoupdate 开关**         | 用户无法通过 GUI 控制这些 behavior flags                    |
| **`enabled_providers` / `disabled_providers` 应用** | 用户无法通过 GUI 启用/禁用 provider                         |
| **`db` / `stats` / `export` / `import`**            | GUI 无入口（通过 CLI 调用即可）                             |
| **`upgrade` / `uninstall` / `acp`**                 | GUI 无入口（agent lifecycle 管理）                          |
| **Agent .md file management**                       | 只能通过文件系统管理 markdown agents                        |
| **DB 备份**                                         | profile copy 必忽略 `opencode.db` 系列文件                  |
| **Snapshot 备份**                                   | profile copy 必忽略 `snapshot/<hash>/`                      |
| **Log 备份**                                        | profile copy 必忽略 `log/opencode.log`                      |
| **Tool-output 备份**                                | profile copy 必忽略 `tool-output/<id>/`                     |
| **Repos 备份**                                      | profile copy 必忽略 `repos/`                                |
| **node_modules 备份**                               | profile copy 必忽略（重新 `bun install` 即可）              |
| **`mcp-auth.json` 备份**                            | profile copy 必忽略（OAuth 重新认证即可）                   |
| **`account.json` 备份**                             | profile copy 必忽略（OpenCode 账户信息）                    |
| **`package.json` + `package-lock.json` 备份**       | profile copy 必忽略（plugin 依赖自动生成）                  |
| **`.gitignore` 备份**                               | profile copy 必忽略（OpenCode 自动生成）                    |
| **Plugin 路径歧义**                                 | 当前模板只放一个空 `opencode.jsonc`，未启用 plugin/npm 体系 |
| **Built-in agent 切换**                             | 无法在 `default_agent` 切换 build/plan                      |

---

## 5. Template 改进建议

`src/agent_box/templates/opencode/` + `templates/opencode-data/` 当前内容：

```
opencode/opencode.jsonc  — 24 行（schema + 一个 custom-provider 占位）
opencode-data/auth.json  — 7 行（Provider Name 占位）
```

**建议补全 opencode.jsonc**：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",

  "provider": {
    "custom-provider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Custom Provider",
      "options": {
        "baseURL": "",
        "apiKey": "",
        "setCacheKey": true,
      },
      "models": {
        "model-name": {
          "name": "Model Display Name",
          "limit": { "context": 128000, "output": 4096 },
        },
      },
    },
  },

  "model": "",
  "default_agent": "build", // plan|build

  "snapshot": true,
  "autoupdate": "notify",
  "share": "manual",

  "compaction": { "enabled": true },

  "watcher": {
    "ignore": ["node_modules/**", ".git/**", "dist/**", "build/**"],
  },

  "permission": {
    "edit": "ask",
    "bash": "ask",
    "webfetch": "allow",
    "websearch": "allow",
  },

  "tools": {
    "bash": true,
    "edit": true,
    "webfetch": true,
  },
}
```

**建议补全 auth.json**：

```json
{
  "Custom Provider": {
    "api_key": "",
    "base_url": ""
  }
}
```

**新增模板文件**：

- `skills/.gitkeep` — 让 skills 目录在 profile 落地时存在
- `agents/.gitkeep` — agents markdown 目录
- `commands/.gitkeep` — slash commands 目录
- `themes/.gitkeep` — themes 目录
- `plugins/.gitkeep` — local plugins 目录

**Profile copy 时必须 ignore**：

| 路径模式                          | 原因                                   |
| --------------------------------- | -------------------------------------- |
| `dot-opencode-data/opencode.db*`  | SQLite 状态 DB（每次启动重建）         |
| `dot-opencode-data/log/`          | 运行日志                               |
| `dot-opencode-data/snapshot/`     | 文件快照（自动生成）                   |
| `dot-opencode-data/tool-output/`  | 大工具输出临时文件                     |
| `dot-opencode-data/repos/`        | 克隆的 git 仓库                        |
| `dot-opencode-data/mcp-auth.json` | OAuth tokens（重新认证即可）           |
| `dot-opencode-data/account.json`  | OpenCode 账户信息                      |
| `dot-opencode/node_modules/`      | npm plugins（重新 `bun install` 即可） |
| `dot-opencode/package*.json`      | plugin 依赖 manifest（自动生成）       |
| `dot-opencode/.gitignore`         | OpenCode 自动生成                      |

agent-box 当前 `create()` 用 `shutil.copytree(..., symlinks=True)` 完整复制，**需要新增 selective copy 机制** 或在 profile_metadata 中维护 ignore 列表。

---

## 6. Profile Tab 设计建议

OpenCode profile 应包含以下 tab（基于本 inventory 的用户可编辑配置项）：

| Tab             | 包含项                                                                  | 编辑方式            |
| --------------- | ----------------------------------------------------------------------- | ------------------- |
| **General**     | display_name, description, agent_type, default_agent (build/plan)       | 表单                |
| **Provider**    | provider map, model, small_model, enabled_providers, disabled_providers | JSON 表单           |
| **Auth**        | auth.json (provider → {api_key, base_url})                              | Key-value editor    |
| **MCP Servers** | 启用/禁用 mcp entries (local/remote)                                    | Library 引用 + form |
| **MCP OAuth**   | mcp-auth.json 中的 server 状态                                          | 只读 + 重新认证     |
| **Skills**      | 启用/禁用 skills (来自 Library)                                         | Library 引用        |
| **Agents**      | agent 列表（built-in + custom markdown/JSON）                           | Markdown + JSON     |
| **Commands**    | command 列表（JSON + markdown）                                         | Markdown + JSON     |
| **Plugins**     | plugin npm 数组 + local plugins                                         | 表单                |
| **Tools**       | tools enabled/disabled, per-tool permission                             | 表单                |
| **LSP**         | lsp server 启用/禁用                                                    | 表单                |
| **Behavior**    | snapshot, autoupdate, share, compaction                                 | 表单                |
| **Watcher**     | watcher.ignore glob                                                     | 表单                |
| **Advanced**    | raw opencode.jsonc                                                      | JSONC editor        |

---

## 7. 待验证 / 已知缺口

| 项                                              | 状态                                 | 备注                                |
| ----------------------------------------------- | ------------------------------------ | ----------------------------------- |
| SQLite db 表结构                                | 📖 未确认                            | 需要 `opencode db` query 才能列出   |
| `account.json` 来源                             | 🧪 观察到但 📖 未文档化              | 可能由 TUI `/connect` 或 OAuth 创建 |
| `snapshot/` 的 `<hash>` 算法                    | 📖 未确认                            | snapshot config 开关已确认          |
| `repos/` 用途                                   | 🧪 观察到空目录 📖 未文档化          | 推测为 git worktree 克隆缓存        |
| `tool-output/<id>/` 文件用途                    | 🧪 观察到空目录 📖 未文档化          | 推测为 large-output 文件落地        |
| `Explore` / `Scout` subagent schema             | 📖 docs 提及但 schema 未详           | 需要实测确认 prompt/tools 配置      |
| Hidden system agents (compaction/title/summary) | 📖 docs 提及但不可选                 | 不应暴露给 GUI                      |
| `mcp-auth.json` 实际格式                        | 📖 docs 提及 OAuth 流程但未给 schema | 需要 OAuth 认证后查看实际文件       |
| Built-in subagent prompt 内容                   | 📖 未确认                            | 影响 agent.prompt 默认值            |
| `acp` server 协议完整规格                       | 📖 提及 stdio nd-JSON                | 完整 protocol 未详                  |

---

## 8. Sources

| 类型      | URL                                                                            |
| --------- | ------------------------------------------------------------------------------ |
| 📖 官方   | https://opencode.ai/docs/                                                      |
| 📖 官方   | https://opencode.ai/docs/config/                                               |
| 📖 官方   | https://opencode.ai/docs/providers/                                            |
| 📖 官方   | https://opencode.ai/docs/cli/                                                  |
| 📖 官方   | https://opencode.ai/docs/mcp-servers/                                          |
| 📖 官方   | https://opencode.ai/docs/skills/                                               |
| 📖 官方   | https://opencode.ai/docs/plugins/                                              |
| 📖 官方   | https://opencode.ai/docs/agents/                                               |
| 📖 GitHub | https://github.com/sst/opencode (or anomalyco/opencode per docs footer)        |
| 🧪 实验   | `~/.config/opencode/` + `~/.local/share/opencode/` host 目录结构（2026-06-28） |
| 🧪 实验   | `~/.agent-box/profiles/opencode-main/dot-opencode*/` 已运行 profile            |
| 🧪 实验   | `agent-box create exp-opencode --type opencode`（本次创建的 test profile）     |
