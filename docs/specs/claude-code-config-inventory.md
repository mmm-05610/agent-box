# Claude Code Configuration Inventory

> 盘点 Claude Code 所有配置项、存储位置、读写方式
>
> 日期：2026-06-28
> 状态：verified（实验 + 官方文档交叉验证）
> 关联：Profile Tab 补全、Library Extension

---

## 0. 方法论

每个结论标注来源：

| 标记 | 含义                                                                      |
| ---- | ------------------------------------------------------------------------- |
| 🧪   | 实验验证（通过 agent-box 创建 exp01 profile，注入配置并启动 CC 观察行为） |
| 📖   | 官方文档（code.claude.com/docs）                                          |
| 🧪📖 | 实验 + 文档双重验证                                                       |

实验 profile：`~/.agent-box/profiles/exp01`，使用 `agent-box claude exp01 -- --print "..."` 非交互验证。

---

## 1. 配置版图总览

### 1.1 用户可编辑配置（agent-box 应管理）

| #   | 配置项                  | CC 读取路径                               | Profile 内对应路径                          | 写入方式                                    | 验证 |
| --- | ----------------------- | ----------------------------------------- | ------------------------------------------- | ------------------------------------------- | ---- |
| 1   | **CLAUDE.md**           | `~/.claude/CLAUDE.md`                     | `dot-claude/CLAUDE.md`                      | 直接覆盖文件                                | 🧪📖 |
| 2   | **settings.json**       | `~/.claude/settings.json`                 | `dot-claude/settings.json`                  | 表单 → JSON 合并写入                        | 🧪📖 |
| 3   | **settings.local.json** | `~/.claude/settings.local.json`           | `dot-claude/settings.local.json`            | 表单 → JSON 覆盖写入                        | 🧪📖 |
| 4   | **Hooks**               | `settings.json` → `hooks` key             | 同上 settings.json                          | settings.json 内嵌，无独立文件              | 🧪📖 |
| 5   | **MCP Servers**         | `~/.claude.json` → `mcpServers`           | `dot-claude.json` → `mcpServers`            | 合并写入 ~/.claude.json（保留 CC 状态字段） | 📖   |
| 6   | **Skills**              | `~/.claude/skills/` + `~/.agents/skills/` | `dot-claude/skills/` + `dot-agents/skills/` | 目录拷贝                                    | 🧪📖 |
| 7   | **Commands**            | `~/.claude/commands/`                     | `dot-claude/commands/`                      | Markdown 文件（已与 skills 机制统一）       | 📖   |
| 8   | **Subagents**           | `~/.claude/agents/`                       | `dot-claude/agents/`                        | Markdown 文件                               | 📖   |
| 9   | **Keybindings**         | `~/.claude/keybindings.json`              | `dot-claude/keybindings.json`               | JSON                                        | 📖   |
| 10  | **Statusline**          | `~/.claude/statusline.json`               | `dot-claude/statusline.json`                | JSON                                        | 📖   |

### 1.2 CC 自动生成（agent-box 不管理，但需保留）

| #   | 路径                                                            | 内容                                                                                    | 验证 |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---- |
| 11  | `~/.claude.json`（除 mcpServers 外）                            | 应用状态：firstStartTime, userID, machineID, tipsHistory, projects, migrationVersion... | 🧪📖 |
| 12  | `.last-cleanup`                                                 | 维护标记                                                                                | 🧪   |
| 13  | `backups/`                                                      | `~/.claude.json` 自动备份                                                               | 🧪   |
| 14  | `projects/`                                                     | 按项目分组的会话记录（jsonl）                                                           | 🧪   |
| 15  | `session-env/`                                                  | 每个会话的环境变量快照                                                                  | 🧪   |
| 16  | `sessions/`                                                     | 会话状态                                                                                | 🧪   |
| 17  | `shell-snapshots/`                                              | Shell 快照                                                                              | 🧪   |
| 18  | `file-history/`                                                 | 文件修改历史                                                                            | 📖   |
| 19  | `jobs/`                                                         | 后台任务状态                                                                            | 📖   |
| 20  | `tasks/`                                                        | 任务状态                                                                                | 📖   |
| 21  | `plugins/`                                                      | 已安装的插件数据                                                                        | 📖   |
| 22  | `daemon/` + `daemon.lock` + `daemon.log` + `daemon.status.json` | 后台守护进程                                                                            | 📖   |
| 23  | `history.jsonl`                                                 | 对话历史                                                                                | 📖   |

### 1.3 项目级配置（不在 Profile 内，非 agent-box 管辖）

| #   | 配置项                 | 路径                               | 是否提交 git            | 验证 |
| --- | ---------------------- | ---------------------------------- | ----------------------- | ---- |
| 24  | MCP Servers（项目）    | `.mcp.json`（项目根目录）          | 是                      | 📖   |
| 25  | Settings（项目）       | `.claude/settings.json`            | 是                      | 📖   |
| 26  | Settings Local（项目） | `.claude/settings.local.json`      | 否（CC 自动 gitignore） | 📖   |
| 27  | CLAUDE.md（项目）      | `CLAUDE.md` 或 `.claude/CLAUDE.md` | 是                      | 📖   |
| 28  | Skills（项目）         | `.claude/skills/`                  | 是                      | 📖   |
| 29  | Commands（项目）       | `.claude/commands/`                | 是                      | 📖   |
| 30  | Agents（项目）         | `.claude/agents/`                  | 是                      | 📖   |

---

## 2. 关键配置项详解

### 2.1 settings.json 完整结构

**路径**：`~/.claude/settings.json` → Profile `dot-claude/settings.json`

**优先级**（从高到低）：

```
Managed Policy > CLI flags > .claude/settings.local.json > .claude/settings.json > ~/.claude/settings.local.json > ~/.claude/settings.json
```

**特殊规则**：

- `permissions` 跨级合并（不覆盖） 🧪📖
- `fallbackModel` 不合并，最高优先级文件全量生效 📖
- 大部分 key 热加载，`model` 需要 `/model` 或重启 📖

**已确认的 settings key**（来源：📖 官方 schema）：

```jsonc
{
  // ── 模型 ──
  "model": "claude-opus-4-6",          // 默认模型
  "fallbackModel": "...",              // 降级链
  "modelOverrides": {},                // 按工具/task 覆盖模型
  "availableModels": [],               // 限制可用模型列表
  "enforceAvailableModels": false,     // 强制限制
  "effortLevel": "medium",            // 推理努力度

  // ── Provider / API ──
  "env": {},                           // 环境变量（provider 写入此处）
  "apiKeyHelper": "",                  // API key 获取脚本
  "apiBaseUrl": "",                    // 自定义 API 地址
  "awsAuthRefresh": "",               // AWS 凭证刷新
  "awsCredentialExport": "",          // AWS 凭证导出
  "gcpAuthRefresh": "",               // GCP 凭证刷新
  "otelHeadersHelper": "",            // OTel headers

  // ── 权限 ──
  "permissions": {
    "allow": ["Bash(npm run *)"],
    "deny": ["Read(./.env)"],
    "ask": []
  },
  "permissionMode": "default",

  // ── Hooks ──
  "hooks": {
    "PreToolUse": [{ "matcher": "", "hooks": [...] }],
    "PostToolUse": [...],
    "PostToolUseFailure": [...],
    "Notification": [...],
    "Stop": [...],
    "SubagentStop": [...],
    "SessionStart": [...],
    "SessionEnd": [...],
    "UserPromptSubmit": [...],
    "PermissionRequest": [...],
    "PreCompact": [...],
    "PostCompact": [...],
    "TaskCompleted": [...],
    "ConfigChange": [...],
    "WorktreeCreate": [...],
    "WorktreeRemove": [...]
  },

  // ── UI ──
  "theme": "dark",
  "outputStyle": "explanatory",
  "showTurnDuration": true,
  "showSpinnerTree": false,
  "autoScrollEnabled": true,
  "editorMode": "default",
  "language": "",
  "prefersReducedMotion": false,
  "axScreenReader": false,

  // ── 行为 ──
  "autoCompactEnabled": true,
  "autoCompactThreshold": 0.7,
  "autoMemoryEnabled": true,
  "autoMemoryDirectory": "",
  "alwaysThinkingEnabled": false,
  "respectGitignore": true,
  "includeGitInstructions": true,
  "skipWorkflowUsageWarning": false,
  "disableAutoUpdates": false,
  "disableTelemetry": false,
  "cleanupPeriodDays": 7,
  "respondToBashCommands": false,

  // ── Tools ──
  "allowedTools": [],
  "deniedTools": [],
  "disableArtifact": false,
  "disableBundledSkills": false,
  "disableSkillShellExecution": false,
  "disableWorkflows": false,
  "disableAgentView": false,

  // ── Plugins ──
  "enabledPlugins": {},
  "extraKnownMarketplaces": {},
  "strictKnownMarketplaces": false,

  // ── Skills ──
  "maxSkillDescriptionChars": 0,

  // ── 高级 ──
  "defaultShell": "",
  "fileCheckpointingEnabled": true,
  "prUrlTemplate": "",
  "attribution": { "commits": true, "pullRequests": true },
  "subAgentModels": {},
  "tier": "",
  "verbose": false,
  "verifyProxy": true,
  "voiceEnabled": false,
  "remoteControlAtStartup": false,
  "disableRemoteControl": false,
  "companyAnnouncements": [],
  "footerLinksRegexes": [],
  "inputNeededNotifEnabled": true,
  "awaySummaryEnabled": true,
  "feedbackSurveyRate": 0,
  "fileSuggestion": true,
  "autoMode": "",
  "disableAutoMode": false,
  "plansDirectory": "",
  "sandbox": {}
}
```

### 2.2 MCP Servers 存储

**结论** 🧪📖：CC 从两个位置读取 MCP，合并生效：

| 位置                            | 作用域       | Profile 对应                     |
| ------------------------------- | ------------ | -------------------------------- |
| `~/.claude.json` → `mcpServers` | User / Local | `dot-claude.json` → `mcpServers` |
| `.mcp.json`（项目根）           | Project      | 不在 Profile 内                  |

**agent-box 当前问题** 🔴：

- `mcp.py` 写入 `~/.claude/claude.json`（不存在于 CC 标准路径中）
- 应改为写入 `~/.claude.json` → `mcpServers`，**合并写入**（保留 CC 生成的其他字段如 `firstStartTime`、`userID` 等）

**`.mcp.json` Schema** 📖：

```jsonc
{
  "mcpServers": {
    "server-name": {
      "type": "stdio", // 或 "http" / "sse"
      "command": "npx",
      "args": ["-y", "@scope/server"],
      "env": { "KEY": "value" },
    },
  },
}
```

**实验记录** 🧪：

- Experiment 2a: `claude.json` → `mcpServers` → CC 读取 ✅
- Experiment 2b: `settings.json` → `mcpServers` → CC 读取 ✅
- Experiment 2c: 两者同时存在 → CC 合并读取 ✅
- **但**官方文档明确说 `settings.json` 不读 `mcpServers` key 📖

> ⚠️ 以官方文档为准：MCP 写入 `~/.claude.json`，不依赖 `settings.json` 的兼容行为。

### 2.3 Hooks 存储

**结论** 🧪📖：Hooks **只在 `settings.json` → `hooks` key 中**，没有独立文件。

**官方原文** 📖：

> "There is no standalone hooks file for project or user config. Define hooks under the `hooks` key in `settings.json`. Only plugins load a separate `hooks/hooks.json`."

**实验记录** 🧪：

- Experiment 1a: `settings.json` → `hooks` → Hook 触发 ✅
- Experiment 1b: `hooks/hooks.json`（独立文件）→ Hook **不触发** ❌

**agent-box 当前问题** 🔴：

- `hooks.py` 写入 `dot-claude/hooks/hooks.json`
- 应改为操作 `settings.json` → `hooks` key

**Hook 事件列表**（17 个）📖：
`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification`, `PreCompact`, `PostCompact`, `SessionEnd`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`

### 2.4 Skills 存储

**结论** 🧪📖：CC 扫描 `~/.claude/skills/` + `~/.agents/skills/`

**官方路径** 📖：

- User: `~/.claude/skills/`
- Project: `.claude/skills/`
- 格式: `skills/<name>/SKILL.md`（`SKILL.md` 必须有）

**跨工具标准** 📖：`~/.agents/skills/` 是 Agent Skills 开放标准路径，CC 也扫描此目录。

**实验记录** 🧪：

- Experiment 3: CC 报告从 `~/.agents/skills/` 读取到 15 个 skill，`~/.claude/skills/` 不存在

**agent-box 当前状态** 🟡：

- `skills.py` apply 写入 `dot-agents/skills/`
- 但 CC 未绑挂 `~/.agents/` → skills 跨 profile 共享
- 应增加 `dot-claude/skills/` 写入 + bwrap bind-mount `~/.agents/`

### 2.5 Commands（自定义 Slash 命令）

**结论** 📖：`~/.claude/commands/<name>.md` → 通过 `/name` 调用。

已与 skills 机制统一：`.claude/commands/deploy.md` 和 `.claude/skills/deploy/SKILL.md` 等价。

### 2.6 settings.local.json

**结论** 🧪📖：覆盖 `settings.json` 中的同名字段（除 permissions 外）。

**实验记录** 🧪：

- Experiment 4: `settings.json` → model: sonnet, `settings.local.json` → model: opus → CC 使用 opus

**优先级** 📖：

```
settings.local.json (project) > settings.json (project) > settings.local.json (user) > settings.json (user)
```

---

## 3. agent-box 问题清单

### 3.1 Bug（与 CC 实际行为不一致）

| #   | 问题                                      | 影响                 | 修复方向                                           |
| --- | ----------------------------------------- | -------------------- | -------------------------------------------------- |
| 1   | `hooks.py` 写 `hooks/hooks.json`，CC 不读 | hooks 功能无效       | 改为操作 `settings.json` → `hooks`                 |
| 2   | `mcp.py` 写 `claude.json`，非 CC 标准路径 | MCP apply 可能不生效 | 改为写 `~/.claude.json` → `mcpServers`（合并写入） |

### 3.2 缺口（CC 有的能力 agent-box 未覆盖）

| #   | 缺口                         | 优先级  | 说明                                                               |
| --- | ---------------------------- | ------- | ------------------------------------------------------------------ |
| 3   | `settings.json` 未建模       | 🔴 高   | 只碰 `env` key，model/theme/permissions/plugins/hooks 等全都未覆盖 |
| 4   | `settings.local.json` 未覆盖 | 🟡 中   | 用户本地覆盖                                                       |
| 5   | `commands/` 未覆盖           | 🟡 中   | 自定义 slash 命令                                                  |
| 6   | `skills/` 路径偏差           | 🟡 中   | apply 写 `dot-agents/skills/`，CC 也读 `dot-claude/skills/`        |
| 7   | `~/.agents/` 未 bwrap 隔离   | 🟡 已知 | skills 跨 profile 共享                                             |

### 3.3 架构风险

| #   | 风险                    | 说明                                                   |
| --- | ----------------------- | ------------------------------------------------------ |
| 8   | `~/.claude.json` 双用途 | MCP apply 必须合并写入，不能覆盖 CC 状态字段           |
| 9   | CC 版本差异             | `mcpServers` 在 `settings.json` 中的行为可能因版本而异 |

---

## 4. 对 agent-box Profile Tab 的设计启示

### 4.1 每个 Tab 对应的编辑目标

| Tab                | 编辑目标文件                     | 编辑方式                                      |
| ------------------ | -------------------------------- | --------------------------------------------- |
| **CLAUDE.md**      | `dot-claude/CLAUDE.md`           | 文本编辑器                                    |
| **Settings**       | `dot-claude/settings.json`       | 表单（结构化 key）+ JSON 编辑器（advanced）   |
| **Settings Local** | `dot-claude/settings.local.json` | 同上                                          |
| **Hooks**          | `settings.json` → `hooks` key    | 可视化 hook builder → 写入 settings.json      |
| **MCP**            | `dot-claude.json` → `mcpServers` | 从 Library 选择 → apply → 写入 ~/.claude.json |
| **Skills**         | `dot-claude/skills/`             | 从 Library 选择 → apply → 拷贝目录            |
| **Commands**       | `dot-claude/commands/`           | 文件编辑器                                    |

### 4.2 apply 流程

```
Library DB (mcp_servers/skills/prompts 表)
  → CLI/Bridge apply 命令
    → 写入 Profile 目录内的对应文件
      → bwrap bind-mount 覆盖真实路径
        → CC 启动后读取
```

---

## 5. 参考资料

- [Claude Code Settings 官方文档](https://code.claude.com/docs/en/settings)
- [Claude Code Hooks 官方文档](https://code.claude.com/docs/en/hooks)
- [Claude Code MCP 官方文档](https://code.claude.com/docs/en/mcp)
- [Claude Code Skills 官方文档](https://code.claude.com/docs/en/skills)
- [Claude Code Debug Your Config](https://code.claude.com/docs/en/debug-your-config)
- [Claude Code .claude Directory Reference](https://code.claude.com/docs/en/claude-directory)
- 实验 profile: `~/.agent-box/profiles/exp01`
