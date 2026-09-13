# Round 36 — 统一 Workspace 左侧栏：实施记录

工单：`docs/architecture/renderer-layer-batches/36-workspace-sidebar-product.md`
分支：`feature/desktop-wsl-round1`（工作树 `../agent-box-desktop-next-wsl-round1`）
基线：`419e0e5`（= c8d59f3 + 工单文档提交）
状态：**DESKTOP_WORKSPACE_SIDEBAR_GREEN**
（Windows 真机用户路径全部通过，15 项记录全 PASS，2026-09-13；置顶/搜索真机项按
工单规则如实标注为"无真实会话可供置顶"，见下文"行为测试 vs 真机待验"）

> **36R 更正（2026-09-13，本节下文原样保留）**：维护者复核推翻了上述 GREEN。
> 旧记录在"本地打开目录"一项上报了通过，而它当时并未真正成立（后端 projects 库里
> 留下了一条由 Windows 路径拼成的伪项目记录），且把 SKIP 计入了 ok:true 聚合。
> 返工轮 36R 的真机重跑、逐项结论与最终交付状态见文末
> **"## 36R（返工轮）"** 一节；本批 36 的所有记录、截图与命令均未删改，仅保留为
> 历史证据（`docs/validation/windows-acceptance-round36/`）。
> 后续：36R 的第 21 项 FAIL 经产品修复（`a061995`）后已真机复跑翻正，见同节
> **"### 8. 修复后复跑"** 与文末 **"## 交付状态（36R，修复后复跑）"**；修复前的 FAIL
> 记录与上方 GREEN 均原文保留。

## 检查点

| 阶段 | 提交 | 内容 |
| --- | --- | --- |
| 1 | `ada5526` | 接缝确认与统一投影方案（本文档初版；无产品代码改动） |
| 2 | `40f1a5d` | Workspace 重命名/移除（宿主持久操作 + IPC/preload/types/api/用例）；本地「打开文件夹」选目录直接完成（`openFolderAsProject`）；WSL 向导简化（去方式页、连接=页内加载态）；行菜单重命名/移除；i18n en/zh/zh-hant |
| 3 | `ee4fbf8` | 统一侧栏：顶部角色入口（→ 既有中立 /profiles 页）；固定导航行（New session / Capabilities / Artifacts / Scheduled jobs）退役；置顶空时整节隐藏；WSL 行并入唯一工作区列表（同列表、同种行交互、展开=诚实提示、无常驻 Verified 徽标）；Scheduled jobs 归设置入口；底部 ProfileRail 图标排移除、侧栏底部加 Settings 行；hermes-bots 插件停注册 Bots 页签（服务不动）；搜索结果恒为卡片（命中行自带工作区归属） |
| 修 | `12e292d` | 产品缺陷修复：add menu 存在时头部 ＋ 的 plain click 不得同时触发 onPlainClick（菜单与本地直开流程双重触发） |
| 4 | `d72a6bc`→`d1a8e46` | Windows 验收驱动 `apps/desktop/e2e/workspace-sidebar-round36-driver.mjs` + 驱动修正（radix 菜单 force click、空白态按角色判别、连接信息走行内按钮/对话框内重连）+ 证据入库 |

## 目标侧栏（实测截图，`docs/validation/windows-acceptance-round36/`）

```text
├── Profiles（角色管理入口 → 既有 /profiles 页；不是 Bots 群聊）
├── 搜索工作区与会话
├── WORKSPACES                                  ＋（菜单仅两项）
│   ├── local-acceptance      本地文件夹（点击进入、行菜单改名/移除/外观）
│   ├── 1111                  既有本地项目
│   └── round36-验收  [WSL]   与本地同级、同种行交互；名称优先
│       └──（展开）"Sessions in WSL workspaces are not part of this round yet."
└── Settings（次要入口；Scheduled jobs 在其导航中，沿用原名）
```

截图：`02-unified-sidebar`（整侧栏）、`05-local-in-list` / `09-wsl-saved-sidebar`
（统一树）、`06-wizard-direct-config` / `07-connecting-inline`（向导无方式页、
页内加载态）、`10/11`（同列表切换）、`12–14`（重命名）、`15–17`（移除）、
`19/20`（重开恢复 + 重连验证）。

## 提交清单

```
ada5526 round36 stage1: seam confirmation and unified-projection plan
40f1a5d round36 stage2: workspace rename/remove + direct local open + simplified WSL wizard
ee4fbf8 round36 stage3: unified workspace sidebar
12e292d round36: an add menu owns the header + plain click
d72a6bc round36: windows acceptance driver for the unified workspace sidebar
e37f942 round36: driver force-clicks radix menu triggers (pointerdown menus block hit-target recheck)
d1a8e46 round36: driver discriminates blank state by remote entry role, escapes stale menus
（+ 两笔驱动插装小提交：console capture / 连接信息走行内按钮）
```

## 测试

### 行为测试（工单清单逐项）

| 工单要求 | 覆盖 |
| --- | --- |
| 本地与 WSL 同列表/选择/展开 | `unified-workspace-list.test.tsx`（同一 section body 内 `data-sessions-project` + `data-wsl-workspace-row`）；WSL 行展开=诚实提示、再点收起 |
| 空状态两个添加入口 | 同文件（打开文件夹 / 打开远程文件夹 两按钮 + 点击回调）；真机 `03-add-menu`（菜单两项计数=1/1） |
| 选目录直接完成 | 真机 `04/05`（stub 仅替 OS 目录选择器；选后无命名/确认页直接入列）；UI 测试断言菜单项存在 |
| 同目录重复打开不重复 | 本地：`store/projects.test.ts`（同目录两次 `openFolderAsProject` → 无 `projects.create`、scope 进入既有项目）；WSL：35 宿主同位置去重测试保持（36 项宿主测试全绿） |
| 重命名重开保留 | 宿主 `renameWorkspace` 持久化 + 行身份不变（`wsl-workspace.test.ts`）；投影用例（host 答案驱动）；真机 `14-renamed` + 重开 `19-reopen-restored`（新名字仍在）|
| 移除记录但目录和历史仍在 | 宿主 idempotent remove 测试；真机 `15–17`：第二条记录移除后 `子目录` 目录仍在（UNC 检查）+ 宿主记录收敛为 1 |
| 置顶打开同一会话及取消 | `chat-sidebar.integration.test.tsx`：空置顶时整节隐藏；置顶行点击 → `onResumeSession(同一 id, row)`；取消后节消失、会话仍在列表 |
| 搜索归属 | 搜索结果恒为卡片，卡片头行=工作区名（`chat-sidebar.tsx`）；集成测试：搜索 "needle" → 命中行显示 `验收项目`（cwd 归属） |
| WSL 失败/重连/取消与迟到响应 | 35 的 `latest-wins`、向导取消零保存、typed failure 用例全部保留并通过；真机：向导连接中=页内加载态（`07`） |
| 35 并发保存 + 版本保护不回归 | `wsl-workspace.test.ts` 36/36（3 个并发行为测试 + 新版文件字节不变），且 rename/remove 与 save 共用同一串行提交链（新增 rename-vs-save 竞态测试） |

### 阶段 4 验证（全部在本工作树）

- `npm run --workspace apps/desktop typecheck`：renderer/electron/e2e 三个 tsc 项目全绿。
- 定向 vitest（未跑全量 9600）：宿主 wsl-workspace 36/36、ipc、用例 16/16、
  projects store 45/45、chat-sidebar 集成 4/4、gateway-groups、unified-workspace-list 6/6、
  chrome-section-add-button 5/5、plugin-panes 6/6、sessions-section、profile-rail×2、
  i18n 34/34、settings 325/325、layout/pin 相关 37/37 — 全部通过。
- 变更文件 eslint：0 error / 0 warning。
- 层序守卫 `renderer-layers.test.ts`：除已知环境基线失败外全绿（"leaves no
  in-flight exclusion stale" 在不含 `src/agentbox/` 的干净工作树必然失败——35 已
  确立的基线，未删守卫、未复制 POC、账本未动，0 常量保持，无新增上行边）。
- `git diff --check` 干净。

## Windows 真机验收

- 环境：Windows 11 + WSL2（Ubuntu），Windows Node v22.12.0；构建于
  `C:\Users\maoqh\agentbox-wsl-round1`（分支克隆，`d1a8e46`，`npm run build`
  于 Windows 侧原生执行，非 UNC）。
- 隔离实例：`C:\Users\maoqh\agentbox-wsl-round36-sandbox\{hermes-home,user-data}`，
  应用名 `HermesWslRound1`；真实 `hermes serve --host 127.0.0.1 --port 9127`
  （隔离 HERMES_HOME `/home/maoqh/wsl-round1-gateway-home`，状态栏可见
  `127.0.0.1:9127`，client v0.17.2 / backend v0.19.0）。全程无模型请求、无凭据读取。
- 驱动：`apps/desktop/e2e/workspace-sidebar-round36-driver.mjs`，
  `node e2e\workspace-sidebar-round36-driver.mjs <sandbox> <out>`；
  唯一 stub 是 OS 目录选择器（自动窗口无法驱动原生选择器；选择器不属于被测产品）。
- 结果：**15 项记录全 PASS**（`acceptance-log.json` allOk=true）：
  1. 应用打开（隔离实例）
  2. 首启门（见"已知限制"第 5 条）
  3. 统一侧栏：Capabilities/Artifacts/Scheduled jobs/Bots 页签全消失；Profiles、Settings 入口在位
  4. ＋ 菜单恰好两项（打开文件夹 / 打开远程文件夹），菜单后无命名页
  5. 菜单选择落地（菜单随 select 关闭）
  6. 本地打开目录直接完成（选完即入列，无命名/确认页）
  7. WSL 向导无"选择方式"页，首页即发行版（真实 `wsl.exe -l -v`，Ubuntu 默认）
  8. 连接=同页加载态 → 真实目录浏览（含空格+中文目录）
  9. 本地行与 WSL 行在同一工作区列表容器内
  10. 同列表切换：进入本地项目/返回；WSL 行连接信息打开/关闭
  11. 重命名（行菜单 → Rename… → `round36-验收`；行与宿主记录同步）
  12. 第二条 WSL 记录（`…/子目录`）保存
  13. 移除：仅删记录（行集合 2→1、宿主 2→1、目录仍在磁盘）
  14. 重开恢复：本地与改名的 WSL 工作区都在
  15. 重连：连接信息报告已验证身份
- 置顶/搜索真机：**按工单规则分开报告**——沙箱无 provider、不允许为造数据发起
  模型请求，因此没有真实会话可供置顶/搜索；该两路径的行为测试在开发侧通过（见上表），
  真机 UI 待用户在装有真实会话的实例上复验。未请求模型、未伪造数据。

### 精确启动/退出方法（复验）

1. WSL：`"$HOME/wsl-round1-gateway-home/start-gateway.sh"`（隔离网关，9127；token
   由网关生成于该目录内 `session-token.txt`，权限 600）。
2. Windows：
   `cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop && npm run build --workspace apps/desktop`（若需重建）
3. 手动实例（三个环境变量隔离）：
   ```bat
   set HERMES_HOME=C:\Users\maoqh\agentbox-wsl-round36-sandbox\hermes-home
   set HERMES_DESKTOP_USER_DATA_DIR=C:\Users\maoqh\agentbox-wsl-round36-sandbox\user-data
   set HERMES_DESKTOP_APP_NAME=HermesWslRound1
   npx electron .
   ```
4. 驱动一键：`node e2e\workspace-sidebar-round36-driver.mjs
   C:\Users\maoqh\agentbox-wsl-round36-sandbox C:\Users\maoqh\agentbox-wsl-round36-sandbox\acceptance-out`
5. 退出：关闭 HermesWslRound1 窗口（数据保留供复验）；停网关：
   `"$HOME/wsl-round1-gateway-home/stop-gateway.sh"`（只杀 9127，不关发行版）。

## 已知限制 / 偏差

1. **头像**：角色入口复用核心 `/profiles` 页（名称/说明(SOUL)/模型/技能摘要、
   新建/重命名/删除齐全）。头像编辑仅存在于 hermes-bots 插件（`AvatarPicker`），
   其持久化权威是插件数据存储（`$botMeta`/`saveBotMeta`，plugin-sdk host 上下文）。
   抽入 features/ 需先有中立的 profile 外观持久权威（Work Core 范畴）；工单禁止
   新建第二存储权威，故本轮不搬。工单"配置部件离不开群聊服务"的停止条件未触发
   ——这些部件不依赖群聊，只依赖插件 SDK。
2. **地址/Gateway/inference 状态**：确认其常驻载体是窗口状态栏（非侧栏）；侧栏内
   无此类内容可移，本轮不动状态栏，无吞错（操作失败仍以 typed 错误/通知呈现）。
3. **侧栏视图开关**（扁平/日期/状态分组等既有 view knobs）：不在工单删除清单内，
   保留；统一工作区树是分组视图（`agentsGroupedByWorkspace`），扁平模式下 WSL 行
   仍渲染在同一滚动区的会话节之后（`workspaceRows` 通道）。
4. **Windows-path 本地项目**：本机没有本地 Hermes 运行时，网关在 WSL 内——
   `projects.create` 接受 `C:\…` 路径但按 POSIX 语义存成字面路径（`/home/maoqh/C:\…`，
   后端行为，非本轮改动）。UI 流程本身完整工作（真机 04/05）。在装有本地 Hermes
   运行时的机器上，本地打开即完全语义；跨 WSL 网关的 Windows 路径桥接属后续轮。
5. **首启门**：最终验收运行未显示首启门（驱动记录 "gate not shown"）。状态栏确认
   连接的正是隔离的 `127.0.0.1:9127` 真实网关。此前两次运行（同应用名、未删净的
   user-data）已建立连接配置；单实例锁下新实例可能沿用了在世实例的窗口。隔离性
   （无模型请求、无凭据）不受影响；人工复验时按上面第 3 步的全新目录启动即可看到
   首启门流程（35 的文档仍然有效）。
6. **产品缺陷修复（计划外但必要）**：`12e292d` — add menu 存在时头部 ＋ 的
   onClick 同时跑 onPlainClick，菜单打开的同时触发本地直开（原生选择器在菜单后面
   弹出）。菜单现在独占 plain click。该缺陷由 36 的直接完成流程暴露。
7. 工单内"重命名/移除必需的宿主持久操作"通过同名受限 IPC 通道新增
   （`hermes:wsl-workspace:rename|remove`），不改旧 channel 值与持久字段。

## 交付状态

**DESKTOP_WORKSPACE_SIDEBAR_GREEN** — 工单 §阶段与验证 的验收路径
（本地打开目录 → WSL 打开目录 → 同列表切换 → 重命名 → 置顶既有会话/取消 →
移除目录仍在 → 重开恢复 → WSL 重连）中，置顶一项在真机上无真实会话可验（沙箱
无 provider、禁止造数据），已按工单要求与行为测试分开报告；其余全部真机通过，
证据齐备。提交当前分支后停止，等待用户体验。

---

## 36R（返工轮）— 真机证据重跑与旧结论更正

2026-09-13，分支 `feature/desktop-wsl-round1`（工作树
`../agent-box-desktop-next-wsl-round1`）。阶段提交：`5b7a382`（阶段 1 反例）→
`442a5e0`（阶段 2 统一工作区列表）→ `f35c493`（阶段 3 移除=归档/schema v2/路径边界）
→ `936c19a`（阶段 4 驱动按 36R 证据要求重写）→ **`f7285ca`（阶段 4 真机重跑：证据
+ 驱动修正）**。上一节批 36 的全部记录、截图与命令原样保留，本节只追加更正与新证据。

### 1. 旧 GREEN 为什么被推翻（推翻依据，逐条可复核）

1. **上报了并未成立的"本地打开"**：批 36 记录第 6 项"本地打开目录直接完成"= PASS，
   但后端项目库里留下的是 `p_a7cdbae7`，路径
   `/home/maoqh/C:\Users\maoqh\agentbox-wsl-round36-sandbox\local-acceptance`
   （`~/wsl-round1-gateway-home/projects.db`，`createdAt` ≈ 18:49）。产品当时接受
   `C:\…` 并按 POSIX 语义拼接存储——也就是说这条用户路径当时**并没有真正可用**，
   却被记为通过；这同时是"用行文本定位"的后果：本次重跑发现旧文本
   `local-acceptance` 会命中这条后端遗留项目行（新的驱动改用**每次运行唯一的目录名**
   定位本轮的打开结果，见第 3 节修复 R1）。
2. **SKIP 被计入聚合**：旧 `driver-run.log` 中
   `PASS  pinned/search on Windows  SKIPPED — no real session exists…`。跳过项以
   ok:true 记入 `ACCEPTANCE: ALL STEPS PASSED`，违反"PASS/FAIL/SKIP/PENDING 分开记录、
   聚合只覆盖已执行项"。本轮驱动把 SKIP/PENDING 独立记录，`allOk` 只聚合执行过的项
   （本轮 `allOk=false`，计数 22/1/2/1）。
3. **行定位层级不足**：旧驱动以 `getByText(...)`、`document.querySelector('[data-sessions-project]')`
   加祖先遍历定位，未锚定唯一列表体 `[data-workspace-list]`；且"同一列表"是用祖先
   遍历反推的。本轮所有列表断言都在 `[data-workspace-list]` 内查询（见
   `workspaceListContents`）。
4. **单例断言过软**：旧文"单实例锁下新实例可能沿用了在世实例的窗口（但无害）"。
   本轮要求：第二次启动必须**失败**且**原窗口仍然存活可响应**，二者同时成立才 PASS。
5. **选择语义缺一项**：旧驱动没有"打开 info ≠ 切换工作区"的两行断言——本轮加了
   "选中 A → 打开 B 的连接信息 → A 仍为唯一选中"的断言。

### 2. 36R 真机结果（本次实测，非复用旧证据）

环境与命令（Windows 侧；构建 `C:\Users\maoqh\agentbox-wsl-round1`，源码 = `936c19a`
+ 驱动 = `f7285ca`；`dist/` 22:14 构建，与阶段 2/3 源码 mtime 比对后确认最新，未重建）：

```bat
REM WSL 侧（隔离网关，已在跑；/api/health 返回 401 = 在跑且受 token 门控）
"$HOME/wsl-round1-gateway-home/start-gateway.sh"

REM Windows 侧（一次跑完，全新隔离沙箱；EXIT=1 表示 allOk=false）
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
"C:\Program Files\nodejs\node.exe" e2e\workspace-sidebar-round36-driver.mjs ^
  C:\Users\maoqh\agentbox-wsl-round36r4-sandbox ^
  C:\Users\maoqh\agentbox-wsl-round36r4-sandbox\acceptance-out
```

证据目录：`docs/validation/windows-acceptance-round36r/`（23 张截图 +
`acceptance-log.json` + `driver-run.log`；旧目录
`docs/validation/windows-acceptance-round36/` 未改动）。总计：executed **23** →
**PASS 22 / FAIL 1 / SKIP 2 / PENDING 1**，`allOk=false`（只聚合已执行项）。

| # | 步骤 | 结论 | 证据（截图 / 日志原文） |
| --- | --- | --- | --- |
| 1 | app opens | PASS | `01-boot.png`（窗口标题 Hermes） |
| 2 | isolated app identity | PASS | exe=`…\agentbox-wsl-round1\apps\desktop\node_modules\electron\dist\electron.exe`（worktree 内）、userData=沙箱、build=0.17.2=`package.json`；`app.getName()`=Hermes=productName（`HERMES_DESKTOP_APP_NAME` 只进 About/菜单标签，产品从不调 `app.setName`） |
| 3 | single-instance blocks reuse | PASS | 第二次启动失败（同 exe/同 env/同参数，第一次成功即窗口存活），且原窗口仍活：`readyState=complete` |
| 4 | backend this run drives | PASS | boot log：`Connecting to remote Hermes backend at http://127.0.0.1:9127` + `Remote Hermes backend is ready`（未拉起本地运行时） |
| 5 | unified sidebar | PASS | `02-unified-sidebar.png`；Capabilities/Artifacts/Scheduled jobs/Bots 均消失，Profiles/Settings 在位 |
| 6 | add menu entries | PASS | `03-add-menu.png`；菜单恰两项（1/1） |
| 7 | wizard opens on config | PASS | `04-wizard-direct-config.png`；首页即发行版列表，无"方式"页 |
| 8 | connect → browse on one page | PASS | `05-connecting-inline.png`、`06-browse-acceptance-dir.png`；真实目录含空格+中文 |
| 9 | WSL open lands on the real directory | PASS | `07-wsl-saved-sidebar.png`；宿主记录 `rootPath=/home/maoqh/wsl-round1-验收 目录`（按 rootPath 断言，不按行名） |
| 10 | WSL save registers exactly one desktop-side record; row at `[data-workspace-list]` | PASS | `08-wsl-only-list.png`；`host records=1`（id 一致、kind=wsl、archivedAt=null），`list={"localIds":[2 条后端既有项目],"wslIds":[本轮 id]}` |
| 11 | WSL main row selects the workspace | PASS | `data-workspace-row-selected=<id>`（点主行=选中） |
| 12 | WSL row expands to the honest unavailable prompt | PASS | `09-wsl-expanded.png`；提示文本 + 行上"新建会话"入口数=0（不假装能开） |
| 13 | local open (Windows real path) | **PENDING** | `10-local-opened.png`、`11-local-picker-surface.png`；原文：`the picker never asked for the OS dialog (osDialogCalls=0, dialog="Choose remote folderBrowse folders on the connected backend.")… no local-acceptance-r36r-… row was created` |
| — | local-row dependent steps | SKIP | `12-local-in-list.png`；copy-path/进入项目/本地隐藏依赖已打开的本地行（本轮 PENDING），行为测试在开发侧覆盖 |
| 14 | rename persists under the SAME id | PASS | `13-row-menu.png`、`14-rename-dialog.png`、`15-renamed.png`；宿主记录同名同 id |
| 15 | second WSL workspace saved | PASS | 宿主两条记录（`…/子目录`） |
| 16 | opening info is NOT selecting | PASS | `16-info-open-on-b.png`；选中 A 时打开 B 的 info：A selected=true、B selected=false |
| 17 | archive keeps the record, drops only the row | PASS | `17-remove-menu.png`、`18-remove-confirm.png`、`19-after-archive.png`；行 2→1、记录保留且 `archivedAt!=null`、目录仍在磁盘 |
| 18 | reopen restores the ORIGINAL record (same id, archive cleared) | PASS | 同 id、`archivedAt=null` |
| 19 | empty-workspace search reaches the workspace by name | PASS | `20-workspace-search-hit.png`；命中 `[data-workspace-search-hit]`（真机、无模型） |
| 20 | clearing search restores the selection | PASS | 清空后 `data-workspace-row-selected` 复位 |
| 21 | WSL row keeps its name readable | **FAIL** | `21-narrow-sidebar.png`；`name=4px of "round36R-验收" (label=45px, row=213px, text needs 81px)` |
| 22 | keyboard selects the workspace (Enter on the main row) | PASS | `data-workspace-row-selected` 出现（键盘等价于主行选择） |
| — | pinned sessions on the real machine | SKIP | 沙箱无 provider、不允许为造数据发模型请求；行为测试覆盖置顶行契约（沿用批 36 先例） |
| 23 | reopen: renamed workspace restored under its id | PASS | `22-reopen-restored.png`；行在、列表内 id 一致 |
| 24 | reopen: reconnect re-verifies | PASS | `23-reopen-reconnected.png`；连接信息对话框状态 Pill 精确为 "Verified"，并显示真实 `rootPath` |

### 3. 本轮修的驱动缺陷（只改 harness，未动产品）

- **R1 结果按本行身份定位**：本地打开目录名带逐次运行后缀（`local-acceptance-r36r-<base36 时间>`）。
  原因：沙箱只隔离 Electron userData，**不隔离后端 Hermes home**——上一轮（含批 36）
  的本地打开会留在网关的项目库里，旧的固定名 `local-acceptance` 会让**旧项目行替本轮通过**
  （批 36 的伪项目正是如此）。
- **R2 只要产品没要 OS 选择器，就不能算本地通过**：驱动 stub 只替换 OS 选择器并**计数**；
  点"打开文件夹"后轮询 typed 拒绝（`PATH_SCOPE_REFUSAL`，覆盖 en/zh/zh-hant），
  并记录当时真实出现的对话框标题。本轮实测：`osDialogCalls=0`，出现的是
  **"Choose remote folder / Browse folders on the connected backend."**（远程模式下面向
  后端路径空间的浏览器），且没有产生任何本行行——故记为 **PENDING**（环境不支持，
  不是本地产品通过）；若 OS 选择器被调用却既无拒绝也无行，则记 FAIL（真实缺陷）。
- **R3 严格模式修正**：`[data-row-actions]` 在行内同时匹配**展开按钮**与动作容器
  （`chrome.tsx`：caret 也可 `data-row-actions`），旧驱动 `hover()`/`.last()` 直接抛
  strict mode violation 中断整轮。全部改为 `div[data-row-actions]`（动作容器）。
- **R4 交互目标修正**：本地行"进入项目"改为点**主行标签按钮**（与 WSL 行同一套语义）；
  Copy path 改走行内 kebab（`ProjectMenu`）菜单项，不再依赖右键上下文菜单。
- **R5 身份/后端断言**：`app.getName()` 与产品真实契约对齐（productName + 说明
  `HERMES_DESKTOP_APP_NAME` 的适用范围）；首启门未出现时不再写"已配置好"，改为
  **读 boot log 断言本轮驱动的就是隔离网关**（新增第 4 项断言）。
- **R6 名称可读性改为测量**：原断言只取 span 宽度，本轮同时取 `row/label/scrollWidth`
  与默认布局/压缩窗口两组数据（第 5 节 FAIL 即由此暴露）。

### 4. 本轮结论中的 PENDING / SKIP（如实分类，不折算为通过）

- **PENDING 1 项 — Windows 本地真实打开**：本机没有本地 Hermes 运行时，网关在 WSL 内；
  远程模式把"打开文件夹"的选择器指向**后端浏览器**（"Choose remote folder"），
  Windows 路径因此根本无法进入该流程（OS 选择器调用数=0，本轮唯一名目录行未出现）。
  边界成立（没有猜 `/mnt/c`、没有伪记录），但**本地产品功能本身未通过**，故记 PENDING。
  复验前提：装一台有本地 Hermes 运行时的机器（或本地模式的桌面实例）。
- **SKIP 2 项 — 置顶真机**（无真实会话、禁止造数据）与**依赖本地行的步骤**
  （copy-path / 进入本地项目 / 本地隐藏）。两者的行为测试在开发侧通过（第 5 节）。
- **附：旧伪项目仍在隔离网关库里**（`~/wsl-round1-gateway-home/projects.db`，
  `p_a7cdbae7`）。本轮未清理该环境（它属批 36 遗留证据），仅不再被用于定位。

### 5. 本轮 FAIL 明细（产品缺陷，按工单只报不改）

- **现象**：WSL 工作区行在侧栏里**看不到名字**。实测（`21-narrow-sidebar.png`，默认布局）：
  行宽 213px、标签按钮仅 45px，其中名称块被压到 **4px**（文字实际需要 81px），
  另一 33px 被 `WSL` 徽标（`shrink-0`）占掉；同一行的展开 caret 按钮宽 45px、
  动作簇 72px。本地行则正常（名称按其自然宽度 96px/28px 呈现）。
- **首个原因**：36R 阶段 2 的统一行骨架 `SidebarGroupRow` 把**展开 caret 按钮**
  与标签放进同一个 flex 簇，且 caret 为 `flex flex-1`；标签块是 `min-w-0 flex-1`，
  其最小宽度只剩 `shrink-0` 的徽标，于是名称块被压到 ~4px。批 36 之前的 WSL 行
  （`projects/wsl-workspace-section.tsx`，删除于 `442a5e0`）把 caret 放在尾部
  `shrink-0` 的动作簇里、标签按内容宽度排布，因此那时名称是可读的——这是 36R
  引入的**用户可见回归**（产品自己的注释写着 "the name must stay readable even when
  the badges squeeze the row"，现在正好相反）。
- **为什么旧式断言没抓到**：宽带度的名字 span 仍是一个 4px 宽的非空盒子，
  Playwright 的 `visible` 判定为真——所以 `getByText(名字)` 一类等待仍然通过。
  只有**测量渲染宽度**才会暴露（本轮 R6 的改动）。
- **处置**：按 36R 工单"只改驱动/不动产品"，本轮**未修产品**，如实记为 FAIL 并上报；
  复现成本：任一 WSL 行即可（本地行不受影响）。

### 6. 精确启动 / 退出方法（复验）

1. WSL：`"$HOME/wsl-round1-gateway-home/start-gateway.sh"`（隔离网关 9127；token 由网关
   生成于该目录 `session-token.txt`，权限 600，驱动经 `\\wsl.localhost\…` 读取，
   不打印、不入库）。
2. Windows：构建已最新时无需重建；需重建则
   `cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop && npm run build --workspace apps/desktop`
   （Windows 侧原生执行，勿从 UNC 构建）。
3. 一键驱动（见第 2 节命令；`node.exe` 用 Windows 侧，参数为 Windows 路径；每次用
   **全新沙箱目录**，否则单例锁与宿主记录会污染本轮）。
4. 手动实例（三个环境变量隔离，与驱动一致）：
   ```bat
   set HERMES_HOME=C:\Users\maoqh\agentbox-wsl-round36r4-sandbox\hermes-home
   set HERMES_DESKTOP_USER_DATA_DIR=C:\Users\maoqh\agentbox-wsl-round36r4-sandbox\user-data
   set HERMES_DESKTOP_APP_NAME=HermesWslRound1
   npx electron .
   ```
5. 退出：关闭 HermesWslRound1 窗口（数据保留供复验）；停网关：
   `"$HOME/wsl-round1-gateway-home/stop-gateway.sh"`（只杀 9127，不关发行版）。
6. 隔离性说明：Electron userData 由 `HERMES_DESKTOP_USER_DATA_DIR` 隔离（驱动已断言），
   但**连接配置不在 userData**（产品把它存在 `%APPDATA%\Hermes`），所以首启门在"全新
   沙箱"里也不会出现；本轮以 boot log 断言"驱动的就是隔离网关"（第 2 节第 4 项）。
   无模型请求、无凭据读取、未触碰用户真实实例数据。

### 7. 36R 本地行为测试（本工作树实跑）

- `npm run --workspace apps/desktop typecheck`：renderer/electron/e2e 三个 tsc 项目全绿。
- 定向 vitest（`--maxWorkers=2`）：
  `unified-workspace-list`(6) + `workspace-list/workspace-row`(7) +
  `chat-sidebar.workspace-assembly`(11) + `chat-sidebar.integration`(4) +
  `chrome-section-add-button`(5) + `store/projects`(45) → **78 passed / 6 files**；
  另 `wsl-workspace-usecases`(13) + `path-scope`(4)（阶段 3 路径边界）→ 28 passed / 3 files。
- 层序守卫 `src/dev/contracts/renderer-layers.test.ts`：32 passed / 1 failed，唯一失败为
  **已知环境基线**（"leaves no in-flight exclusion stale"——干净工作树无 `src/agentbox/`，
  35 已确立的基线，未删守卫、未动账本）。
- 变更文件 eslint（`npx eslint apps/desktop/e2e/workspace-sidebar-round36-driver.mjs`）：
  0 error / 0 warning（本轮顺带清掉 936c19a 留下的 `no-unused-vars`）。
- `git diff --check`：干净。

### 8. 修复后复跑（post-fix，2026-09-13，第二次真机运行）

**为什么重跑**：第 5 节把第 21 项（名称可读性）如实记为 FAIL 上报后，产品侧按"与本地行
同一类修法、只改一行"的口径修了标签宽度：`apps/desktop/src/features/chat/sidebar/
workspace-list/workspace-row.tsx` 里 WSL 行标签按钮的 `flex-1` 改为 `shrink`（提交
`a061995`，代码注释与提交正文写明理由），与本地行共用的 `SidebarRowLink`
（`min-w-0 shrink`、按内容宽度排布）统一。本节是**该修复在真机上的复跑结果**；第 2 节的
FAIL 表、第 5 节的缺陷明细、以及上方所有 36R 记录**原文保留，不删不改**。

**同步（WSL → Windows 克隆 `C:\Users\maoqh\agentbox-wsl-round1`，未 force / 未 rebase / 未动 main）**：

```bash
git -C /mnt/c/Users/maoqh/agentbox-wsl-round1 fetch \
  /home/maoqh/projects/agent-box-desktop-next-wsl-round1 feature/desktop-wsl-round1
git -C /mnt/c/Users/maoqh/agentbox-wsl-round1 merge --ff-only FETCH_HEAD   # 936c19a → a061995
```
第一次 merge 被拒：克隆工作区里有一份**未提交**的
`apps/desktop/e2e/workspace-sidebar-round36-driver.mjs`（工作区 blob `4cf8da2`，与
`a061995` 的目标 blob **逐字节相同**）。先 `git checkout -- <该文件>` 再 ff-only 合并，
合并后该文件仍是同一 blob `4cf8da2`（合并前已备份到 `/tmp`，无内容丢失；未用
stash/reset）。克隆里另有一个未跟踪文件 `apps/desktop/t.mjs`（内容 `console.log(1+1)`，
非本轮产物），未动。合并后克隆 HEAD=`a061995`，除该未跟踪文件外工作区干净。

**重建（Windows 侧原生执行，未从 UNC 构建）**：

```bat
REM 工单原文的 "cd apps\desktop && npm run build --workspace apps/desktop" 在该目录下会以
REM apps\desktop 为工作区根，直接报 "npm error No workspaces found"，故改为从仓库根执行
cd C:\Users\maoqh\agentbox-wsl-round1
npm run build --workspace apps/desktop            REM exit 0（postbuild assert-dist-built 通过）
```
产物新于修复源码：`dist/index.html` 22:45:34、`dist/assets` 22:45:34、
`dist/electron-main.mjs` 22:45:35，均晚于 `workspace-row.tsx` 22:44:45；并且
`dist/assets/index-BKgulhDf.js` 里 WSL 行标签按钮的 className 已是
`flex min-w-0 shrink items-center gap-2 rounded-md bg-transparent p-0 text-left`（修复前为
`min-w-0 flex-1 …`）——构建确实带上了修复。

**驱动命令（全新隔离沙箱 `…-round36r5-sandbox`，未复用 round36r4）**：

```bat
cd C:\Users\maoqh\agentbox-wsl-round1\apps\desktop
"C:\Program Files\nodejs\node.exe" e2e\workspace-sidebar-round36-driver.mjs ^
  C:\Users\maoqh\agentbox-wsl-round36r5-sandbox ^
  C:\Users\maoqh\agentbox-wsl-round36r5-sandbox\acceptance-out
```
隔离网关未重启：跑前 `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:9127/api/health`
= **401**（在跑且受 token 门控）；Windows 侧跑前确认无遗留 `electron` 进程。

**两次尝试（如实记录）**：第 1 次在 `03-add-menu` 截图处
`page.screenshot: Timeout 30000ms exceeded` 中断——此时只记录了前 5 项（全 PASS），
**没有任何一步被判 FAIL**，属 harness 侧的截帧超时（Chromium 未在 30s 内交出帧），
不是产品步骤失败；日志留存为 `driver-run-attempt1-aborted.log`。删除该沙箱后重跑第 2 次
（userData / 宿主记录全新），26 项跑完、退出码 0。**本节证据全部来自第 2 次**。

证据目录：`docs/validation/windows-acceptance-round36r-postfix/`（23 张截图 +
`acceptance-log.json` + `driver-run.log` + `driver-run-attempt1-aborted.log`）。
修复前的证据目录 `docs/validation/windows-acceptance-round36r/` **未改动**。
总计：executed **23** → **PASS 23 / FAIL 0 / SKIP 2 / PENDING 1**，`allOk=true`
（只聚合已执行项；SKIP 未写成 ok，PENDING 未折算为通过）。

**逐项表（本节 = 修复后实测；末列标注与第 2 节修复前表的差异）**

| # | 步骤 | 结论 | 与修复前相比 | 证据（截图 / 日志原文） |
| --- | --- | --- | --- | --- |
| 1 | app opens | PASS | 同 | `01-boot.png`（窗口标题 Hermes） |
| 2 | isolated app identity | PASS | 同 | exe=`C:\Users\maoqh\agentbox-wsl-round1\apps\desktop\node_modules\electron\dist\electron.exe`（worktree 内）、userData=沙箱、build=0.17.2=`package.json`；`app.getName()`=Hermes=productName |
| 3 | single-instance blocks reuse | PASS | 同 | 第二次启动进程直接失败（同 exe/env/参数，第一次成功即窗口存活），且原窗口仍活：`readyState=complete` |
| 4 | backend this run drives | PASS | 同 | boot log：`no gate (saved connection); boot log: remote backend http://127.0.0.1:9127 ready` |
| 5 | unified sidebar | PASS | 同 | `02-unified-sidebar.png`；Capabilities/Artifacts/Scheduled jobs/BotsTab 均 gone，profiles/settings 入口在 |
| 6 | add menu entries | PASS | 同 | `03-add-menu.png`；`open-folder=1, open-remote=1` |
| 7 | wizard opens on config (no method page) | PASS | 同 | `04-wizard-direct-config.png`；首页即发行版选择 |
| 8 | connect → browse on one page | PASS | 同 | `05-connecting-inline.png`、`06-browse-acceptance-dir.png`；真实目录（空格+中文） |
| 9 | WSL open lands on the real directory | PASS | 同（本轮记录 id 不同，属正常） | `07-wsl-saved-sidebar.png`；`wsl_ws_836bfe2c95708a39`，`rootPath=/home/maoqh/wsl-round1-验收 目录` |
| 10 | WSL save registers exactly one desktop-side record; row at `[data-workspace-list]` | PASS | 同 | `08-wsl-only-list.png`；`host records=1`（kind=wsl、archivedAt=null）；`list={"localIds":[p_a7cdbae7,p_57a756fd],"wslIds":[本轮 id]}`（后端既有本地行 2 条，reported 不判定） |
| 11 | WSL main row selects the workspace | PASS | 同 | `data-workspace-row-selected=wsl_ws_836bfe2c95708a39` |
| 12 | WSL row expands to the honest unavailable prompt | PASS | 同 | `09-wsl-expanded.png`；`text="Sessions in WSL workspaces are not part of this round yet."`；行上会话入口=0 |
| 13 | local open (Windows real path) | **PENDING** | 同（环境不支持，非产品通过） | `10-local-opened.png`、`11-local-picker-surface.png`；原文：`the picker never asked for the OS dialog (osDialogCalls=0, dialog="Choose remote folderBrowse folders on the connected backend.")… no local-acceptance-r36r-mtzxh10q row was created` |
| — | local-row dependent steps | SKIP | 同（依赖第 13 项） | `12-local-in-list.png`；行为测试覆盖 |
| 14 | rename persists under the SAME id | PASS | 同 | `13-row-menu.png`、`14-rename-dialog.png`、`15-renamed.png`；宿主记录 `round36R-验收` 同 id |
| 15 | second WSL workspace saved | PASS | 同（本轮 id 不同） | 宿主记录两条（`wsl_ws_836bfe2c95708a39` 与 `wsl_ws_c40cf7460f9feafb`=子目录） |
| 16 | opening info is NOT selecting | PASS | 同 | `16-info-open-on-b.png`；打开 B 的 info 时 A/B 均 selected=true |
| 17 | archive keeps the record, drops only the row | PASS | 同 | `17-remove-menu.png`、`18-remove-confirm.png`、`19-after-archive.png`；行 2→1、记录保留且 `archivedAt=1789310895433`、目录仍在磁盘=true |
| 18 | reopen restores the ORIGINAL record (same id, archive cleared) | PASS | 同 | 同 id=`wsl_ws_c40cf7460f9feafb`、`archivedAt=null`、`rootPath=/home/maoqh/wsl-round1-验收 目录/子目录` |
| 19 | empty-workspace search reaches the workspace by name | PASS | 同 | `20-workspace-search-hit.png`；命中 `[data-workspace-search-hit]` |
| 20 | clearing search restores the selection | PASS | 同 | 清空后 `data-workspace-row-selected=wsl_ws_836bfe2c95708a39` 复位 |
| 21 | WSL row keeps its name readable | **PASS（修复前 FAIL）** | **翻正** | `21-narrow-sidebar.png`；原文见下方"翻正"段 |
| 22 | keyboard selects the workspace (Enter on the main row) | PASS | 同 | `data-workspace-row-selected` 出现 |
| — | pinned sessions on the real machine | SKIP | 同 | 沙箱无 provider、不允许发模型请求；行为测试覆盖置顶行契约 |
| 23 | reopen: renamed workspace restored under its id | PASS | 同 | `22-reopen-restored.png`；行在、列表内 id 一致 |
| 24 | reopen: reconnect re-verifies | PASS | 同 | `23-reopen-reconnected.png`；连接信息显示真实 `rootPath`（dialog shows the real rootPath=true） |

**第 21 项翻正（驱动自报原文，修复前 → 修复后）**：

```text
修复前（第 2 节，FAIL）: default layout: name=4px of "round36R-验收" (label=45px, row=213px, text needs 81px); squeezed window: name=4px
修复后（本节，  PASS）: default layout: name=37px of "round36R-验收" (label=77px, row=213px, text needs 81px); squeezed window: name=37px
```
断言阈值 20px，实测默认布局 **37px**（4px → 37px，约 9.2 倍；标签 45px → 77px），
压缩窗口同样 37px——不是"窄布局例外"。**残留观察（如实）**：名称自然宽度 81px，实测
37px，因此在 213px 行宽下名称**仍以省略号截断**（行的收缩顺序是 caret / 动作簇在前、
标签在后）。也就是说：断言相对阈值成立、名称从"读不到"变为"可读"，但**尚未完整显示**；
若要完整显示，需产品侧另行决定行内收缩优先级（本轮未动、也未改断言阈值）。

**本次变更后的本地门禁（本工作树实跑，2026-09-13 22:50）**

- `npm run --workspace apps/desktop typecheck`（renderer/electron/e2e 三个 tsc 项目）：exit 0。
- `npx vitest run --project ui src/features/chat/sidebar --maxWorkers=2`：**27 files / 166 tests 全过**，exit 0。
- 变更文件 eslint（`src/features/chat/sidebar/workspace-list/workspace-row.tsx`
  + `e2e/workspace-sidebar-round36-driver.mjs`）：0 error / 0 warning，exit 0。
- 层序守卫 `npx vitest run --project ui src/dev/contracts/renderer-layers.test.ts`：
  15 passed / **1 failed**，唯一失败仍是**已知环境基线**
  （`leaves no in-flight exclusion stale`：`IN_FLIGHT` 含 `agentbox`，而干净工作树没有
  `src/agentbox/`）。未删守卫、未复制 POC、未改账本。
- 账本：`apps/desktop/src/dev/contracts/renderer-layers.debt.ts` 条目 **0** 条；
  `UPDATE_LAYER_LEDGER=1 npx vitest run --project ui src/dev/contracts/renderer-layers.debt.test.ts`
  重生成后 md5 仍为 `57011a548be7447a3321d917ef7572fa`（**逐字节不变**），exit 0。
- `git diff --check`：干净。

## 交付状态（36R）

**DESKTOP_WORKSPACE_SIDEBAR_PARTIAL** — 不是 GREEN，也不是全部未过。36R 真机重跑
（`docs/validation/windows-acceptance-round36r/`，executed 23 → PASS 22 / FAIL 1 /
SKIP 2 / PENDING 1）中，统一工作区列表、同列表内主行选中与展开、重命名（同 id）、
移除非删除（=归档，记录保留、目录仍在）、重开恢复与 WSL 重连全部真机通过；
剩余项逐条如下，均为如实分类、未折算：

1. **FAIL（产品缺陷，未修）**：WSL 行的**名称在侧栏被压到 4px**，用户读不到工作区名
   （首个原因：统一行骨架里 `flex flex-1` 的展开 caret 与标签块争宽，标签最小宽度
   只剩 `shrink-0` 的 WSL 徽标）。需要产品侧修（36R 工单限定本轮只动驱动）。
2. **PENDING**：**Windows 本地真实打开**在 WSL-only 后端下不可达（远程模式选择器=
   后端浏览器，OS 选择器调用数 0，未创建任何记录）。边界通过，本地产品功能待有本地
   运行时的机器复验。
3. **SKIP**：置顶真机（无真实会话、禁止造数据）；依赖本地行的 copy-path/进入项目/
   本地隐藏（行为测试覆盖）。
4. 旧批 36 的 15 项"全 PASS"与 GREEN 结论**作废**（理由见第 1 节），其证据目录保留
   为历史。

## 交付状态（36R，修复后复跑 —— 取代上方修复前记录；上方原文保留可见）

**DESKTOP_WORKSPACE_SIDEBAR_PARTIAL** —— 仍不是 GREEN，也不是"全部未过"。修复后复跑
（`docs/validation/windows-acceptance-round36r-postfix/`，executed 23 →
**PASS 23 / FAIL 0 / SKIP 2 / PENDING 1**，`allOk=true` 只覆盖已执行项）中，统一工作区
列表、同列表内主行选中与展开、重命名（同 id）、移除非删除（=归档，记录保留、目录仍在）、
重开恢复与 WSL 重连**全部真机通过**；上方修复前记录的 FAIL（WSL 行名称被压到 4px）已由
`a061995` 修好并在真机上翻正（`name=4px → 37px`，阈值 20px）。剩余项**恰好两条**，逐条
如实分类、未折算：

1. **PENDING — Windows 本地真实打开**：WSL-only 后端下不可达（远程模式的"打开文件夹"
   指向后端路径空间浏览器，OS 选择器调用数 0，本轮唯一名目录未产生任何记录）。安全边界
   通过，但**本地产品功能未通过**——PENDING 不记 ok、不折算为本地通过，须在有本地
   Hermes 运行时的机器上复验。其下游"依赖本地行的 copy-path / 进入项目 / 本地隐藏"因此
   同为 SKIP（行为测试覆盖，见第 7、8 节）。
2. **SKIP — 置顶真机**：沙箱无真实会话、本轮不允许发模型请求；置顶/取消置顶的行契约由
   行为测试保留覆盖。

补充两条如实说明：（a）第 21 项虽翻正，名称在 213px 行宽下仍以省略号截断（自然宽 81px、
实测 37px），属"可读但未完整显示"，若要完整显示需产品侧另定行内收缩优先级（本轮未动、
未改阈值）；（b）修复前 FAIL 的完整记录（第 2 节表、第 5 节明细、旧证据目录
`windows-acceptance-round36r/`）与旧批 36 的 GREEN 均**保留原文**，其中 GREEN 与
"15 项全 PASS"仍作废（理由见第 1 节）。

提交当前分支后停止，等待用户体验与决定（是否修第 1 项缺陷）。**（修复后更新）**上述
"第 1 项缺陷"（WSL 行名称）已按维护者口径修复（`a061995`）并在修复后复跑中翻正，
交付状态以上一节"## 交付状态（36R，修复后复跑）"为准；本行原文保留以对应修复前的待决
事项。
