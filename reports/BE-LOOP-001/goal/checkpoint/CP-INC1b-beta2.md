# CP-INC1b-beta2 — INC1b β2 S⊗E 合批（b-4 受理时冻结）验收入候选 `57e91ec`

发布：C · 2026-09-22 01:13Z · 机制＝COORDINATION-V2（D-0031）· **INC1b 至此关闭**（β1+β2 全落）。
来源提交：**S `405b8b4`**（5 文件：repository/service/handlers/stage_a/test_b4，+258/-5，CHECKPOINT=msg.server.22）⊕ **E `2c69343`**（3 文件：sidecar_backend/test_e_inc0_block1_pins/test_e_inc1b_b4_pins，+305/-34）。两腿皆组自提交、停写声明在各自 handover；C 未动用代提交权。

## 集成方式与树同一性（V2 §5 证据复用的前提证明）
- 集成树预检 dirty=0；`git cherry-pick -n 2c69343 405b8b4` 上 `67e5c52` 零冲突；staged 恰 8 文件、无他人内容；单笔 squash commit＝**`57e91ec`**（+563/-39）。
- **树同一性**：cherry-pick 后 `git write-tree`＝`089a79643acfd262b273cf6d8d4431f308bbf5c0`＝C 00:30-00:33Z 预验证沙盒树（`67e5c52`+同三份 diff）**逐字节同一**。

## 验收证据（复用＋真树抽查，均未重跑 175s 全量——V2 §5「相同内容/环境已有可复现证据可复用」）
1. **全量权威门（复用，00:33Z 沙盒＝同一树一 环境）**：`21 failed / 1397 passed / 33 skipped / 1 xfailed`；排序 FAILED-ID 集与 pristine `67e5c52`（21F/1388P，同环境同配方对照跑 00:24Z）**逐字节相同（diff 空）＝0 新增 0 消失**；+9 passed＝合批新钉。21 枚皆环境固有红灯（tool/model 缺席族），**不伪称全绿**。
2. **真集成树抽查（01:13Z，`57e91ec`）**：`test_b4_acceptance_freeze_s` + `test_e_inc1b_b4_pins` + `test_e_inc0_block1_pins` + `test_stage_a_server` ＝ **47 passed / 1 xfailed / 0 failed**（该 xfail＝E 刻意 delegation-leg strict-xfail，归 INC1c；与沙盒读数一致）。
3. **三方互证在册**：S 自证（合并树↔pristine FAILED+ERROR 双向 comm 空、+9P；其 10F/20E 构成系其跑法差异、结论同向）；E sim（cherry-pick 零冲突、E 钉 65P/1xf）；C 预演链（23:19Z 抓到 stage_a:412 唯一回归→S 照修→00:33Z 全量门 0 新增）。
4. **非假绿反证（23:12Z）**：b-4 钉投 pristine 候选→F1/F2+F4 红、F3/F5 绿（刻意护栏）＝钉有牙。

## 语义落点（对契约）
- b-4＝直建受理写点冻结：`create_turn` 必填 `effective_config_object_digest`（intent 同对 helper 铸造、零迁移）；同读锚＝冻结前 revision 复核 409 `PROFILE_REVISION_CONFLICT`（事务闸保留为最终门）。
- E accept 消费**原始冻结键**（null→typed `AgentBoxProfileV1` 拒绝，永不 COALESCE 活行拾取）；第二生产者+迟到 profiles.permissions import 根除。
- 两 S accept 调用点（service 直建、handlers `_dispatch`）停传 overrides；E 形参保留忽略、Protocol 未动（死参清理＝β2 后微批）。
- legacy NULL 行 READ 侧 COALESCE 回退保留（F5 加性钉）→ **INC1c 处置**。

## 附带处置
- **OPS-S-session-stalled：关闭**（S 00:43Z 自提交解决；升级件原文保留、以本 CP+恢复 ACK §2 为准）。
- E-034/E-035 回执：负结果账收讫成立（全树裸路 `create_turn` caller 唯一＝stage_a:412，已随 `405b8b4` 闭合）——**本 CP 即正式回执**。
- Sol：**未消费**（used=4/10 不变）。本批为已预验证合批，树同一性+复用证据成立，无新语义需 reviewer；E-impl-accept 预留保持。
- S/E 两树基线对齐（净快进至 `57e91ec` 形态）＝随 INC1c 批文处理，逐路径批文原则不变。

## 下一增量（随本 CP 派发）
**INC1c**（批文另发）：范围＝`decisions/INC1b-b4-confluence-interface.md` §6 四项——①委派写点 `_create_child_turn` 落同 digest 语义+delegation-leg strict-xfail 转正（E 域）；②委派 N1 双入口钉；③legacy `effective=NULL` 行 COALESCE 回退删（S 域 `get_turn_context`/`sessions/repository.py`）＋`resolve_all` 直读删（E 域 `sidecar_backend.py:228`/`delegation.py:387`）；④死参清理微批（`overrides` 形参+`_override_mapping`，S/E 联合签名 note 终稿随批）。新基线＝**`57e91ec`**。
**BE-PROFILE-001**：研究派工另发（不依赖本批）。
