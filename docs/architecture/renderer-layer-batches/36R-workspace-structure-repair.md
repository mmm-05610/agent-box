# Work order 36R — 统一工作区主体，修复 36 的验收缺口

## 基线与唯一调度

本单是 36 的增量返修，不是新 goal。继续原 Zcode 会话、原工作树
`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`、原分支
`feature/desktop-wsl-round1`，从已提交的 `250fb79` 接续，不能重做 35/36。
维护者验收：36 = `DESKTOP_WORKSPACE_SIDEBAR_PARTIAL`，覆盖执行者旧 GREEN 宣称。
上一轮维护者实跑四文件 91/91、三项目 typecheck exit 0；只审阅 Windows 证据，未重跑
Windows。原报告 71/71 为计数错误。已有测试未覆盖下面的核心反例，不能凭绿跳过返修。

从 main 导入本单的文档提交；若 status 已被执行者更新，合并保留其事实记录，按本单修正
验收结论。文档冲突只处理指定文档，不合入产品代码。不 merge/push main。
36R 独占 Desktop。34/预览/全面去 Hermes 化继续暂停。37 已迁入独立后端 Codex 队列，
Zcode 不得执行、修改或复制其实现；Windows 重构建与后端演练协调串行。

## 问题与目标树

```text
现状 @250fb79
features/chat/sidebar/
├── chat-sidebar.tsx               旧 Session 分组控制工作区显示；空状态忽略 WSL
├── sessions-section.tsx           旧内容后追加 workspaceRows，不是统一模型
└── projects/wsl-workspace-section WSL 主行开连接信息，身份/选择未统一

目标（等价文件名可调整，职责不可合并回旧结）
features/chat/sidebar/
├── chat-sidebar.tsx               顶部角色/搜索/置顶/工作区/设置的组合
├── pinned-sessions/               原会话快捷入口；不复制 Session
└── workspace-list/
    ├── workspace-list.tsx        唯一工作区根列表；独立于 Session 数量/分组
    ├── workspace-row.tsx         本地/WSL 共用名称、选择、展开、菜单骨架
    └── workspace-content.tsx     本地复用会话树；WSL 显示诚实 unavailable
application/workspace/
├── workspace-projection.ts       两种权威数据投影为中立行/搜索结果
├── workspace-navigation.ts       选择、展开、打开后定位；无运行策略
└── workspace-actions.ts          按能力调用既有本地/WSL操作
store/workspace-view.ts           选中/展开/本地隐藏ID等视图偏好；非项目元数据库
types/workspace.ts                中立 DTO，与业务层无反向依赖
原有 projects / WSL宿主存储       两个权威保留，本轮不迁库、不接 Server
```

拆分来源是已审的 Sidebar/WSL 呈现与导航；不把纯 helper/DTO 提到 features。
派工边界定向查 `250fb79`：上述三个组件的生产符号消费者位于 features 与 app/composition，
未在 api/types/lib/store/application 找到消费者；不是把下层正在消费的模块提到 UI。
投影与用例不能 import features/app；store 不 import 新 application 用例。原有 Session
组件保持下层可消费的现有位置，通过 props 接入，不强迁所有 projects/store 代码。
旧 workspaceRows 追加接缝应退役；保留适用的本地 Session 渲染，而非重写整棵树。

## 已裁决的行为

### 1. 工作区是主体，不是 Session 列表的附件

- 只有 WSL、只有本地空目录、没有 Session、旧偏好为 date/status/flat：工作区仍显示。
- 主侧栏固定工作区树；日期/状态/卡片偏好只影响工作区内 Session，不再切掉工作区主体。
  迁移或忽略旧“是否按项目分组”的视图偏好，不要求用户手动改 localStorage。
- 搜索分别匹配工作区名称/路径和会话内容/标题，保留所属工作区；零会话的工作区可搜到。
  清空搜索恢复原选择/展开，不更改持久项目和会话。不要把所有服务端全文搜索重写。
- 本地/WSL 主行都选择相应工作区并按同一约定展开；WSL 内容显示会话未接入，不创建
  Hermes 会话。连接信息/重连归菜单或次要按钮，不替代主行点击。
- WSL 行名称有可用宽度；隐藏按钮不能占满一整排行宽。保留紧凑布局、focus可达和正确
  aria-label（更多操作不标成连接信息）。不要增加品牌重绘或新 UI 框架。

### 2. 移除是隐藏/归档，不销毁身份

- WSL 记录保留 id/身份，使用归档标记；重新打开同位置恢复原记录、原 id 和已改名称。
  列表默认排除归档；保存/归档/恢复/改名仍在同一串行提交边界；请求重试不得复活已
  归档记录，除非是用户新的打开意图。新增持久字段时升级 schema，迁移前备份；旧版
  文件可读迁移、未来版拒绝写，不能让旧程序误显示归档行。非法版本原字节不变。
- 本地优先保留 backend project 记录，仅用按 backend/profile/id 作用域的既有视图偏好
  隐藏，重新打开取消隐藏并复用 id；这是可丢失的可见性偏好，不是第二份项目元数据。
  不再通过 projects.delete 实现“从侧栏移除”。不要误隐藏其他后端或角色同名项目。
- 两种方式都不删除磁盘目录、会话、pin 或停止 WSL；已有历史仍可从原会话入口访问。
- 不恢复已在旧实现中物理删除且无法追溯的身份；历史局限如实列出，不能发明旧 id。

### 3. Windows 路径不能交给 WSL 当 POSIX 字面路径

- 本地目录选择后，在写 projects.create 或触发新会话之前判断目标 backend/路径空间
  是否匹配。客户端本地选目录不等于远端 backend 能访问它。
- 复用已有且经过验证的路径能力/映射。没有匹配能力时 typed 拒绝、显示可操作错误，
  零创建、零启动；不得猜 /mnt/c 映射、偷偷改 remote workspace、伪装目录打开成功。
- 本轮禁止因此接37、改后端或新增一个本地项目数据库。环境只能连接 WSL Hermes 时，
  Windows 本地真实打开路径记 PENDING/unsupported；正确拒绝是安全边界通过，不是本地
  产品功能通过。需要新架构才支持时停该子项，其余返修继续，最终只能 PARTIAL。
- 已有本地等价环境可用则用它验证；不授权安装/更换全局运行时或读取用户凭据。

## 精确范围及依赖

允许：`src/features/chat/sidebar/**`、`features/workspace/**`、`application/workspace/**`、
`store/{workspace-view*,wsl-workspace*,projects/**,layout*}` 的必要接缝、`types/workspace.ts`、
`api/workspace.ts`、既有文件选择/backend能力 API 的窄校验（不引入上行依赖）、
`app/composition/wiring` 必要注入、i18n、Electron `host-capabilities/platform/wsl-workspace*`、
workspace IPC/preload、相关测试/e2e与验收文档。不改旧网关协议或其他产品能力。
若新目的地有低层消费者，采用中立 DTO/回调或保持低层位置；不可反向导入 features。

禁止触碰：`src/agentbox/`、`src/plugins/agentbox-lab/`、未跟踪架构/目录文档、用户实际
home/会话/项目、后端各仓。只导入本次文档；不 stash/reset/git add -A，不自动合并 main。
本单覆盖 36 的旧分组“保留即可”、新建身份、同祖先断言等验收解释，其他原要求不变。

## 阶段与检查点

1. **先补反例**：完整 ChatSidebar 装配下 WSL-only/无 Session/旧分组/空目录搜索；
   本地与 WSL 同意图；remove→reopen 原 id；路径空间不匹配零副作用。测试先红后修，
   不再只手工给 SidebarSessionsSection 塞 projectOverview 证明生产组合已通。
2. **结构收口**：统一投影、根列表、主行交互、搜索、选择/展开；保留 pins/Profiles/
   Settings 已过成果。局部行为门通过后提交。
3. **身份/路径**：归档与本地隐藏、恢复、并发、schema升级保护、路径匹配或拒绝；
   命名/取消/旧迟到响应不回退。局部门通过后提交。
4. **真实证据**：修驱动、一次定向合集/typecheck/lint/层序守卫、Windows 原生构建和
   用户路径。若出明确首因只修定向再验，不重跑全部9600项。每阶段报告变化树和可体验路径。

## 驱动与证据要求

- 以唯一 list 标识定位，断言工作区行在规定列表层级；禁止向上扫到 body 也算同列表。
- 通过主行验证选中/展开与内容，不把打开 info 算“切换工作区”。
- 默认新实例不注入分组偏好；另验旧 date/flat 偏好升级后仍能看到工作区。
- 全新隔离 app identity/userData，核对实际进程路径、实例标识、userData、构建版本；
  单实例复用旧窗口须失败，不能说“可能复用但不影响”。不打印 token/配对秘密。
- OS picker 可 stub，但只替选择，校验结果的实际路径/host；用目录标记验证，不仅看行名。
- PASS/FAIL/SKIP/PENDING 分开，allOk只代表已执行项或删除该汇总；不得 skip 写 ok:true。
  置顶真机无数据可按36允许项SKIP，保留行为测试；空工作区搜索不需要模型，必须真机验。
- 补验仅WSL记录、移除后重开身份、重命名恢复、窄侧栏名称/键盘操作；不请求模型造数据。

```bash
# 在实施工作树执行，新增测试路径按实际文件填写
npm run --workspace apps/desktop typecheck
# apps/desktop: npx vitest run <受影响文件> --maxWorkers=2
# 变更文件 eslint；renderer 层序守卫；已知 IN_FLIGHT 基线不通过复制POC消除
git diff --check
```

碰撞复核（在实施工作树 apps/desktop/src 下）：
`node ../../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs ../../../../docs/architecture/renderer-layer-batches/batch-manifest.json`。
先导入派工文档再运行；脚本只报模式交集，执行顺序始终以本单独占裁决为准。

更新 `docs/validation/workspace-sidebar-round36.md`，保留旧运行记录并标注旧 GREEN 已被
维护者复审推翻，新增本次实际通过/未通过表和截图/命令。不覆盖旧证据冒充未发生问题。
旧测试91/91和typecheck来自维护者上轮实跑，不再当返修后新结果。

## 停止与终态

遇需新增后端协议/持久化权威、角色配置服务改造、执行能力、历史迁移丢失、保护路径
或共享Windows资源无法协调时停止相关阶段并报告。边界内其他明确工作可以继续。
沿用唯一整体状态：`DESKTOP_WORKSPACE_SIDEBAR_GREEN` / `DESKTOP_WORKSPACE_SIDEBAR_PARTIAL`。
不能因为“结构已修好”将未通过的本地真实打开算GREEN。完成后停在分支等待用户体验。
