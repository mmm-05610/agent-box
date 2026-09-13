# Round 1 / Work order 35 — 真实 Desktop 添加 WSL Workspace

## 目标与调度

交付一个 Windows 上可打开的真实 Electron Desktop：在项目侧栏选择「添加项目 →
远程连接」，完成 WSL 配置、连接、真实目录浏览及 Workspace 保存，退出重开后能找回它。
外观沿用现有 Hermes Desktop。这里只做第一轮；完成后停止，交给用户验收。

本单是用户明确授权的新会话任务。旧会话已暂停；Batch 34 及其预览任务继续暂停。
35 不依赖 34，也不解锁 34。严禁旧 executor 自动把 35 合并到 main。
与所有 Renderer/Electron 改造独占串行，碰撞工具的自动 wave 不覆盖此约束。

基线来自已有状态报告：Batch 30–33 已 merged/reviewed，层序账本为 0。本单派发时只核对了
调度记录与相关路径，未重新运行产品；执行者在独立工作树记录自己的测试及真机基线。

## 后续路线（只解释方向，不授权本轮执行）

| 轮次 | 目标 | 用户验收路径 |
| --- | --- | --- |
| 1，本单 | Windows Desktop 添加 WSL Workspace | 选择 Ubuntu → 连接 → 浏览目录 → 保存 → 重开仍存在 |
| 2，待派 | WSL 薄服务 + 官方 Codex 单次对话 | 在所选目录新建 Session，读取用户准备的无秘密文件，收到真实回答 |
| 3，待派 | 持续对话、流式输出、停止、失败 | 连续两轮，停止长任务，再发送成功 |
| 4，待派 | 历史恢复与原生续接 | 退出重开同一 Session，分别证明历史恢复和 native context 续接 |
| 5，待派 | Work Core 接替执行编排 | 复跑同一用户路径，执行由 AgentBox 装配和管理 |

本轮没有模型请求，不启动 Codex，不接 AgentBox Work Core，也不创建正式 Profile 编辑器。
不以历史列表可见冒充原生续接；不以保存 Workspace 冒充 Session 已接通。

## 分支与工作树

1. 只读确认当前 branch、HEAD、status 和 worktree list。不得切换或清理他人工作树。
2. 从包含本工单且已有 30–33 成果的本地 main 提交创建独立工作树：
   `git worktree add -b feature/desktop-wsl-round1 ../agent-box-desktop-next-wsl-round1 main`。
   记录完整 base SHA。不 pull 上游 Hermes，不 reset/stash，不复制未跟踪 POC。
3. 若该名称已存在，检查是否为本轮可续作成果；不可覆盖。必要时使用明确的新后缀并记录。
4. 所有实现、验证记录按下面检查点提交在该分支。禁止自动 merge、push 或修改 main 产品代码。
5. 阶段报告写到分支内 `docs/validation/wsl-workspace-round1.md`，含启动方式、提交、截图和待办。

保护且不得读取用于实现、复制、修改、暂存的路径：

```text
apps/desktop/src/agentbox/
apps/desktop/src/plugins/agentbox-lab/
docs/architecture/acp-desktop-phase1-design.md
docs/desktop-src-tree.md
```

## 已确认的交互规格

参考用户提供的 Zcode 截图，采用相同步骤顺序；视觉样式用本项目现成组件和主题：

```text
现有 Desktop 项目侧栏
└── 添加项目
    ├── 打开文件夹                    保留已有本地功能
    └── 远程连接
        ├── 1 选择方式                本轮仅 WSL 可用；不增加 SSH/Docker 假入口
        ├── 2 填写配置                发行版下拉；可选 Linux 用户（空=发行版默认用户）
        ├── 3 连接中                  有界进度、取消、具体错误、重试
        └── 4 选择目录
            ├── 显示真实 Linux 绝对路径
            ├── 上级、子目录、前往路径、显示隐藏目录
            └── 选择此目录 → 保存 → 侧栏新增同级项目
```

- Linux 用户默认留空，不主动选择 root；发行版由真实 Windows WSL 发现结果提供。
- 图中的「同步」不实施。目录留在 WSL，不能复制到 Windows 或将 UNC 路径作为执行目录。
- 连接成功只代表验证通过，不代表 Workspace 已保存。完成目录选择后才提交持久化。
- 本地/远程项目平级；远程条目显示项目名、WSL 标识、发行版及连接状态。
- 远程条目提供「连接信息/重新连接」入口，不新增 Settings → Connections 或共享连接库。
- 取消向导不产生正式项目；保存失败保留选择以便重试；重复点击保存不产生多条记录。
- 重开后可见已保存项目，但状态先为未验证，再验证；不能把磁盘里旧的 ready 当当前事实。
- 新建 Session 相关入口本轮若未接通，明确不可用，不沿用 Hermes 后端替用户偷偷建会话。

## 架构与范围

```text
现状：相关代码分散（路径已确认，行为由执行者定向核对）
src/features/chat/sidebar/projects/          Workspace 呈现，可复用
src/features/settings/connections-registry  旧连接 UI，可拆可用部件，不继承产品归属
src/store/connections*                      旧 runtime 连接状态，避免成为新 Workspace 权威
electron/legacy-hermes/connection-*          旧 Hermes 连接，不能用作本轮成功条件
electron/host-capabilities/platform/         现有 WSL/宿主工具，可复用

目标职责（目录内部文件名可调整，需记录理由）
src/app/composition/                        接线和贡献注册
src/features/workspace/                     新向导、远程项目操作与状态呈现
src/features/chat/sidebar/projects/         保留现有项目树，消费 Workspace 投影
src/application/workspace/                  向导流程、迟到响应处理、保存/重连用例
src/store/                                 UI 投影、选中项、临时交互状态
src/types/workspace.ts                      中立请求/响应与 Workspace DTO
src/api/                                   窄 WorkspaceHostPort 的客户端
electron/ipc/                              校验请求，调用宿主服务
electron/host-capabilities/                 WSL 发现/验证/列目录；Workspace 本地持久化
electron/process/                          既有有界进程工具
```

已有等价模块优先复用，不强行为目录树增加重复层。移动前检查全部导入者，更新动态 import、
mock、测试路径和文档；禁止新增上行依赖、全树改名或将业务塞回 main.ts。
api/types 不 import store/application/UI；application 可消费 api/store；app 只组装。
Electron 宿主模块不得依赖 legacy-hermes；UI 不解析 wsl.exe 输出或拼 shell 命令。

本轮 Workspace 元数据由 Electron 宿主服务持久化在隔离 app userData 中，Renderer 是缓存。
这一存储是未来迁往 Work Core 的明确临时所有权，不实现两边双写。连接和根目录只在该
Workspace 下保存；不同 Workspace 即使同发行版也没有共享逻辑 Connection 实体。

后续薄服务负责 Codex Session/执行；Electron 只引导服务。不可为了本轮连目录搭一套 HTTP
服务器、Python runtime 或新的通用 RPC 框架。

## 最小宿主接口合同（本轮允许实现的窄接口）

复用现有受限 IPC 机制，允许新增必要的 typed channel/preload 方法及测试；不改旧 channel
值、全局名称和持久字段。接口命名可服从本仓规范，以下行为必须成立：

| 操作 | 输入 | 返回/约束 |
| --- | --- | --- |
| discoverWsl | 无 | 真实发行版列表、默认项和状态；非 Windows 为 unavailable |
| connectWsl | distribution、可选 user | 验证实际用户、Linux home、目录浏览能力，返回临时 opaque connection id |
| listDirectories | 临时 connection id 或已存 Workspace id、Linux absolute path、showHidden | 已验证路径、父路径、目录条目、必要分页；不可返回文件正文 |
| saveWorkspace | 临时 connection id、selected path、可选名称、request id | 宿主再次校验目录后原子保存，返回 Workspace；request id 重试幂等 |
| listWorkspaces | 无 | 已存 Workspace 投影，无虚假在线状态 |
| reconnectWorkspace | Workspace id | 重验保存的配置，返回状态；不改变另一 Workspace |
| cancel/release | 请求或临时 connection id | 有界取消自身操作并释放临时资源；不终止整个 distribution |

临时连接 id 只供客户端相关性标识，由宿主校验归属与失效；不引入后端 Ref 或原生执行标识。
持久化采用版本化记录，保存 id、名称、kind=wsl、distribution、配置 user、已核实 Linux
根目录；actual user 用于验证，使用默认用户时重连发现变化须显式报告，不能静默换身份。
修改默认用户或目录等变更不能悄悄重绑定已有 Session；本轮只做查看/重连。

所有失败返回 code + 安全文案 + 是否可重试。覆盖 WSL 不可用、未知发行版、用户不存在、
连接超时、取消、目录不存在、无权限、临时连接过期、保存失败。清空列表不是失败替代品。
用户输入以结构化 argv 传入已有进程工具，不进入 shell 插值；路径含空格/中文必须可用。
不新增依赖 Python 的 WSL 探针。每次探针/列目录有 deadline、输出上限；取消与过期响应
不能覆写较新的选择。日志无凭据，不扫描用户 auth/config 文件。

## 分阶段检查点

### A — 基线与宿主验证

定向读相关 AGENTS、现有向导/侧栏/WSL/持久化接缝，列出复用模块和需要新加的模块。
确认 Windows 真机执行路径（允许 WSL interop 启动 Windows Electron）。先确认能打开
现有 Desktop；避免为获得基线修整整个仓库。实现或复用 discover/connect/listDirectories，
通过真实 WSL 证明目录来源。验证后提交 `round1: WSL host capability`。

### B — Workspace 存储与应用流程

实现版本化宿主存储、幂等保存、重连及 UI 投影。临时连接和已保存项目分离；一次保存同时
持久化私有连接配置及目录，失败不留半条。验证后提交 `round1: workspace persistence`。

### C — 原位 UI 接线

接项目添加菜单、四步向导和现有侧栏；保持主题、字体、组件、布局密度。新增文案按现有
i18n 规则处理。实际挂到生产 Renderer，不能只在 agentbox-preview.html 上演示。
验证后提交 `round1: WSL workspace onboarding UI`。

### D — 用户验收包

运行下面真机路径并截图，保存启动命令、分支、checkpoint SHA、实例位置、日志位置和退出
方法。最终报告区分测试通过与 Windows 操作通过。提交 `round1: acceptance evidence` 后停止。

实现者可在上述职责内调整文件名、复用方式和窄接口细节，不必为每个技术选择请示。
发现单条能力阻塞时先保存检查点，可继续不依赖它的工作；不能用假数据将阻塞标绿。

## 比例化验证

每个检查点运行相关测试与 typecheck；新增逻辑覆盖用户可观察行为，禁止源码文本断言。
重点覆盖：失败/取消零保存、旧目录响应不覆盖新目录、重复保存幂等、存储失败无半条、
重启恢复未验证状态、两个 Workspace 连接隔离、含空格/中文目录、无权限错误。
平台差异在真实 Windows 验证；纯数据函数可跨平台测试，不伪造 OS 得出真机通过。

最终运行 Desktop `npm run typecheck`、`npm run test:ui`、受影响 Electron 测试、层序守卫、
变更文件 lint 和 `git diff --check`。若 shared 被改才扩大其测试。账本维持 0；不改宽守卫，
不为不存在的未跟踪 POC 删守卫。基线错误需可复现并分别报告；不得连续重跑无变化全量。

## 用户可验收路径（必交付）

在隔离 Windows app userData 启动真实 Desktop，记录完整启动命令。使用选定 Ubuntu 与
当前用户，不读取凭据、不调用模型。准备专属临时测试目录（含空格/中文子目录），仅操作
测试方自己创建的文件；默认提供它用于验收，用户可自行另选真实项目。

1. 项目侧栏 → 添加项目 → 远程连接，看到 WSL 选项。
2. 选择实际发行版及用户 → 开始连接，成功才进入目录选择。
3. 浏览真实子目录、返回上级、粘贴路径前往，确认与 WSL 真实文件树一致。
4. 选择目录 → 侧栏出现与本地项目平级的新项目及 WSL 标识。
5. 查看该项目连接信息；重复保存同次操作不产生第二条。
6. 正常退出应用并重开同一隔离配置，项目仍在，重新验证可用。
7. 对未知路径测试失败；取消一次向导，确认侧栏无假项目。

退出验收后回收本轮应用与子进程，不关闭用户 WSL distribution。可保留隔离验收目录以便
用户复验，明确列出位置。提供可重新启动的 Windows 实例/构建，而非仅浏览器静态地址。
若仅 Linux 开发测试可跑，交付 checkpoint 与 Windows handoff，状态只能 PARTIAL。

## 停止条件与状态

普通实现缺陷在范围内修复；遇到跨仓后端修改、必须安装 Hermes 才能浏览 WSL、必须更改
用户真实配置、破坏原有数据迁移、需要权限外的系统安装时，保存证据并报告该具体阻塞。
没有 Windows UI 实测不得宣布完成。不得自动进入第二轮，不自动解除 Batch 34。

- `DESKTOP_WSL_WORKSPACE_R1_GREEN`：全部用户路径真机通过且检查点可复验。
- `DESKTOP_WSL_WORKSPACE_R1_PARTIAL`：明确缺失路径、实际结果和最后可用 checkpoint。

本轮 GREEN 只证明 Desktop 的 WSL Workspace 能力。Codex、Session、Profile 隔离和
AgentBox Work Core 接入仍未验收。
