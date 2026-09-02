# 矩阵：原生资源面（resource-surfaces）

来源：各 harness FACTS.md G 节 + candidate.toml `[resource_surfaces]`。
观察 2026-09-01/02。三态：supported / unsupported / unknown。
MCP 仅记录原生事实（本轮不实现 Agent-Box MCP Resource）。

| 资源面 | codex | claude-code | opencode | hermes | pi | grok-build | kilo-code | zcode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| instructions | ✅ AGENTS.override.md > AGENTS.md（全局 $CODEX_HOME + 逐目录 root→cwd，每目录一份，默认 32KiB 上限） | ✅ CLAUDE.md 族（managed/user/project/CLAUDE.local.md；@import 最深 4 跳；auto-memory MEMORY.md 另算） | ✅ AGENTS.md\|CLAUDE.md\|CONTEXT.md 向上走 cwd→worktree，**首个匹配的类型胜出（不叠加）**；config.instructions[] globs（可 http，5s 超时） | ✅ cwd 的 AGENTS.md/SOUL.md/.hermes.md/CLAUDE.md/.cursorrules + $HERMES_HOME/SOUL.md（自动注入 system prompt；`--ignore-rules` 跳过） | ✅ AGENTS.md/CLAUDE.md（agent-dir + 祖先 + cwd 拼接；AGENTS.override.md 逐目录覆盖；SYSTEM.md 覆盖 system prompt） | unknown | 继承 OpenCode（AGENTS.md 族） | unknown |
| skills | ✅ 多根：repo `.codex/skills` + `$HOME/.agents/skills` + `/etc/codex/skills` + 系统缓存（**$CODEX_HOME/skills 已弃用但仍读**）；SKILL.md frontmatter；重名不合并；`[[skills.config]]` 可禁用 | ✅ `<config>/skills` + `.claude/skills` + managed + plugin；frontmatter 面很宽（when_to_use/allowed-tools/model/effort/context:fork/agent…）；**skill 重名优先于 command** | ✅ `.opencode/skill(s)/<name>/SKILL.md` + global + **自动扫描 `~/.claude/skills` 与 `~/.agents/skills`**；name 必须等于目录名（≤64 小写连字符） | ✅ `$HERMES_HOME/skills/` + `skills.external_dirs` + bundled；hermes skills 全家桶 CLI（search/install/audit/publish） | ✅ `<agent-dir>/skills/` + `~/.agents/skills/` + `.pi/skills/` + `.agents/skills/`（trust 门控）+ `--skill <path>`；标准 SKILL.md | unknown | 继承 OpenCode 1.x skills | unknown |
| MCP | ✅ `[mcp_servers.*]` 任意配置层（project 需 trust）；stdio/streamable-http；per-server OAuth；`codex mcp add/list/login`；required=true 时 exec 初始化失败即退出 | ✅ 三作用域：local（.claude.json projects[key].mcpServers）/ project（.mcp.json，审批门）/ user（顶层）；local > project > user > plugin；`--mcp-config`/`--strict-mcp-config`；`${VAR}` 展开；-p 下无审批提示 | ✅ config `mcp.<name>`：local（stdio 子进程）/ remote（HTTP）；`opencode mcp add/list/auth/debug`；enabled:false 禁用继承 | ✅ config.yaml `mcp_servers` map + `hermes mcp add/list/test/login/serve`（亦可作为 MCP server） | ❌ **设计上无 MCP**（README 原话 "No MCP."；`--mcp-config` 会被吞） | unknown | 继承 OpenCode | unknown |
| prompts | ❌ 0.152.0 无独立 prompts 目录（plugin commands/ 安装时迁移为 skills） | ✅ slash commands：`.claude/commands/*.md` + user + plugin + managed；$ARGUMENTS/$1/@file/反引号 shell | ✅ commands：`.opencode/command(s)/*.md` frontmatter + 模板；headless 经 `run --command` | unknown（内建 slash 命令存在；自定义库未见） | ✅ prompt 模板：`<agent-dir>/prompts/`、`.pi/prompts/`、`--prompt-template`；`/name` 展开含 {{var}} | unknown | 继承 OpenCode | unknown |
| rules | ✅ execpolicy `.rules`（user `rules/*.rules` + project；allow/deny 前缀；`--ignore-rules` 跳过） | ❌ 无独立 rules 目录（落 settings permissions 的 Tool(specifier) + hooks + CLAUDE.md） | ✅ 以 permissions 配置形态（read/edit/bash/webfetch…，allow/ask/deny，**最后匹配胜出**） | ✅ approvals.deny globs（先于 yolo 生效）+ command_allowlist + tirith 扫描 | ❌ 无 rules 面（指令归 AGENTS/SYSTEM.md） | unknown | 继承 | unknown |
| agents/subagents | ⚠️ 功能在（multi_agent flag；collab_tool_call 项 + SubagentStart/Stop hooks）但**无用户 subagents 目录** | ✅ `.claude/agents/*.md` + `--agents <json>`；managed > --agents > project > user > plugin；深度 ≤3、并发 ≤20 | ✅ `.opencode/agent(s)/*.md`（mode primary\|subagent\|all）+ config.agent{}；内建 build/plan/general/explore | ✅ spawn/delegate_task 工具（隔离上下文；共享 IterationBudget） | ❌ **设计上无 sub-agents**（"Spawn pi instances via tmux, or build extensions"） | unknown | 继承 OpenCode | unknown |
| commands（slash） | ❌ 迁移为 skills（无独立目录） | ✅ 同 prompts（与 skill 重名时 skill 胜） | ✅ 同 prompts 行 | ✅ quick_commands（type: exec，绕过 agent loop） | ✅ 内建 + 扩展注册 + `/skill:name`；RPC get_commands | unknown | 继承 | unknown |
| hooks | ✅ 12 事件（PreToolUse/PermissionRequest/PostToolUse/Compact/Session*/UserPromptSubmit/Subagent*/Stop/Interrupt；flag 稳定默认开；trust 逐 handler 持久化） | ✅ 33 事件、5 类 handler（command/http/mcp_tool/prompt/agent）；settings/plugin/skill/subagent 四处挂载；exit 2=阻断 | ⚠️ 无独立 hooks 面；以 **plugin（JS 模块）** 形态（event/chat.message/tool.execute.before…；--pure 可全关） | ✅ config.yaml hooks map（pre/post_tool_call、pre_llm_call、subagent_stop）+ allowlist（--accept-hooks） | ⚠️ 以 **extensions（TS）** 形态：registerTool/registerCommand/on('tool_call')（--no-extensions 全关） | unknown | 继承 | unknown |
| plugins | ✅ plugin.json + marketplace（bundles skills+MCP；commands→skills 迁移；app-server plugin/* 方法） | ✅ .claude-plugin/plugin.json + marketplace.json；组件 skills/commands/agents/hooks/MCP/LSP；`--plugin-dir/--plugin-url` 会话级注入 | ✅ JS/TS 插件：`.opencode/plugin(s)/*.{ts,js}` + npm spec + file:// | ✅ bundled > user > project（project 需 opt-in env）> pip entry-points；git URL 安装 | ✅ pi packages（npm/git；`pi install`；完整系统权限警告） | unknown | 继承 | unknown |
| memory | ⚠️ memories feature flag（默认关；CODEX_HOME/memories/ + sqlite） | ✅ CLAUDE.md 族（静态）+ auto memory（`<config>/projects/<p>/memory/`，user/feedback/project/reference 类型；subagent 另有 user/project/local 三档） | ⚠️ 无专用面（compaction + instructions 承担） | ✅ `$HERMES_HOME/memories/`（MEMORY.md + USER.md）+ memory toolset + journey/learning | ❌ 未发现原生 memory（可由扩展提供） | unknown | 继承 | unknown |

## 横向规律（对 Resource Projector 设计的意义）

1. **SKILL.md/Agent Skills 标准已是跨 harness 最大公约数**：codex、claude-code、opencode、
   hermes、pi、（继承 opencode 的 kilo）全部原生消费 SKILL.md；且 codex/claude/opencode/pi
   都把 `$HOME/.agents/skills` 作为共享根。→ Agent-Box 的 skill-tree 投影目标应默认为
   各家"已原生发现"的根（见逐家 guest 目标表），`skill_target` 模板机制方向正确。
2. **逐家 guest 目标**：codex → `$CODEX_HOME/skills/<id>`（弃用路径！）或 repo `.codex/skills`；
   claude → `<CLAUDE_CONFIG_DIR>/skills/<id>`；opencode → `<config>/skill(s)/<id>`；
   hermes → `$HERMES_HOME/skills/<id>`；pi → `<agent-dir>/skills/<id>`（无需 flag）。
   现声明 codex 的 `/runtime/home/skills` 恰是**弃用路径**，应改 repo/global 根或跟随官方推荐。
3. **instructions 不可只读投影到 cwd 之外就了事**：opencode"首个类型胜出不叠加"、
   codex"每目录一份"、claude"@import 4 跳"语义不同 → instructions 属于
   harness-native-adapter + resource-projector 协作（目标文件名是通用约定 AGENTS.md/CLAUDE.md，
   发现语义是各家私有）。
4. **MCP**：四家支持（codex TOML / claude 三作用域 JSON / opencode config mcp map /
   hermes YAML map），一家明确拒绝（pi）。格式与作用域差异大 → Registry 只声明
   supported + 配置文件位置，payload 构造归 native adapter。
5. **hooks/extensions 的形态分裂**（claude settings-hooks / codex config-hooks /
   opencode JS plugin / pi TS extension / hermes YAML hooks）→ 不可能统一声明；
   归 native adapter + KEEP_NATIVE_OPAQUE。
6. **冲突行为**：claude"skill 胜 command"、codex"重名不合并都出现"、opencode"name=目录名"→
   Agent-Box 现有 `SKILL_TARGET_COLLISION` fail-closed 与各家兼容性最好。
