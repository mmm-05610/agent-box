# Batch 29 — 消息平台：整个移除，前端不再认识"平台"这个概念

**Edges paid off: 0.** 账本前后都是 **0**。

> **本单在 2026-09-12 被扩大过一次。** 第一版只删"配置面"（页面），保留"展示面"
> （左栏按平台分组、平台徽标、20 个平台的清单）。裁决改了：不是"暂时不维护"，
> 而是**不想适配 hermes 的平台模型**——那是要后端重新设计的东西，适配它等于白做。
>
> 所以范围从"删一页"变成"**删掉前端对平台的全部认识**"。

## 这是这个目录里第一张删除单，规矩和搬运单不同

**搬运单有 typecheck 兜底**：改漏一个 import，立刻红。**删除单没有**——少删一个引用会红，
但"该删的没删"不会：一段没人用的导出、一条点不动的命令、一堆孤儿 i18n、一份还挂在
数据流里的切片，typecheck 全是绿的。

所以：**先读"不能删"，再读"要删"，最后逐条核。** 清单是量出来的。

## 一、终态：前端不再认识"平台"

```
今天   会话列表 = [本地 recents] + [每个平台一个自管分区]
       每条平台会话行上有一个品牌徽标
       前端硬编码 20 个平台 id + 12 个品牌图标

之后   会话列表 = 一个列表
       不分组、无徽标
       前端不认识任何一个平台
```

**这不是"少几个功能"，是一个概念从渲染层消失。** 平台会话不会消失——它们会和普通会话
混在一个列表里（下面第五节说明为什么）。

## 二、不能删的（先读这一节）

### 1 · `api/messaging.ts` —— 整个保留

11 个函数，其中 4 个是 webhook 的（webhook 页还在）。**平台那 7 个虽然立刻变成无人调用，
也保留。**

理由：它是**现有协议形状的记录**。后端重新设计消息平台时要参照"以前是什么样"，
而删掉它只会让那份记录消失，换不来任何干净（`api/` 是叶子层，没有循环风险）。
**执行者不要自作主张删它。**

### 2 · `app/webhooks/` —— 另一个页面，不在本次范围

它和消息共用一个 api 文件，但是独立的 overlay。**一个字不动。**

### 3 · `app/settings/keys-settings.tsx` 的排除逻辑 —— 保留

它把消息平台凭据排除在设置之外，理由是"在消息页配"。页面删了之后这条排除变成
"无处可配"——**那是本次裁决接受的代价**（要重新设计，现在不配）。改它属于下一轮。

### 4 · `normalizeSessionSource` —— 保留

通用的来源归一化，和平台无关。删了它，`session.source` 这个字段就没有归一入口了。

## 三、要删的

### A · 配置面（原来的范围）

| # | 位置 | 删什么 |
| --- | --- | --- |
| 1 | `app/messaging/index.tsx` | 整个文件（`MessagingView`） |
| 2 | `app/messaging/index.test.tsx` | 整个文件 |
| 3 | `lib/routes.ts` | `MESSAGING_ROUTE` · `AppView` 的 `'messaging'` · `AppRouteId` 的 `'messaging'` · `APP_ROUTES` 那一条 |
| 4 | `app/contrib/surfaces.tsx` | lazy import · `<Route … path="messaging" />` |
| 5 | `app/chat/route-tile.tsx` | lazy import · `BUILTIN_PAGES` 那一条 · import 里的 `MESSAGING_ROUTE` |
| 6 | `app/chat/sidebar/sidebar-constants.tsx` | **只有**导航那一行（含 `keybindActionId: 'nav.messaging'`） |
| 7 | `app/command-palette/body.tsx` | `MESSAGING_ROUTE` · 命令条目 |
| 8 | `app/hooks/use-keybinds.ts` | `MESSAGING_ROUTE` · `'nav.messaging'` 绑定 |

### B · 适配面（本次扩大的部分）

| # | 位置 | 删什么 |
| --- | --- | --- |
| 9 | `app/messaging/platform-icon.tsx` | **整个文件**（101 行：12 个品牌图标 + Photon 手绘 SVG + 颜色表 + 单字母回退） |
| 10 | `lib/session-source.ts` | `MESSAGING_SESSION_SOURCE_IDS`（**20 个平台 id**）· `MESSAGING_SOURCE_IDS` · `isMessagingSource` · `handoffOriginSource` · `sessionSourceLabel`（如果只为徽标服务）· 以及 `LOCAL_SESSION_SOURCE_IDS`（它的存在理由是"把本地源从消息切片里排除"——切片没了它就没有理由） |
| 11 | `app/chat/sidebar/session-row.tsx` | 平台徽标（`PlatformAvatar` 的渲染 + 它的 import + `handoffOriginSource` / `sessionSourceLabel` 的 import 与调用） |
| 12 | `app/chat/sidebar/chat-sidebar.tsx` | 按平台分组的自管分区：`MessagingSection` · `onLoadMoreMessaging` · `revealMoreMessaging` · `$messagingSessions` · `PlatformAvatar` import |
| 13 | `app/chat/sidebar/sidebar-constants.tsx` | `MessagingSection` 接口 · `onLoadMoreMessaging` 字段（**除了导航行，这个文件里所有 messaging 的东西都走**） |
| 14 | `app/session/hooks/use-session-list-actions.ts` | `SIDEBAR_EXCLUDED_SOURCES` 里的 `...MESSAGING_SESSION_SOURCE_IDS` · 消息切片的取数逻辑（"the messaging slice is the inverse: drop cron + every local source"） |
| 15 | `application/session/session-registry-lookup.ts` | `isMessagingSource` · `$messagingSessions` · `ListedSessionSlice` 里的 `'messaging'` 成员及所有分支 |
| 16 | `application/session-lists.ts` | 侧栏取数结果里的 `messaging` 切片 |
| 17 | `app/contrib/wiring.tsx` | `isMessagingSource` · `$messagingSessions` 的订阅与消费 |
| 18 | i18n | 见第四节 |

### 平台会话为什么不会消失（第 14 条的关键）

`SIDEBAR_EXCLUDED_SOURCES = ['cron','kanban','subagent','tool', ...MESSAGING_SESSION_SOURCE_IDS]`
是**在前端过滤**的。删掉那份平台清单，这个排除项就没了，
**平台来的会话于是和普通会话一起出现在同一个列表里**——没有分区、没有徽标。

**这正是"不适配"该有的样子。** 但执行者要清楚：这不是"少取一份数据"，
是**过滤条件被移除**，行为和条数都会变。

## 四、i18n：不要只按行号删

`i18n/` 有 **20 个语言文件**，其中 **7 个**含顶层的 `messaging: {` 段（`types.ts:1634`）。
但消息在 i18n 里**不止一处**：命令面板读 `commandCenter.nav.messaging`，
左栏分组、平台名字、徽标的无障碍标签都可能各有一份。

**先搜、再列、再删：**

```bash
cd apps/desktop/src
rg -n "messaging|Messaging" i18n/types.ts
```

把**每一处**列进报告（键路径 + 在哪些文件里），然后判断：
- 页面文案、命令面板导航项、平台分组标签、平台名字 → **删**
- 任何和"来源徽标"无关的通用文案 → **留**

`types.ts` 是形状定义，删了它**必须同步改那 7 个文件**，否则 typecheck 红。

## 五、一个副发现，写下来别丢

`app/chat/route-tile.tsx` 的头部注释：

> ROUTE (PAGE) TILES — a full-page view rendered as a layout-tree pane **BESIDE the
> main thread**, the page analog of session tiles.

**页面本来就能变成一个 panе**（`openRouteTile(path)` → 挂在主区旁边 → 关掉移除）。
这影响 `pages/` 该不该存在的裁决：**"技能/产出物能不能拖出来并排看"这个问题，机制已经在了。**
记下来，编排时用得上。

## 六、验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

**测试数会掉，而且可能掉不少。** `app/messaging/index.test.tsx` 整个没了；
左栏、路由、命令面板、`session-source`、`session-registry-lookup` 里针对消息切片的
断言也会少。**报告里要写清掉了多少个、分别来自哪** —— 删除单里"测试掉了多少"是
主要证据，不是异常。

## 七、停止条件

- **删平台清单之后，左栏的会话条数变了而你说不清为什么。** 那说明过滤逻辑的去向
  没搞清（见第三节末尾）。**停下来，把改前的条数和改后的条数都报出来。**
- **`application/` 里的改动需要 `app/` 里的东西。** 那是方向反了。
  `session-registry-lookup.ts` 和 `session-lists.ts` 都在 rank 2，删完之后只应够着 rank ≤ 2。
- **`platform-icon.tsx` 除了左栏徽标还有别的消费者。** 量到只有
  `session-row.tsx` 和 `chat-sidebar.tsx`（以及被删的页面）。多出一个就报告。
- **`sessionSourceLabel` 被别处用到。** 它可能服务徽标以外的显示。报告再删。
- **`api/messaging.ts` 需要改。** 它保留；需要改说明有东西在引用被删的函数——
  报告，不要顺手删那个文件。
- **`test:ui` 出现失败用例。** 分清两种：断言了被删功能的（跟着删或改），
  和别的东西坏了的（停下来）。**不许一起改掉。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
