# CLI Library Extension — MCP / Skills / Hooks

> Phase 1 补完：补齐 Library DB 表的 CLI 管理层
>
> 日期：2026-06-26
> 状态：spec（待确认）
> 关联：`docs/ROADMAP.md`、`docs/ARCHITECTURE.md`

---

## 0. 背景

### 0.1 当前状态

| 层              | Provider                         | Claude.md                        | MCP                                  | Skills                     | Hooks         |
| --------------- | -------------------------------- | -------------------------------- | ------------------------------------ | -------------------------- | ------------- |
| DB 表           | ✅                               | ✅ (prompts)                     | ✅ (mcp_servers + mcp_server_agents) | ✅ (skills + skill_agents) | ❌ (文件级别) |
| CLI 命令        | ✅ list/show/upsert/delete/apply | ✅ list/show/upsert/delete/apply | ❌                                   | ❌                         | ❌            |
| Bridge          | ✅                               | ✅                               | ❌                                   | ❌                         | ❌            |
| GUI Library Tab | ✅                               | ✅                               | ❌                                   | ❌                         | ❌            |

### 0.2 cc-switch vs agent-box 的 DB Schema 差异

cc-switch 在 `mcp_servers` 和 `skills` 表中用 `enabled_claude/codex/gemini/opencode/hermes` 列表示关联。agent-box 改为独立的关联表（更规范）：

```
cc-switch:  mcp_servers.enabled_claude, enabled_codex, ...
agent-box:  mcp_server_agents(mcp_server_id, agent_type)  -- 多对多
            skill_agents(skill_id, agent_type)
```

这意味着 CLI 设计需要独立管理 agent 关联，这是 agent-box 的改进点。

---

## 1. CLI 命令设计

### 1.1 设计原则

- **upsert 模式**：与 provider/claude-md 一致，JSON 从 stdin 读入，绕过 `$EDITOR`
- **apply 语义**：将 library item 同步到指定 profile 的 agent 实时配置中
- **agents 子命令**：独立管理 agent 类型关联（agent-box 独有，cc-switch 无）

### 1.2 MCP Server

```
agent-box mcp-server list   [--type <agent_type>] [--json]
agent-box mcp-server show   <id> [--json]
agent-box mcp-server upsert <id> [--name <name>]   # config JSON from stdin
agent-box mcp-server delete <id> [--force]
agent-box mcp-server apply  <profile_name> <id>
agent-box mcp-server agents <id> --enable  <agent_type>
agent-box mcp-server agents <id> --disable <agent_type>
```

#### 字段

| 字段            | 来源                     | 必填 |
| --------------- | ------------------------ | ---- |
| `id`            | CLI 参数                 | ✅   |
| `name`          | `--name` 或 `id`         | ✅   |
| `server_config` | stdin JSON               | ✅   |
| `description`   | stdin JSON 可选          |      |
| `homepage`      | stdin JSON 可选          |      |
| `docs`          | stdin JSON 可选          |      |
| `tags`          | stdin JSON 可选 `[]`     |      |
| `agent_types`   | 通过 `agents` 子命令管理 |      |

#### server_config JSON 格式

与 cc-switch 兼容的 MCP 规范，支持 stdio 和 sse/http 两种类型：

```jsonc
// stdio 类型
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@anthropic/mcp-server-filesystem"],
  "env": { "HOME": "/home/user" },
  "cwd": "/optional/working/dir"
}

// sse/http 类型
{
  "type": "sse",
  "url": "https://mcp.example.com/sse",
  "headers": { "Authorization": "Bearer token" }
}
```

#### upsert 输入格式（stdin）

```jsonc
{
  "name": "Filesystem",
  "server_config": { "type": "stdio", "command": "npx", ... },
  "description": "Filesystem operations via MCP",
  "homepage": "https://github.com/...",
  "docs": "https://docs.example.com",
  "tags": ["filesystem", "tools"]
}
```

#### apply 流程（per agent type）

`apply` 将 MCP 配置从 DB 写出到 agent 实时配置中。各 agent 的配置文件和格式不同：

| Agent    | 文件                           | 路径                  | 格式                                   |
| -------- | ------------------------------ | --------------------- | -------------------------------------- |
| Claude   | `~/.claude.json`               | profile dot-claude/   | JSON `mcpServers` map                  |
| Codex    | `~/.codex/config.toml`         | profile dot-codex/    | TOML `[mcp_servers.<id>]`              |
| Hermes   | `~/.config/hermes/config.yaml` | profile dot-hermes/   | YAML `mcp_servers` map (无 type)       |
| OpenCode | `opencode.jsonc`               | profile dot-opencode/ | JSONC `mcp.servers` map (local/remote) |

**apply 只在 agent_type == "claude" 时调用真正的 agent 实时配置覆盖**，其他 agent 类型目前仅操作 profile 目录内的文件。

#### 格式转换（参考 cc-switch）

OpenCode 需要特殊转换：

| 统一格式             | OpenCode                  |
| -------------------- | ------------------------- |
| `type: "stdio"`      | `type: "local"`           |
| `command` + `args`   | `command: [cmd, ...args]` |
| `env: {...}`         | `environment: {...}`      |
| `type: "sse"/"http"` | `type: "remote"`          |
| `headers: {...}`     | `headers: {...}`          |

Hermes 格式特性：

- 无 `type` 字段（通过 `command` 或 `url` 字段推断）
- 保留 `enabled`, `timeout`, `connect_timeout`, `tools`, `sampling`, `auth` 等扩展字段（merge-on-write 策略）

### 1.3 Skill

```
agent-box skill list   [--type <agent_type>] [--json]
agent-box skill show   <id> [--json]
agent-box skill upsert <id> [--name <name>] [--directory <dir>] [--description <desc>]
agent-box skill delete <id> [--force]
agent-box skill apply  <profile_name> <id>
agent-box skill agents <id> --enable  <agent_type>
agent-box skill agents <id> --disable <agent_type>
```

#### 字段

| 字段           | 来源                         | 说明               |
| -------------- | ---------------------------- | ------------------ |
| `id`           | CLI 参数                     | 唯一标识           |
| `name`         | `--name` 或 `id`             | 显示名称           |
| `description`  | `--description`              | 简短描述           |
| `directory`    | `--directory`                | skill 文件目录路径 |
| `repo_owner`   | stdin JSON 可选              | GitHub owner       |
| `repo_name`    | stdin JSON 可选              | GitHub repo        |
| `repo_branch`  | stdin JSON 可选，默认 `main` |                    |
| `readme_url`   | stdin JSON 可选              |                    |
| `content_hash` | 自动计算                     | 目录内容的 hash    |
| `installed_at` | 自动设置                     | 安装时间戳         |
| `updated_at`   | 自动设置                     | 最后更新时间       |
| `agent_types`  | 通过 `agents` 子命令管理     |                    |

#### upsert（无 stdin 模式）

Skills 的配置不像 MCP 那样有复杂的 JSON spec，主要通过参数传入：

```bash
agent-box skill upsert frontend-design \
  --name "Frontend Design" \
  --directory /home/maoqh/projects/skills/frontend-design \
  --description "UI review and design guidance skill"
```

#### apply 流程

`apply` 将 skill 目录同步到 profile 的 agent skills 目录：

| Agent    | Skills 目录                                               |
| -------- | --------------------------------------------------------- |
| Claude   | `~/.agents/skills/<skill_id>/` (bwrap 隔离内 dot-agents/) |
| Codex    | `~/.codex/skills/<skill_id>/`                             |
| Hermes   | profile skills 目录                                       |
| OpenCode | profile skills 目录                                       |

### 1.4 Hooks（Claude Code 专属）

Hooks 是 CC 的 `hooks.json`，只存在于 Claude Code profile 中。其他 agent 类型没有对应的概念。

```
agent-box hooks show   <profile_name> [--json]
agent-box hooks upsert <profile_name>     # JSON from stdin
```

#### upsert 输入格式（stdin）

```jsonc
{
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        { "type": "command", "command": "npx biome format --write $FILE_PATH" },
      ],
    },
  ],
}
```

#### 实现

不需要新表。直接读写 profile 的 `dot-claude/hooks.json`。

---

## 2. 模块结构

```
src/agent_box/
├── providers.py          # ✅ 已有
├── claude_mds.py          # ✅ 已有（操作 prompts 表）
├── mcp.py                 # 🆕 MCP CRUD + apply
├── skills.py              # 🆕 Skills CRUD + apply
├── hooks.py               # 🆕 Hooks 读写
└── cli.py                 # 🔧 新增 mcp-server / skill / hooks 子命令
```

### 2.1 mcp.py API

```python
def list_mcp_servers(agent_type: Optional[str] = None) -> List[Dict]
def get_mcp_server(id: str) -> Optional[Dict]
def upsert_mcp_server(id: str, data_json: str) -> Dict
def delete_mcp_server(id: str) -> bool
def apply_mcp_server(profile_name: str, id: str) -> None
def set_mcp_agent(id: str, agent_type: str, enabled: bool) -> None
def get_mcp_agents(id: str) -> List[str]  # list of agent_types
```

### 2.2 skills.py API

```python
def list_skills(agent_type: Optional[str] = None) -> List[Dict]
def get_skill(id: str) -> Optional[Dict]
def upsert_skill(id: str, data: Dict) -> Dict
def delete_skill(id: str) -> bool
def apply_skill(profile_name: str, id: str) -> None
def set_skill_agent(id: str, agent_type: str, enabled: bool) -> None
def get_skill_agents(id: str) -> List[str]
```

### 2.3 hooks.py API

```python
def get_hooks(profile_name: str) -> Optional[Dict]
def upsert_hooks(profile_name: str, data_json: str) -> Dict
```

---

## 3. 实施顺序

### Phase 1a — MCP backend

1. `src/agent_box/mcp.py` — CRUD + agent 关联 + apply 逻辑
2. CLI 集成：`mcp-server` 子命令（list/show/upsert/delete/apply/agents）
3. 测试：`tests/test_mcp.py`

### Phase 1b — Skills backend

4. `src/agent_box/skills.py` — CRUD + agent 关联 + apply 逻辑
5. CLI 集成：`skill` 子命令（list/show/upsert/delete/apply/agents）
6. 测试：`tests/test_skills.py`

### Phase 1c — Hooks backend

7. `src/agent_box/hooks.py` — 读写 hooks.json
8. CLI 集成：`hooks` 子命令（show/upsert）
9. 测试：`tests/test_hooks.py`

### Phase 1d — Bridge + GUI（后续）

10. `gui-web/bridge.py` — MCP/Skill/Hooks bridge 方法
11. Library 页 — MCP tab + Skills tab
12. Profile Detail 页 — 各 agent 类型补全 Provider/MCP/Skills 等 tab

---

## 4. 设计决策记录

### 4.1 为什么不分 agent 类型建表

cc-switch 用 `enabled_claude/codex/...` 列的方式绑死了 agent 类型。agent-box 用 join 表 `mcp_server_agents`，新增 agent 类型时只需插入行，不需要 ALTER TABLE。这是对 cc-switch 的改进。

### 4.2 为什么 MCP upsert 走 stdin 而不是 file

与 provider/claude-md 保持一致。GUI 通过 bridge.py → wsl.exe subprocess stdin 管道传递 JSON。$EDITOR 模式（`add`/`edit`）仍然保留给 CLI 用户手动编辑。

### 4.3 为什么 hooks 不建表

hooks 是单文件（hooks.json），内容完全由用户定义，且只在 Claude Code 中有意义。建表无收益，直接文件读写即可。如果未来需要 hooks 模板库，可以再建 `hooks` 表。

### 4.4 apply 只覆盖 profile 目录内文件，不碰真实配置

为了 bwrap 隔离的完整性，apply 写入的是 profile 目录内的 config 文件（dot-claude/claude.json、dot-codex/config.toml 等），这些在 launch 时通过 bind-mount 覆盖真实配置。apply 绝不直接写 `~/.claude.json` 等真实路径。

### 4.5 agent 关联独立管理

`mcp-server agents` 和 `skill agents` 子命令独立管理，不嵌入 upsert。理由：

- 一个 MCP server 可能被多个 agent 类型使用
- 关联变更不需要修改 server_config JSON
- GUI 可以用 checkbox 独立控制
