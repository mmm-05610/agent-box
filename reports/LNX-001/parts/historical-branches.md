# LNX-001 · parts/historical-branches — 历史分支相关性/内容审计

签发背景:D-0018 整合授权下的只读证据收集。目标线 = backend `feature/env-provider-v1`(003b52b)、
`feature/env-provider-runtime`(a7b7b6f)、各仓库 `main`;desktop `feature/agentbox-desktop-product`(08b4eac7)、
`feature/agentbox-desktop-settings`(01083212)、`main`;studio `feat/profile-provider-flat-transcript-ui`、`main`。
全部判定基于只读命令(`log/show/diff/cat-file/ls-tree/rev-list/merge-base/cherry/grep` +
`--no-optional-locks status`);未运行任何脚本、未连接任何服务、未读任何凭证内容。
仓库缩写:**BE** = /home/maoqh/projects/agent-box,**DT** = /home/maoqh/projects/agent-box-desktop-next,
**ST** = /home/maoqh/projects/agent-box-studio。

## 判据说明

- "五类能力" = 本地启动 / 对话 / 配置 / 工具·工作区 / 数据兼容。
- patch 等价(`git cherry` 的 `-` 标记)只说明补丁内容相同,**不自动证明运行行为等价**;
  树级比较用 `git diff --stat A B` 为空 = 两棵树逐字节一致(比 patch 等价更强的内容证据,仍不证明未合入分支的历史运行行为)。
- 依据 D-0016,Windows/WSL 专属代码一律"延后保留",任何"暂存"都**不是删除建议**。

---

## §1 判定总表

| 分支 (repo) | 判定 | unique 提交 | 影响哪类能力 | 核心证据 | 建议去向 |
| --- | --- | --- | --- | --- | --- |
| feature/server-harness-extension-v1 (BE) | **纳入候选(仅 1 个文件)**;其余暂存(历史调度档案) | 501(其中改 src/ 或 plugins/ 的提交 = **0**) | 本地启动 | 唯一带凭据播种的 Linux 常驻启动脚本 `scripts/server-round1/trial-serve-linux.py`(blob 83a2dd8,a0d82f1 2026-09-18 添加,此后再未改动);两条目标线均无此文件;见 §2.1/§3 | 把该单文件移植入 `integration/linux-native-0`(签名兼容已在两线验证);调度史 docs 作为档案保留,不并入 |
| feature/capability-entry-v1 (BE) | **已包含(改判,能力级)** | 51 | 配置/工具·工作区(capability gate、bwrap 声明) | 两线均含吸收提交 642b1af "absorb the capability layer by content";`tests/capability/` 全套与 `CapabilityGateRefusal`(sidecar_backend.py ×4 命中)在两线在位;未入线的只有 docs/capability-entry-v1/ 设计/评审档案 | 无需并入代码;docs 留档。见 §2.2 |
| main #66/#67 (BE) | **暂存(平行架构)**,其中 1 项登记"需要进一步调查" | 2 | 数据兼容(session store)、配置(harnesses.toml 第三形态) | #66(532cc99) 树 == feat/resource-routing-phase2 树;#67(6c14ea8) 引入 `plugins/agent-box-session`/`agent-box-studio`,两线 plugins/ 下均无、src 零引用;harnesses.toml main=5 drivers vs 线=8 drivers,schema 分叉(276+/237-) | 不整体并入;agent-box-session 作数据兼容候选另题评估(§6-U1)。见 §2.3 |
| feat/work-core-runtime-v0.1 (BE) | 暂存(历史平行实现) | 11 | 执行编排(间接影响对话/工具) | e340f3b 起沿的 work-core v0.1 支线;线内 work_core 来自 dd34b84 治理核演化(对 e340f3b 态 +2078 行),无 `cli.py`/`providers/`;inspect CLI 等在线内无同名实现 | 保留不删;若将来需要 work-core inspect CLI 再回看。见 §2.4 |
| demo/work-core-self-use-2026-08-25 (BE) | 暂存 | 9 | 无独立能力(自证记录) | 与上同一提交串;tip 03903e8 与 feat 线 5d1cd26 **patch 等价**(`git cherry` 输出 `-`);另含 26c7994 自验证报告 docs | 保留即历史档案 |
| feature/work-core-v0.1 与 spike/execution-binding-flow-stress (BE,同 HEAD e340f3b) | 暂存(被取代的前身) | 各 1 | 无(phase-1 前身) | e340f3b 是 986b221 的另一子;线走了 dd34b84 子;其 work_core 文件在线内已大幅演化(见 §2.4 diffstat) | 保留 |
| studio-backend (BE,仓库主目录 HEAD a9f749f6) | 暂存(Studio 历史线) | 9 | 对话(session×harness 切换语义)——但属 Studio 产品垂直 | G1–G7 提交串构建 `plugins/agent-box-studio`(BE@05122c6 起);是 main #67 的**平行前身**而非祖先(9 提交对 main 全部 "+",树 diff 476 文件);两线 plugins/ 无 agent-box-studio | Studio 整体历史参考;切换语义(G4b)如需复用得从 main#67 的后继形态找。见 §2.5 |
| refactor/harness-registry (BE) | **已包含(改判)** | 6 | — | 树与 80d2017(main #65 squash,两线共同祖先)**逐字节一致**:`git diff --stat refactor/harness-registry 80d2017` 为空;cherry "+" 全是 squash 伪像 | 无需动作 |
| spike/real-governed-binding (BE) | **已包含(改判)** | 4 | — | 树与 dd34b84(`--is-ancestor` 确认为线内在)`git diff` 为空 | 无需动作 |
| feat/resource-routing-phase2 (BE) | **已包含(改判)** | 4 | — | 树与 main@532cc99(#66)`git diff --stat` 为空 | 无需动作 |
| fix/gui-1.6.2 / 1.6.3 / 1.6.4 / 1.6.5 / 1.7.2 / 1.7.3 / 1.7.4 / 1.7.5 / 1.7.6 (BE,各 1) | 暂存(老 GUI 发布线,Windows 专属) | 各 1 | 本地启动——但仅对 `gui-web/` PyInstaller 打包 GUI;gui-web 在 main 与两线**都已不存在**(`git cat-file -e` 三分支均 MISS) | 全部单提交链式挂在 1.6/1.7 release train(merge-base ebc755a "release 1.7.5");1.7.3/1.7.5 顺带改 `src/agent_box/launch.py` 的 `_MEI*` 环境去污,属 PyInstaller 泄漏问题,线以 PYTHONPATH 源码运行无此形态;1.7.6 改 `src/agent_box/core/agent_types.json`(线上不存在该文件) | 保留不删(D-0016);Linux 原生不需要 |
| fix/staging-datawsl (BE) | 暂存 | 3 | 无(Windows 构建 staging) | 29bdd75=merge main;466b4e6/0f28a2e 只动 `gui-web/data_wsl.py`、`setup.iss`、release manifest | 保留(9P/WSL 知识对窗口期有用) |
| docs/9p-landmine (BE) | 暂存(历史文档) | 1 | 无 | 5d13207 仅 `docs/RELEASE.md` +9 行:9P 陈旧 SOURCE 地雷 → pyinstaller 前 `wsl --shutdown` | 保留为 Windows 线延期期的运维知识 |
| feat/studio-codex-product-vertical (BE) | 暂存 + 保护范围 | 1 | 配置(5 harnesses launch facts docs)、harness adapter 修补 | 9ad2044 是 main#67 的**直接子**(`merge-base(main)=6c14ea8`);改 main 架构上的 adapters(+139 行,含 native_guard.py 21/start_context.py);线内 adapters 目录形态不同(无 native_guard/start_context) | 不并入;其工作树有 96 项未提交改动(§4),严格保护。 |
| experiment/agentbox-desktop-frontend (DT) | 暂存(设计原型) | 9 | 对话(仅 UI 语义原型,mock-only) | 提交串构建 `apps/desktop/src/dev/agentbox-product-preview/` + `agentbox-preview.html` + 10 张原型截图(docs/architecture/agentbox-prototype-screens/);预览目录与 html 不在任何目标线;i18n 增键只为 preview 屏幕;commit 9b41dd5b 明示 "mock-only … design hold" | 作为 UI 语义设计参考保留。见 §2.6 |
| studio-shell (ST) | 暂存(纯文档) | 1 | 无 | 8dce2c02 仅 +622 行 docs(PHASE2_IMPLEMENTATION + README 一行);= main + 该文档 | 保留 |
| feat/agentbox-frontend-clean = feat/studio-product-ui-reconstruction (ST,同 HEAD c65c133c) | 暂存(计划文档) | 2 | 无(提交级) | 881c56be 与 studio-shell 的文档提交 **patch 等价**(cherry "-");c65c133c 为 checkpoint 计划文档(纯 docs/design/) | 但其工作树有 961 项未提交实现(§4)——那是真正的 Studio UI 重建现场,只登记不吸收 |

> 复核包含矩阵用的可复现命令:`git -C BE rev-list --count <branch> --not main feature/env-provider-v1 feature/env-provider-runtime`
> 与上表 unique 列一致(其中 main 的 unique=2 是对两条 feature 线而言)。

---

## §2 深入调查

### 2.1 feature/server-harness-extension-v1(纳入候选:仅 trial-serve-linux.py)

**分支构成**:501 个 unique 提交里,按顶层目录统计 = docs/ 1284 次文件触碰、AGENTS.md 4、scripts/ 3、
.gitignore 1;**改 `src/` 或 `plugins/` 的提交数为 0**
(`git rev-list --count feature/server-harness-extension-v1 --not main feature/env-provider-v1 feature/env-provider-runtime -- src plugins` → 0)。
分支的 src 就是与两线 merge-base(47895e4)处的旧状态。因此它是**纯调度/验收档案树 + 3 个运维脚本**,
tip 577b47a 自己也宣告退休("docs: retire the scheduling entry here and point it at ordessa/control")。

唯一有产品运行价值的文件:`scripts/server-round1/trial-serve-linux.py`(97 行,a0d82f1 2026-09-18 22:08
"trial tooling: the Linux trial server launcher and its three hard constraints",blob 83a2dd8 至今未变;
工作树 /home/maoqh/projects/agent-box-server-round1 的 scripts/ 无未提交改动,`status --porcelain -- scripts/` 为空)。

**它为什么存在**(脚本 docstring 自述,与实测一致):默认 composition 只在 `os.name == "nt"` 时建 DPAPI
secrets store——该 nt 门在两线仍然存在:
`feature/env-provider-v1:src/agent_box/server/bootstrap/runtime.py:318`
(`if secrets_store is None and os.name == "nt":`)。所以 Linux 常驻服务没有凭据库,
凭据依赖路径全失败。此脚本注入 `MemorySecretStore` 并可选播种一条凭据,补上这个洞。

**树内依赖 = 零**。它 import 的全部是:`uvicorn`、`agent_box.server.bootstrap.build_runtime_from_sidecar_deployment`、
`agent_box.server.ids.opaque_id`、`agent_box.server.transport.http.create_app`、`agent_box.storage.MemorySecretStore`。
逐项核实,这些符号在两线都在且签名一致:

- `build_runtime_from_sidecar_deployment(data_root, deployment_path, secret_store=None, *, plugin_root, mount_bindings)`
  在两线 `src/agent_box/server/bootstrap/runtime.py` 签名逐字相同(两线 `git grep -A8` 实测);
- `create_app` 在两线 `src/agent_box/server/transport/http/__init__.py:1` 重导出;
- `MemorySecretStore` 在两线 `src/agent_box/storage/secrets.py`,`src/agent_box/storage/__init__.py` 导出;
- `register_credential` 在两线 `src/agent_box/server/persistence.py`;
- `uvicorn>=0.30,<1` 在两线 `pyproject.toml:47`。

**"是否唯一可运行的 Linux 启动脚本"的准确回答**(两问分开):

1. **常驻监听 uvicorn 的 Linux 启动入口在全部相关树里只有两个** —— 本脚本,与两线自带的
   `python -m agent_box.server`(`src/agent_box/server/__main__.py`,支持
   `--data-root/--port/--sidecar-deployment/--plugin-root/--mount`)。全仓 `uvicorn.run` 命中仅这两处
   (两线 scripts/ 下无第二处)。
2. 但 `__main__.py` 入口 **没有凭据播种**(无 `--credential-*` 参数,也不注 MemorySecretStore),
   受同一 nt 门约束:Linux 上起来后凭据路径必失败。所以**带凭据的 Linux 试用启动脚本目前唯一一份,就在退休调度树里**。
   实证:两台在跑的服务 S-1(18790)/S-2(18810)都直接执行这份脚本(environments.md §1 记录其命令行),
   S-2 的 PYTHONPATH 指向 runtime-round1(即 env-provider-runtime 工作树)——**等于已实测该脚本对两条线的树都能跑**;
   S-1 用 env-provider 工作树 @ 启动时刻 b630acd。

**结论/去向**:把 `trial-serve-linux.py` 单文件移植进 `integration/linux-native-0`
(建议放 `scripts/server-round1/` 同路径,保持与在跑服务的命令行可比对)。这是本历史分支唯一"纳入候选"项。
分支上的其余 500 提交按 D-0018/AGENTS.md 是退休调度档案:**保留归档,不并入产品分支**。
cdp-read.py(读 S-4 的 CDP 取证)与 remote_runner.py(云端 job runner)是调度器运维工具,不属五类能力,暂存。

### 2.2 feature/capability-entry-v1(改判:已包含,能力级)

51 个提交做的事(CAP-01 "capability entry module v1"):定义能力条目四段契约
(`src/agent_box/extensions/capability/{ids,documents,match,requirements,selection,errors}.py`),
把 bwrap 沙箱的中性声明(`plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/declarations.py`)
接进 bootstrap 注入链,并在 `_start_run` 里实施 capability gate 零生成(zero-spawn)拒绝 +
`CapabilityGateRefusal` 来源隔离 + public post-open impostor 反例(D 评审 R1–R4 串,
代表提交 df34e7e / c45eff5 / e70f433 / 4b60a8b;tip 1c74d15 自评 "CAP-01 delivered … CAPABILITY_ENTRY_SLICE_REVIEW_READY")。

**包含证据(不是靠 commit message,是内容)**:

- 两线都含吸收提交 **642b1af** "50: absorb the capability layer by content and converge network.none@1"
  (`--grep='absorb the capability'` 在两线各命中 1 次;`merge-base --is-ancestor` 确认 642b1af 同时在两线)。
  分支点 897a833 处两线尚**无** `CapabilityGateRefusal`(git grep 为 0),吸收点在其后 ⇒ 方向为分支→线。
- 现状:`CapabilityGateRefusal` 在两线 `src/agent_box/server/execution/sidecar_backend.py` 各 4 处在位;
  `authorized_providers` 门逻辑在两线 sidecar_backend.py:803–839(注释与变量实测);
  `tests/capability/` 两线 9 个文件 ≥ 分支 8 个;impostor 测试(`tests/server/test_capability_gate.py`)在两线在位;
  分支的全部 capability 源文件在线上一无缺失(逐文件 `cat-file -e` 循环,MISS=0)。
- 分支相对线独有内容 = docs/capability-entry-v1/ 设计与多轮评审台账(+1 个工作树未跟踪 master-plan.md,§4)。

**谨慎表述**:这是"内容/能力级已包含"。patch 等价未被主张;线内实现是吸收后的演化形态
(sidecar_backend 在两线又前进了数百行),补丁相同不自动证明运行行为等价——但 S-1/S-2 正跑在两线的这份代码上,
是当前最接近运行等价的外部证据。去向:不需要并入;docs/capability-entry-v1 留档。

### 2.3 backend main:#66/#67 与两线在 harness adapter / session store 上的关系

两线分叉点 = main@80d2017(#65,2026-09-01)。main 其后只有两笔:
532cc99 #66(09-02,"harden native profile and harness runtime boundaries")与
6c14ea8 #67(09-05,"Studio backend core with Official Session Store and five real harnesses")。
`git cherry -v` 对两线均标 "+"(不 patch 等价)——因为 PR 是 squash 合并。内容级结论:

- **#66 树 == feat/resource-routing-phase2 头**(diff 为空,§5):对它的评估等价于评估 phase2 分支,
  而 phase2 全部 4 提交的内容就是 main 的祖先 #66——已包含于 main 这个目标参照;两线不含它。
- **#67 引入两个两线完全没有的包**:`plugins/agent-box-session/`(Official Session Store,
  store.py 2008 行 + 8 个契约测试文件)与 `plugins/agent-box-studio/`(Studio HTTP 服务:
  server/app.py、store.py、orchestrator.py、claude_channel.py)。两线 `src/`+`plugins/` 对
  `agent_box_session` 的引用数 = 0;两线的会话持久化走自己那套
  (`src/agent_box/server/persistence.py` + `src/agent_box/storage/database.py` + `src/agent_box/migrations/0NN_*.sql`)。
  **在跑的试用数据根(/home/maoqh/.agentbox-trial-chat,只登记路径)用的是线的 migration schema,不是 agent-box-session 的 schema** ⇒
  不把 #67 并入不产生任何数据兼容断裂;反过来把 #67 并入才会引入第二套 session 架构。
- **harness adapter 关系**:adapters/ 目录同源(80d2017)后双向分叉。main 侧 #67/9ad2044 演化出
  `composer/failures/native_guard/native_render/staging/start_context/launch_plan` 形态;
  两线侧演化出 `dsh/kilo/qwen` 新 driver 与 `skill_observation` 形态(native_guard/start_context 在两线 adapters/ 下不存在)。
  `harnesses.toml` 三方都在但 schema 已分叉:main 5 drivers(codex/claude/hermes/opencode/pi)+ 研究校准注释;
  两线 8 drivers(增 dsh/kilo/qwen)+ capability 声明结构(中文注释、test_capability_declarations.py 交叉)。
  diff = 276+/237-。**不能假定同文件即兼容。**

**判定:#66/#67 暂存(平行架构线,Studio/main 血统)。** main 分支本体是目标参照、当然在基座里;
但 #66/#67 这两笔对四线整合是"可要可不要",Linux-native-0 不需要它们即可跑通启动/对话/配置/工具;
Official Session Store 是否作为未来"单一权威会话存储"纳入,超出本调查判据,登记 §6-U1。

### 2.4 work-core 支线(feature/work-core-v0.1 / spike/execution-binding-flow-stress / feat/work-core-runtime-v0.1 / demo/work-core-self-use-2026-08-25)

拓扑:986b221(release 1.9.0 #62)有两个子——e340f3b "feat: add production minimal work core phase 1"
(= feature/work-core-v0.1 与 spike/execution-binding-flow-stress 双 tip,再向上是 demo(9)与
feat/work-core-runtime-v0.1(11)),和 dd34b84 "feat!: introduce Agent-Box 2.0 execution governance core"
(两线的真正祖先)。即 **phase-1 支线与线本体是平行演化**:

- 两线 work_core 实际来自 dd34b84 及其后演化;把 e340f3b 与 evp 线的 `src/agent_box/work_core` + 004 migration
  做 diff:多数同名文件(errors/events/models/projection/registry/repository/services)两边都在,但线侧净演化
  **+2078/-373 行**(15 文件,`git diff --stat e340f3b feature/env-provider-v1 -- src/agent_box/work_core`),
  线侧另有 dd34b84 系的 `db.py/finalization.py/resource_observations.py/runtime.py`,而支线侧的
  `cli.py`、`providers/{codex,codex_jsonl,codex_launch}.py`、`services.py` 的 phase-1 形态不在线内。
- 两线 work_core 是活代码:harnesses/artifacts/git 等 10+ 模块 import 它(`git grep -l 'from agent_box.work_core'` 两线均命中)。
- demo tip 03903e8 与 feat tip 5d1cd26 patch 等价;feat 顶多两笔:26c7994 自验证报告 docs、
  8726785 devtool-launch skill(docs/.agents 技能文档)。

**判定:暂存(平行前身/实验实现)。** 影响面:执行编排,属对话/工具的间接层,但线的 dd34b84 血统已覆盖
其能力面且被在跑服务使用;支线的 inspect CLI/continuation recovery 是**不同实现的参考**,纳入会造成双 work-core
形态冲突。若未来要补 `work_core/cli.py`(运维 inspect),从 8726785^..5d1cd26 取材再调查。不删。

### 2.5 studio-backend(= 仓库主目录 HEAD a9f749f6)

9 笔 G1–G7(05122c6 session domain/store/profile facade;ceda853 codex App Server 受治理轮次编排;
5fdc3ef session×harness switching:cursor resume / fresh / explicit handoff;7de20da 跨 harness e2e)。
它构建 `plugins/agent-box-studio` 服务包。与 main#67 关系:**平行而非祖先**——merge-base=80d2017,9 笔对 main
全部 "+"(squash 吸收进了 #67),#67 的 agent-box-studio 是其后继(38 文件 5417+/4668- 的差异)。
两线 plugins/ 无 agent-box-studio。影响五类?对话语义(session×harness 切换)有价值,但属 Studio 产品垂直,
而 Studio 已由用户定位为历史参考。主目录树另有 43 项未提交(多为 docs/product 设计稿,§4),**这是工作区入口目录,
任何后续动 main 目录前先保护它**。判定:暂存。

### 2.6 experiment/agentbox-desktop-frontend(DT)

9 笔都在做 "agentbox-ui 语义原型":stage-0 语义地图 docs(90e0741b/82d0f3c0)、
mock-only 可点击原型(936e6bd2 起,`apps/desktop/src/dev/agentbox-product-preview/` +
`agentbox-preview.html`)、10 状态截图、以及 i18n 六语言各 +5 键(纯 preview 键)。
9b41dd5b 明示 "in-place preview … batch 34 remains on design hold";最后 31588667 删除了一个遮蔽的
project-local skill 副本。preview 目录与 html 不在任何目标线(实测 ls-tree 空)。
影响面:对话(会话 UI 语义)/配置(settings 屏语义)——**但全部是 mock-only 设计参考**,
产品语义已由 stageA 线(已包含)实现。判定:暂存(设计参考档案)。其工作树另有 4 项未跟踪(§4)。

---

## §3 server-harness-extension-v1 与活运行时基础设施的关系

综合 §2.1 与 control/environments.md(2026-09-20 实测记录,未触碰):

1. **退休的是调度权威,不是运行时**。工作树 /home/maoqh/projects/agent-box-server-round1 的
   `scripts/server-round1/trial-serve-linux.py` 被 S-1(18790)与 S-2(18810)**直接执行**;
   environments.md §4.1 明令"S-1/S-2 在跑期间不得移除/移动该工作树"。
   AGENTS.md 的"read-only history"约束与它作为活运行时的身份并存,不矛盾。
2. **该脚本对树是寄生式的零依赖**:代码不 import 自身树内任何东西,业务逻辑全部来自
   `--plugin-root`/`PYTHONPATH` 指向的 env-provider / runtime-round1 工作树(即两条目标线的检出)。
   换言之,树内其余 500 提交(docs)与运行时无关;把它移植到目标线后,S-1/S-2 式的运行完全可由线自身支撑
   ——这是移植建议的依据。**但迁移在跑的服务进程本身不在本任务范围,也不允许**(不重启服务)。
3. 附带核查:两线 scripts/server-round1 各有 45/54 个脚本(生产链 gate、artifact builder 等),
   其中没有任何常驻 Linux serve 入口(`uvicorn.run` 仅 `__main__.py` 一处);gate 类脚本用 TestClient
   进程内跑,不能替代试用服务。
4. 同一分支里另两个脚本(`cdp-read.py` 读桌面端 CDP 取证、`remote/remote_runner.py` 云端 job runner)
   只在调度会话内有意义,与五类能力无关;若移植 trial-serve-linux.py,**不要**顺带搬它们。

---

## §4 Studio(及相关工作树)保护范围登记 —— 只登记路径,不吸收、不 diff

| 树 | 分支/HEAD | 未提交规模(实测 `--no-optional-locks status --porcelain` 行数) | 有未提交工作的路径(聚合,只列前缀) |
| --- | --- | --- | --- |
| /home/maoqh/projects/agent-box-studio-ui-reconstruction | feat/agentbox-frontend-clean @ c65c133c | **961**(工单原记 898,现为实测值) | src/components(478)、src/lib(204)、src/features(77)、src/hooks(46)、src-tauri/tests(35)、src/app(28)、src-tauri/src(23)、src/core(17)、src/contexts(17)、src/stores(15)、docs/design(3)、src-tauri/resources(2)、vitest.config.ts、tests/、src-tauri/tauri.conf.json |
| /home/maoqh/projects/agent-box-studio-codex-vertical | feat/studio-codex-product-vertical @ 9ad2044 | **96**(57 项已跟踪修改 + 39 项未跟踪) | plugins/agent-box-studio(38)、plugins/agent-box-harnesses(35)、plugins/agent-box-model-providers(10)、docs/validation(4)、src/agent_box(3)、plugins/agent-box-runtime-local(2)、plugins/agent-box-workspace-wsl(1)、installer/、tools/、1 个指向 `C:\Users\maoqh\agentbox-build-staging\…` 的路径名条目(**只登记,未读**) |
| /home/maoqh/projects/agent-box-studio(main 目录) | studio-shell @ 8dce2c02 | 16 | docs/architecture/ REMOTE_CONNECTION_* 等 13 篇未跟踪、docs/implementation/、docs/research/hermes-desktop-file-map-2026-09-10/、`.editorconfig`(M)、1 个 zip 会话包(未读) |
| /home/maoqh/projects/agent-box(BE 主目录,studio-backend @ a9f749f6) | studio-backend | 43 | 多为未跟踪 docs/product/*.md 设计稿 + .zcode/ |
| /home/maoqh/projects/agent-box-server-round1 | feature/server-harness-extension-v1 | 24 | docs/acceptance、docs/qa、docs/reviews 等调度台账(修改)+ 1 个未跟踪 png 截图 + docs/remote/results/ |
| /home/maoqh/projects/agent-box-capability-entry-v1 | feature/capability-entry-v1 | 1 | docs/capability-entry-v1/master-plan.md(未跟踪) |
| /home/maoqh/projects/agent-box-desktop-next(DT 主目录) | main @ e08fa034 | 7 | 未跟踪 apps/desktop/src/agentbox/、apps/desktop/src/plugins/agentbox-lab/、docs/architecture/agentbox-system/ 等 |
| /home/maoqh/projects/agent-box-desktop-next-agentbox-ui | experiment/agentbox-desktop-frontend | 4 | 未跟踪 apps/desktop/agentbox-preview.html、preview-test.html、design-pending-badge.tsx、docs/architecture/agentbox-inplace-preview-screens/ |
| /home/maoqh/projects/agent-box-runtime-round1 / -env-provider | 两目标线工作树 | 各 1 | 未跟踪 .qoder/(工具目录) |

`/tmp/audit-fe-2/{app,settings}` 两个 prunable 登记 worktree 与 `/tmp/audit-fe-2/data|user-data`(含
secrets/http-token,**路径登记,未读**)维持 environments.md 原状,不得触碰。
Studio 两棵大树结论:**保护范围如上;不进入任何纳入候选;未逐文件读取,diff 一律未做。**

---

## §5 已改判"已包含"的分支及依据

| 分支 | 原判 | 改判依据(命令级) |
| --- | --- | --- |
| BE refactor/harness-registry(6) | 未包含 | `git diff --stat refactor/harness-registry 80d2017` → **空**(树逐字节一致);80d2017=#65 squash,是两线共同祖先(`merge-base main feature/env-provider-v1` 实测)。cherry 的 "+" 是 squash 伪像 |
| BE spike/real-governed-binding(4) | 未包含 | `git diff --stat 33c4407 dd34b84` → 空;`merge-base --is-ancestor dd34b84 feature/env-provider-v1` → true |
| BE feat/resource-routing-phase2(4) | 未包含 | `git diff --stat feat/resource-routing-phase2 532cc99` → 空;532cc99 是 main(目标参照)祖先。注:main#66 内容即此树 |
| BE feature/capability-entry-v1(51) | 未包含 | 能力级包含:两线含吸收提交 642b1af;`tests/capability/` 与 `CapabilityGateRefusal`/authorized_providers 门在两线在位;分支 capability 源文件对线零缺失(逐文件 cat-file 验证)。patch 等价未主张;运行证据 = S-1/S-2 正跑在两线的这份演化后代码上 |
| BE 已包含名单(任务给定) | — | 未发现相反证据;其中 986b221 组与 dd34b84 拓扑复核一致(e340f3b/33c4407 各为 986b221 另一子) |

demo/work-core-self-use 的 tip 与 feat/work-core-runtime 的 5d1cd26 patch 等价(`git cherry` "-"),
但它本身无独有内容,故随支线一并"暂存"而非"已包含"。

---

## §6 不确定点

- **U1|main#67 的 Official Session Store 是否长期需要**。两线完全不用它、试用数据不用它的 schema,
  对 Linux-native-0 判"暂存"是安全的;但 D-0016 保留的"单一权威存储"不变量若未来指向 agent-box-session
  的契约(`plugins/agent-box-session/src/agent_box_session/schema.py`,388 行 schema + versioning 测试),
  需要 I 单独决策。判据外,不展开。
- **U2|S-1 运行版本 b630acd ≠ env-provider HEAD 003b52b**(相差 10 提交,environments.md 记录)。
  移植 trial-serve-linux.py 后,未来某次重启会跳到新 HEAD;本轮无法验证新旧行为差(禁止运行/重启),
  移交 I 作为"何时允许换钉"的问题。
- **U3|feat/work-core-runtime-v0.1 的 `work_core/cli.py`(inspect CLI)是否构成运维能力缺口** ——
  两线无同名实现,但也无人主张需要;若 I 判定需要,再做端口性调查(取材点 §2.4)。
- **U4|harnesses.toml 三形态**(main 5-driver 研究校准版 vs 两线 8-driver capability 声明版)将来 main
  作为集成基座时的冲突面:**本报告按任务约束只称"重叠/分叉",未做任何合并预演**。
- **U5|"暂存"分支的 fix/gui-\* → src/agent_box/launch.py `_MEI` 去污**两笔(1.7.3/1.7.5)是否对
  未来把服务端打包成 Linux 单文件时同样成立——当前产品不打包 GUI,判暂存;若打包决策变化需回看。
- **U6|工单计数与实测的漂移**:codex-vertical 未提交规模实测 96(57 tracked + 39 untracked),
  ui-reconstruction 实测 961;以本报告实测值为准,路径清单见 §4。

*全部操作均只读;未写任何产品仓库;未运行/连接 18790/18810/18830/9222。*
