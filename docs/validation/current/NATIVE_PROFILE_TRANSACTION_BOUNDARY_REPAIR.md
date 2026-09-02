# NATIVE_PROFILE_TRANSACTION_BOUNDARY_REPAIR — 审计修复报告（2026-09-02）

本报告记录对 Native Profile Home / Central Skill Repository closure 的
事务边界修复：audit 确认的 A–H 缺口全部由实现与正式仓库测试保证，不新增
设计。未执行 git 写操作；未读取 credential 值；未执行真实模型请求；未修改
Work Core/schema/migrations；`PLUGIN_API_VERSION` 保持 2。

> 2026-09-02 追加（supersession）：`NATIVE_PROFILE_TRANSACTION_CRASH_WINDOW_
> CLOSURE.md` 以此前各章的恢复描述为基线再次收紧——journal 升级到 intent
> schema v2（`proposed_pointer` 在 pointer replace **之前**声明），恢复决策
> 改为「intent + ACTUAL pointer observations」truth table，不再依据 journal
> step 猜测；reconcile 的 verify 改为 operation-aware（envelope canonical
> digest 重算 / generation+tree digest 匹配）；execution prepare 冻结 exact
> revision/digest；legacy import 与 skill update 语义见该文 §11/§12。凡是与
> 该文冲突的表述，以 Crash-Window Closure 为准。


> 2026-09-02 再追加（final durability closure）：terminal 严格 authority、
> 物理 home 冻结、committed API outcome、fsync durability 及 retention
> 见 `NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE.md`；本文件中
> “journal 写 POINTER_COMMITTED 后 COMMITTED 前崩溃 → 已提交收尾”等
> 描述已由该文的最严格版本覆盖（recovery-confirmed 补写 + 合法 terminal
> transition）。

## A. profile.json current pointer authority

- `get(harness_type, profile_id, revision=None)`：显式 revision → 读取不可变
  envelope；`None` → 读取并校验 `profile.json` → 按 pointer 的 exact revision
  读取。**禁止扫描 `revisions/` 选最大 revision 作为 current**。
- `list()` 只枚举 identity，通过合法 pointer 解析 current；无 pointer 或
  pointer 失效的 identity 不在 list 中出现，并由 `pointer_problems()` 以 typed
  code 上报（`PROFILE_POINTER_NOT_FOUND` / `PROFILE_POINTER_INVALID`）。
- pointer 校验 harness_type/profile_id/revision/digest 一致性；指向不存在的
  envelope → typed fail closed。
- envelope-only 迁移改为**显式** `migrate_envelope_only()`（唯一被允许的 legacy
  max-revision 单次阅读），带 `MIGRATED_FROM_ENVELOPE` provenance，幂等。
- 回归测试：`test_transaction_boundary.py::test_pointer_is_current_authority_*`、
  `test_orphan_revision_never_becomes_current`、`test_missing_pointer_fails_closed_*`。

## B. Profile mutation transaction / CAS

统一 `ProfileTransaction`（`native_home/transaction.py`）步骤词表：
`PREPARED → STAGED → APPLIED → REVISION_WRITTEN → POINTER_COMMITTED →
COMMITTED`；终态 `COMMITTED / ROLLED_BACK / RECOVERY_REQUIRED`。

- 顺序：**先抢 mutation lease → lease 内 `assert_no_pending` + active 检查 →
  lease 内重新 CAS（重读 current）→ STAGED（staged 文件 guest-relative）→
  APPLIED（native config patch，备份被覆盖文件）→ REVISION_WRITTEN →
  POINTER_COMMITTED（**唯一可见性提交点**）→ COMMITTED → cleanup**。
- 任何阶段失败：`rollback_transaction`（`native_home/recovery.py`）按 journal
  记录的 previous pointer（完整快照）、revision_written、backup、applied_files
  确定性回滚；回滚失败 → `RECOVERY_REQUIRED`，绝不暴露半提交状态。
- `GenericProfileManager.create_revision` / `ProfileEnvelopeManager.
  create_revision` 的 `expected_revision` 现真实传入 store；错误 CAS 产生
  `PROFILE_REVISION_CONFLICT`。
- fault-injection 测试覆盖 STAGED 后 / APPLIED 后 / pointer replace 时三个
  阶段，断言 pointer/get/native config/historical revision/recovery 幂等
  （`test_transaction_boundary.py::test_fault_*`）。

## C. Execution prepare freeze（无 TOCTOU）

`NativeHomeView.prepare()` 现在是**单一 lease 临界区**：

```
acquire lease → assert_no_pending → 冻结 current pointer（revision + native
generation）→ copy native-home → base manifest → 声明 overlay → 注册 active
marker → release lease
```

mutation 路径（put/installer/legacy import/reconcile）一律**先 acquire 同一
lease，再在 lease 内**检查 active execution 与 pending journal，再 CAS；
不存在“先 assert_idle 再 acquire”竞态。异常时清理 partial view + marker +
lease。两个 prepare 可冻结同一 revision；mutation 在 active execution 存在时
typed fail closed。

确定性并发测试（无 sleep）：lease 被占时 prepare 立即 typed 失败且无残留；
copy 中途异常清理 view/marker/lease 后可重试；prepare 后 mutation 被 block；
双 prepare 同 revision（`test_transaction_boundary.py` 第三节）。

## D. reconcile generation / digest 单 lease 事务

`reconcile()` 在**同一 lease/journal 事务**内完成：lease → no-pending →
generation 校验（前置 CAS）→ 纯决策 → 逐文件 copy-back（被覆盖文件入
backup，staged 存真实内容供回滚证明）→ **持久 native-home** 的 tree digest →
generation CAS + pointer 原子提交（`commit_native_generation`）→ COMMITTED。

- pointer 的 `native_tree_digest` 永远等于 reconcile 后的**持久 home** digest，
  绝无 ephemeral overlay / managed override / credential / ephemeral 污染；
  期刊的 committed 判定使用 operation-aware verify（reconcile：pointer 全
  字段 == proposed；revision 类：envelope canonical digest 重算 + identity
  校验），不再使用含义模糊的 `expected_digest` 字段（见 Crash-Window
  Closure §8）。
- generation 冲突 → typed ambiguous（`NATIVE_HOME_RECONCILE_AMBIGUOUS` /
  `PROFILE_NATIVE_HOME_DRIFT`）+ recovery view，不覆盖。
- pointer 提交失败 → copy-back 从 backup 完整回滚，journal 关闭
  ROLLED_BACK，generation 不前进。
- 测试：`test_pointer_tree_digest_is_the_persistent_home_digest`、
  `test_two_reconciles_same_generation_only_one_wins`、
  `test_reconcile_pointer_failure_rolls_back_copyback`、
  `test_reconcile_excludes_config_skill_credential_ephemeral`。

## E. finish terminal guard

`GenericExecutionProvider.finish()` 只允许在**终态**调用：native 进程已退出
（`poll()` 返回 exit code）或 driver 的 ObservationHub 已见 native terminal
事件。仍在运行 → 抛 typed `FinishNotTerminal`（`FINISH_NOT_TERMINAL`）：
不 reconcile、不 discard、不人工补造 terminal observation，execution view
原样保留供 Host 处置。terminal-once 与 reconcile-once 保持；重复 finish
幂等。测试：`test_finish_boundary.py` 新增三例（运行中/exit 后/ambiguous
transport）。

## F. Skill receipt rollback / journal recovery

- 每次 skill mutation 开始时保存 `receipts.before.json` 快照；install/update/
  rollback/uninstall 任一步失败都完整恢复：files（staged+backup 重放）、
  previous receipt（或 absence）、Profile pointer/revision、receipts digest。
- 提交判定修正：**仅出现 RECEIPT/APPLIED 不视为 committed**；`verify_committed`
  至少验证 pointer revision/digest == journal、envelope 存在且 digest 匹配、
  `receipts_digest_after` == receipt store digest；不满足 → rollback 或
  RECOVERY_REQUIRED，**绝不把 files+receipts+旧 revision 标记 committed**。
- 回滚删除「事务新建文件」前必须出示 staged 内容与现文件一致（`RESTORE_
  MANIFEST_UNVERIFIABLE` → RECOVERY_REQUIRED），**永不删除无法证明属于该
  事务的数据**（假 committed journal 场景测试锁定）。
- malformed/corrupt journal → fail closed `SKILL_INSTALL_RECOVERY_REQUIRED`
  （diagnostic 不含路径），`recover_pending()` 幂等。
- crash matrix 测试覆盖 STAGED / APPLIED / REVISION_WRITTEN /
  POINTER_COMMITTED / 假 committed 五个崩溃点。
- receipts digest 与 pointer 一致性由 `_receipts_consistent` 断言全程锁定。

## G. Legacy import transaction + path redaction

`store.confirm_legacy_import()` 与 Profile mutation 同一 lease/journal 事务：
lease → no-pending → active 检查 → CAS → **preview digest 重验（零写入前置）**
→ STAGED → APPLIED（conflict 跳过、不覆盖）→ provenance + revision +
pointer 提交 → 失败全回滚。active execution / CAS / drift 任一失败均为
**零文件写入**。

脱敏（frozen）：`LegacyImportPreview.public()` 不再含绝对 source path（改为
`source_fingerprint` = 内容 digest 前 16 hex）；`import_sources()` /
`import_candidates()` 不再返回宿主路径；`import_provenance` 仅含 kind +
`source_kind` + `source_fingerprint` + `guest_relative`；typed error 不含完整
路径；preview→confirm 会话用一次性 server-side token。credential 内容由
0o000 sentinel 测试证明从未读取。

## H. EffectiveSkillInventory bounded derivation

新增集中定义的边界（值 + 依据注释）：
`MAX_PROJECT_SKILL_DIRECTORIES=64`、`MAX_PROJECT_SKILL_FILES=128`（对齐
SkillStore）、`MAX_PROJECT_SKILL_DEPTH=16`、`MAX_PROJECT_SKILL_FILE_BYTES=
2 MiB`、`MAX_PROJECT_SKILL_TOTAL_BYTES=32 MiB`、`MAX_PUBLIC_INVENTORY_
ENTRIES=256`、字段长度上限 256、Git 命令超时 5s。

- 超限即停：digest 置空、state=`OVER_LIMIT`、typed warning，绝不伪装完整
  可复现；symlink/special → `UNSUPPORTED`（不跟随）。
- git status/HEAD 失败 → `dirty=None`/`commit=None`，public state=`UNKNOWN`
  （绝不报告 clean）；非 git worktree 同样 UNKNOWN。
- public 输出不含 repository 绝对路径（`repository_identity` 仅插件内部），
  entries/warnings 数量与字符串长度有界。
- adversarial 测试：超大文件/超多文件/超深目录/symlink/git 失败/非 git/
  public 序列化路径扫描。

## 统一事务模型（第三节）

- 单一 Profile 的所有持久 mutation（config put、skill install/update/
  rollback/uninstall、legacy import、reconcile）共享：同一 `ProfileMutationLease`、
  同一 `ProfileTransaction` state machine、同一 `pending_journals` /
  `recover_pending` / `rollback_transaction` 恢复路径。
- 所有 CAS 与 generation 校验都在 lease 内重新执行；所有 active check 都在
  lease 内；recovery 在下次 mutation 或 execution prepare 前强制检查；
  corrupt/incomplete 默认 fail closed。
- journal 不含 credential、文件内容、宿主绝对路径（仅 digest/bounded
  names/完整 prev pointer——指针本身无 secret）。
- 实现仍归 agent-box-harnesses（`native_home/transaction.py` +
  `native_home/recovery.py`），未移动 Extension Kernel 或 Work Core。

## Atomicity 边界（如实声明）

- **单文件原子替换**（atomic rename）：`profile.json` pointer 写入、
  `installed-skills.json` 写入、每份 envelope JSON 写入、journal 写入。
- **跨目录多文件：journaled transaction**（非 directory-level atomic swap）：
  native config patch、skill 文件、legacy import 文件、reconcile copy-back。
  一致性由「staged+backup 确定性重放 + pointer 唯一可见性提交点 + crash
  recovery 强制前置」保证；本修复未宣称这些操作是 directory atomic swap。
  理由（任务书 §F 允许）：同文件系统目录 swap 在 target/backup 存在与
  crash 语义上并不更安全，journaled replay 可证明且跨文件系统稳健。

## Remaining limitations（如实）

- Hermes 沙箱完整 venv 投影不可用（RD-5，未在本次范围内）；
- `stream` 仍 unavailable（RD-4）；
- 并发协议为文件级协作式 lease/marker（O_EXCL + atomic rename），已在 typed
  层 fail closed；跨主机并发不在承诺内；
- cancel/interrupt 无自动 recovery 策略（Host 显式处置；view 保留）；
- promote/import 高级 Project Skill UI 仍未实现（typed backend disposition
  已具备）。