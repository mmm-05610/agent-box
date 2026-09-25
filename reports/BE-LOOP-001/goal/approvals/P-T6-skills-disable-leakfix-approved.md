# 批文 — P-T6（skills `disable` 重放泄漏修复）· 采 P 拆口：**仅批缺口 B**、缺口 A 并入 R-6/INC2

发出：C · 2026-09-21 21:41Z · 触发：`platform/outbox/goal-platform-P-CRES022.md`（msg.platform.22 CHECKPOINT）§4/§5。
基线＝**当前最新候选 `b15c435`**。性质＝**逐路径批准动码**（P 已在 §4 给白名单+验收预承诺）。Sol：预期免（C 红-绿 + P 全量差量足证）。不 push、集成树只由 C 改。

## 裁定：批 P-T6 **缺口 B**，延缺口 A（= 采 P 自己 §5.3 倾向，我判定成立）
- **缺口 B（批准、现可动码）＝补偿止血、零对外语义变化**：`disable` 的 `mkdtemp→copytree→os.replace` 段套 `try/except → shutil.rmtree(本次自建 tmp, ignore_errors) ; raise`，与同文件 `import_directory:211-221` **逐字同构**（R-4 合规）。⇒ 根除"每重放泄漏一个无主孤儿、无界累积"。
  - **C 已独立确认 B 是完整安全修**：陈旧令牌使 `disable` 目标号落到**已存在** revision → 碰撞即中止写（`os.replace`/`copytree` 不覆写他号）⇒ **B 前无数据损坏/身份错乱**（P §三"先把话说小"属实、孤儿名非纯数字被 `_latest:156 isdigit` 过滤、不污 revision 序列）；B 再清掉本次 `.2.<hex>` 临时目录 ⇒ **不泄漏、不 clobber**。
- **缺口 A（本批不做、并入 R-6 / INC2）＝改对外失败形状**：`disable` 先取 `_latest` 比令牌、陈旧→复用固定词 `REVISION_CONFLICT`（早退、不再靠碰撞）。虽复用同文件既有本地串、**未铸新枚举/未触 `sandbox_port`**，但它把 `disable` 的可观测失败由 `OSError` 改判 ⇒ 属"rejection 词汇/形状收敛"一族，**与已裁延 INC2 的 R-6 同序处理**（免逐插件 ad-hoc 改错形）。
- **净效果**：泄漏（实际危害）即刻止；干净早退拒绝（人体工学）随 R-6/INC2 一次性统一。二者不冲突。

## 逐路径白名单（仅此，越界即驳）
- `plugins/agent-box-skills/src/agent_box_skills/store.py` —— **仅 `disable` 方法体**（加 B 的 try/except-rmtree；**不动**签名、**不**加删除/清理动词、**不**扫历史遗留孤儿目录）。
- `plugins/agent-box-skills/tests/test_skill_store.py` —— **仅追加**（不动既有例）。

## 验收承诺（B-only 版，诚实、勿夸大）
1. 新钉：陈旧令牌重复 `disable` **失败后 `revisions/` 无非数字目录残留**（修前必红=现泄一个 `.2.<hex>`、修后绿）。
2. 守护钉：以墓碑号再 `disable` 仍早退、不增 revision（当前即绿，保持）。
3. **既有 `test_skill_store.py:55` 必保持绿**（其令牌=latest ⇒ 不经陈旧路径、B 不改其结果）。
4. **缺口 A 的陈旧令牌→`REVISION_CONFLICT` 钉随本批移除**（那是 A 的、留 INC2）；故 skills 计数 8→**9**（只加残留-无 钉），六插件 222→223/0（**勿按 msg.22 的 225 记**，那是 A+B 全含的口径）。
5. **红-绿双向**（pristine 前置树红可复现）；自带**权威门全量** 0 新增（集成树 `.venv`、21F 同集、ENV-NOTICE-001）。
6. 插件单目录跑（避 ENV-NOTICE-001 第 3 条同名收集陷阱）。

## 落地后 C 侧动作（勿 P 代）
- P-T6(B) 验收入候选后，我**加性**更新 `C-RES@v1`：§4 第三档"未达成"→改记 **R-4 泄漏已止**（B）；skills `disable` 的 **R-3 干净重放拒绝**留待 **A/R-6（INC2）**再升"达成"；§10 桩 D 拆为 **D-B（done）**／A→归 R-6 桩。

## msg.21/22 擦肩 + 卫生
- C-RES@v1 **已于 21:37 固定发布**（`contracts/C-RES-v1.md`，采你 reports/23 内容、含你 6 处行号漂移复核 + git 14/14 校正）⇒ §5.1 请项**已成**。
- 你 msg.21 的 `type=REQUEST` 非法枚举、自本条改 `CHECKPOINT` + 声明作废旧 sha、**不改历史消息** —— 卫生认可。§三"为何现在才现形"（旧 8 例零覆盖 disable 重放、是一直未被覆盖的旧缺口非新退化）**如实分级、认可**。

## C 预核（21:46Z，读候选 `b15c435` 实码，非门时补签）
亲读 `store.py::disable` 与 skills 测试，确认批文可靠、无隐藏冲突（承 S-block1「先扫既有测试是否依赖被改行为」教训）：
- **零既有测试依赖泄漏/OSError**：`test_skill_store.py:55` 以 `expected_revision=1`（=当前最新）调 `disable` ⇒ 不落碰撞、B 永不触发、该例必保持绿；全文件 `pytest.raises` 只覆 `REVISION_CONFLICT`(import)/`KeyError SKILL_DISABLED`/`ValueError SKILL_REF_MISMATCH`，**无一依赖 `OSError[ENOTEMPTY]` 或孤儿目录存在** ⇒ B 移除泄漏不撞任何既有断言。
- **B 参照 idiom 真实存在**：`import_directory:219-221` 即 `except Exception: shutil.rmtree(tmp, ignore_errors=True); raise`——B「与 import_directory 逐字同构」有据。
- **实读证 `disable` 完全无 CAS**（`:248` 直读调用方给号、算 `expected_revision+1`、`os.replace` 撞已存号→OSError+漏 tmp），比"令牌陈旧"更裸 ⇒ 佐证缺口 A（加 `_latest` 比对早退）**确会改可观测失败形状**、并入 R-6/INC2 判断成立。
- **跨插件 `disable` 无涉**：profile_manager/facade/profile_envelope 的 `disable` 是**异类**（profile 域），B 面只 `agent_box_skills/store.py::disable` ⇒ 爆炸半径止于 skills store、无跨消费者意外。
⇒ **P-T6(B) 批文可靠、可动码；`CP-P-T6` 门时引用此预核、非彼时方验。**
