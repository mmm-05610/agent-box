# 工单 59 阶段 A —— 逐家 hook 形态观察（一手）

执行：2026-09-18，env-provider 工作树。方法：只读钉住工件（`~/.agentbox-all-harnesses/artifacts/<family>`）。
不读任何用户原生配置、零模型调用。

## 逐家结论

| 家 | 种类 | 事件清单（一手） | 配置位置 | 依据（字符串计数） |
| --- | --- | --- | --- | --- |
| **Claude Code** | **声明式**（事件 → 匹配器 → 处理器） | `PreToolUse`(108)、`PostToolUse`(97)、`SessionStart`(76)、`UserPromptSubmit`(44)、`SubagentStop`、`PreCompact`、`Notification`、`Stop` 等；返回语义 `hookSpecificOutput`(46)；总开关 `disableAllHooks`(30)；处理器类型含 `mcp_tool`(89) | `~/.claude/settings.json`、`.claude/settings.json(.local)`、受管策略、插件 `hooks/hooks.json`；多层合并 | 计数见左 |
| **Codex** | **声明式（与 Claude 同族）+ 受管开关**（本腿新钉，工单原文说"事件清单缺失"） | **同名事件全套**：`SessionStart`(34)、`SessionEnd`(34)、`UserPromptSubmit`(8)、`PreToolUse`(39)、`PostToolUse`(33)、`PreCompact`(28)、`Notification`(87)、`Stop`(107)、`SubagentStop`(28)；输入含 `hook_event_name`(22)；信任/运行 id：`hook_trust`(10)、`hook_run_id`(7)、`hook_started`(4) | `hooks/hooks.json`（"failed to serialize hooks.json" 为解析错误串）；受管层 `requirements.toml` 的 `hooks_only`/`hooks_review`（"allow_managed_hooks_only" 语义由 `hooks_only` 承担） | 计数见左 |
| **OpenCode** | **代码插件**（非声明式） | JS 钩子名（`tool.execute.before/after`、`shell.env`、`file.edited`、`permission.asked/replied`、`session.*`、`tui.*`…）——**本机无该家安装工件（门在 /tmp 构建后清理），按工单 §0 的取证记录，标注"未复验"** | `.opencode/plugins/*.js\|ts` 自动加载；`opencode.json` 的 `plugin` 数组（npm，Bun 启动时装、缓存 `~/.cache/opencode`） | 工单 §0（文档取证） |
| pi / dsh / qwen / hermes | 未观察到 hook 面 | — | — | 本轮未复验 ⇒ **如实声明不支持** |

## 由观察直接得出的模型结论

1. **Claude 与 Codex 共用一套声明式模型**（事件名、`hooks/hooks.json` 形态、`hook_event_name` 输入、
   受管开关），因此**一份 schema 服务两家**，但**逐家声明差异**：Codex 多一个"仅受管 hooks"的
   强制开关（`hooks_only`），Claude 有 `disableAllHooks` 与更多事件/处理器类型。
2. **OpenCode 按"代码资产"处理**（工单 §1 已定）：用户提供插件源码（带摘要与预览），
   我们只**投递与加载**，**不做表单拼装代码**——本模块不为其建声明式模型。
3. **不支持的家（pi/dsh/qwen/hermes）**：UI 上显示"该家不支持 hook"，**不产生假物化**（G6）。

## 阶段 B 首块（已落地）：逐家模型校验 + hook 账本（schema 14）

- **逐家 schema**（`server/hooks/model.py`）：Claude Code 与 Codex 各一份**自己的**声明
  （事件集、是否支持 matcher、处理器类型、受管开关名），**不合并**成"都用同一套"；
  未声明 hook 面的家（pi/dsh/qwen/hermes）→ `HOOK_FAMILY_UNSUPPORTED`（UI 据此显示"不支持"，
  不画假开关）。字段级类型化码：`HOOK_EVENT_UNSUPPORTED`（含"该家声明了哪些"）、
  `HOOK_HANDLER_UNSUPPORTED`、`HOOK_TIMEOUT_INVALID`（1..600s）、`HOOK_FIELD_INVALID`
  （command/url/tool/prompt 按处理器类型各自必填；http 仅 https 或 loopback）。
- **命令可见性**：`command_preview()` 从**规范化模型**派生该 hook 会跑的全部命令
  （与投影同源、不会漂移）——"启用前必须看得见完整命令"。
- **账本**（`server/hooks/records.py` + schema 14 `server_hooks`）：create/update/set_enabled/
  delete/list/enabled_for_family；**默认不启用**；非法编辑在保存前拒绝且不落库；
  **无命令处理器的 hook 不可启用**（`HOOK_NOT_EXECUTABLE`——开关不撒谎）。
- **测试**：5 条（schema 差异与未支持家、规范化、五类字段反例、账本 CRUD 与"默认停用/
  非法编辑不落库/不可启用的声明式 hook"）；全量见提交记录。

## 59 未做（下腿）

- **物化**（G3）：把启用 hook 渲染成各家原生形态（Claude/Codex 的 `hooks` JSON →
  只读投影；OpenCode 按代码资产投递插件文件），**绝不写原生配置**；
- **可观测**（G5）：触发事实（hook id/事件/时间/退出码/有界输出摘要、`exit 2` 阻断语义）
  与 52 的过程事实同一批入账；
- 沙箱内执行接线（G4：命令在沙箱内、凭据不进 hook 环境、输出有界+扫描）；
- `hooks.*` wire 面（与 P16 前端配对、两仓重锁）；OpenCode 插件资产形态；
  Windows 执行侧差异（`shell` 语义）与 Codex 受管层的真机验证。
