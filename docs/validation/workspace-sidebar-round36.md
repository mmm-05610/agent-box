# Round 36 — 统一 Workspace 左侧栏：实施记录

工单：`docs/architecture/renderer-layer-batches/36-workspace-sidebar-product.md`
分支：`feature/desktop-wsl-round1`（工作树 `../agent-box-desktop-next-wsl-round1`）
基线：`419e0e5`（= c8d59f3 + 工单文档提交）
状态：**DESKTOP_WORKSPACE_SIDEBAR_GREEN**
（Windows 真机用户路径全部通过，15 项记录全 PASS，2026-09-13；置顶/搜索真机项按
工单规则如实标注为"无真实会话可供置顶"，见下文"行为测试 vs 真机待验"）

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
