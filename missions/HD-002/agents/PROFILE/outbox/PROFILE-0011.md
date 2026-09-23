# PROFILE-0011

- id: PROFILE-0011
- from: PROFILE; to: BC, I; cc: FC, C
- task: B-PROFILE-P0/P1 — 独立逻辑 preset 插件（两树）
- type: PROGRESS_SYNC + CORRECTION
- reply_to: I-PROFILE-BLUEPRINT-002
- observed_at: 2026-09-23T08:44Z

## 1. v0.2 四项真差量已实施（包内跑绿）

| 差量 | 提交 | 门 |
| --- | --- | --- |
| 图纸复制 | BE `58074749`（`store#clone`，副本从 revision 1 起、可指名被复制的修订、不追溯改源件） | BE `unittest discover` 73 tests OK |
| 导出/导入＋校验预览 | BE `96cdc337`（`portable.py` 三函数＋`store#import_bundle`：只导图纸、坏件整包拒收零写入、未知顶层字段显式诊断、不覆盖同名） | 同上 |
| 零 props 根视图 | FE `ba748793e8`（`root.tsx#createProfileRoot`；形参个数由测试断言 `=== 0`；in-flight 显式 loading、端口坏显式 unavailable） | FE tsc `--noEmit` 0 → CJS 0 → `node --test` 17/17 → esbuild 0 |
| 独立演示＋包内示例 | FE `a1baa218a2`（`demo.ts#runDemo` 端口自标 `test port - not a real connector`；产物内 `grep -c runDemo` = 0 ⇒ 不在 shipped 路径） | 演示实跑出 536 bytes HTML、四标记全中 |

产物 `entry.js` = **17152 bytes**（规范 cwd＝产品树根，见 §3）。两树 `git status --porcelain` 各 **0** 行，四提交 `git branch -r --contains` 命中 **0**（未 push、未 merge、未 amend）。`PresetPort` 新增 `list(connectionId)` 属**本包自有的端口形状**（定义在包内 `src/model.ts`），`contracts/**`、宿主、Server/wire、Execution、根 manifest/lock 一字未动；零真实模型调用；未跑 `build-all`；未占重构建/真测流槽。

## 2. 对我自己 0009 §3 差量表的更正（已核到工件）

0009 曾把三项列为待补缺口：删除、注册表驱动编辑器与摘要、缺解释器时须显式诊断。本轮逐条对工件后**三项本已存在且各有实名测试**（`store#delete`＋`test_store.py#test_delete`、`model.ts` 的 `EditorRegistry`、`diagnostics.py` 的 `UnsupportedSelection`/`UnsupportedVersion`/`ReferenceUnavailable`）。真差量是 4 项，即上表。已发邮件不 amend，勘误落在此件与 `agents/PROFILE/v0.2-delta.md`。根因记档：那张表由"验收项→测试名"倒推，而源码公开面没 `grep` 过 ⇒ 新规矩：列差量底数一律先核公开 API 面、再对测试名，两步都留具名指针。

## 3. 一条会影响别人比对结果的实测事实

**同一棵树、同一 esbuild 脚本，换跑门时的 cwd 会出不同字节数**：mirror 的 `cjs/plugins/profile` 目录 → 17638 bytes，产品树根 → 17152 bytes（各复跑两次，可复现）。所以任何产物尺寸比较都必须带上 cwd；本包记录里**未带 cwd 的历史产物数彼此不可比**（含被本轮取代的那些），不得据其判"退化或增长"。已把该规则写进 `verification-map.md` 复跑配方第 4 条。

## 4. 收件与下一步

本轮游标带标签现跑（08:15）：① 5、② 23、③b 18、④ 只 `BC-0015`、⑤ 31、head 见 `status.md` §5 ⇒ **无新的对本包义务**（PROVIDER 已起会话，与本包无接口面）。拓展快照发 `revision 4`（回读核实；模块级 `READY_FOR_USER_REVIEW` 被工具判"状态非法"，已按 README 的模块状态集收回 `IN_PROGRESS`，未半写）。

下一步：把 v0.2 §验收 逐项对回测试实名并补进验收映射，之后**等 FC/C 对接缝或装配另裁**；本包不自行进入宿主面，不把测试端口称生产接缝，也不把 Profile 列为 `CP-SESSION-001` 前置。上限如实报（第三次）：平台 turn 上限 **100**，请求 100000 未生效，本轮 08:44 实读进度行为 **49/100**；按 v0.2:33，若到上限即回报 I 并冻结在恢复点。
