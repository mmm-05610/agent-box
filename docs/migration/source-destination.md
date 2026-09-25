# Ordessa 根目录切换：source→destination 表与恢复步骤（草案 v1，切换前定稿）

状态：定稿待确认。候选 main 最终 HEAD `af31e92dc5eb...`（tag `baseline/cp-monorepo-0`，见 §0）；报用户确认后才执行切换。
本表覆盖 `/home/maoqh/projects/ordessa` 根内全部现存条目与根外相关路径。

## 0. 候选仓最终状态（2026-09-25 实测）

- 候选 main HEAD：`af31e92dc5eb`（tag `baseline/cp-monorepo-0`），祖先链 = 旧远端 main `6c14ea8d` → 8 个迁移提交（cd24ddd8 桌面 / 974e643a 后端 / b6a08cec 根文档 / db5ac119 workspaces 修复 / f70829f 文档与红账本裁定 / df632757 补 2 文件 / c0ff0479 移除桥二进制 / fa461219+573d5c15+af31e92d 记录）。
- 干净检出门 9/0 全过（verify-clean-run3.log）；独立审阅 docs/migration/independent-review.md。
- 历史 refs：594 archive + 3 reference + 基线 tag；`git fsck` 干净。

## 1. 根内条目去向

| # | 条目（根内） | 现状 | 去向 | 方式 |
| --- | --- | --- | --- | --- |
| 1 | `AGENTS.md`、`README.md`、`cleanup-report.md` | 旧工作区说明 | 被新 monorepo 根 `AGENTS.md`/`README.md` 取代；原文进 `docs/migration/legacy-workspace/`（历史参照） | 新仓提交 |
| 2 | `control/`（独立 git 仓，56 项未提交） | 调度与决策记录 | 历史→`refs/archive/control/*`（含 checkpoint `4fc80571`）；有效决策蒸馏进 `docs/`；原目录整体移至根外 `ordessa-legacy/control/`（保留原样，不再作为权威入口） | 目录搬迁（用户确认后） |
| 3 | `repos/backend`、`repos/desktop`、`repos/studio-legacy`（符号链接→根外主仓） | 链接 | 链接删除；目标主仓本体不动，历史已在 `refs/archive/agent-box*` | 删链接（目标保留） |
| 4 | `repos/harness-profile`（实体 git 仓 @1191a41b） | 独立插件，无活动写者 | 历史已存 `refs/archive/harness-profile` + bundle；目录整体搬至根外 `ordessa-legacy/repos/harness-profile`，独立开发继续在那里 | 目录搬迁（用户确认后） |
| 5 | `repos/harness-provider`、`repos/harness-workboard` | 同上（@e925f23 / @9168313） | 同上 | 同上 |
| 6 | `worktrees/harness-desktop-002/bc-native`（agent-box 工作树 @a0b343e0） | HD-002 后端候选；2 个 qoder 会话驻留；57411 服务腿运行中 | 历史进 `refs/archive/agent-box/heads/work/hd002-bc-native`；**服务腿运行期间目录原位不动**；会话结束后经 `git worktree remove` 退役（另批） | 保留原位（本轮） |
| 7 | `worktrees/harness-desktop-002/fc-functional`（desktop 工作树 @450944bd） | HD-002 桌面候选；1 个 qoder 会话驻留 | 历史进 `refs/archive/agent-box-desktop-next/heads/work/hd002-fc-functional`；会话结束后退役（另批） | 保留原位（本轮） |
| 8 | `worktrees/harness-desktop-002/` 其余 16 个子树（bc、fc、e、f0–f3、h、s、profile、provider、fc-candidate 等） | HD-002 执行树群 | 全部历史在两主仓分支（work/hd002-*）；目录与会话退役另批处理 | 保留原位（本轮） |
| 9 | `worktrees/desktop-ui-codex`（desktop 工作树 @95aec192） | 1 个 qoder 会话驻留（其分支已并入 fc-functional） | 历史已存 archive；退役另批 | 保留原位（本轮） |
| 10 | `worktrees/integration-linux/{backend,desktop}` | LNX 集成树（backend @92a2d2ba） | 历史进 `refs/archive/*/heads/integration/linux-native-0`；目录退役另批 | 保留原位（本轮） |
| 11 | `worktrees/backend-loop/` | BE-LOOP-001 运行沙箱+12 隐藏工作树 | 全部分支历史在 archive/agent-box（work/be-*）；目录退役另批（含 worktree 记录清理） | 保留原位（本轮） |
| 12 | `worktrees/desktop-minimal`、`desktop-modular-v1` | 早期桌面线（后者 27 项未提交已快照） | 历史在 archive/agent-box-desktop-next；退役另批 | 保留原位（本轮） |
| 13 | `worktrees/pi-loop/` | C1-001 暂停态 | 历史在 archive；退役另批 | 保留原位（本轮） |
| 14 | `worktrees/harness-desktop-001/` | HD-001 旧树群（9 子树） | 历史在 archive；退役另批 | 保留原位（本轮） |
| 15 | 符号链接外部树（backend-service-env-provider、backend-runtime-round1、desktop-chat-wsl-round1、desktop-settings-round1、scheduling-legacy-server-round1、legacy-*、studio-*） | 指向 `/home/maoqh/projects/agent-box*` | 链接删除（根内）；目标本体全部保留在 projects/ 下不动 | 删链接（目标保留） |
| 16 | `archive/`（362M：2026-09-20 bundle、legacy-scheduling、workspace-backups 等） | 上一轮保全产物 | 整体搬至根外 `ordessa-legacy/archive-20260920/`（与 20260925 批次并列，不删除） | 目录搬迁 |
| 17 | `backups/`（hd002-transport-only-20260924） | HD-002 快照 | 搬至 `ordessa-legacy/backups/` | 目录搬迁 |
| 18 | `releases/`（candidate/current/previous 清单骨架） | 版本清单 | 搬至 `ordessa-legacy/releases/`；新仓 `docs/baseline.md` 承接版本事实 | 目录搬迁 |
| 19 | `runtime/native-pi-user`（运行数据） | 用户运行数据 | 原位保留或搬 `ordessa-legacy/runtime/`（**迁移运行数据须用户确认**） | 待确认 |
| 20 | `tools/`（excalidraw、lumino-host-probe、theia-probe，748M，多为 node_modules） | 探针/工具产物 | 搬至根外 `ordessa-legacy/tools/`（不进 Git） | 目录搬迁 |
| 21 | `.c1-001-runtime/`（686M，含 64B token 600） | C1-001 运行材料+凭据 | **原位不动**（凭据与运行材料永不进仓）；切换后成为新根内的环境例外（.gitignore 忽略）或搬根外 | 待确认（默认原位） |
| 22 | `.c1-001-secrets/`（drwx------） | 凭据目录 | **原位不动**，永不读取/复制/进仓 | 原位 |
| 23 | `.mimocode/`、`.qoder/` | 会话工具 | 原位或随服务结束清理；不进仓 | 原位（本轮） |
| 24 | 新 `main` 源码树 | — | 由 `/home/maoqh/projects/ordessa-monorepo-candidate` 检出为新的根内容 | 切换（见 §3） |

## 2. 根外路径（不动 / 仅登记）

| 路径 | 处置 |
| --- | --- |
| `/home/maoqh/projects/agent-box`、`agent-box-desktop-next`、`agent-box-studio` 及全部 worktree 本体 | 不动；对象库完整保留，是历史第一还原源 |
| `/home/maoqh/ordessa-builds/acp-adapter` + go1.24.13 工具链 + cache | 不动；桥源码已入新仓，本地构建材料继续可用 |
| `/home/maoqh/ordessa-acceptance/`（hd004b 数据/会话/日志） | 不动（57411 服务腿在用） |
| `/home/maoqh/.agentbox-*` 数据根、`.pi/`、秘密定位器 | 不动 |
| `/home/maoqh/projects/ordessa-preservation/20260925/` | 本轮保全批次（9 bundle+12 快照+checkpoint），长期保留 |
| `/home/maoqh/projects/ordessa-monorepo-candidate` | 候选仓；切换后其对象库成为正式根 `.git` |
| `/home/maoqh/projects/ordessa-migration/` | 迁移工作区（契约、子代理产物、SWITCH 文档）；可归档至 `ordessa-legacy/` |

## 3. 切换步骤（草案，确认后执行）

前提：用户已确认本表与恢复步骤；后端集成与验证门已过；审阅代理无阻塞发现。

1. 冻结候选：记录候选 main SHA、`git fsck`、tag `baseline/cp-monorepo-0`。
2. 旧根内容搬至 `/home/maoqh/projects/ordessa-legacy/`（§1 中"搬迁"条目；原位保留条目除外）。
3. 将 `/home/maoqh/projects/ordessa` 让位：根内"保留原位"条目中，worktrees/ 群与运行例外（.c1-001-*、.mimocode、.qoder、runtime）移入 `ordessa-legacy/` 或按用户选择保留为新根环境例外。
4. 候选仓落位：`ordessa-monorepo-candidate` → `ordessa`（mv 或 clone+fetch，保持对象库完整）。
5. 重跑启动检查：`npm ci && npm run build && npm test`（桌面）；`python -m venv … && pip install -e packages/pacthold apps/server plugins/harness` + pytest（后端）；桥重建比对。
6. 复核：根内无嵌套 .git（除主仓）、无凭据、`git status` 干净（环境例外显式 .gitignore 并在 docs 登记）。
7. 回报 BASELINE_ESTABLISHED_WITH_KNOWN_ISSUES 或未完成项。

## 4. 恢复步骤（任一步失败/用户反悔时）

- 整体回退：`ordessa-legacy/` 按原结构搬回 `ordessa/`（目录级 mv，可逆）；候选仓留在原位或删除。
- 任一历史线恢复：见 `docs/reference-index.md`（bundle/克隆命令），与保全批次 `REPORT.md` §7。
- control 恢复：clone `checkpoints/control/control-checkpoint.bundle`，checkout `checkpoint/2026-09-25`（4fc80571）得到 2026-09-25 全部决策与任务状态。
- 57411 服务腿：从未被动过；其代码树（bc-native）若已搬走，从 `refs/archive/agent-box/heads/work/hd002-bc-native` 重检出于原路径即可（对象库未动，worktree 记录仍在 agent-box 主仓）。

## 5. 服务影响

- **无服务被停止/重启。** 57411 腿（pid 381142 等）继续以 `ordessa-legacy` 之前的原路径运行；其工作树条目 6 已列"保留原位"，若用户选择搬迁 worktrees 群，则 57411 腿的路径会失效——**默认方案是 bc-native 与运行例外原位不动，新根以环境例外方式与旧树共存**，待会话与服务腿结束后再清理（另批）。
- 4 个 qoder 会话（bc-native×2、fc-functional、desktop-ui-codex）的 cwd 在旧树；原位不动则不受影响。
- 18790/18810 试验服务器已在此前停止（2026-09-25 实测无监听），与本次切换无关。
