# LNX-001 · 成果去向表（覆盖全部本地分支）

采样 2026-09-21 15:1x–15:5x +08:00。全集 = `sources.tsv` 里的 **100 条本地分支**
（backend 48 / desktop 47 / studio-legacy 5）+ 19 条 worktree 登记。逐字节输入见
`sources.tsv`，祖先/差集矩阵见 `parts/containment-matrix.tsv`，逐分支内容证据见
`parts/historical-branches.md`。**归组不遗漏：组内每条分支名都写出来。**

四档：**纳入候选**（新主线必须带走）／**已包含**（内容已在保留线里，无需动作）／
**暂存**（保留不删，按 D-0016 延期≠删除，且不进候选）／**需要进一步调查**（判据不足）。

---

## 1 backend `/home/maoqh/projects/agent-box`（48 条分支、10 个 worktree）

### 1.1 四条线自身 + main（6 条）

| 分支 | HEAD | 判定 | 依据 / 去向 |
| --- | --- | --- | --- |
| `feature/env-provider-v1` | `003b52b2b18a` | 纳入候选（基座之一） | 集成起点候选；wire 面独占方（见 `integration-analysis.md` §1.1） |
| `feature/env-provider-runtime` | `a7b7b6ff15ab` | 纳入候选（基座之一） | schema 20 与执行/存储独占方 |
| `main` | `6c14ea8db813` | **需要进一步调查**（仅 #66/#67 两笔） | 两笔与两条线**非 patch 等价**〔证实 `git cherry -v <线> main` 皆 `+`〕。#66 树 == `feat/resource-routing-phase2` 树；#67 引入两线完全没有的 `plugins/agent-box-session`（Official Session Store，2008 行 store + 8 契约测试）与 `plugins/agent-box-studio`，两线 `src`+`plugins` 对 `agent_box_session` 引用数 0 ⇒ **不并入不产生数据兼容断裂，并入才引入第二套 session 架构**。`harnesses.toml` 三形态已分叉（main 5 drivers / 两线 8 drivers，276+/237−）。长期取舍属 I（`parts/historical-branches.md` §6-U1） |
| `feature/server-harness-extension-v1` | `577b47ad402b` | **纳入候选——只有 1 个文件**；其余 500 提交暂存（历史档案） | 501 个独有提交里改 `src/`/`plugins/` 的**为 0**〔证实〕。唯一有运行价值的文件是 `scripts/server-round1/trial-serve-linux.py`（97 行，blob 自 `a0d82f1` 2026-09-18 起未变；两线均无此文件〔证实〕）。它是**唯一带凭据播种的 Linux 常驻启动入口**：两线自带 `python -m agent_box.server`（`src/agent_box/server/__main__.py`，64 行，`--data-root/--port`，默认 8732，`from uvicorn import run` at `:45`）全文 `credential` 命中 **0**；该脚本 23 处、注入 `MemorySecretStore` 并可选播种。根因在两线都存在的 nt 门：`feature/env-provider-v1:src/agent_box/server/bootstrap/runtime.py:318` `if secrets_store is None and os.name == "nt":`。脚本对自身树**零 import**（只 import `uvicorn` 与目标线的 `agent_box.*` 包），且 S-1/S-2 已分别用 env-provider 与 runtime-round1 两棵树跑过它 ⇒ 移植单文件即可，不需搬分支其余内容 |
| `studio-backend`（仓库主目录 HEAD） | `a9f749f6ff8c` | 暂存 | G1–G7 建 `plugins/agent-box-studio`，是 main#67 的**平行前身**（9 笔对 main 全 `+`）。session×harness 切换语义属 Studio 产品垂直（Studio = 历史参考）。主目录有 43 项未跟踪（`docs/product/*.md` 设计稿）——**动 main 目录前先保护** |
| `feature/harness-expansion-v1` | `c1a7ea9b8207` | 已包含 | 祖先关系直接成立（`--is-ancestor` 于两线）。但**不要**因此删工作树：其 ignored 目录含 `.acceptance-bundle-c4/-c8`，用户已裁定不得当缓存（`control/workspaces.md`） |

### 1.2 改判为"已包含"（3 条，原判未包含）

树级逐字节证据（`git diff --stat <branch> <commit>` 为空），比 patch 等价更强；
**仍不证明未合入分支的历史运行行为**。

| 分支 | unique | 逐字节等于 | 该参照在 |
| --- | --- | --- | --- |
| `refactor/harness-registry` | 6 | `80d2017`（#65 squash） | 两线 + main 的共同祖先〔证实〕 |
| `spike/real-governed-binding` | 4 | `dd34b84` | 两线祖先〔证实〕 |
| `feat/resource-routing-phase2` | 4 | `532cc99`（main #66） | **仅 main**，两线不含〔证实〕 ⇒ 随 §1.1 的 main 决定一起处置，不单独动作 |

`feature/capability-entry-v1`（51 unique）**改判为已包含（能力级）**：两线都含吸收提交
`642b1af` "50: absorb the capability layer by content and converge network.none@1"〔证实：`--is-ancestor` 于两线均为真〕；
分支的 capability 源文件对线零缺失、`CapabilityGateRefusal` 与 `authorized_providers` 门在两线在位、
`tests/capability/` 两线 9 文件 ≥ 分支 8。未入线的只有 `docs/capability-entry-v1/` 设计评审档案 ⇒ 留档。
（措辞：内容/能力级包含；patch 等价未主张。）

### 1.3 暂存：work-core 平行支线（4 条）

`feature/work-core-v0.1`、`spike/execution-binding-flow-stress`（同 HEAD `e340f3b`，各 1 unique）、
`feat/work-core-runtime-v0.1`（11）、`demo/work-core-self-use-2026-08-25`（9）。
拓扑：`986b221` 的两子——`e340f3b`（phase-1 支线）与 `dd34b84`（两线真正血统）**平行演化**；
线侧 `src/agent_box/work_core` 相对 `e340f3b` 净 `+2078/−373`，且线侧有 `db.py/finalization.py/
resource_observations.py/runtime.py`，支线侧的 `cli.py`、`providers/{codex,codex_jsonl,codex_launch}.py`
线内无同名实现。demo tip 与 feat 的 `5d1cd26` **patch 等价**〔证实 `git cherry` `-`〕。
判定暂存（并入会造成双 work-core 形态冲突）；`work_core/cli.py` 是否算运维缺口 → I 的 U3。不删。

### 1.4 暂存：老 GUI 发布线与 Windows 构建（11 条，各 1–3 unique）

`fix/gui-1.6.2/1.6.3/1.6.4/1.6.5/1.7.2/1.7.3/1.7.4/1.7.5/1.7.6`、`fix/staging-datawsl`（3）、
`docs/9p-landmine`（1）。全部挂在 1.6/1.7 release train 上，改的是 `gui-web/`（PyInstaller 打包 GUI）
与 `setup.iss`/release manifest；**`gui-web/` 在 main 与两条线都已不存在**〔证实 `git cat-file -e` 三处均 MISS〕。
其中 1.7.3/1.7.5 顺带改 `src/agent_box/launch.py` 的 `_MEI*` 环境去污、1.7.6 改
`src/agent_box/core/agent_types.json`（该文件线上不存在）——属打包形态专属，线以 PYTHONPATH 源码运行无此形态。
`docs/9p-landmine` 只有 `docs/RELEASE.md` +9 行（9P 陈旧 SOURCE → 打包前 `wsl --shutdown`），是 Windows 线延期期的运维知识。
**按 D-0016 保留不删**；Linux 原生主线不需要它们。

### 1.5 已包含（2 条 + 21 条一组）

- 包含于 `feature/env-provider-v1` + `feature/env-provider-runtime`（不含 main）：**2** 条
  —— `feature/harness-expansion-v1`（见 §1.1）、`feature/server-http-codex-r1`。
- 同时包含于两线与 `main`：**21** 条 —— `frontend/01-config`、`frontend/02-domains`、`frontend/03-migrate`、
  `frontend/04-form`、`frontend/05-tabs`、`frontend/06-hooks`、`frontend/07-i18n`、`frontend/08-verify`、
  `refactor/agent-type-registry`、`refactor/centralize-agent-registry`、`refactor/fix-resources-audit`、
  `refactor/layered-arch`、`refactor/remove-agent-box-crud`、`refactor/remove-shims`、`feat/acs-integration`、
  `feat/detail-storage-monaco-pr1`、`spike/checkpoint-workflow-contract`、`spike/minimal-work-core`、
  `spike/real-provider-compat`、`experiment/work-core-v0.1`、`feat/2.0-project-profiles`。
  （末 5 条与 `spike/*` 同 HEAD `986b221`，归组映射保留：`986b221` → 这 5 条分支。）

## 2 desktop `/home/maoqh/projects/agent-box-desktop-next`（47 条分支、6 条 worktree 登记）

| 分支 | HEAD | 判定 | 依据 |
| --- | --- | --- | --- |
| `feature/agentbox-desktop-product`（chat） | `08b4eac7fe10` | 纳入候选（基座之一） | 集成起点候选；服务侧 Workspace/发送诚实化/媒体 blob 方 |
| `feature/agentbox-desktop-settings` | `01083212aaad` | 纳入候选（基座之一） | 唯一演进过 `src/types/wire/wire-v1.ts` 与生成 schema 的一条；thought.delta、子代理可见性、i18n 完整性门 |
| `main` | `e08fa034f247` | 已包含（内容级），**但分支本体不得覆盖** | 11 笔独有提交：9 笔非 merge 全在 `docs/**` 与 `.agents/skills/**`〔证实：非 merge 提交文件清单去 docs/.agents 后为 0〕；2 笔 merge 的 second parent（`ee721f5d`=Q1、`b6932ea2`=Q2）**都是 `b8c2e0b6` 的祖先**〔证实〕⇒ 对产品码零净新增。树级复核：**main 有而 chat∪settings 并集没有的非 docs 文件数 = 0**〔证实〕。它是 publishing 分支，AGENTS.md 禁止覆盖 |
| `experiment/agentbox-desktop-frontend` | `31588667e19a` | 暂存（设计原型档案） | 9 笔建 `apps/desktop/src/dev/agentbox-product-preview/` + `agentbox-preview.html` + 10 张截图 + 六语各 5 个 preview 键；`9b41dd5b` 自述 "mock-only … design hold"。preview 目录/html 不在任何目标线〔证实〕 |
| `feature/desktop-wsl-round1` + `stageA/*` ×41 | — | 已包含 | 全部为 chat+settings+main 的祖先〔证实〕。逐条：`feature/desktop-wsl-round1`、`stageA/01`、`03`、`05`、`06a2`、`06b1`、`06c1`、`06c2`、`07a`、`07b`、`08`–`33`（各单条）、`stageA/23r`、`stageA/next-a/b/c`（同 HEAD `85463647`）、`stageA/wt-a/b/c`。同 HEAD 归组映射：`84f09cce`→{`23r`,`29`}、`85463647`→{`next-a`,`next-b`,`next-c`}、`c5bd645e`→{`21`,`26`}、`e5bf5c60`→{`19`,`22`} |

## 3 studio-legacy `/home/maoqh/projects/agent-box-studio`（5 条分支、3 个 worktree）—— 整体历史参考

| 分支 | 判定 | 依据 |
| --- | --- | --- |
| `studio-shell`（主目录 HEAD `8dce2c02`） | 暂存 | 相对 `main` 只 +622 行文档（PHASE2 + README）。主目录 16 项未跟踪含一个 16 MB `dsh-session-*.zip`（会话材料，**不入任何 Git、未读**） |
| `feat/agentbox-frontend-clean` = `feat/studio-product-ui-reconstruction`（同 HEAD `c65c133c`） | 暂存（提交级） | `881c56be` 与 studio-shell 的文档提交 patch 等价；`c65c133c` 为纯 `docs/design/` 计划文档。**但其工作树有 961 行 porcelain 未提交实现**（= 本调查实测 898 tracked + 63 untracked）——那是真正的 Studio UI 重建现场，只登记保护范围、不吸收入候选 |
| `feat/profile-provider-flat-transcript-ui` `3763d0c8` | 已包含 | 0 ahead / 2 behind `feat/agentbox-frontend-clean`〔证实〕 |
| `main` `93c33861` | 已包含 | 是 `feat/agentbox-frontend-clean` 与 `studio-shell` 的祖先〔证实〕 |

## 4 脏工作与 prunable 登记（只登记，不吸收、不清理）

本调查实测（`--no-optional-locks status --porcelain=v1 -unormal`，**untracked 目录按 1 条计**，
因此条目数不可与旧的逐文件口径直接相加；tracked 数与 2026-09-20 记录**逐字相同**）：

| 树 | tracked | untracked 条目 | porcelain 行 | 性质 |
| --- | --- | --- | --- | --- |
| `agent-box-studio-ui-reconstruction` | 898 | 63 | 961 | Studio 重建现场（478 在 `src/components`、204 在 `src/lib`）——**保护，不 diff** |
| `agent-box-server-round1` | 14 | 10 | 24 | 退休调度文本（acceptance/qa/reviews 台账） |
| `agent-box-studio-codex-vertical` | 57 | 39 | 96 | Studio vertical；含 1 个指向 `C:\Users\maoqh\agentbox-build-staging\…` 的条目（**只登记，未读**） |
| `agent-box`（BE 主目录） | 0 | 43 | 43 | `docs/product/*.md` 设计稿 |
| `agent-box-studio`（ST 主目录） | 1 | 15 | 16 | 13 篇 `docs/architecture/REMOTE_CONNECTION_*` + `.editorconfig` M + 会话 zip |
| `agent-box-desktop-next`（DT 主目录） | 2 | 5 | 7 | 未跟踪 `src/agentbox/`、`plugins/agentbox-lab/`、`docs/architecture/agentbox-system/` |
| `agent-box-desktop-next-agentbox-ui` | 0 | 4 | 4 | preview html/截图 |
| 四条线工作树 | 0 | 1 | 1 | 仅 `.qoder/` 工具目录 |
| `/tmp/audit-fe-2/{app,settings}` | 未测 | 未测 | — | 目录已缺失、Git 标 prunable〔证实〕。**未执行 prune/remove**；其 `data/`、`user-data/` 维持 `environments.md` 原状（含 `secrets/http-token`，路径登记、未读） |

## 5 汇总：新主线**必须带走**的历史分支成果只有 1 项

| 项 | 来自 | 为什么必须 |
| --- | --- | --- |
| `scripts/server-round1/trial-serve-linux.py`（97 行，单文件） | `feature/server-harness-extension-v1`（退休调度树） | 唯一带凭据播种的 Linux 常驻启动入口；两线自带入口受 `runtime.py:318` 的 nt 门限制、无凭据 ⇒ 没有它，Linux 侧凭据路径结构性失败 |

其余历史分支：1 项随 `main` 待 I 决定（#66/#67 与 Official Session Store）、3 项改判已包含、
1 项能力级已包含、其余全部暂存保留。**没有任何一项历史成果被判定为"可删除"。**
