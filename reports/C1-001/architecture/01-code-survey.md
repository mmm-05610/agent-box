# 01 — 只读代码调研（全部为【代码事实】）

范围：`worktrees/pi-loop/desktop` @ `80872f556c…`、`worktrees/pi-loop/backend` @ `e2ec0ef…`。
只读，未执行产品代码路径（唯一例外：为验证绑定顺序单独跑过 `bwrap`，记在 `../status.md`）。

## 1. 现有扩展框架：是真的，而且已经是 VS Code module 模型

| 事实 | 证据 |
| --- | --- |
| 贡献原语是一个统一结构，bar 用 `<Slot>`、dock 用 `<PaneHost>`，**同一形状两种呈现** | `src/types/contributions.ts:25-52`（`Contribution{id,area,source,title,order,when,enabled,render,data}`） |
| 来源标签驱动优先级与"可信/能力门"（注释自称 WoW-style taint） | 同上 `:5-10`（`ContributionSource = 'core' \| string`） |
| 注册表 + 错误隔离边界 | `src/lib/contributions.ts`、`src/extension/contrib/react/boundary.tsx`、`slot.tsx`（`ContribBoundary`） |
| 插件契约：作者**不碰注册表**，`ctx.register` 自动打来源标签 + 命名空间化 id | `src/extension/contrib/plugin.ts:1-33` |
| 插件存储（VS Code `globalState` 类比，键前缀 `hermes.plugin.<id>.`） | 同上 `PluginStorage` |
| 受控 OS 门（通知/开链等），成员**解析失败而不抛** | 同上 `PluginOs` |
| 内置插件**自动发现**（`src/plugins/<name>/plugin.tsx`，无需改注册表） | 同上（`discoverBundledPlugins()`） |
| SDK 单一入口 `@hermes/plugin-sdk`，**lint 隔离** `@/…` 内部，两种投递模式（内置 / 运行时注入 `window.__HERMES_PLUGIN_SDK__`） | `src/extension/sdk/index.ts:1-25` |
| SDK 能力分级：`host.state.*`（只读）、`host.*`（受控动作）、`ctx.hostViews`（可渲染的宿主面：Capabilities/toolset/MCP）、`host.request`（**gateway JSON-RPC 门**）、`ui.*` | 同上 |
| 宿主责任模块已拆分 | `src/extension/sdk/{host-state,host-session,host-routing,host-system,profile-routing,plugin-open-session-plan}.ts` |

**结论（事实）**：任务书担心的"再造一个并行插件框架"**没有必要**——框架在位，且形状与 VS Code 的
`contributes` + extension-host 模型同源。

## 2. 但两处明显薄弱

### 2.1 类型化 UI 插槽覆盖极薄【代码事实】

全仓 `<Slot>` 只有 **3 处**，且都在标题栏：

```
area="titleBar.left" / "titleBar.center" / "titleBar.right"
```

没有会话头、输入区附件控件、工具详情、侧面板、设置页等插槽点。**框架有了，插槽目录几乎没有。**

### 2.2 服务面绑死在 legacy Hermes，而不是 agentbox wire【代码事实】

`plugin.ts` 的插件能力直接依赖 legacy 网关类型与通道：

```ts
import { type HermesGateway, type ProfileScope } from '@/api/client'
import { pluginRest, type PluginRestOptions, pluginSocket } from '@/api/plugins'
```

而 agentbox 产品链走的是 **wire v1**（`src/api/wire-v1-client.ts`，`client.call('sessions.createAndSend', …)`）。
SDK 文档也把 `host.request` 描述为"the gateway JSON-RPC door"。

**推论（事实层面）**：插件今天能扩展的"服务面"是 Hermes 网关；agentbox 的会话语义**没有**对插件
暴露的中立入口。这是"中立边界"问题的真正所在——不是缺抽象层，而是**抽象层接错了服务**。

## 3. 会话核心：很厚，但全是 agentbox 专属【代码事实】

`src/application/session/` 约 **45 个模块**，覆盖：

- 投影与顺序：`agentbox-session-projection.ts`、`message-stream-utils.ts`、`message-equivalence.ts`
- 恢复/重连：`recovery.ts`、`wire-reconnect-plan.ts`、`single-flight-resume.ts`、`finalize-interrupted-turn.ts`
- 请求与归属：`request-router.ts`、`session-owner.ts`、`request-owned-session.ts`、`transcript-provenance.ts`
- 目录与状态：`wire-session-catalog.ts`、`session-state-cache.ts`、`optimistic-session-rows.ts`
- 控制：`wire-session-control.ts`（停止/授权）、`upload-attachment.ts`、`open-session.ts`

命名前缀 `agentbox-*`/`wire-*` 说明它们**直接建立在 wire v1 之上**，而非建立在一个中立接口之上。

## 4. 后端契约：已经是"能当中立边界"的形状【代码事实】

| 事实 | 证据 |
| --- | --- |
| wire v1 = JSON-RPC 2.0，**64 个方法**，有生成工件与摘要 | `docs/server-round1/fullstack/contract/wire-v1.schema.registered-b1eb4762.json`（sha256 `b1eb4762…`） |
| 握手带**能力声明**：`server.hello` 返回 `harnesses[]`（id/credentialKind/modelControlId）与 64 条 `capabilities[]`，参数需 `clientVersions`/`clientPresentationSupports` | 本轮实测（`../status.md` 进度五） |
| 可选能力**显式缺席**：`harnesses` 里没有的能力就不出现，不是空值糊过去 | 同上 + LNX-002 的合同/门 |
| 方法族：`sessions.*`（含 `createAndSend`/`send`/`switchProfile`）、`workspaces.*`、`profiles.*`、`providerModels.*`、`runs.stop`、`approvals.*`、`server.hello` | 合同工件；本轮实测调用过 `workspaces.open`/`profiles.create`/`providerModels.create`/`sessions.createAndSend` |
| 读侧另有 HTTP 面：`GET /api/v1/sessions/{id}`（含 turns）、`GET …/events`、`POST /api/v1/credentials` | `src/agent_box/server/transport/http/app.py:309-328` |

**结论（事实）**：wire v1 已经是一个**带能力协商、可选缺席显式、可版本化摘要**的契约。它满足
"中立边界"的多数形式要求。

## 5. harness 侧已经是协议化的【代码事实】

后端与 harness 之间走 **ACP**（Agent Client Protocol），仓库 vendored 两个实现：
`@agentclientprotocol/codex-acp@1.1.14`、`@automatalabs/pi-acp@0.5.0`
（`plugins/agent-box-harnesses/runtime/{package.json,vendor/}`）。

ACP 的语义面（官方 v1 概览，见 `03-references.md`）：`initialize` → `authenticate` →
`session/new` | `session/load` → `session/prompt` → `session/update` 通知 → `session/cancel` →
prompt 响应带 **stop reason**；`session/update` 承载 message chunk（agent/user/**thought**）、
tool calls、plans、commands、mode changes；权限请求是 client 基线方法 `session/request_permission`；
扩展靠 `_meta` 字段、`_` 前缀自定义方法与初始化时声明的能力。

**这解释了后端为什么能"收敛到最小核心语义"**：它把 harness 的差异压到了 ACP + 部署文档 + 适配器，
核心只认"会话/轮次/事件/能力"。**前端目前没有对应物**——前端核心直接认 wire 方法名。

## 6. 与任务的对照（事实 → 缺口）

| 任务关注点 | 现状（事实） | 缺口 |
| --- | --- | --- |
| 复用现有 Slot 框架 | 框架在，形状正确 | 插槽目录需扩充 |
| 服务中立会话核心 | 核心厚但绑 wire v1；插件面绑 Hermes | **缺一条会话语义接口** |
| 服务适配模块 | 无（wire 调用直接散在核心） | 需新增适配层（薄） |
| Profile 接入不侵入核心 | Profile 已是 wire 域，核心直接调 | 需经接口 |
| 工具展示 | 有通用工具卡（`agentbox-chat-view.tsx` 的 `toolPart`，`args` 目前为 `{}`） | 需类型化插槽 + 回退 |
| Skill/MCP | SDK 提到 `ctx.hostViews`（Capabilities/toolset/MCP） | 未验证实现程度 |
| 接入第二个服务要改哪些文件 | 今天必须改核心（wire 方法散落） | 目标：只加适配模块 + 注册入口 |
