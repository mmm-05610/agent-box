# 03 — 参考与出处（含适用限制）

**方法说明（先声明，避免误读）**：本轮的 `web_search` 工具调用**失败**（返回
`MATRIX_TOOL_REQUEST_FAILED`），因此外部资料靠 `web_fetch` 直接取官方页。**实际打开的官方页只有 1 个**
（下 §1）。§4 列出的其余项目是**建议后续核查**的，本轮**未打开**、不作为论据，只标注"该看什么"。
本仓库内的源码与工件为第一手读数（§2、§3）。

---

## 1. 已实际打开：ACP v1 官方概览

- 来源：`https://agentclientprotocol.com/protocol/overview`（规范页 `/protocol/v1/overview`），
  Agent Client Protocol（站点由 Zed 维护，见页面 logo/OG 资源指向 `zed.dev`）。**本轮已抓取正文**。

**可引用的内容（原文要点）**

| 要点 | 原文表述 |
| --- | --- |
| 传输 | 遵循 **JSON-RPC 2.0**，两类消息：**Methods**（请求-响应）与 **Notifications**（单向、无响应） |
| 典型流程 | `initialize` → `authenticate`（如需要）→ `session/new` 或 `session/load` → `session/prompt` → Agent 发 `session/update` 通知 → 需要时 `session/cancel` → **prompt 响应带 stop reason** |
| Agent 基线方法 | `initialize`、`authenticate`、`session/new`、`session/prompt` |
| Agent 可选方法 | `session/load`（需 `loadSession` 能力）、`logout`（需 `agentCapabilities.auth.logout`）、`session/set_mode` |
| Agent 通知 | `session/cancel` |
| Client 基线方法 | `session/request_permission`（工具调用的用户授权） |
| Client 可选方法（按能力） | `fs/read_text_file`（需 `fs.readTextFile`）、`fs/write_text_file`、`terminal/create｜output｜release｜wait_for_exit｜kill`（需 `terminal`）、`elicitation/create`、`elicitation/complete` |
| `session/update` 承载 | message chunks（**agent / user / thought**）、**tool calls 与更新**、plans、可用命令、mode 变化 |
| 约定 | 文件路径**必须绝对**；行号 1-based；属性键 `camelCase`，判别字段字符串值 `snake_case` |
| 错误处理 | 标准 JSON-RPC 2.0：成功含 `result`；错误含 `code`/`message`；通知永不返回 |
| 扩展机制 | `_meta` 字段、**以 `_` 前缀的自定义方法**、初始化时声明的自定义能力 |

**适用限制（重要）**

1. **它是 harness ↔ client 的协议，不是 GUI 架构**。它规定"agent 与客户端怎么说话"，**不**规定
   插槽、插件模型、UI 状态管理。所以它只能当**核心语义的参考**（会话/轮次/事件/能力/授权），
   不能当"前端扩展架构"的参考。
2. **在本仓库里，扮演 ACP "Client" 的是后端，不是桌面**。后端经 vendored `pi-acp`/`codex-acp` 与
   harness 对话（`01-code-survey.md` §5）。若把 ACP 当作**桌面**的边界，是**层级错位**——
   桌面在后端之外一层。**故：不要把 ACP 直接搬成桌面边界。**
3. **v1 且年轻**。可选能力集合在演进；把某个能力当稳定假设前应先核对 schema 页
   （`/protocol/v1/schema`，本轮未打开）。
4. 页面是 Mintlify 渲染的 Next.js 站点，正文混在 HTML 内联数据里；抓取时被截断过一次，
   上表只覆盖概览页要点，**未覆盖** schema、prompt-turn、tool-calls 等子页。

---

## 2. 第一手：本仓库 vendored 的 ACP 实现（代码事实）

| 包 | 版本 | 位置 | 备注 |
| --- | --- | --- | --- |
| `@agentclientprotocol/codex-acp` | `1.1.14` | `plugins/agent-box-harnesses/runtime/node_modules/`（tarball 在 `runtime/vendor/`） | `main: dist/index.js` |
| `@automatalabs/pi-acp` | `0.5.0` | 同上 | `main: ./dist/lib.js`，`exports: ["."]`；Pi 适配器入口为 `node_modules/@automatalabs/pi-acp/dist/index.js` |

**适用限制**：本轮只读了 `package.json` 与入口路径，**没有**读这两个包的实现源码，也没有读 ACP 的
schema 定义。因此"ACP 具体字段形状"在本方案中**未被当作事实使用**，只用了官方概览的方法/通知集合。

---

## 3. 第一手：本仓库自身的契约（代码事实，路径可复现）

| 事项 | 路径 / 值 |
| --- | --- |
| wire v1 合同工件（64 方法，含 params/result 的 JSON Schema） | `docs/server-round1/fullstack/contract/wire-v1.schema.registered-b1eb4762.json`，sha256 `b1eb4762b2a8e13e873967b770854e5e73a948488d4d066da07bc584e693dcd1` |
| 前端贡献原语 | `apps/desktop/src/types/contributions.ts` |
| 注册表 | `apps/desktop/src/lib/contributions.ts` |
| 插槽渲染与错误隔离 | `apps/desktop/src/extension/contrib/react/{slot.tsx,contribute.tsx,boundary.tsx}` |
| 插件契约 | `apps/desktop/src/extension/contrib/plugin.ts` |
| SDK 入口与能力分级 | `apps/desktop/src/extension/sdk/index.ts` |
| 会话核心（~45 模块） | `apps/desktop/src/application/session/**` |
| wire 客户端 | `apps/desktop/src/api/wire-v1-client.ts` |
| 后端 HTTP 读侧/凭据路由 | `src/agent_box/server/transport/http/app.py:309-328` |

**适用限制**：以上为本轮读数；行号未逐条固化，路径与文件名可靠，**行号在后续改动后可能漂移**。

---

## 4. 建议后续核查（本轮**未打开**，不作为论据）

任务要求"调研相关成熟项目的官方文档与源码"。以下是我建议的核查清单与**该看什么**；本轮因
`web_search` 不可用、且抓大页会挤占预算，**没有**实际打开，故不引用其结论：

| 项目 | 建议入口 | 该看什么 |
| --- | --- | --- |
| VS Code 扩展 API | `https://code.visualstudio.com/api/references/contribution-points` 与 `.../api/advanced/extension-host` | **contribution points（声明式插槽）与 extension host（进程隔离）的分工**——本仓库的 `Contribution`/`Slot` 与它同源，值得逐条对照"哪些用声明、哪些必须进宿主" |
| Language Server Protocol | `https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/` | **能力协商 + 可选方法缺席**的表达法（`clientCapabilities`/`serverCapabilities`）——这是"中立边界"最成熟的先例 |
| Zed 编辑器 | `https://github.com/zed-industries/zed`（`crates/` 下 ACP 相关） | ACP 的**实现侧**取舍；Zed 如何把 agent 差异收进少数 trait |
| assistant-ui | `https://github.com/assistant-ui/assistant-ui` | 桌面**已是其依赖**；它的 runtime/state 模型是"agent 会话 UI 核心语义"的现成参照，值得对照本方案 §1 的分类集合 |
| MCP | `https://modelcontextprotocol.io/` | Skill/MCP 接入面（本方案 §4 的"功能模块 + 窄 host API"是否与 MCP 的能力声明同构） |

**适用限制**：以上均**未经本轮验证**；若 I 要求以它们为论据，需先实际打开并记录版本/日期。

---

## 5. 结论性的方法论限制（供评审判断证据强度）

1. 外部证据**只有一份**官方页（ACP 概览）；其余为**本仓库第一手代码事实**。
2. `web_search` 本轮不可用，故**没有**做多来源交叉核对；任何"业界普遍如此"的表述在本报告中
   **一律未使用**。
3. 未读 ACP schema 子页、未读 vendored 适配器源码、未读 VS Code/LSP 正文——因此本方案的设计取舍
   **主要建立在仓库现状之上**，外部先例仅提供"该往哪看"的方向，不提供"已经这样"的结论。
