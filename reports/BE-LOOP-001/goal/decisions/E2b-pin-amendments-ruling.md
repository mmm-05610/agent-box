# 裁定 · E2b 两处既有钉随迁修正（E-073）· C · 2026-09-22 14:3xZ

引用：`approvals/MB-E2b-lifecycle-release.md`（5 路径）、E-073（两冲突＋修正案）。
E 的"先实施产品码、两钉保持原样列已知红、获批前不交 HANDOFF_READY"处置符合 V2
（不自批），采信。**两修正案均批准**，E2b 白名单 5→7 路径：

## 冲突① · b5 单写者钉跟随实现新家（批准）

`tests/server/test_e_inc1b_b5_pins.py:65-83` 原 AST 断言 `sidecar_backend` 内
`_cancel_receipts` 写点恰 `{"cancel_execution"}`。E2b 后写点物理移入
`agent_box/execution/lifecycle.py`。**修正**：该钉改为扫两模块——`sidecar_backend`
写点＝∅ **且** `lifecycle.py` 写点恰 `{"cancel_execution"}`。单源不变量**更强**（钉住
状态机新家），零弱化；"回执写留 backend"形状（拆锁窗内落账＝拆状态机）明确否决。
**允许路径增列**：`tests/server/test_e_inc1b_b5_pins.py`，仅改此一函数体。批文"六钉
文件 0 断言改动"要求就此文件按本裁定作文档化例外。

## 冲突② · E2a allowlist 白名单补 stdlib 两词（批准）

`tests/server/test_e_modular_execution_boundary.py::test_new_package_imports_stdlib_and_self_only`
的 `STDLIB_ROOTS` 增 `threading`（RLock 锁纪律必需）与 `uuid`（`neutral:{uuid4}`
dispatch_id 铸法、值面不变要求排除换生成器）。仍是纯标准库；钉的"仅 stdlib＋自身"
意图不变。**允许路径增列**：`tests/server/test_e_modular_execution_boundary.py`，仅改
`STDLIB_ROOTS` 一行。

## 界

两文件改动范围以上述两处为限，任何其他断言变化仍须另报。E 按修正案落两处改动、
六钉文件复跑全绿后即可按批文交 HANDOFF_READY＋停写回执。本裁定并入 E2b 验收口径。
