# Native Linux 基线与业务组织提案

2026-09-21，I。状态：只读盘点完成；方向已记录；集成、派工和验收尚未进行。
不使用旧 incremental-work-order 调度机制，不恢复旧队列或轮询。

## 1. 实测输入，不是已完成的统一检查点

环境：Ubuntu 26.04.1 LTS，内核 7.0.0-31-generic，根盘 ext4 /dev/nvme0n1p7。
三个产品仓库维持独立；control 是另一个仅保存组织记录的仓库。

| 输入树 | 分支 | 完整 HEAD | 工作区 |
| --- | --- | --- | --- |
| backend-service-env-provider | feature/env-provider-v1 | 003b52b2b18a86547d2819ea8875095442d2011b | clean |
| backend-runtime-round1 | feature/env-provider-runtime | a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa | 仅未跟踪 .qoder/ |
| desktop-chat-wsl-round1 | feature/agentbox-desktop-product | 08b4eac7fe10aacc3220cca94c52659aaf043cc5 | 仅未跟踪 .qoder/ |
| desktop-settings-round1 | feature/agentbox-desktop-settings | 01083212aaade2ead3a1be9323943ea3eae3284e | 仅未跟踪 .qoder/ |

三个仓库共 19 条 worktree 登记，17 个目录存在；Desktop 的
`/tmp/audit-fe-2/app`、`/tmp/audit-fe-2/settings` 已缺失且被 Git 标为 prunable。
没有执行 prune/remove。入口 symlink 未发现断链。
全树状态检查采用 `git --no-optional-locks status --porcelain=v1
--untracked-files=normal`；未跟踪目录计一项，不能与旧报告逐文件数直接比较。
历史 Studio 重构树仍有 898 项 tracked 改动，vertical 树 57 项；
旧调度树 14 项，Desktop main 2 项，Studio 主树 1 项。
其余树也可能有未跟踪内容；均保持原样，未读取凭证。

### 分叉与集成风险

| 配对 | merge-base | 两侧独有提交 | 从共同祖先起改变的路径数 |
| --- | --- | --- | --- |
| 后端 service / runtime | a4f82566f6718c4af0c58062a44c2107e04e6106 | 103 / 138 | 150 / 180 |
| 桌面 chat / settings | b8c2e0b6eb5301c48b91598e94a191d9f7be934a | 87 / 117 | 136 / 218 |

两侧改过同一文件不等于文本冲突；尚未执行合并预演。
后端共同改动的源码有 model_configs/repository.py、model_configs/service.py、
sessions/repository.py（均在 src/agent_box/server/）。
桌面共同改动源码包括 message-parts.tsx、tool/fallback.tsx、activity-timer.ts、
agentbox-chat-view.tsx、八个 i18n 文件、desktop-fs.ts、media.remote.test.ts。
历史工单/队列亦有交叠，不得因合并旧文档恢复其调度权威。

### Native Linux 的已有基础（源码证据，非运行通过）

- runtime 树 `src/agent_box/server/bootstrap/runtime.py:481` 引用 LocalSidecarLauncher；
  `:800` 定义本地 profiles 根；`:1255` 非 Windows 默认选择 sandbox-bwrap。
- chat 树 `apps/desktop/package.json:43` 已有 Linux AppImage/deb/rpm 构建脚本。
- 仍须验证桌面实际启动链、Python/Node 原生依赖、bwrap 权限、harness 工件与路径。
  换 OS 减少跨系统边界，不会自动修好截断、凭证自助和状态失真。

## 2. 一个产品检查点，而不是强行一个仓库

拟定产品检查点 `linux-native-0`，由一份版本清单绑定：后端完整 SHA、
桌面完整 SHA、协议/生成工件摘要、运行时工件身份、工具链与锁文件身份、
启动方式、隔离测试数据根定位、测试证据、已知缺陷、上一个可运行版本。
不含秘密。四个旧 HEAD 是输入快照，不能冒充已整合的输出。

阶段必须分开记录：

1. **源码收敛**：两条后端线归入一个候选分支，两条桌面线归入一个候选分支；
   检查源分支内容是否保留及冲突决策，工作区无未提交产品改动。
2. **可运行候选**：Linux 桌面→本地服务→本地 harness→回复闭环；
   会话重开、取消、错误/截断可见、配置持久化有证据。模拟与真实模型证据分开，
   真实调用先核对授权；未通过项明确列出，不能用静态代码检查替代。
3. **用户验收**：I 提供固定入口、版本标识、短验收步骤与已知问题；只有用户能
   判定接受。未验收时允许发布“候选”，不得晋升 releases/current。

建议先只开 `worktrees/integration-linux/{backend,desktop}`，各一条
`integration/linux-native-0` 分支；起点分别选 service/chat，吸收 runtime/settings。
这是待验证的集成顺序，不是宣称两个起点包含所有成果。
不向 main 合并、不 push、不清理旧树、不搬用户数据；旧树保留至证据和恢复验证完毕。
用户已通过 D-0018 授权仅限这两条候选分支的整合与 Linux 适配；AGENTS 已同步例外。

## 3. 基线后按用户能力划分，而非按前后端划分

| 业务线 | 用户能验收的结果 | 跨仓库范围 | 启动顺序 |
| --- | --- | --- | --- |
| conversation | 发消息、流式回复、取消、重开、失败与截断如实呈现 | chat UI + sessions/runtime turn lifecycle | 基线后第一批 |
| configuration | 自己添加 Provider/凭证、选择模型与 Profile，重开仍生效 | settings UI + model configs/provider services | 与 conversation 并行，先锁接口 |
| workspace-tools | 看清工具执行、文件变化和工作区状态 | tool renderer + workspace/artifact APIs | 共享转录接缝稳定后再开 |

每条线需要哪一个仓库才开哪一个 worktree：
`worktrees/<business>/{backend,desktop}`。从同一个产品检查点派生；
不是每个模型、每个角色各开长寿命分支。初始最多两条业务线并行。
协议、数据库迁移、bootstrap、公共转录组件和 i18n 索引由集成人统一协调单写者；
业务线提交变更提议，不得抢写。集成工作区本身也只允许一个写者。
每个可独立验收的小增量先回集成候选，复测后形成下一份固定清单，不能数周后大合并。

## 4. 人与信息流（提案，未任命）

- **I（本会话）**：唯一用户接口，维护方向/范围/风险，给用户验收与决策结论。
- **交付调度者（DeepSeek）**：把一个业务目标拆成有限任务，维护依赖和候选版本；
  关键路径可自己执行，此时暂停其他写者进入相同工作区。
- **执行者/证据助手（Qoder + Qwen）**：检索、迁移适配、测试、重现、文档等有限任务。
- **审阅者（Sol，按需）**：只看候选 diff、接口与风险证据；Qwen 助手准备复现和测试包。
  审阅者不兼任被审功能作者。高风险审阅资源缺席时暂停晋升该候选，而不是虚构通过；
  低风险且可逆的文档/测试整理可继续，状态不升级为已审阅。

不转发长聊天记录。一个任务只维护一份任务卡：目标、非目标、基线版本、写入范围、
接口依赖、验收命令、结果 SHA、证据路径、已知缺陷和是否需要 I 决策。
执行者更新任务卡；调度者维护汇总索引；只有 I 写用户决策和交付结论。
状态变更用短通知（任务 ID + 新状态 + SHA + 证据链接），通知不是第二份事实源。
只有完成一个可验收增量、出现阻塞或需要决策时上报，不启动常驻空轮询。

给用户始终展示四件事：当前可试版本、这一轮改善什么、还差什么、需要什么决定。
验收窗口固定版本，不跟随开发分支热变更；开发可以继续，是否晋升由用户确认。

## 5. 授权已确认，执行尚未开始

用户已明确认可上述两个新 integration 分支中整合现有成果，并做 Linux 原生适配
（D-0018）；仍禁止合入 main / push / 删除旧树 / 触碰用户数据或现存服务。
执行前先读各产品仓库自身规则，检查源 HEAD 漂移、保全新脏工作，
再任命本轮执行者。当前没有合并、创建新 worktree 或派功能工单。
