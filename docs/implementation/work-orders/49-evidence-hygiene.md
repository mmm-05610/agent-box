# Work Order 49 — 证据卫生：消灭假绿入口 + 计数口径可核验

状态：**READY_FOR_EXECUTION**（用户 2026-09-16 要求"加一个工单让那边的 goal 循环完成"；实现未开始）。
依赖：无（可随时插入；与 44–48 不冲突，改动面只在门脚本与文档）。
依据：2026-09-16 后端扫描（根套件实跑 605 passed/3 skipped/0 failed、tracked 内容无密钥串）。

## §0 目标

把两类**会制造不可信证据**的东西修掉：

1. **假绿入口**：四个全链门（pi/hermes/opencode/codex production-chain-gate.py）把
   `--worker` 默认写死成 `workers/agent-box-worker/.acceptance-bundle-**c4**/agent-box-worker`
   （`pi:52`、`hermes:75`、`opencode:59`、`codex:95`，且 `add_argument("--worker", default=...)`），
   而**现行 bundle 是 c8**、且 **c2–c8 七个目录都在盘上**——所以**不带参数**跑门会拿 2026-09-14
   的旧工件、却仍然 exit 0。任何人（包括验收）手跑一遍都会得到一份"看起来通过"的过时证据。
2. **计数口径不可核验**：`docs/implementation/status.md` 里 577 / 843 / 886 都标着"现行"，
   而口径不同（根 `tests` vs 含插件套件）——验收时最先看的就是这个文件。

**验收（第一手证据）**：

| 门 | 断言 |
| --- | --- |
| **G1 缺省即失败** | 四个门**不带** `--worker` 时非零退出，并给出**类型化原因**（含"要用哪个 bundle"的提示）；**反例测试**：不得静默采用任何写死的旧 bundle；`accept-e.ps1` / `runtime-artifact-gate.py` / `host-substitution-gate.py` 若同类问题一并修 |
| **G2 显式仍绿** | 显式给**现行** bundle（c8，`sha256:514f48a9…`）时，至少一家全链门（假端点）exit 0；Windows r4 用 c8 复跑（环境不允许则按 §6 记账，不得写成通过） |
| **G3 口径自洽** | status 每条计数都带**范围 + 命令 + HEAD** 三要素；全文件只有一条"现行"；历史数字明确标注"历史（已被取代）"；本单自己的报告也照此写 |
| **G4 不退化** | 根套件（基线 **605 passed / 3 skipped / 0 failed**，2026-09-16 实跑）+ 插件套件计数不降；门的行为除"缺参"外不变 |
| **G5 证据不被误删** | `git worktree prune` 后 `git worktree list` 无 prunable 残留；**`.acceptance-bundle-c2…c8` 一个都不删**（它们是历史证据） |

## §1 要做的事

### A 门脚本：默认不再猜

- 四个门的 `--worker` 默认值从写死的 c4 改成 **None**；缺省 → 类型化失败
  （例如 `GATE_WORKER_REQUIRED`），消息里给出仓库里现行的 bundle 路径与摘要；
- 门输出 JSON 里必须带**worker 目录名 + 摘要**（`worker.path` / `worker.sha256` 已有，确认逐门都在）；
- 反例测试（新增）：对每个门，缺参跑一次断言**非零退出 + 类型化码**；
- 同类排查：`accept-e.ps1`、`runtime-artifact-gate.py`、`host-substitution-gate.py`、以及
  §44–48 新增的门（若届时已存在），凡"写死某个 bundle/工件路径当默认"的一律按同一规矩改。

### B status 口径

- 每个计数写成：`范围（哪个套件） + 命令 + HEAD`；
- 只保留**一条**"现行"，其余标"历史（已被取代，见上）"；
- 顺手把 44–48 的进度条目按同一格式整理（不改变事实，只统一格式）。

### C 仓务

- `git worktree prune`（两个 prunable 条目）；
- 确认 `.acceptance-bundle-c2…c8` 保留；
- 把 47 §2.E 的收口项补全：删 `legacy_codex.py` 要**连两个 import 它的测试一起处理**
  （`tests/server/test_stage_c_codex.py`、`tests/server/test_stage_c_windows_wsl_offline.py`），
  不得只删实现留下 import 错误。

## §2 硬性规则

- 本单**零真实模型调用**；不碰 wire（28 方法、`wire/1`、事件 schema）；前端仓只读。
- **不动历史证据**：c2–c8 bundle、既有门输出 JSON、`docs/server-round1/**` 的历史记录一律保留；
  本单只改"默认值"与"措辞口径"。
- 不 reset/stash/clean、不 merge main、不 push；父/扩展/前端仓只读。

## §3 阶段

- **A** 四个门 + 同类脚本的默认值 + 反例测试；
- **B** 至少一家全链门 + Windows r4 用 c8 显式复跑（G2）；
- **C** status 口径统一 + 仓务 + 47 的补充（G3/G5）；
- **D** 回归（G4）+ 收口报告。

## §4 六件套 DoD

1. 实现（提交）；2. 反例测试（缺参必须失败，逐门一条）；3. 显式复跑证据（门 exit 0 + bundle 摘要）；
4. 回归计数（根套件 + 插件套件，带范围/命令/HEAD）；5. status 分账（自洽）；6. 清理证据
（worktree 列表、Git 状态、`git diff --check`）。

## §5 阻塞账格式

与 46 §7 相同。

## §6 报告格式

```text
结果：EVIDENCE_HYGIENE_DONE 或 EVIDENCE_HYGIENE_PARTIAL
G1：逐门缺参运行结果（退出码 + 类型化码）+ 反例测试计数
G2：显式 c8 复跑（哪几门、exit 码、worker.sha256）
G3：status 口径核对（"现行"条目数、三要素是否齐）
G4：根套件计数（范围/命令/HEAD）+ 插件套件计数
G5：worktree 列表、bundle 目录清单（c2–c8 齐全）
未做项与阻塞项：逐条
```

## §7 边界

- **不改变任何门的判据强度**（除"必须显式给工件"这一条）；
- **不合并任何分支**（含 `feature/capability-entry-v1`，见下）；
- 回父分支：之后单独一步。

## §8 与 `feature/capability-entry-v1` 的关系（记录，不在本单执行）

2026-09-16 只读检查：该分支**未合并**，独有提交含一整条能力入口切片（61 文件 / +8590 行，
含 `tests/capability/**`、`tests/server/test_capability_gate.py` 等），其提交链自称
`CAPABILITY_ENTRY_SLICE_REVIEW_READY`（E ACCEPT `d40435bd`）；工作树有一个未跟踪文件
`docs/capability-entry-v1/master-plan.md`。**是否合并进交付分支是一个独立决定**，需要：
① 只读复算它的检查点与测试；② 确认它是否与当前 44–48 的改动面冲突；③ 用户裁决。
本单**不动它**。
