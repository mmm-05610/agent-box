# NATIVE_PROFILE_TRANSACTION_CRASH_WINDOW_CLOSURE — 崩溃窗口闭合验证（2026-09-02）

本报告把 `NATIVE_PROFILE_TRANSACTION_BOUNDARY_REPAIR.md` 从「测试表面通过」
升级为可证明的 crash-safe/fail-closed 实现：审计 A–G 反例全部以 intent +
actual-observation 决策模型修复并锁定。未执行 git 写操作；未读取 credential
值；未执行真实模型请求；未修改 Work Core/schema/migrations；API v2 不变。

## 1. Verdict

**COMPLETE** —— 所有已确认反例（pointer replace/journal step 窗口、corrupt
pointer 放行、execution freeze 缺失、reconcile verify 用错 digest、legacy
apply 读 source、skill update inventory 不可变、非严格状态机）均已修复，
每个窗口都有 fault-injection/crash-matrix 测试；未删断言、未放宽测试、
未吞异常。fake/protocol/transaction 测试零 skip；仅真实 bwrap/native 探测
按既有条件 skip（4 项）。


> 2026-09-02 追加（final durability closure）：terminal transition 收紧为
> 严格 authority（COMMITTED 只能从 POINTER_COMMITTED 进入；recovery 补写
> POINTER_COMMITTED 并标记 confirmed_by_recovery 后才 COMMITTED）；
> execution freeze 增加物理 native-home 实际 tree digest 校验
> （PROFILE_FREEZE_NATIVE_HOME_DRIFT）；committed mutation 以成功结果或
> typed CommittedMutationError 返回（不再伪装普通失败）；全部持久化写入走
> fsync-based durable primitive（local POSIX power-loss durable，目录 fsync
> 不可用显式降级）。详见
> `NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE.md`。

## 2. Baseline / branch / HEAD / dirty preservation

- branch `feat/resource-routing-phase2`，HEAD `1a3c3083…`，92 项 dirty 全保留；
  本轮回在此基础上新增/修改，未 reset/checkout/clean/stash。
- `git diff --check` 全程干净；未修改其他 worktree。

## 3. 修复前两个已复现反例

1. **pointer replace → journal step 崩溃窗口**：replace 成功、POINTER_COMMITTED
   未写入时，旧 rollback 依据 journal 步骤判定「未提交」→ 恢复旧 pointer 且
   删除新 revision → dangling pointer（get 报 PROFILE_POINTER_INVALID）。
2. **corrupt pointer 被当不存在**：`_current_pointer_or_none` /
   `_read_pointer_optional` / `_pointer_or_none` 吞掉所有 ProfileNativeHomeError
   返回 None → prepare 放行、frozen generation 为 None、installer/put 把损坏
   pointer 当 fresh profile。

## 4. Transaction intent / schema（v2）

Journal（`native_home/transaction.py`，`JOURNAL_SCHEMA_VERSION = 2`）携带完整
commit intent：

- `previous_pointer`：完整旧 pointer 快照（空 = fresh profile，无 previous）
- `proposed_pointer` + `pointer_intent_declared`：**replace 之前**由
  `set_pointer_intent()` 声明的完整新 pointer（revision/digest/skill_receipts_
  digest/generation/tree_digest）
- `expected_revision` / `expected_generation`
- `revision_written`、`applied_files`、`receipts_digest_before/after`
- steps（严格状态机）与 terminal

恢复决策由 intent + ACTUAL durable observations 推导（`recovery.py`）：

```
intent declared, actual pointer:
  actual == proposed        -> verify (canonical envelope digest + identity +
                               receipts) -> COMPLETE_COMMIT
                               (fresh) verify fails but envelope canonical
                               proves the transaction -> ROLLBACK_TO_PREVIOUS
                               (safe pointer removal) — 其余 -> RECOVERY_REQUIRED
  actual == previous        -> ROLLBACK_TO_PREVIOUS（清理未提交 revision/files）
  actual missing + fresh    -> ROLLBACK_TO_PREVIOUS
  actual missing + previous -> RECOVERY_REQUIRED
  其他 / corrupt            -> RECOVERY_REQUIRED（禁止猜测/删除/覆盖）

intent not declared:
  actual missing + fresh / actual == previous -> ROLLBACK_TO_PREVIOUS
  其他（含 corrupt）        -> RECOVERY_REQUIRED
```

运行时失败路径（except）与 crash 恢复共用同一 `decide_recovery`
（`handle_mutation_failure`）：已兑现的 pointer commit 被补写 COMMITTED 并
re-raise 原异常，绝不在异常处理器里回滚已提交状态。

## 5. 各 operation 合法 state graph

- linear（profile-config / skill-install / skill-update / skill-rollback /
  skill-uninstall / legacy-import / envelope-migration）：
  `PREPARED -> STAGED -> APPLIED -> REVISION_WRITTEN -> POINTER_COMMITTED -> COMMITTED`
- reconcile（无 staged、无 revision）：`PREPARED -> APPLIED -> POINTER_COMMITTED -> COMMITTED`
- `step()` 严格校验后继、禁重复、terminal 后禁 step；`POINTER_COMMITTED`
  要求 intent 已声明；journal 读取同样校验（乱序/重复/双 terminal/缺
  required facts -> `JOURNAL_MALFORMED` -> 恢复路径 RECOVERY_REQUIRED，
  永不被当作可信输入）。

## 6. pointer actual-vs-intent recovery truth table

（实现于 `decide_recovery`，测试覆盖每行）

| intent | actual | 决策 |
| --- | --- | --- |
| declared | == proposed + verify✓ | COMPLETE_COMMIT |
| declared | == proposed + verify✗ + fresh + envelope✓ | ROLLBACK_TO_PREVIOUS（安全删除 pointer） |
| declared | == proposed + verify✗（existing） | RECOVERY_REQUIRED |
| declared | == previous | ROLLBACK_TO_PREVIOUS |
| declared | missing + fresh | ROLLBACK_TO_PREVIOUS |
| declared | missing + previous | RECOVERY_REQUIRED |
| declared | 其他 / corrupt | RECOVERY_REQUIRED |
| 未声明 | missing + fresh / == previous | ROLLBACK_TO_PREVIOUS |
| 未声明 | 其他 / corrupt | RECOVERY_REQUIRED |

verify（operation-aware，`verify_committed`）：revision 类操作要求 pointer
revision 的 envelope 存在、**canonical digest 由 recovery 重算**（非自报字段）
== pointer digest、envelope identity（harness_type/profile_id/provider_id/
revision/digest）匹配；skill 类另要求 receipts store digest ==
`receipts_digest_after`；reconcile 无 envelope，pointer 全字段 == proposed
即视为提交（单文件原子 replace 即 commit point）。

## 7. fresh / existing Profile crash matrix

测试（`test_crash_window_closure.py`）：

- revision written 后、pointer replace 前失败：existing（指针不动、revision
  清理）与 fresh（pointer 从未落地、revision 清理、无 dangling）均可恢复且
  可再次创建；
- **pointer replace 已成功、POINTER_COMMITTED journal 写入前失败**（审计
  反例）：existing 与 fresh 均识别为已提交（pointer=new、envelope 存在、
  recovery 幂等为空）；
- POINTER_COMMITTED 已写、COMMITTED 前失败：已提交；
- 三窗口各自 recovery 重入两次结果一致；dangling pointer 状态由
  `PROFILE_POINTER_INVALID` typed fail closed 且 `pointer_problems()` 上报；
- 不删除无法证明属于本事务的数据（staged/manifest 内容证明机制 +
  RESTORE_MANIFEST_UNVERIFIABLE → RECOVERY_REQUIRED）。

## 8. reconcile crash matrix

`view.reconcile` 现在 write-ahead：决策后先 `step("APPLIED", applied_files)`
再执行 copy-back，中间崩溃回滚精确到该 manifest。matrix 覆盖：

- APPLIED 前崩溃（无 copy-back）→ rolled_back；
- APPLIED 后、intent 前崩溃 → rolled_back（copy-back 回滚、generation 不变）；
- pointer replace 前（intent 已声明、actual==previous）→ rolled_back；
- **pointer replace 后、journal step 前**（actual==proposed）→ committed
  （generation+1、tree_digest==持久 home digest、copy-back 保留）——修复
  旧 `expected_digest`（native tree digest vs envelope digest）误判；
- journal POINTER_COMMITTED 后、COMMITTED 前 → committed（幂等重入）；
- proposed mismatch / corrupt → RECOVERY_REQUIRED，真实 pointer 不动。

## 9. exact Profile freeze 语义

- provider 把 resolved envelope 的 (harness_type, profile_id, revision,
  digest) 包成 `FrozenProfileSnapshot`（harnesses/native_home 私有，不入
  Root/Work Core）传入 `prepare(frozen=…)`；
- prepare 在**同一 mutation lease 内**严格读取 pointer（corrupt/missing 皆
  fail closed）并校验 identity/revision/digest；不一致 → typed
  `PROFILE_FREEZE_IDENTITY/REVISION/DIGEST_MISMATCH`，无 view/marker/lease
  残留；
- generation 与 native_tree_digest 在 lease 内从该 pointer 冻结；
  `expected_generation()` 只返回 in-lease 快照（provider 不再 lease 外预读）；
- generation 前进（session reconcile）不构成配置变更：同 revision/digest 下
  prepare 允许并以当前 generation 为 base（显式决定 + 测试）；resolve 后发生
  config/skill mutation → rev1 prepare 一律 typed reject（含 provider 级
  MaterializationFailed 断言）。

## 10. corrupt/missing pointer 行为矩阵

- 只有「文件不存在」是 `PROFILE_POINTER_NOT_FOUND`；JSON 损坏、identity 不
  匹配、revision 缺失、digest 形状非法全部为 `PROFILE_POINTER_INVALID`；
- `_read_pointer_optional` 只把 NOT_FOUND 转 None（fresh 创建入口）；INVALID
  一律 fail closed——put/installer/execution/reconcile 都不能把 corrupt
  pointer 当 fresh；
- 参数化测试覆盖 malformed / wrong_harness / missing_revision /
  bad_digest_shape 四种损坏 × get/put/install/execution prepare 四个入口；
- 真正缺失 pointer 只允许 put（create）路径创建；execution/installer 缺失
  → fail closed。

## 11. Legacy staged snapshot 证明

`confirm_legacy_import`：preview digest 通过后把所有待导入文件一次性读入
staged（逐文件 regular 校验），**staged manifest digest 必须等于 preview/
verified digest**（算法逐字节一致：relative + "file" + sha256）；此后 APPLIED
只从 staged 复制（永不读 source），apply 后逐文件读回校验。staging 后 source
任意变化不影响导入（测试注入 tamper 证明）；中途变化 → typed drift fail，
且「无 native-home/revision/pointer mutation before proofs」表述改为精确语义
（journal/staged 是事务基础设施写入，并非 Profile 状态变更）。冲突文件跳过
不覆盖；credential 0o000 sentinel 依旧。

## 12. Skill inventory-delta update 语义

- 旧 receipt.managed_files 是旧 managed authority；整体 installed evidence
  digest 未 drift 才可 update；
- 计算 retained / added / removed：added 不得覆盖 unmanaged target（存在但
  非旧 managed 即冲突）；target 中出现既非旧 managed 也非新 inventory 的
  unknown → UNMANAGED fail closed；
- removed 只在旧证据整体匹配时删除（receipt-owned、内容可证明）；
- update/rollback 故障恢复旧文件集合+旧 receipt+旧 revision/pointer；
- 测试：add file / remove file / rename / unmanaged preserved /
  new-file-vs-unmanaged conflict / removed-drifted / failure-after-delta 全回滚。

## 13. malformed journal fail-closed 证明

乱序、重复 step、双 terminal、缺 required facts（REVISION_WRITTEN 无
revision_written、POINTER_COMMITTED 无 intent/proposed、APPLIED 无
applied_files）→ `JOURNAL_MALFORMED` → 恢复路径 recovery_required、
下一次 mutation/prepare 前 `assert_no_pending` fail closed、diagnostic 无
路径/内容。

## 14. tests 数量与结果

- harnesses：389 passed + 4 skipped（真实 bwrap/native 探测）
- 其中新增：test_crash_window_closure.py 25 项（A/C/D/G+B 矩阵+provider
  freeze）、test_legacy_import_transaction.py +3（staged snapshot 证明）、
  test_skill_installer.py +8（inventory delta）
- root 144 / skills 8 / acp 40 / runtime-local 6 / sandbox-bwrap 12 /
  terminal-session 3 / git 4 / artifacts 2 / web 17
- fake/protocol/storage/transaction 测试全部执行，无新增 skip；
  并发/故障测试全部使用 monkeypatch/fault-injection/barrier，无 sleep。

## 15. wheel / clean venv / discovery / doctor

Root + 8 插件共 9 wheels 构建成功；root-only clean venv（plugins 空、API v2、
doctor 降级 JSON 无 traceback）；preview clean venv（12 entry points READY、
doctor 全绿、静态定位 ✓）。

## 16. secret / path scan

public errors/diagnostics/journal 不含宿主绝对路径（legacy provenance 改为
fingerprint+token）、不含 credential 值/路径、不含文件内容；journal 体积
上限 96 KiB；`git diff --check` 干净；compileall 通过。

## 17. Work Core / schema / migrations diff

相对基线仅既有 3 文件（pyproject acp extra、runtime/__init__ duplex 导出、
assembler docstring）——均为上轮 ACP 成果，本轮回零修改；PLUGIN_API_VERSION
保持 2。

## 18. exact git status

未 commit；dirty worktree 保留（92+ 项，含本轮回新增/修改）。本轮回修改：
`native_home/{transaction,recovery,view,installer,failures}.py`、
`generic/{profile_store,execution_provider}.py`、测试
`test_crash_window_closure.py`（新）、`test_legacy_import_transaction.py` /
`test_skill_installer.py`（增补）、`test_transaction_boundary.py`（沿用）及
本报告与三份文档更新。

## 19. remaining limitations

- Hermes 沙箱完整 venv 投影仍不可用（RD-5，如实，非本轮回范围）；
- `stream` 仍 unavailable（RD-4）；
- 并发为文件级协作式 lease/marker（O_EXCL+atomic rename），跨主机分布式
  语义不在承诺内；
- cancel/interrupt 无自动恢复策略（Host 显式处置、view 保留）；
- Project Skill promote/import UI 仍未实现（typed backend disposition 已备）；
- 跨目录多文件仍为 journaled transaction（非 directory atomic swap），但
  每个不确定窗口现在只有三种可证明结局：COMPLETE_COMMIT / ROLLBACK_TO_
  PREVIOUS / RECOVERY_REQUIRED（fail closed 并保留证据）。

## 20. READY FOR MANUAL CHECKPOINT

**READY** —— 代码未提交，工作树保留全部变更供人工审查。