# Batch 30 — `app/` 收口为组合根，产品功能整棵退出

**Edges paid off: 0.** 账本前后都是 **0**。

> 这是一个**终端结构批次**，不是新的业务重构。
>
> 它必须在 17–29 全部 merged + reviewed 后单独执行。那些批次正在移动
> `app/chat`、`app/session`、`app/settings`、`app/starmap`、`app/right-sidebar`
> 和 `app/contrib` 里的文件；提前做本单会让它们的路径、测试和碰撞清单全部失真。

## 一、这张单解决什么

今天的 `app/` 同时装着四种东西：

```text
app/                                      632 个 TS/TSX · 163,701 行（派单时实测）
├── contrib/ · gateway/                   应用组合和运行时接线
├── shell/ · overlays/ · command-palette/ 应用骨架
├── hud/ · pet-overlay/ · quick-entry/    独立窗口入口
└── chat/ · session/ · settings/ · …      具体产品功能
```

所以“这是应用组合代码”与“这是某项产品功能”无法从位置判断。决定已经作出：

> **`app/` 只拥有最高层组合。** 它回答应用如何启动、如何组装、如何挂载；
> 它不再充当所有产品界面的总目录。

本单只把这个边界做实。产品目录先**整棵**进入 `src/features/`；不在本单里继续讨论
`chat/`、`session/`、`right-sidebar/` 内部的最终切法。

## 二、终态树（验收接口）

```text
apps/desktop/src/
├── app/                                      ✓ 只剩组合根
│   ├── index.tsx                             应用入口
│   ├── routes.ts                             rank-5 路由/工作区呈现策略
│   ├── routes.test.ts
│   ├── routes.workspace-reveal.test.ts
│   ├── composition/                          只做应用装配，不收留功能实现
│   │   ├── index.ts                          唯一公开入口
│   │   ├── root/                             顶层控制器与 Provider 树
│   │   ├── wiring/                           feature/action 的静态接线
│   │   ├── registrations/                    surface/pane/chrome/host-view 注册
│   │   ├── routing/                          session/runtime 所有权选择
│   │   ├── bridges/                          Electron 宿主能力接入 React 生命周期
│   │   └── dev/                              只服务装配层的开发演示
│   ├── shell/                                主窗口公共骨架；不拥有产品菜单内容
│   │   ├── chrome/                           titlebar/statusbar/sidebar
│   │   ├── layers/                           overlay/palette/context-menu/tour 宿主
│   │   └── platform/                         窗口尺寸与宿主平台呈现
│   └── windows/                              独立窗口挂载入口
│
├── features/                                 ◀ 产品功能；本批只整棵搬，不内部重构
│   ├── agents/
│   ├── artifacts/
│   ├── chat/
│   ├── command-center/
│   ├── cron/
│   ├── learning/
│   ├── pet-generate/
│   ├── profiles/
│   ├── right-sidebar/
│   ├── runtime/                              Runtime 连接/重连功能，不在 composition 实现
│   ├── session/
│   ├── session-import/
│   ├── settings/
│   ├── skills/
│   ├── starmap/
│   ├── webhooks/
│   └── logs/                                 日志 pane；具体 UI 不是装配代码
│
├── application/                              ✓ 本批不重新设计
├── store/                                    ✓ 本批不重新设计
├── api/                                      ✓ 本批不重新设计
├── components/                               ✓ 只接收下面点名的 3 个通用 hook
├── extension/ · plugins/                     ✓ 插件边界不变
└── lib/ · types/ · i18n/ · themes/           ✓ 基础层不变
```

**`features/` 在本批仍是 rank 5。** 这是把“组合”与“产品功能”分开，不是把产品功能
下沉成新的业务层。`features/chat` 是否还要拆成 conversation/sessions/browser，
`features/session` 里哪些还该进入 `application/`，都属于下一轮；本单不替维护者决定。

`composition/` 的判断式只有一个：**它是在选择实现并接线，还是在实现功能？** 前者留下，
后者必须去对应 feature/application。高 fan-out 对组合根是正常的；反向由
`features/application/store/shell → composition` 导入则是结构错误。

## 三、移动清单

所有目录使用 `git mv`；除 import/mock 路径和记录旧路径的注释外，文件内容保持不变。
测试跟着被测模块走。

### A · 产品功能整棵离开 `app/`

| 从 | 到 |
| --- | --- |
| `app/agents/` | `features/agents/` |
| `app/artifacts/` | `features/artifacts/` |
| `app/chat/` | `features/chat/` |
| `app/command-center/` | `features/command-center/` |
| `app/cron/` | `features/cron/` |
| `app/learning/` | `features/learning/` |
| `app/pet-generate/` | `features/pet-generate/` |
| `app/profiles/` | `features/profiles/` |
| `app/right-sidebar/` | `features/right-sidebar/` |
| `app/session/` | `features/session/` |
| `app/session-import/` | `features/session-import/` |
| `app/settings/` | `features/settings/` |
| `app/skills/` | `features/skills/` |
| `app/starmap/` | `features/starmap/` |
| `app/webhooks/` | `features/webhooks/` |

`app/messaging/` **不在表里**：batch 29 先把它删除。若执行本单时它仍存在，说明前置
未完成，停止；不要搬到 `features/messaging/` 来绕过删除裁决。

本节派单时实测 **505 个 TS/TSX、134,320 行**；17–29 落地后数字会下降。
执行者报告实际移动数字，不把这里的派单快照当验收数字。

### B · `composition/` 不是改名后的 `contrib/`

本节覆盖派单时实测的 **36 个 TS/TSX、12,420 行**。不允许把 `app/contrib/` 整桶改名；
先按职责落位，明显在实现功能的文件移出组合根。

```text
app/composition/
├── index.ts                              唯一公开入口
├── root/
│   ├── app-composition.tsx               顶层控制器；原 controller.tsx
│   └── context.tsx                       已装配 Wiring API 的窄 Context
├── wiring/
│   ├── features.tsx                      feature/action 接线；原 wiring.tsx
│   ├── types.ts                          Wiring API
│   └── latest-actions.ts                 防止注入过期 action
├── registrations/
│   ├── surfaces.tsx                      route/sidebar/statusbar surface 注册
│   └── chrome-contributions.tsx          statusbar/titlebar contribution 接线
├── routing/
│   ├── open-session.ts                   应用级打开会话策略
│   ├── session-owner.ts                  原 wiring-routing.ts
│   └── session-rpc-dispatcher.ts         请求派给正确 session/runtime owner
├── bridges/
│   ├── desktop-filesystem.ts             原 use-desktop-fs-connection.ts
│   ├── desktop-integrations.ts           原 use-desktop-integrations.ts
│   ├── pet-window.ts                     原 use-pet-bridge.ts
│   └── quick-entry-window.ts             原 use-quick-entry-bridge.ts
└── dev/
    └── credits-notice-demo.ts
```

精确移动表：

| 从 | 到 |
| --- | --- |
| `app/contrib/index.ts` | `app/composition/index.ts` |
| `app/contrib/controller.tsx` | `app/composition/root/app-composition.tsx` |
| `app/contrib/context.tsx` | `app/composition/root/context.tsx` |
| `app/contrib/wiring.tsx` | `app/composition/wiring/features.tsx` |
| `app/contrib/types.ts` | `app/composition/wiring/types.ts` |
| `app/contrib/latest-actions.ts` + test | `app/composition/wiring/latest-actions.ts` + test |
| `app/contrib/surfaces.tsx` + test | `app/composition/registrations/surfaces.tsx` + test |
| `app/contrib/wiring-routing.ts` + test | `app/composition/routing/session-owner.ts` + test |
| `app/contrib/session-rpc-dispatcher.ts` + test | `app/composition/routing/session-rpc-dispatcher.ts` + test |
| `app/open-session.ts` + test | `app/composition/routing/open-session.ts` + test |
| `app/host-views.ts` | `app/composition/registrations/host-views.ts` |
| `app/contrib/hooks/use-desktop-fs-connection.ts` | `app/composition/bridges/desktop-filesystem.ts` |
| `app/contrib/hooks/use-desktop-integrations.ts` + test | `app/composition/bridges/desktop-integrations.ts` + test |
| `app/contrib/hooks/use-pet-bridge.ts` | `app/composition/bridges/pet-window.ts` |
| `app/contrib/hooks/use-quick-entry-bridge.ts` | `app/composition/bridges/quick-entry-window.ts` |
| `app/contrib/dev/credits-notice-demo.ts` | `app/composition/dev/credits-notice-demo.ts` |

保留现有导出名和 hook 名；目的地文件名可以更准确，但本批不重写函数体。
`app/index.tsx` 改为从 `./composition` 导出组合控制器。不要保留旧 `app/contrib`
转发目录，不要新增兼容 barrel。

### B2 · 伪组合代码必须迁出

这些文件之所以被原 `contrib/wiring` 调用，并不代表它们属于组合根。组合层只调用它们，
不拥有它们的算法或 UI。

| 从 | 到 | 理由 |
| --- | --- | --- |
| `app/gateway/` | `features/runtime/gateway/` | 1,265 行 boot/reconnect 状态机是 Runtime 连接功能；composition 只调用 `useGatewayBoot` |
| `app/contrib/hooks/use-background-sync.ts` + 4 tests | `features/session/sync/background-sync.ts` + tests | 915 行 transcript/live-session 同步算法，不是静态接线 |
| `app/contrib/hooks/use-session-tile-delegate.ts` + test | `features/session/tiles/use-session-tile-delegate.ts` + test | 449 行 tile resume/submit/interrupt 行为属于 Session feature |
| `app/contrib/mcp-install-deeplink-dialog.tsx` | `features/skills/mcp-install-deeplink-dialog.tsx` | 具体 MCP 安装确认 UI；composition 只挂载 |
| `app/contrib/panes.tsx` 中 `LogsPane` | `features/logs/logs-pane.tsx` | 读取并渲染日志的具体功能 |
| 同文件中 `FilesPane`、`ReviewPaneContent` | `features/right-sidebar/panes/{files-pane,review-pane}.tsx` | 文件树与 Git review 的具体 surface |
| 同文件中 `$restartPreviewServer` | `features/chat/right-rail/restart-preview-server.ts` | Preview feature 的临时 bridge，不是 chrome 注册 |
| 同文件其余 contribution hooks/setters | `app/composition/registrations/chrome-contributions.tsx` | 只负责把 feature 数据接进 titlebar/statusbar registry |

拆 `panes.tsx` 时只搬现有声明和 import，不改变 registry id、atom 实例、query key、pane render、
statusbar/titlebar contribution area 或调用顺序。拆完旧文件必须删除。

`features/runtime/gateway` 是现有 Hermes Gateway 实现的临时产品归属，不是新的通用协议层。
本批不把它改写成 ACP，也不把 Hermes 类型改名伪装成通用类型；后续 Harness Port 切片再替换。

> **Independent semantic-review correction (2026-09-13):** Batch 30 preserves its
> historical move and validation record, but `routing/` is not the final owner of all
> three Session helpers. Batch 31 moves `open-session`, `session-owner` and
> `session-rpc-dispatcher` to `application/session/`; only `overlay-routing` remains
> composition-owned. The correction is a later work order rather than a rewrite of
> Batch 30's already-built scope.

### C · `shell/` 只保留主窗口公共骨架

派单时这组候选合计约 **58 个 TS/TSX、11,822 行**。不能整桶塞进 `shell/`：其中既有
公共容器，也有 Profile、Session、Runtime、Update 等产品内容。终态按“去掉任意 feature 后
是否仍然成立”判断：成立的是 shell；只服务某项业务的是 feature；决定把两者接起来的是
composition。

```text
app/shell/
├── chrome/
│   ├── titlebar/                         窗口标题与窗口按钮
│   ├── statusbar/                        状态栏容器、显隐和通用菜单
│   ├── sidebar/                          侧栏 chrome
│   └── group-setter.ts                   shell 布局分组控件
├── layers/
│   ├── overlays/                         overlay chrome/panel/split-layout 宿主
│   ├── command-palette/                  palette host/model/highlight/status-row
│   ├── context-menu/                     menu host/store/target + 通用 DOM/guest/shell sections
│   └── tour/                             应用导览层
├── hooks/
│   └── use-keybinds.ts                   全局应用键盘调度
└── platform/
    └── use-window-controls-overlay-width.ts
```

#### C1 · 纯 Shell 文件原地归整

| 从 | 到 |
| --- | --- |
| `app/shell/titlebar-controls.tsx` | `app/shell/chrome/titlebar/controls.tsx` |
| `app/shell/titlebar-icon.tsx` | `app/shell/chrome/titlebar/icon.tsx` |
| `app/shell/statusbar-controls.tsx` 及显隐/菜单测试 | `app/shell/chrome/statusbar/` |
| `app/shell/sidebar-label.tsx` | `app/shell/chrome/sidebar/label.tsx` |
| `app/shell/group-setter.ts` | `app/shell/chrome/group-setter.ts` |
| `app/overlays/{overlay-view,overlay-chrome,overlay-split-layout,panel}*` | `app/shell/layers/overlays/` |
| `app/tour/` | `app/shell/layers/tour/` |
| `app/shell/hooks/use-window-controls-overlay-width.ts` | `app/shell/platform/use-window-controls-overlay-width.ts` |
| `app/hooks/use-keybinds.ts` | `app/shell/hooks/use-keybinds.ts` |

这些 overlay 文件只提供公开容器合同，不决定显示哪个产品浮层。feature 可以消费这个窄
Shell UI 合同，但不得反向导入 shell 的内部 store、注册或路由。

#### C2 · Command Palette：宿主与命令内容分开

| 从 | 到 | 理由 |
| --- | --- | --- |
| `app/command-palette/index.tsx` | `app/shell/layers/command-palette/host.tsx` | palette 打开、关闭、键盘与渲染宿主 |
| `palette-model.ts`、`contrib.ts`、highlight watcher、status row | `app/shell/layers/command-palette/` | 通用 palette model、贡献入口与 chrome |
| `body.tsx`、`palette-sources.ts`、聚合 helpers | `app/composition/registrations/command-palette/` | 它们知道全部产品 feature；是组装，不是 shell |
| marketplace theme command page | `features/theme/command-palette/` | Theme 功能内容 |
| pet command page | `features/pet-generate/command-palette/` | Pet 功能内容 |

本批只拆宿主和已有内容，不建立新的插件式 command contribution 协议；各 feature 的更细
注册机制留给下一轮。宿主不得 import `features/`，由 composition 把内容交给宿主。

#### C3 · Context Menu 设计结：本批先拆所有权，不深拆业务

今天 `app/context-menu/app-context-menu.tsx` 一文件同时拥有 menu host、DOM target 解析、
通用浏览器菜单、Shell 命令和 Terminal 菜单。本批把这个结拆成三方：

```text
app/composition/registrations/
└── context-menu.tsx                       选择 sections，交给 Shell host
    ├── imports app/shell/.../context-menu ✓ 宿主
    └── imports features/right-sidebar/
        terminal/context-menu-sections     ✓ 产品内容

app/shell/layers/context-menu/
├── host.tsx                               菜单呈现、键盘、关闭生命周期
├── item.tsx                               通用 menu item renderer
├── store.ts                               open/close 与当前位置状态
├── target.ts                              DOM target 归一化
├── dom-sections.tsx                       link/image/editable/selection 通用动作
├── guest-sections.tsx                     embedded guest 通用动作
└── shell-sections.tsx                     new window/palette/settings/tab chrome

features/right-sidebar/terminal/
└── context-menu-sections.tsx              terminal copy/paste/clear 等产品内容
```

`AppContextMenu` 的最终组装迁到 `composition/registrations/context-menu.tsx`；Shell host
接收已经选好的 sections，不认识 Terminal。Terminal section 整段下沉，保持 action id、顺序、
enabled/visible 条件和快捷键不变。Update action 若当前与 `shellSections` 紧耦合，本批允许作为
一个已命名的 registration callback 从 composition 注入；不得让 Shell 直接 import Update feature。

**停止边界**：这一步只消除 ownership knot。不要趁机把 dom/guest sections 再抽成新的通用
插件协议，也不要重写 context-menu 数据模型；等进入各 feature 时再继续拆其内部实现。

#### C4 · 原先被误判为 Shell 的内容下沉

| 从 | 到 |
| --- | --- |
| `app/master-detail.tsx`、`app/page-search-shell.tsx` | `components/layout/` |
| `app/model-picker-overlay.tsx`、`model-visibility-overlay.tsx`、`shell/model-menu-panel*` | `features/profiles/` |
| `app/session-picker-overlay.tsx`、`session-switcher.tsx`、`shell/{context-usage-panel,use-context-breakdown}*` | `features/session/` |
| `app/shell/{approval-mode-menu,gateway-menu-panel,use-status-snapshot}*` | `features/runtime/` |
| `app/shell/system-resources-statusbar.tsx` | `features/system/` |
| `app/updates-overlay.tsx` + blocker test | `features/updates/` |
| `app/shell/hooks/use-statusbar-items.tsx` | `app/composition/registrations/statusbar-items.tsx` |
| `app/shell/live-duration.tsx` | `components/ui/live-duration.tsx` |
| `app/shell/hooks/use-overlay-routing.ts` | `app/composition/routing/overlay-routing.ts` |

上述目的地在本批只要求职责归位；若 `features/system` 或 `features/updates` 尚不存在，可以创建。
不继续拆这些 feature 的内部结构，不改行为，也不为了消除 import 而复制 store 或业务算法。

### D · 独立窗口统一入口

| 从 | 到 |
| --- | --- |
| `app/hud/` | `app/windows/hud/` |
| `app/pet-overlay/` | `app/windows/pet/` |
| `app/quick-entry/` | `app/windows/quick-entry/` |

同步更新 `src/main.tsx` 的三个动态入口和 perf probe 路径。不要改变 `win=` 参数、
挂载时机、lazy chunk 边界或窗口行为。

### E · `app/hooks/` 逐个归属，不整桶换名字

| 文件 | 到 | 为什么 |
| --- | --- | --- |
| `use-keybinds.ts` | `app/shell/hooks/` | 全局应用键盘调度，是 shell 接线 |
| `use-debounced.ts` | `components/hooks/` | 纯 React 通用 hook，两个视图消费 |
| `use-refresh-hotkey.ts` | `components/hooks/` | 多个功能页复用的呈现交互 |
| `use-route-enum-param.ts` | `components/hooks/` | 多个 tabbed view 复用的路由 UI hook |
| `use-config-record.ts` | `application/config/use-config-record.ts` | 共享后端配置 query/cache，用例级状态，不是 app 组合 |

只有最后一项进入下层，但边界已经由代码证明：它只消费 `api/`、`lib/`、`types/`，
不依赖任何 `app/`/`components/`。不要借机重命名 Hermes 配置语义或改 query key。

### F · 根上只留四个文件

```text
app/index.tsx
app/routes.ts
app/routes.test.ts
app/routes.workspace-reveal.test.ts
```

`routes.ts` 当前是 rank-5 路由策略，已有裁决要求保留。**本单不下沉、不拆它。**
移动后的 `features/` 可以继续消费这个 rank-5 策略；是否建立更窄的 navigation port，
留到下一轮依赖讨论。本单不得用 re-export 或额外 facade 假装已经解决。

## 四、引用改写纪律

1. 覆盖 `import`、`import()`、`require()`、`vi.mock()`、副作用 import 和测试夹具中的路径。
2. 优先改成 `@/features/...`、`@/app/composition/...`、`@/app/shell/...`、
   `@/app/windows/...`；同一小目录内部可以继续相对引用。
3. 不留旧路径转发文件或 re-export 目录。旧路径必须不存在。
4. 不改导出名、函数签名、组件 props、store key、route id、贡献 id、lazy/eager 边界。
5. 路径注释同步更新；产品说明和测试断言不改写。
6. `features/` 加入层序定义，和 `app/` 同为 rank 5；账本仍为 0。
7. 不新增“读取源码文本来断言路径”的 Vitest。仓库根 `AGENTS.md` 明确禁止。
   结构边界进入现有架构配置/ledger 或 ESLint `no-restricted-imports`，不写 regex 源码测试。
8. `composition/` 可以导入其他 renderer 层；`features/application/store/shell/components` 不得
   反向导入 `@/app/composition`。只有 `app/index.tsx` 可启动组合根。
9. `composition/` 中不得保留 API 轮询、重连算法、session action 实现或具体 feature pane。

## 五、执行顺序与提交边界

本单独占执行，不开并行工作树。它的 import 改写面覆盖整个 renderer，并行只会制造
假冲突和半迁移测试失败。

```text
30.0  前置审计：17–29 全部 merged + reviewed；基线数字落盘
30.1  features/ 整棵迁移                         一个提交
30.2  伪组合代码移入 runtime/session/skills 等 feature  一个提交
30.3  composition/{root,wiring,registrations,routing,bridges}  一个提交
30.4a shell chrome/layer host 抽出；Context Menu 三方拆结  一个提交
30.4b 被误放在 shell 的产品内容下沉 + windows/ 迁移       一个提交
30.5  hooks 逐个归属 + 层序/文档更新              一个提交
30.6  全量验收 + reviewer + status                一个提交
```

阶段提交是为了让路径迁移可定位，不是允许交付半成品。中间提交可以暂时不 typecheck；
每一阶段结束前必须修到 typecheck green，30.5 以前不得对外标完成。

## 六、验证

开工前记录实际基线；不要背派单时的 776/7466，因为 Zcode 正在吸收 17–29。

```bash
cd apps/desktop
npm run typecheck
npm run test:ui
npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts
npm run ledger:layers
npm run lint
git diff --check
```

迁移完成后再跑同一组，且：

```bash
find src/app -maxdepth 1 -mindepth 1 -printf '%f\n' | sort
# 除 colocated tests 外，只能看见：composition index.tsx routes.ts shell windows

test ! -e src/app/chat
test ! -e src/app/session
test ! -e src/app/settings
test ! -e src/app/contrib
test ! -e src/app/gateway
test ! -e src/app/composition/panes.tsx
test ! -e src/app/context-menu/app-context-menu.tsx

rg -n "@/app/(chat|session|settings|contrib|gateway|hud|pet-overlay|quick-entry|command-palette|context-menu|overlays|tour)(/|')" \
  src --glob '*.{ts,tsx}'
# 必须零命中

rg -n "@/app/composition" src/features src/application src/store src/components src/app/shell \
  --glob '*.{ts,tsx}'
# 必须零命中
```

测试数应与开工基线一致，**只有 batch 29 已登记的删除量例外**；本单本身不删测试，
所以不能用“只是搬目录”解释任何额外下降。

最后由独立 reviewer：

- 对照本单的终态树检查每个一级目录；
- 检查 `composition/` 只有 root/wiring/registrations/routing/bridges/dev 六类职责，且
  background-sync、gateway boot、session tile delegate、MCP dialog 和具体 panes 均已迁出；
- 检查 Shell 只含 chrome、公共 layer host、全局 keybind 和平台窗口呈现；Profile、Session、
  Runtime、Update、System 内容均已下沉；
- 检查 Context Menu 由 composition 组装、Shell host 不 import Terminal、Terminal section
  已归 `features/right-sidebar/terminal`，并且 action id/顺序/条件无变化；
- 抽查 `git diff --find-renames=90%`，证明绝大多数是 rename + import path；
- 核对没有旧路径 shim、没有新行为、没有未登记的测试下降；
- 自己重跑 typecheck、test:ui、层序守卫、ledger、lint、diff-check；
- 把实测文件数、行数、测试数和 commit 写入 status。

## 七、停止条件

- 17–29 任一仍未 merged/reviewed，或 status 与 Git 历史冲突。
- 整棵移动某目录需要改函数体、props、状态结构、route/contribution id 或运行时行为。
- 将伪组合代码迁出时发现目标 feature 需要导入 `app/composition` 才能工作。
- 为了让 `features/` 编译，需要新增低层 → `app/composition|shell|windows` 依赖。
  已存在的 `app/routes`/`app/open-session` 路径只做等价 repoint，不趁机扩大。
- 某个目录无法判断是组合还是产品功能。报告具体文件，不自创第三种垃圾桶。
- `features/` 被迫拆分 `chat/session/right-sidebar/settings` 才能通过。那是下一轮。
- 账本不再是 0，或需要改宽层序豁免。
- 测试断言需要变化（batch 29 已授权的删除除外）。
- 需要读取、修改或 stage 下列未跟踪工作：
  `src/agentbox/`、`src/plugins/agentbox-lab/`、
  `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。

## 八、验收状态名

只有终态树、完整验证和独立 review 全部成立，才写：

```text
APP_COMPOSITION_ROOT_GREEN
```

否则写 `APP_COMPOSITION_ROOT_PARTIAL`，逐项列出仍留在 `app/` 的业务目录；
不允许用“imports 已更新大半”代替终态。
