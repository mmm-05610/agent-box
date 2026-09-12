# Batch 29 — 删掉消息平台的**配置面**（保留展示面）

**Edges paid off: 0.** 账本前后都是 **0**。

## 这是这个目录里第一张删除单，规矩和搬运单不同

**搬运单有 typecheck 兜底**：改漏一个 import，立刻红。**删除单没有兜底**——少删一个引用会红，
但**"该删的没删"和"不该删的删了"里，后者会红、前者不会**。留下一个孤儿导出、
一段没人用的 i18n、一条点不动的命令，typecheck 全是绿的。

所以：**先读"不能删"那一节，再读"要删"那一节，最后逐条核。** 清单是量出来的，不是想出来的。

## 一、不能删的（先读这一节）

### 1 · `app/messaging/platform-icon.tsx` —— **要留，但要搬家**

```
app/chat/sidebar/session-row.tsx:9      import { PlatformAvatar } from '@/app/messaging/platform-icon'
app/chat/sidebar/chat-sidebar.tsx:10    import { PlatformAvatar } from '@/app/messaging/platform-icon'
```

**左栏在用**——它画会话行上那个"这条来自 Telegram"的小徽标。

```
app/messaging/platform-icon.tsx  (101 行, 导出 PlatformAvatar)
  → components/chat/sidebar/platform-icon.tsx
```

`components/chat/sidebar/` 已经有 `connection-glyph.tsx`、`row-lead.tsx`、`row-geometry.ts`——
`PlatformAvatar` 是和它们完全同类的东西。**它从来不属于消息页，只是当初顺手写在那儿。**

搬完顺手改 `lib/session-source.ts:51` 的注释——它写着
"keep in sync with `PLATFORM_ICONS` in `app/messaging/platform-icon.tsx`"。
**只改路径，不改那句话的意思。**

### 2 · `lib/session-source.ts` —— 整个保留

左栏按消息平台给会话分组、解析"这条会话从哪个平台来"，全靠它。**一个字都不动**（除上面那个注释）。

### 3 · `api/messaging.ts` —— 整个保留

11 个函数，其中 4 个是 webhook 的（webhook 页还在用）。这是"删 A"的核心：
**UI 走了，接口留着**，以后加回来是一张页面单，不是一次协议重写。

### 4 · 左栏的平台分组展示面 —— 保留

```
app/chat/sidebar/chat-sidebar.tsx    $messagingSessions · MessagingSection
                                     onLoadMoreMessaging · revealMoreMessaging
app/chat/sidebar/sidebar-constants.tsx  MessagingSection 接口 · onLoadMoreMessaging
app/chat/sidebar/session-row.tsx        平台徽标
```

**这些是由数据驱动的，不是由那一页驱动的。** 网关还在跑的话，从 Telegram 来的会话照样出现在左栏。

### 5 · 其余保留

`app/webhooks/`（另一个页面）· `app/settings/keys-settings.tsx`（它那份"消息平台凭据不在设置里配"的排除逻辑）·
`app/chat/sidebar/sidebar-constants.tsx` 里除了导航行以外的所有东西。

## 二、要删的（逐条核，别凭印象）

| # | 位置 | 删什么 |
| --- | --- | --- |
| 1 | `app/messaging/index.tsx` | 整个文件（`MessagingView`） |
| 2 | `app/messaging/index.test.tsx` | 整个文件 |
| 3 | `lib/routes.ts` | `MESSAGING_ROUTE`（:12）· `AppView` 的 `'messaging'`（:32）· `AppRouteId` 的 `'messaging'`（:45）· `APP_ROUTES` 那一条（:65） |
| 4 | `app/contrib/surfaces.tsx` | lazy import（:38）· `<Route … path="messaging" />`（:171） |
| 5 | `app/chat/route-tile.tsx` | lazy import（:21）· `BUILTIN_PAGES` 那一条（:27）· import 列表里的 `MESSAGING_ROUTE` |
| 6 | `app/chat/sidebar/sidebar-constants.tsx` | **只有**导航那一行（:41–45，含 `keybindActionId: 'nav.messaging'`） |
| 7 | `app/command-palette/body.tsx` | `MESSAGING_ROUTE`（:81）· 命令条目（:406–410） |
| 8 | `app/hooks/use-keybinds.ts` | `MESSAGING_ROUTE`（:71）· `'nav.messaging'` 绑定（:205） |
| 9 | i18n | 见下 |

**删完 `lib/routes.ts` 那一行之后**，`AppView` / `AppRouteId` 两个联合类型会少一个成员——
typecheck 会告诉你还有谁在引用它。**跟着它走，别自己猜。**

## 三、i18n：不要只按行号删

`i18n/` 有 **20 个语言文件**，其中 **7 个**含 `messaging: {`（顶层段，`types.ts:1634`）。
但消息在 i18n 里**不止一处**——命令面板读的是 `commandCenter.nav.messaging`，
左栏导航也可能有自己的标签键。

**先搜，再列，再删：**

```bash
cd apps/desktop/src
rg -n "messaging" i18n/types.ts | head -40
```

把你找到的**每一处**列在做完的报告里（键路径 + 哪个文件），然后：
- 顶层的 `messaging:` 段（那个页面的文案）→ **删**
- `commandCenter.nav.messaging`（命令面板导航项）→ **删**（命令条目已经删了）
- **左栏平台分组用到的键 → 留**（展示面还在）
- 平台名字（Telegram / Slack / 钉钉…）如果被展示面用到 → **留**

`types.ts` 是形状定义，删了它**必须同步改那 7 个文件**，否则 typecheck 红。

## 四、一个副发现，写下来别丢

`app/chat/route-tile.tsx` 的头部注释说：

> ROUTE (PAGE) TILES — a full-page view rendered as a layout-tree pane **BESIDE the
> main thread**, the page analog of session tiles.

**所以页面本来就能变成一个 panе**（`openRouteTile(path)` → 挂在主区旁边 → 关掉移除）。

这直接影响 README 里 `pages/` 该不该存在的讨论：**"技能/消息/产出物能不能拖出来并排看"
这个问题，机制已经在了。** 记在这里，编排时用得上。

## 五、验证

```bash
cd apps/desktop
npm run typecheck && npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers && npm run test:ui
```

基线：**776 文件 / 7466 个**；守卫 **16/16**；账本 **0**（前后都是 0）。

**测试数会掉。** `app/messaging/index.test.tsx` 整个没了，`lib/routes.test.ts`、
`command-palette`、`use-keybinds` 里如果有针对这条路由的断言也会少。
**报告里要写清掉了多少个、分别来自哪** —— 删除单里"测试数掉了多少"是主要证据，
不是异常。

## 六、停止条件

- **删页面需要动左栏的平台分组。** 那说明配置面和展示面比量出来的耦合更紧，
  "删配置留展示"这条裁决就不成立。**停下来报告，不要顺手把展示面也删了。**
- **`PlatformAvatar` 的搬家需要改它的内部实现。** 它是纯展示组件；需要改就说明它
  和页面有共享状态，报告。
- **`keys-settings.tsx` 的排除逻辑需要改。** 它保留（消息凭据本来就不在设置里配）；
  如果删页面后它编译不过，报告——那说明它引用了被删的东西。
- **i18n 里找不到顶层 `messaging:` 段以外的东西。** 那就把你搜到的完整列表贴出来再删，
  别默认只有一处。
- **删完 `test:ui` 里出现失败的用例。** 失败的用例要么是断言了这条路由（跟着删或改），
  要么是别的东西坏了（停下来）。**这两种必须分清，不许一起改掉。**
- 不要读、改、stage `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
