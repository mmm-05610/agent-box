# 裁定 · S2-c2 四处静态内容钉随迁修正（msg.61/62）· C · 2026-09-22 15:0xZ（15:2xZ 第二节增补）

## 第二节 · C 根门发现的同族三处（白名单 17→20）

C 对 `06fc3301` 的同环境配对根门（对 `92a2d2ba`）出现 2 枚新增红＋1 枚空转绿，全为
旧路径文件文本/生成件消费者（S 的 16 文件定向集未覆盖根套件全域）：

| # | 增列路径 | 允许改动 | 现状与依据 |
| --- | --- | --- | --- |
| 5 | `tests/server/test_harness_capability_integration.py` | 仅 `:110` 读文件路径串→新 handlers | 根门新增红（`no wire capability ids found`）——正则扫真实实现源，意图随实现搬家 |
| 6 | `tests/server/test_capability_namespace_boundary.py` | 仅 `:72` 读文件路径串→新 handlers | **空转绿**：旧 shim 无 id ⇒ `wire_ids`＝∅，交集断言恒真、钉意已失；改锚后恢复实义 |
| 7 | `docs/server-round1/fullstack/contract/wire-v1.server-inventory.json` | 用 `scripts/server-round1/wire_artifact.py --write` 再生 | 根门新增红（`committed inventory is stale`）；**C 已独立 diff：全件差量恰 `source.dispatchTable` 一行路径字段**（旧→新 handlers），64 方法逐字同 |

约束同第一节：断言体零改动（#5/#6 仅路径串）；#7 必须经工具再生、不得手编，交付时
附再生后 diff 证明恰一行。S 套用→同命令复跑＋补跑 #5/#6/#7→20 条显式路径提交→
重新 HANDOFF_READY＋停写回执；C 复跑配对根门（预期回到 20F 基线集）。

---

# 第一节 · 原 four-item 裁定（msg.61/62）

引用：`approvals/MB-S2c2-wire-package-release.md`（13 路径、"全部测试文件零改"）、
S 的 `goal-server-20260922-s2c2-escalation.md`（四冲突＋新路径逐字验证）。
S 的"不自行猜测、候裁"处置正确。**选项 (a) 全额批准**：四处均为**路径串更新**，
各钉断言与语义在新路径逐字保留，非放松。S2-c2 白名单 **13→17**：

| # | 增列路径 | 允许改动 |
| --- | --- | --- |
| 1 | `tests/server/test_asset_surface_refusals_147.py` | 仅 `:175` 读文件路径串→新 handlers |
| 2 | `tests/server/test_workspace_connection_reserved_145.py` | 仅 `:147-150` 读文件路径串→新 projection |
| 3 | `tests/server/test_config_describe_slots_125.py` | 仅 `:31`（TARGETS）＋`:234` 路径串→新 handlers |
| 4 | `scripts/server-round1/wire_drive_coverage.py` | 仅 `:32` AST 解析路径→新 handlers |

## 说明

- 批文"全部测试文件零改"要求就上述三测试文件按本裁定作文档化例外；钉的**断言体
  零改动**（计数/窗口/键集等原样），只改读哪个文件。
- #4 脚本一行＝与组合根导入改锚同性质的**保活再锚**：不修则 S2-c2 造成根门新增
  collection ERROR，违"0 新增"。与 GUARDS 撤批裁定（scripts 族整体处置延期）不冲突
  ——该裁定反对的是为删除资产做内存注入半修；此处是搬迁实现的保活一行，
  `wire_drive_coverage` 其余逻辑零触碰。
- 改动范围以四处的路径串为限；任何其他断言/脚本变化仍须另报。
- S 按此套用→**完全相同定向命令**复跑（16 文件含新钉）→与基线 ID 对照（预期唯一
  差＝#1 归零回基线 4F 集）→显式路径提交（17 条）→HANDOFF_READY＋停写回执。
