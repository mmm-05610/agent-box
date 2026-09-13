# Work order 36 — 统一 Workspace 左侧栏

> 2026-09-13 维护者复审：250fb79 = PARTIAL，执行者旧 GREEN 不成立。
> 接续执行 [36R](36R-workspace-structure-repair.md)，本单其余要求保留；冲突以36R为准。

## 目标、基线与调度

35 已在 `feature/desktop-wsl-round1` 的 `c8d59f3` 验收，尚未合并 main。复核者定向
测试 39/39；执行者 Windows 15/15；用户亲自确认 WSL 连接符合预期，但添加流程和侧栏
仍过于复杂。本单以这些报告和用户截图为基线，不要求重新跑全仓审计。

继续原会话、原工作树 `../agent-box-desktop-next-wsl-round1`、原分支，在 c8d59f3
成果上追加阶段提交，不从 main 重做 35。先只导入 main 上本单及相关调度文档的指定
文档提交（可 cherry-pick 该文档提交）；不得合并其他产品代码。遇冲突仅处理调度文档，
不覆盖实施成果。36 独占 Renderer/Electron，34、预览及 Codex 后续轮继续暂停。
不自动 merge/push main。

## 产品 before / after

```text
原侧栏（用户截图）
├── Sessions / Bots 页签             删除双模式入口
├── New session / Capabilities       全局入口移除或归位
├── Artifacts / Scheduled jobs       移出主侧栏
├── PINNED                           保留真实会话快捷入口
├── PROJECTS                         与下方合并
├── REMOTE                           删除独立分区
└── 工具图标排 / 地址 / Gateway       不再常驻主导航

目标侧栏（复用原主题、组件、密度）
├── App 标识 / 收起
├── 角色                             上方 Profile 管理入口，不是 Bots 群聊
├── 搜索工作区与会话
├── 置顶会话                         无内容时折叠/隐藏，不留大段提示占位
│   └── 会话快捷入口 + 所属工作区     点击同一会话，非复制
├── 工作区                      ＋
│   ├── 本地文件夹                   与 WSL 同级、同一种行交互
│   │   ├── 新建会话
│   │   └── 原有 Session 列表
│   └── WSL 文件夹                   小 WSL 标识；名称优先
│       └── 会话尚未接入的诚实提示   不假接 Hermes，不增加执行能力
└── 设置                             留作次要能力入口
```

### 添加与管理

- ＋只有「打开文件夹」「打开远程文件夹」。本地选定目录即打开/加入列表，无命名或确认页。
- 远程本轮只有 WSL，不再设“选择方式”页。发行版默认项 + 可选用户 → 连接并浏览目录
  → 选择目录即保存打开；连接中为加载状态而非独立页面。保留取消、错误、重试。
- 默认名取目录名；重命名放行菜单。移除仅移除侧栏记录，不删除文件、会话历史或停 WSL。
  若有关联会话，明确告知历史保留，不做级联删除；重新打开目录复用已有身份/历史。
- 统一行选择/展开交互及空状态，不保留第二份远程树。可复用两种现有存储，以中立投影
  汇合；本轮不强行迁移数据库或建立第二权威。UI 投影不能充当宿主持久化权威。
- WSL 行菜单提供连接信息/重连；连接私有，不新增全局连接库。发行版、用户、路径详情
  在连接信息中。常态不堆 Verified/Not verified 徽标；重开未验证不是故障，重验时显示加载，
  真错误显示可操作提示。不得把未验证谎称在线。
- 新建会话定位到工作区；本地原有能力保留。远程未接通时明确不可用，不沿旧 Hermes
  流程创建。Session 本轮不迁移归属，未来切换工作区仍是后端裁决。
- 置顶保留原会话身份和持久数据；支持置顶/取消，点击定位所属工作区和原会话。
  不复制会话，不因取消置顶/移除 Workspace 删除历史。搜索保留所属工作区上下文。

### 导航删减与角色

- 删除 Sessions/Bots 页签、Capabilities 和全局 Artifacts 入口；会话内产出仍保留。
- 角色入口置于顶部，复用既有角色配置部件（名称、头像、说明和已有配置），不接群聊、
  relay、@bot、在线机器人逻辑；不新造 Profile 后端或编辑器。入口不得落到旧 Bots 群聊页。
  如果配置部件离不开群聊服务，报告精确接缝后停止，不用假列表冒充可用。
- Profile 是持久角色；会话选角色是本次使用，不因临时参数调整直接改 Profile。
  本轮不新增 Harness 管理页，不在 UI 暴露 Execution/Ref。
- Scheduled jobs 移到设置的自动化入口，保留既有功能，不重写调度后端；不让 Hermes
  原语义通过改标题偷渡为通用功能。必要时列明暂不能中立化的具体内容并停止该子项。
- 底部图标排移除；仍保留的 HUD/Pet 等已有入口归设置，不扩展能力。地址、Gateway、
  inference 状态归诊断/相关操作错误，不常驻侧栏；不得因此吞掉影响操作的错误。
- 此轮只退役侧栏入口，不全仓删除相关服务或 Profile 数据。

## 代码归属与范围

```text
apps/desktop/
├── src/app/composition/                仅注册、接线
├── src/features/chat/sidebar/         统一导航与树的呈现
├── src/features/workspace/            简化向导、连接信息
├── src/features/profiles/             角色呈现；可从旧插件抽纯配置部件到这里
├── src/features/settings/             次要入口归位
├── src/application/{sidebar,workspace}/ 中立投影与操作协调
├── src/store/                         缓存、选中、展开投影
├── src/api/ + src/types/               窄接口与 DTO，不 import 上层
├── src/i18n/                          全部新文案按目录回退规则覆盖
└── electron/host-capabilities/         必需的重命名/移除持久操作
    electron/ipc/ + preload            必要受限接口；不吸收 Harness 策略
```

路径可依据现有等价模块在职责内调整；记录来源、目的地和消费者。禁止新增上行边、全树
改名、重复 renderer 存储权威。迁移同步 import/dynamic import/mock，不以源码正则测试。
允许读旧 hermes-bots 以提取角色配置；不扩展群聊。35 并发提交与新版文件保护必须保持。

保护路径（不得读取用于实现、复制、修改、暂存）：
`apps/desktop/src/agentbox/`、`apps/desktop/src/plugins/agentbox-lab/`、
`docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`。
不改后端仓库，不运行模型，不修 Hermes 启动架构（沿用披露的临时网关）。

## 阶段与验证

1. 定向确认导航、角色配置、置顶、本地目录存储接缝，记录统一投影方案及精确触碰文件。
   不重跑全仓盘点；若本地打开必须创建 Hermes agent 才能成立，报告而非复刻其模型。
2. 完成 Workspace 投影/重命名/移除和简化向导；跑相关行为测试后提交检查点。
3. 完成统一侧栏、置顶、角色及次要入口归位；测试后提交检查点。
4. 一次集成 typecheck、相关测试、变更 lint、层序守卫和 Windows 构建/用户路径验收。
   出现明确首因只做定向修复，不重复整仓全量；允许阶段内灵活协调，不并发冲突编辑。

行为测试至少覆盖：本地与 WSL 同列表/选择/展开；空状态两个添加入口；选目录直接完成；
同目录重复打开不重复；重命名重开保留；移除记录但目录和历史仍在；置顶打开同一会话及
取消；搜索归属；WSL 失败/重连/取消与迟到响应；35 的并发保存及版本保护不回归。

```bash
npm run --workspace apps/desktop typecheck
# 在 apps/desktop 下定向 vitest run <本轮受影响测试文件>，不跑 9600 项全量
# 变更文件 eslint；既有 renderer 层序守卫（不改账本抬高基线）
git diff --check
```

沿用 35 已复现的 loopback 和干净 worktree IN_FLIGHT 基线，不能删守卫或复制 POC 凑绿。
Windows 用隔离实例、真实文件树；不在 UNC 构建。验收：本地打开目录 → WSL 打开目录 →
同列表切换 → 重命名 → 置顶既有会话/取消 → 移除目录仍在 → 重开恢复 → WSL 重连。
角色入口不进群聊；主侧栏无旧导航。无真实会话可供置顶时，行为测试与 UI 待验分别报告，
不得请求模型造数据或宣称该项真机通过。截图须展示整个侧栏与统一树，不只向导。

## 停止与交付

需发明后端协议、访问保护路径、丢失历史/数据迁移、角色配置无法独立、超出目录归属或
必须改启动架构才能继续时，保存已验证检查点并报告首因，不擅自扩大范围。
文档 `docs/validation/workspace-sidebar-round36.md` 记录提交、目标树、测试、截图、精确
启动退出方法和已知限制；不提交 token，不输出凭据，不清用户数据或关闭发行版。

全部范围含 Windows 证据完成：`DESKTOP_WORKSPACE_SIDEBAR_GREEN`；否则
`DESKTOP_WORKSPACE_SIDEBAR_PARTIAL`。提交当前分支后停，等待用户体验，禁止自动进入 Codex。
