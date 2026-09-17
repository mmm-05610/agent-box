# Work Order 59 — Hook 管理：逐家分开的模型 + 可配置 + 可审计

状态：**READY-FOR-EXECUTION**（用户 2026-09-16：hook 也要做，"没有成熟收敛就自己设计一套分开的管理，也要可配置"）。
依赖：与 51/52/53/55/56/57/58 **共用一次 wire 重锁**；与 58（资产层）同族但**不同模型**。
配对前端单：桌面工作树 **P16**。

## §0 结论先行：没有收敛，且是三种不同种类

本轮取证（三家，逐条给出处）：

| 家族 | Hook 的**种类** | 关键形态 |
| --- | --- | --- |
| **Claude Code** | **声明式**：事件 → 匹配器组 → 处理器 | 事件极多（`SessionStart`/`Setup`/`SessionEnd`、`UserPromptSubmit`/`Stop`、`PreToolUse`/`PermissionRequest`/`PostToolUse`…、`PreCompact`/`PostCompact`、`PreModelSwitch`/`PostModelSwitch` 等）；处理器类型 `command`/`http`/`mcp_tool`/`prompt`/`agent`；字段 `type`/`if`/`timeout`/`statusMessage`；配置在 `~/.claude/settings.json`、`.claude/settings.json(.local)`、受管策略、插件 `hooks/hooks.json`；多层**合并**；`disableAllHooks` 可全关；**输入走 stdin JSON**（`session_id`/`cwd`/`hook_event_name`/工具事件带 `tool_name`/`tool_input`）；**返回**看退出码与 stdout（`exit 2` 对部分事件**阻断**），stdout 为 JSON 时可带 `hookSpecificOutput`/`additionalContext`/`updatedInput`。**注意：它自己的 `/hooks` 菜单是只读浏览器。** |
| **Codex** | **受管开关** + 生命周期 hook | 可得的公开证据只有 `allow_managed_hooks_only = true`（写在 `requirements.toml`，效果是**忽略用户/项目/会话的 hook 配置**、只允许受管层）；**事件清单与命令声明在这份文档里没有** → 由阶段 A 实测补 |
| **OpenCode** | **代码插件**（不是声明式配置） | `.opencode/plugins/*.js|ts` 自动加载，或 `opencode.json` 的 `plugin` 数组装 npm 包（Bun 在启动时装、缓存在 `~/.cache/opencode`）；事件是 **JS 钩子名**（`tool.execute.before/after`、`shell.env`、`file.edited`、`permission.asked/replied`、`session.*`、`tui.*`…），签名 `async (input, output)` **可就地改写**，插件还能**注册自定义工具** |

→ 因此**不做统一抽象**（把三种东西压成一种只会造出假的统一）。做法是：
**一个 UI 外壳 + 逐家独立的模型**，模型由**该家声明的 schema** 校验。

## §0b 目标

把 hook 做成**可配置的受管资产**：逐家定义、**用户可增删改与启停**、执行时**只读投影**进沙箱、
执行**可观测**（哪个 hook 何时触发、退出码、输出摘要），并且**绝不回写用户的原生配置**。

**验收（第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 逐家模型** | 每家一套 schema（事件清单 / 是否支持匹配器 / 处理器类型 / 字段与默认超时），**来源可指**（文档或实测）；不支持的事件 → **类型化拒绝**，不静默丢弃 |
| **G2 可配置** | 记录的**增删改启停**都是产品动作（**不是只读展示**）；非法配置在保存前就被拒（带原因） |
| **G3 物化** | 按该家的**原生形态**生成（Claude Code 的声明式 hooks JSON；OpenCode 的插件文件/npm 列表；Codex 按阶段 A 结论），产物进**只读投影**；**绝不写** `~/.claude*`、`~/.codex/**` |
| **G4 安全** | hook 命令**在沙箱内**、以该次执行的身份与网络姿态运行；**命令原文在 UI 上必须可见**（用户明确启用才生效）；凭据不注入 hook 环境（除非该 hook 显式引用凭据且用户确认）；**零日志泄漏** |
| **G5 可观测** | 触发事实进账本：hook id、事件、时间、**退出码**、输出摘要（**有界**）；`exit 2` 这类**阻断语义如实呈现**（不得把"阻断了一次工具调用"显示成普通成功） |
| **G6 平台边界** | 各家的**平台差异**如实声明（例如 `shell: bash|powershell` 在不同执行侧的行为）；跑不了的家/事件**显示不支持**，不做假开关 |
| **G7 不退化** | 既有投影/工件语义不变；全量套件与四家全链门不退化 |

## §1 设计要点

- **记录**：`{id, family, name, enabled, model, source}`；`model` 是逐家结构：
  - Claude Code：`{event, matcher?, handlers: [{type, command|url|..., timeout?, async?}]}`；
  - OpenCode：**按"代码资产"处理**——用户提供插件源码（带摘要与预览），我们只**投递与加载**，
    **不做表单拼装代码**（拼装等于我们替用户写可执行代码，安全性说不清）；
  - Codex：阶段 A 实测后按受管层写入其声明的形态。
- **物化**：复用只读投影；hook 文件与其它配置一起在每次执行时冻结（**改 hook = 下一轮生效**，与全局同一条纪律）。
- **审计**：G5 的触发事实与 52 的"过程事实"**同一批**（同一次重锁、同一套有界与扫描规则）。
- **不做**：统一 hook 抽象；任何"猜测式"的逐家翻译；写用户原生配置。

## §2 硬性规则

- **用户动作才生效**：hook 默认**不启用**；启用时要能看到**完整命令**与它会在哪个事件上跑。
- **沙箱内执行**：hook 是**沙箱里的进程**，享有该次执行的隔离与网络姿态；**不**在宿主直跑。
- **零回写**、**零凭据意外注入**、**零日志泄漏**；输出有界 + 凭据扫描。
- 阶段 A 必须补齐 **Codex 的事件模型**与**三家在 Windows 执行侧的差异**（`shell` 语义、
  OpenCode 插件在无 Bun 场景的行为），查不到的**如实标注**。
- 不 reset/stash/clean、不 merge main、不 push；真实模型零调用。

## §3 六件套 DoD 与报告

实现 / 定向测试与反例（非法事件、非法 matcher、超时越界、阻断语义、命令原文本可见、
"绝不写原生配置"守卫、凭据不进 hook 环境）/ 真机证据（至少两家各一个 hook 真实触发并记账）/
回归计数 / status 分账 / 清理与费用账（0）。
报告含：逐家 schema 与出处、物化形态、阻断语义的呈现、触发账本样例、类型化码表、
两仓摘要（若重锁）、未做项。
