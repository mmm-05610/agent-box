# UI 编排裁决

**这是什么。** 界面该长什么样的决定，一条一条记在这里。

**为什么要单独记。** 在此之前，这些决定只活在对话里——需要的时候要靠回忆往回拼，
拼出来的往往是"我以为你说过"。一份记下来的裁决可以被**推翻**（下面就有被推翻的），
但散在对话里的决定连被推翻的机会都没有，只会被忘掉。

**不在这里的。** 分层与目录归属的裁决在 `renderer-layer-batches/README.md`（决定 A 那一节）
和 `renderer-layer-status.md`。本文只记**产品与界面**的决定。

---

## 一、界面呈现的五层（不是目录树）

编排在这五层上进行。判据是"它在窗口里的第几层"，而这五层**代码里全都已经区分了**。
它描述运行时画面，不再用来给 `app/` 分目录；目录归属见裁决 7：

```
windows/     独立窗口          自己有 win= 分支，自己挂载          main.tsx
  └─ shell/     骨架            标题栏 · 状态栏 · 路由 · overlays   ContribController
       └─ panes/    格子        布局树里的 pane，可拖可关可分屏       pane 注册表 + 4 个预设
            └─ pages/   整页    顶掉 workspace 那一格的整页          APP_ROUTES 里非 overlay 的
                 └─ overlays/  盖住整窗的卡片                      OVERLAY_VIEWS（8 个）
```

两个从代码里读出来的事实，后面的裁决都要用到：

- **会话是 `workspace` 那一格的标签。** 页面不是标签，所以页面进来时那一格的标签条
  会收起来（`headerVeto`；注释原文 *Pages aren't tab-able*）。
- **页面本来就能变成一个 pane。** `app/chat/route-tile.tsx` 的 `openRouteTile(path)`
  把整页挂在主区**旁边**，生命周期和会话 tile 一样。所以"能不能拖出来并排看"不是一个
  待建机制，它已经在了。

---

## 二、裁决

| # | 日期 | 决定 | 状态 |
| --- | --- | --- | --- |
| 1 | 2026-09-12 | 消息平台**整体移除**——前端不再认识"平台"这个概念 | 已派单（batch 29） |
| 2 | 2026-09-12 | 能力管理（技能/工具集/MCP）**归设置**，不归工作视图 | 已定，未派单 |
| 3 | 2026-09-12 | `app/routes.ts` **留原地**——它是 rank 5 这一层的定义 | 已关闭 |
| 4 | 2026-09-12 | 不做**目标/任务一等对象** | 已定（现状已符合：目标模式在 `plugins/kanban`） |
| 5 | 2026-09-12 | **`pages/` 与 `overlays/` 不做目录层**——位置是路由数据里的一个值 | 已定，未派单 |
| 6 | 2026-09-12 | **插件路由要能声明模式**——今天只能注册"页" | 已定，属于扩展机制 |
| 7 | 2026-09-12 | **`app/` 只做组合根**——产品功能整棵退出到 `features/` | 已派单（batch 30） |

### 1 · 消息平台整体移除

**决定**：删掉消息平台的前端全部——配置面**和**适配面。前端不再认识任何一个平台。

**为什么**：不是"暂时不维护"。是**不想适配 hermes 的平台模型**——平台的连接方式
属于后端下一轮的设计，现在适配它等于白做。

**删的是什么**（比"一页"大得多）：

```
配置面    MessagingView + 路由 + 导航项 + 命令面板 + 快捷键 + i18n
适配面    MESSAGING_SESSION_SOURCE_IDS（20 个平台 id）
          platform-icon.tsx（12 个品牌图标 + 官方色值 + 单字母回退）
          左栏按平台分组的自管分区 + 会话行上的品牌徽标
          侧栏数据模型里的 messaging 切片（ListedSessionSlice）
```

**代价（已接受）**：`SIDEBAR_EXCLUDED_SOURCES` 是**前端过滤**的，删掉平台清单，
过滤条件跟着没了——**平台来的会话会和普通会话混在一个列表里**，不分区、无徽标。
它们不会消失，这是"不适配"该有的样子。

**保留（点名的）**：`api/messaging.ts` 整个（它是现有协议形状的记录，且 4 个函数是
webhook 的，webhook 页还在）· `app/webhooks/` · `keys-settings.tsx` 的凭据排除
（它的意思现在变成"无处可配"）。

### 2 · 能力管理归设置

**决定**：技能、工具集、MCP 的管理界面归设置，不占中区那一格。

**为什么**：设置是"这个系统怎么配"，能力管理是配置；技能库虽然要"逛"（搜索/预览/安装），
但它不是"工作的一个视图"——你在逛技能库时不需要左栏的项目树。

**已知的后果**：

- `pages/` 少一个成员，只剩产出物（→ 见第三节）
- **一处重复自动解决**：技能页的"插件"标签和设置里的插件面板读**同一个 store**
  （`@/store/agent-plugins`），前者是后者（超集）的子集 → 删子集，留超集
- **MCP 是例外**：它是**跨 harness** 的（codex/claude-code/opencode 都支持），
  其余是 hermes 专有。收进设置时 MCP 那块不能跟着 hermes 一起沉进 Extension

**未定**：收进设置之后，技能库那一块打开时**仍是自己的界面**（设置卡片里换内容），
还是压成设置里的一行行开关。倾向前者（它是"逛"的体裁）。

### 3 · `app/routes.ts` 留原地

63 行，35 个文件引用它，自己零依赖——**它是 `app/` 这一层最底的东西**。
内容全是"导航的时候还要顺手做什么"（镜像 `$workspaceIsPage`、把工作区切到前面），
那就是 rank 5 的定义。搬它等于把这一层的定义掏空。

`app/open-session.ts` 和 `app/session/hooks/session-context-drift.ts` 跟着留下：
它们够着的是一层**策略**，不是一个放错的模块。

### 4 · 不做目标/任务一等对象

**现状已经符合**：目标模式与目标卡在 `plugins/kanban` 里，不在核心。

这条同时确定了一件事：**"目标/进度"那个浮窗如果是插件的地盘，它就不该进核心的 pane 注册表。**
（浮窗本身还没做，见第三节。）

### 5 · `pages/` 与 `overlays/` 不做目录层

**决定**：`app/` 的顶层只按**机制**分层；"页"和"浮层"是路由数据里的一个值，不进目录名。

**为什么**（第三条是决定性的）：

1. **"是不是页"已经有唯一的家**——`lib/routes.ts` 的 `isWorkspacePageRoute` + `OVERLAY_VIEWS`。
   做成目录层，同一个事实抄两遍；不一致时你不知道该信哪个。
2. **裁决 1 和 2 之后，`pages/` 只剩产出物一个成员**（技能归设置、消息删掉、
   插件页不在 `app/` 里）。为一个成员建一层目录，收益是零。
3. **会变的东西不该进目录名。** 裁决 2 就是"技能从页变成设置的一部分"，
   那一行改在 `OVERLAY_VIEWS`。**若目录编码了位置，"把技能改成浮层"就变成一次目录搬家**——
   而它本该是一行。

**留下的概念**：页/浮层是真的，四处代码在实现它——`isWorkspacePageRoute`、`$workspaceIsPage`、
`headerVeto`、以及 `openRouteTile`（整页可以变成挂在主区旁边的 pane）。
**概念留在代码里，不进目录名。**

**唯一支持目录层的理由，以及它为什么不成立**：目录层让"哪些是整页"一眼可见。
但那张表**已经是一处完整的清单**（12 条 `APP_ROUTES` + 8 条 `OVERLAY_VIEWS` + 插件路由），
而目录会把它拆到四处。**一张表比一层目录好找。**

### 6 · 插件路由要能声明模式

**今天**：插件只有 `ROUTES_AREA` 一个路由 area，**一律当"页"处理**。
所以一个界面天然是"停下来说一件事"的插件（像设置那样的浮层）**做不了**，只能占掉中区一整格。

**决定**：路由贡献要带一个模式字段（`page` / `overlay`），内置路由和插件路由共用。
补上之后 `OVERLAY_VIEWS` 那张表并进路由数据，裁决 5 的"位置是一个值"才真正成立。

**为什么现在不做**：它属于**扩展机制**（和"通用扩展点 + 能力 gate"同一摊），
而那一摊还没定。**记在这里，别让它丢了**——否则下一轮定扩展机制时不会想起这个缺口。

**一个反面证据**：插件页今天拿到的是**一等公民待遇**——左栏一行（`SIDEBAR_NAV_AREA`）、
中区一整格、命令面板、状态栏、快捷键。设置里的分区一样都没有。
所以"插件页该不该进设置"的答案是明确的**不该**：进了设置，插件就永远做不了一等入口。

### 7 · `app/` 只做组合根

**决定**：`app/` 不再是所有界面的收纳箱，只回答三件事：应用如何组装、主窗口骨架如何呈现、
独立窗口如何挂载。产品功能整棵进入同为 rank 5 的 `features/`。

```text
app/
├── index.tsx
├── routes.ts
├── composition/
│   ├── root/ · wiring/
│   ├── registrations/ · routing/
│   └── bridges/ · dev/
├── shell/
│   ├── chrome/                      titlebar/statusbar/sidebar
│   ├── layers/                      overlay/palette/context-menu/tour 宿主
│   ├── hooks/                       全局键盘调度
│   └── platform/                    窗口宿主呈现
└── windows/
```

**为什么**：此前先后尝试按“窗口里的位置”、注册表、机制/功能来分 `app/`，每套分类都需要
对例外再次判断，结果目录方案不断变化。真正稳定的边界不是“显示在哪”，而是“这是应用组合，
还是被应用组合的产品功能”。页、浮层、pane 仍是运行时呈现方式，不再决定功能源码住址。

**内部裁决**：`composition/` 只保留选择实现并接线的代码，按 root、wiring、registrations、
routing、bridges、dev 六类组织；不能把 `contrib/` 整桶改名。Gateway boot、background sync、
session tile delegate、MCP 安装 Dialog 和具体 pane 是功能实现，迁到对应 `features/`。

**Shell 内部裁决**：Shell 只拥有主窗口 chrome 和公共 layer host，不拥有显示在这些 host 中的
产品内容。Command Palette 的聚合放 composition，Theme/Pet 命令跟 feature；Context Menu 由
composition 选择 sections，Shell 只呈现并管理通用 DOM/guest/shell 动作，Terminal section
下沉到 `features/right-sidebar/terminal/`。本批只拆清所有权，不继续设计通用贡献协议。

`chat/`、`session/`、`right-sidebar/`、`settings/` 的其余内部业务结构仍不在 batch 30 内决定；
它们先整棵搬入 `features/`。`features/` 本轮仍是 rank 5，不是新的业务核心层。

**执行**：batch [30](renderer-layer-batches/30-app-composition-root.md)。它在 17–29 全部
merged + reviewed 后独占运行，避免一次全树路径迁移踩正在施工的 UI 文件。

### 8 · `composition/routing` 复审修正

Batch 30 先按旧裁决把 `open-session`、`session-owner` 与
`session-rpc-dispatcher` 归进 `composition/routing`。独立语义复审后确认，这个分类把
“参与应用装配”误当成了“属于装配层”：三者分别实现 Session 打开策略、Session owner
解析和 Session-scoped request 编排，都是 `application/session` 用例。只有
`overlay-routing.ts` 是 UI composition routing。

因此 Batch 31 将前三组实现与测试原样下沉到 `application/session/`，不顺手改协议、行为或
词汇，也不把 dispatcher 强行并入已有 `request-router.ts`。后者负责选择并持有 owner transport，
dispatcher 负责在它之前解析目标 Session 与 owner；它们是相邻上下游。

Hermes/Gateway/RPC/品牌词汇另行保留为终端 Batch 34。它必须等
`composition`、`shell`、`windows` 及相关 product feature 的语义审阅全部完成并形成逐项词汇表后
才能派工，禁止执行者自行全局替换。兼容性名称（preload global、IPC channel、storage key、
持久化字段）必须与用户文案、代码符号分开裁决。

### 9 · Shell 只拥有机制，不拥有产品动作

语义复审确认 Batch 30 对 Shell 的第一层拆分仍不彻底：`use-keybinds.ts` 同时拥有全局事件
机制和全部 Session/Profile/Composer/Workspace 动作；Context Menu host/sections 直接访问
Hermes preload、Gateway topology、Preview 和更新动作；`run-tour.ts` 同时选择 app/preview 并
驱动产品 pane。这些都不是通用 Shell。

Batch 32 保留 Shell 的 keybinding listener/capture、menu host/model/DOM mechanics 与 Tour
engine/spotlight，把产品 action map、fallback menu content 和 Tour surface coordination 移到
composition registrations。所有现有行为不变，不引入新协议。Shell 本批不得再直接出现
`window.hermesDesktop`；整个 Renderer 与 preload 的兼容名迁移仍由终端 Batch 34 协调。

---

### 10 · 独立窗口只消费投影，不拥有 Session/Execution 流

**决定**：HUD、Pet、Quick Entry 都保留为通用产品界面，但 `app/windows/` 只接收
ViewModel、发出用户 Intent、调用中性窗口宿主端口。它不认识 Harness 实现、Gateway、后端
Ref、cursor、resume 或消息流所有权。

**为什么**：同一 Session 同时显示在主窗口、HUD 和 Pet 是正常的多视图产品能力；异常的是
Hermes Gateway 的单 WebSocket/`resume` 限制泄漏到 `hud/handoff.ts`，迫使窗口之间“抢流”。
AgentBox Work Core 更适合持有持续 Execution、事件账本、replay/live fan-out 和后台 Ref，各窗口
只是并发消费者。详细决策见
[`session-multi-surface-ownership.md`](session-multi-surface-ownership.md)。

**代价**：当前 Hermes 的 resume/socket 转移行为在 Direct Hermes 退役前仍需兼容，但只能藏在
legacy adapter/port 实现后面；本轮不发明 AgentBox wire 协议。UI 可以有不透明 `id` 用于
React identity 和选择，不得把它提升成 Ref/capability/revision/native continuation。

**结构结果**：Batch 33 将 Quick Entry 变成通用 Prompt surface，将 Pet 变成只读 Activity
projection，将 HUD 变成 compact Session surface；通用焦点/可见性/选择/草稿协调下沉到
`application/session`，窗口 mechanics 留在 `app/windows`。原终端词汇批次顺延为 Batch 34。

---

### 11 · 固定产品对象只有 Workspace、Session 与 Profile

**决定**：固定主导航只有 Workspaces 与 Profiles。Session 按当前 Workspace 归组但可在活动
之间切换 Workspace；Profile 是用户选择的独立角色，也是独立管理 Surface。完整语义地图见
[`app-product-semantics.md`](app-product-semantics.md)。

**Connection** 不是独立或共享资源：每个 Remote Workspace 私有持有一个逻辑 Connection，
创建、编辑、验证、诊断都从该 Workspace 进入；删除 Settings > Connections 产品面。后端可以
透明复用物理 channel，但不能把共享关系重新暴露给产品。

**Harness 与 Execution 均弱化到后台**：Harness 只是 Profile 执行时使用的工具台，名称可以在
Profile Picker 中作为分组/`powered by` 信息出现，但没有独立管理页；Execution 只作为 Work
Core 事实存在，UI 以 Session 的 ready/working/waiting/failed/stopped 状态表达活动。

**Profile 的双面语义**：用户看到可复用角色；后端持有静态、完整的 Harness-home blueprint。
Session 内 model 等修改是 Session-local override，不隐式反写 Profile；独立管理的 Skill、Memory、
Tool、Credential 等资源由 Work Core 动态装配。跨 Profile/Harness 切换策略和错误由后端权威
处理，产品组件只提交稳定意图并消费结果。

**入口边界**：Git/Worktree/Files/Terminal/Browser 是 Workspace 上下文；Transcript、Composer、
Artifacts 是 Session 上下文；Skills/Memory/Tools/Permissions 是 Profile 上下文。其他插件按
pane、section、overlay、command 或必要时 navigation page 动态贡献。Settings 只保留应用级偏好。

**下一步**：先把现有 route、sidebar、command、context menu、Settings 和独立窗口逐项归入
上述分类，再写实施批次；本裁决本身不授权移动或删除代码，也不授权全局词汇替换。

---

## 三、待裁决

按"卡在哪"排，不按重要性。

| 问题 | 卡在哪 |
| --- | --- |
| **右栏四项**（辅助对话 / 审查 / 终端 / 浏览器） | 横跨两个目录：`right-sidebar/`（files·review·terminal，6,148 行）和 `chat/right-rail/`（浏览器，5,039 行）。要合并成一个 dock |
| **浮窗**（Git 工具 + 目标/进度） | pane 引擎支持浮动（`floating-*`），但这个浮窗没有。而且它装的两样东西分属不同归属（Git 是工作台能力，目标/进度是插件） |
| **辅助对话** | 后端有 `prompt.btw`，前端没有面板。它是只读的、共享工作区、父会话保留写权限 |
| **产出物归哪** | 它是"助手产出过的文件与图片"，既不是配置也不是对话。大概是 overlay |
| **子代理作为组合单位** | 有子代理可见性，但不成"单位"（名字/工具/提示词/模型/effort） |
| **项目 = 连接 × 目录，远端同形** | 连接相关存在，但项目身份没有统一 |

---

## 四、被推翻的

**"消息归配置"（2026-09-12，早于裁决 1）。** 当时的推理是：消息页是平台开关 + 配对白名单，
按"配置归设置"的判据该进设置。

**当天被裁决 1 取代。** 推翻它的理由不是"这个推理错了"，而是**问题的层次变了**：
原来的问题是"它该放哪个位置"，后来的问题是"这个功能现在要不要"。
*放对位置的代价，永远小于先放对再删掉。*

---

## 五、怎么更新这份文件

1. 新裁决加在第二节的表里，格式照旧：**决定**（一句话）、**为什么**、**代价**、**保留了什么**。
   "为什么"不能省——半年后判断这条还成不成立，靠的就是它。
2. 裁决之间冲突时，**不要改旧的那条**，在第四节记一条"被谁取代、为什么"。
   一份会被悄悄覆盖的裁决表，比没有裁决表更糟。
3. 待裁决的问题在第三节有归属；定下来之后从这里搬进第二节。
4. 每一条都写清它**推翻了哪个现状**——否则执行者不知道要动什么。
# Workspace sidebar ruling — 2026-09-13, work order 36

Supersedes the four-step onboarding and split PROJECTS/REMOTE presentation of 35, not its
host capability. Keep Profile/角色 near the top and keep pinned sessions as shortcuts to
original sessions. Remove Sessions/Bots tabs, global Capabilities/Artifacts and the bottom
utility strip. Settings hosts secondary retained capabilities. Local/WSL Workspaces are
one peer list, not two sections. Add offers open folder/open remote folder; choose directory
to finish, no naming/confirmation page. Only WSL exists, so omit connection-type step;
connecting is a loading state. Rename/remove live in row menus; removal never deletes files
or history. Private connection details/reconnect belong to the Workspace. No fake remote
Session, no group chat, no new execution/backend. See [36](renderer-layer-batches/36-workspace-sidebar-product.md).

# WSL-first implementation ruling (historical; flow amended by 36)

The owner authorizes work order [35](renderer-layer-batches/35-wsl-workspace-round1.md)
as the only executable next round for a new session. Follow the supplied Zcode flow:
add project → remote connection → select WSL → distribution/user → connect → browse
Linux directories → choose directory. Local and remote Workspaces are sidebar peers;
each remote Workspace owns a private logical Connection. Reuse the real Desktop UI.
Implement only WSL Workspace first; thin Codex service and eventual Work Core orchestration
are later rounds. Electron may own temporary local Workspace metadata for this first
round; it must not take ownership of future Harness execution. Batch 34 and previews stay
paused. The implementation branch is not automatically merged into main.
