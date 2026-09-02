# NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE — 最终收口（2026-09-02）

本报告闭合最后四项审计缺口：严格 terminal transition、Execution freeze 的
物理 Native Home 完整性验证、committed mutation 的 API outcome 语义、以及
显式 fsync durability scope。未执行 git 写操作；未读取 credential 内容；未
执行真实模型请求；未修改 Work Core/schema/migrations；API v2 不变。

## 1. Verdict

**COMPLETE** —— 四项缺口全部修复并锁定；新增 31 项正式测试；fake/protocol/
transaction 测试零 skip；未删/未放宽既有测试（仅按新语义重写 4 个 committed-
outcome 测试与若干 fixture 时序）。

## 2. Baseline / dirty preservation

branch `feat/resource-routing-phase2`，HEAD `1a3c3083…`，94 项 dirty 为基础；
本轮回新增/修改后现 95 项，全部为前序+本轮成果，未 reset/checkout/clean/stash；
`git diff --check` 全程干净。

## 3. Strict terminal transition result

- `COMMITTED` 只能从 `POINTER_COMMITTED` 进入（linear 与 reconcile 两图一致）；
  `ROLLED_BACK`/`RECOVERY_REQUIRED` 允许前驱 = operation graph 内任意合法
  非终态 step；terminal 唯一、必须为最后一步。
- `ProfileTransaction.step()`/`commit()`/`validate_journal()`/`read_journal()`
  共用同一 `valid_terminal_transition` authority；`PREPARED→COMMITTED`、
  `STAGED→COMMITTED`、`APPLIED→COMMITTED`、`REVISION_WRITTEN→COMMITTED`、
  reconcile `APPLIED→COMMITTED` 全部拒绝（step 级与 journal 级都测）。

## 4. Recovery-confirmed commit transition

- 修复此前由反例暴露的缺陷：recovery 判定 actual==proposed 且 committed
  state 完整、但 journal 缺 POINTER_COMMITTED 时，不得直接跳到 COMMITTED。
- `close_committed()`/`recover_pending()` 现在走统一 `_append_terminal`
  helper：先按 operation graph 补写 `POINTER_COMMITTED`
  （`confirmed_by_recovery=True`、`pointer_committed=True`），再写
  `COMMITTED`；只有合法前驱（REVISION_WRITTEN/APPLIED，即 POINTER_COMMITTED
  的直接前驱）才允许补写；malformed journal 永不被自动补齐。
- 测试：premature-commit 全矩阵拒绝、terminal 后追加拒绝、recovery-confirmed
  path accept、重复 recovery 幂等。

## 5. Native Home physical integrity freeze

`NativeHomeView.prepare()` 在 mutation lease 内新增：以同一 NativeHomePolicy
bounded walk **重新计算 persistent native-home 的实际 tree digest**，与
pointer 的 `native_tree_digest` 比较；缺失/格式非法或不等 → typed
`PROFILE_FREEZE_NATIVE_HOME_DRIFT`。失败时无 execution view、无 active
marker、无 lease 残留、不改 pointer、不自动接受外部修改；计算出的实际 digest
绝不回写 pointer（pointer 补齐仅限显式 migration/recovery 流程）。

## 6. Five Harness freeze result

参数化测试覆盖 codex / claude-code / opencode / hermes / pi：
digest 匹配时 prepare 成功；config/unknown/session 三类外部漂移全部 typed
拒绝；credential sentinel（0o000）证明漂移检查不读 credential 内容；
symlink 漂移 typed fail；pointer tree-digest 缺失 fail closed。执行视图内的
session mutation 仍走 reconcile/generation（真实路径保持），transaction 外
的 persistent home 变化一律 drift 拒绝。

## 7. Committed mutation API outcome

`handle_mutation_failure()` 现在**返回 typed decision**（COMPLETE_COMMIT /
ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED）。调用方（put、record_skill_mutation、
legacy import、envelope migration、installer install/update/rollback/remove、
reconcile）显式分支：

- COMPLETE_COMMIT → 返回原本的成功结果（payload / receipt / removed /
  ok ReconcileReport）；无法安全构造时抛 `CommittedMutationError`
  （`PROFILE_MUTATION_COMMITTED`，携带 harness/profile/committed_revision/
  committed_digest/operation——不再泄漏原始 OSError 让上层误判失败）。
- ROLLBACK_TO_PREVIOUS → 保留原始业务失败。
- RECOVERY_REQUIRED → typed `PROFILE_RECOVERY_REQUIRED`（skill 路径
  `SKILL_INSTALL_RECOVERY_REQUIRED`），不假装普通回滚。

测试：pointer 落地 + journal step 异常 → API 返回 committed success、状态
前进、stale-CAS 重试得 REVISION_CONFLICT（调用者可区分）；pointer 未落地 →
rolled-back 失败、状态不变；actual/proposed mismatch → typed recovery-
required。覆盖 fresh/existing put、skill install/update/remove、legacy
import、reconcile（部分路径由既有窗口测试覆盖 + 新 outcome 测试）。

## 8. Rolled-back / recovery-required outcome

同上：ROLLED_BACK 保持原失败语义（不伪装 committed）；RECOVERY_REQUIRED 以
typed code 抛出，public diagnostic 无 traceback/host path/credential；Web
facade 可按 error code 区分 committed / rolled-back / recovery-required。
对真实 response loss/process death：文档承认调用者可能不知道结果，可通过
exact profile read、expected revision/CAS、transaction status 确认；不承诺
跨网络 exactly-once，但当前进程已证明 committed 时绝不返回普通失败。

## 9. Durability primitive

新增 `native_home/durable.py`：`atomic_write_durable`（temp→flush→fsync
file→os.replace→fsync parent dir）、`remove_durable`（unlink+fsync parent）、
`fsync_file`/`fsync_directory`（目录 fsync 能力探测一次）、
`DurabilityRecorder`（可注入的顺序记录/故障注入口，不用全局 monkeypatch）。
durability 声明：local POSIX-like filesystem、atomic same-directory rename、
fsync 可用 → process-crash + power-loss durable（subject to filesystem
honoring fsync）；网络/分布式文件系统不在保证内；目录 fsync 不可用平台 →
typed `DIRECTORY_FSYNC_UNSUPPORTED` 显式降级为 process-crash-only，绝不静默
声称 durable。

## 10. Durability ordering

journal（REVISION_WRITTEN/intent/POINTER_COMMITTED/COMMITTED 各步骤）、
revision envelope、profile.json pointer、installed-skills index、lease/active
marker 全部走 durable primitive。commit ordering 由 recorder 断言：
intent journal durable → pointer replace durable → POINTER_COMMITTED journal
durable → COMMITTED journal durable（`intent_at < replace_at < commit_at`）。

## 11. fsync failure matrix

- journal 写入 fsync 失败 → `JOURNAL_DURABILITY_FAILED` / typed
  recovery-required，零持久化残留，事后可重新创建；
- pointer replace fsync 失败 → 回滚（pointer 未落地），后续创建成功；
- pointer durable 后 committed journal 失败 → committed outcome 语义
  （§7）生效；
- 删除路径（journal/pointer/tx 目录）parent-dir fsync 失败 → typed 诊断，
  不影响已提交状态（由 retention 兜底）。

## 12. Transaction artifact retention / pruning

新增 `prune_terminal_transactions(layout, keep=16)`：COMMITTED/ROLLED_BACK
journal 与其事务目录（含 uninstall 的 recoverable backup）按 mtime 保留
最近 16 个，其余 durable 删除；malformed journal 永不自动清理（人工证据）；
cleanup 失败不影响已提交状态且给出 typed diagnostic。transactions/ 不再
随 post-commit failure 或 uninstall 无界增长；uninstall keep_backup 的
backup 受同一 pruning 管辖（测试：大量提交 + uninstall backup 后 ≤16）。

## 13. Added adversarial tests

`test_final_durability_and_freeze.py`（31 项）：terminal authority 参数化、
premature-commit 全矩阵、recovery-confirmed transition、durability barrier
顺序、fsync 故障矩阵、committed/rolled-back/recovery-required outcome、
CommittedMutationError identity、五家物理 freeze、config/unknown/session
漂移、credential sentinel、symlink 漂移、pointer digest 缺失、
retention/pruning、malformed 保留。

## 14. Full Python tests

harnesses **420 passed + 4 skipped**（仅真实 bwrap/native 探测）；root 144；
skills 8；acp 40；runtime-local 6；sandbox-bwrap 12；terminal-session 3；
git 4；artifacts 2；web 17。指定六文件全部通过。

## 15. ACP/OpenCode regressions

agent-box-acp 40、opencode ACP/parity/probe/mode 全通过；ACP 组件零修改。

## 16. Frontend/browser

Vitest 6 ✓、oxlint 0 errors、vite build ✓（_static 同步）、Playwright
vertical ✓。

## 17. Wheel/clean venv/discovery/doctor

9 wheels 构建成功；root-only venv（plugins 0、API v2、doctor 降级 JSON）；
preview venv（12 READY entry points、doctor 全绿、静态定位 ✓）。

## 18. Secret/path/boundary scans

journal/recovery/durable 无宿主绝对路径（fsync diagnostic 已脱敏为文件名）、
无 credential 值、无文件内容；`git diff --check` 干净；compileall ✓；
`agent-box.skill@1` 仅契约+管理解析；max-revision 仅存于显式迁移。

## 19. Work Core / schema / migrations diff

相对基线仅既有 3 文件（上轮 ACP/净化成果）；本轮回零触碰；API v2 不变。

## 20. Exact git status / intended files

未 commit；95 项 dirty 全保留。本轮回：新增
`native_home/durable.py`、`tests/test_final_durability_and_freeze.py`；
修改 `transaction.py`、`recovery.py`、`view.py`、`failures.py`、
`installer.py`、`profile_store.py`、`receipts.py` 及
`test_crash_window_closure.py` / `test_transaction_boundary.py` /
`test_skill_installer.py` / `test_native_home.py` / `test_skill_projection.py`
/ `test_five_harness_vertical.py`；文档本报告 + 四份既有文档更新。

## 21. Remaining limitations（如实分类）

- **visibility atomicity**：单文件 pointer/ envelope/receipt/journal 原子
  rename；跨目录多文件为 journaled recovery，非原子。
- **process-crash recovery**：全部窗口有三种可证明结局
  （COMPLETE_COMMIT / ROLLBACK_TO_PREVIOUS / RECOVERY_REQUIRED）。
- **power-loss durability**：local POSIX + fsync honoring 下提供；网络/
  分布式文件系统不保证；WSL/Windows 尽力、目录 fsync 不可用即显式降级。
- **API response loss**：调用者以 exact read / CAS / transaction status
  确认；不承诺跨网络 exactly-once。
- 其余既有限制（Hermes venv 投影、stream、跨主机并发、cancel 自动恢复、
  Project Skill promote UI）保持。

## 22. READY FOR MANUAL CHECKPOINT

**READY** —— 代码未提交，dirty worktree 保留供人工审查。