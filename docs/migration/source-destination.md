# Ordessa 根目录切换：source→destination 表与恢复步骤（草案 v1，切换前定稿）

状态：定稿待确认。候选 main 最终 HEAD `af31e92dc5eb...`（tag `baseline/cp-monorepo-0`，见 §0）；报用户确认后才执行切换。
本表覆盖 `/home/maoqh/projects/ordessa` 根内全部现存条目与根外相关路径。

## 0. 候选仓最终状态（2026-09-25 实测）

- 候选 main HEAD：`f8309c33f4a8`（tag `baseline/cp-monorepo-0`，已随收尾提交前移），祖先链 = 旧远端 main `6c14ea8d` → 8 个迁移提交（cd24ddd8 桌面 / 974e643a 后端 / b6a08cec 根文档 / db5ac119 workspaces 修复 / f70829f 文档与红账本裁定 / df632757 补 2 文件 / c0ff0479 移除桥二进制 / fa461219+573d5c15+af31e92d 记录）。
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
| 6 | `worktrees/harness-desktop-002/bc-native`（agent-box 工作树 @a0b343e0） | HD-002 后端候选；2 个 qoder 会话驻留；57411 服务腿运行中 | 历史进 `refs/archive/agent-box/heads/work/hd002-bc-native`；**定案：原位保留**（服务腿运行中）；退役=§3 步骤 9 **[USER GATE B]** | 原位（环境例外） |
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
| 19 | `runtime/native-pi-user`（运行数据） | 用户运行数据 | **定案：原位保留**，成为新根环境例外（.gitignore）；迁移运行数据另批 **[USER GATE C]** | 原位（环境例外） |
| 20 | `tools/`（excalidraw、lumino-host-probe、theia-probe，748M，多为 node_modules） | 探针/工具产物 | 搬至根外 `ordessa-legacy/tools/`（不进 Git） | 目录搬迁 |
| 21 | `.c1-001-runtime/`（686M，含 64B token 600） | C1-001 运行材料+凭据 | **定案：原位不动**（凭据与运行材料永不进仓），新根环境例外（.gitignore 忽略） | 原位（环境例外） |
| 22 | `.c1-001-secrets/`（drwx------） | 凭据目录 | **原位不动**，永不读取/复制/进仓 | 原位 |
| 23 | `.mimocode/`、`.qoder/` | 会话工具 | **定案：原位**，新根环境例外；随服务结束的清理另批 | 原位（环境例外） |
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

## 3. 切换步骤（唯一方案，确认后执行）

每步一条命令路径，无备选分支。执行者=本会话主代理；标注 **[USER GATE]** 的步骤必须先获用户明确答复。

前置条件：用户对本表无异议；后端集成与验证门全过；审阅发现已闭环。

1. 冻结候选：记录 `git rev-parse main` 与 tag `baseline/cp-monorepo-0`（二者同 SHA）；`git fsck` 留证据。
2. 建立接收目录：`mkdir -p /home/maoqh/projects/ordessa-legacy/{repos,workspace-root}`。
3. 搬迁旧工作区容器（§1 中 disposition="搬 ordessa-legacy" 的全部条目，逐条 `mv`，保持原名）：
   `mv ordessa/control ordessa-legacy/control`；
   `mv ordessa/repos/harness-{profile,provider,workboard} ordessa-legacy/repos/`；
   `mv ordessa/archive ordessa-legacy/archive-20260920`（2026-09-20 清理轮产物整体保留）；
   `mv ordessa/backups ordessa-legacy/backups`；
   `mv ordessa/releases ordessa-legacy/releases`；
   `mv ordessa/tools ordessa-legacy/tools`；
   `mv ordessa-migration ordessa-legacy/migration`（契约、子代理产物、验证脚本与全部日志）。
4. 删除根内符号链接（只删链接，链接目标一律不动）：`repos/backend`、`repos/desktop`、`repos/studio-legacy`，及 `worktrees/` 下 11 个符号链接（§1 条目 15）。
5. 让位旧根文档：`mv ordessa/{AGENTS.md,README.md,cleanup-report.md} ordessa-legacy/workspace-root/`（新根同名文件取代它们，原文留档）。
6. **[USER GATE A]** 停点：报告将移动的完整清单（逐条 src→dst）；用户答复后才继续。不移动（定案=原位保留，成为新根环境例外，已列新根 `.gitignore` environment-exceptions 段）：`worktrees/` 实体树（57411 服务腿与 4 个 qoder 会话驻留）、`.c1-001-runtime/`、`.c1-001-secrets/`、`.mimocode/`、`.qoder/`、`runtime/`。
7. 候选仓落位（唯一方法 = `mv`，对象库原样）：`mv /home/maoqh/projects/ordessa-monorepo-candidate /home/maoqh/projects/ordessa`。此步必须在第 3–5 步之后（目标非空则中止并回滚）。
8. 切换后验证（在正式根执行）：`git status`（预期：environment-exceptions 之外干净）；`git fsck`；`npm ci && npm run typecheck && npm test`；`python3.12 -m venv .venv && pip install -r apps/server/lockfiles/server-linux-py312.txt && pip install -e packages/pacthold -e apps/server -e 'plugins/harness[dev]' -e 'apps/server[dev]' -e 'packages/pacthold[dev]'` + 四套件严格对账（verify-clean.sh v2 门禁参数）；`bash plugins/harness/packaging/acp-adapter/build-acp-adapter-round-h.sh /tmp/x` 比对 sha256。
9. 回报 `BASELINE_ESTABLISHED_WITH_KNOWN_ISSUES`（或未完成项清单）。worktree/服务腿退役 = **[USER GATE B]**：用户确认会话结束后另批执行。

## 4. 回滚步骤（任一步失败即停，按序回退）

1. 第 7 步前失败：一切保持原状，第 2–5 步的每条 `mv` 原路反向 `mv` 回 `/home/maoqh/projects/ordessa/`（src→dst 一一对应，无覆盖）。
2. 第 7 步后失败：`mv /home/maoqh/projects/ordessa /home/maoqh/projects/ordessa-switched-<date>` 留证；旧根从 `ordessa-legacy/` 原路 `mv` 回；候选仓留在 `ordessa-switched-<date>` 待用户处置。
3. 历史恢复（任何时点）：`docs/reference-index.md` §How to restore——普通 clone + fetch archive/reference（已验证 +603 refs 全部可达）、bundle 克隆、workspace-backup tar（MANIFEST sha256 逐文件校验）、control checkpoint `4fc80571`（双路字节核验）。
4. 57411 服务腿：全程未触碰；若其工作树日后被移动，从 `refs/archive/agent-box/heads/work/hd002-bc-native` 于原路径重检出即可（agent-box 对象库未动）。

## 5. 服务影响

- **无服务被停止/重启。** 57411 腿（pid 381142 等）继续以 `ordessa-legacy` 之前的原路径运行；其工作树条目 6 已列"保留原位"，若用户选择搬迁 worktrees 群，则 57411 腿的路径会失效——**定案：bc-native 与运行例外原位不动，新根以 environment-exceptions 与旧树共存**（§1 条目 6、19、21、22、23；§3 步骤 6），会话与服务腿结束后再清理（[USER GATE B] 另批）。
- 4 个 qoder 会话（bc-native×2、fc-functional、desktop-ui-codex）的 cwd 在旧树；原位不动则不受影响。
- 18790/18810 试验服务器已在此前停止（2026-09-25 实测无监听），与本次切换无关。
