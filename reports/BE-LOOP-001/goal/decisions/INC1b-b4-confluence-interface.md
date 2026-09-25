# 裁定 — INC1b b-4 S⊗E confluence 接口 + 逐路径批文（对 `INC1b-S-b4-application.md` v2）

发出：C · 2026-09-21 21:24Z · 锚 `b15c435`（C 亲验五锚属实：column 存 `:135`/intent 写 `:223/:240`；直建 `create_turn` INSERT **不含** `effective_config_object_digest`；`get_turn_context` `COALESCE(t.effective…,p.config_object_digest)` `:687`=漂移根；intent helper 对已在生产）· 无交 I（跨腿接口/派生时机=技术裁、组内写授权）。

## §1 S 腿 b-4 —— ✅ 批准逐路径（P1/P2/P3），**采 D2、附一硬条件**
- **P1 `service.create_turn`**：`records.create_turn` 前，按 intent 路径 **同一对 helper**（`_effective_configuration`→`_publish_effective_configuration`）算 effective + 落 digest，以 kwarg 传 records。**不铸第三形状**。
- **P2 `repository.create_turn`**：INSERT 列增 `effective_config_object_digest`＝P1 digest；**零 schema 迁移**（列已在）。
- **派生时机＝D2（事务外算、事务内既有 `expected_profile_revision` 校验兜底）**：与**已在生产运行的 intent 路径同一信任结构**、不引入新时序面/新断言/孤儿对象。**硬绑定条件**：S 算 digest 所依据的 profile 读，其 revision **即**事务内 `expected_profile_revision` 所校验者（同一次读），否则锚定不成立。
- **D2' 预备升格**：若 S grep 证「profile 配置**内容可在不抬 revision 下改变**」（revision 与 digest 非函数绑定）⇒ 纯 revision 锚不足 ⇒ **必采 D2'**（事务内加单行断言 `profile.config_object_digest == 冻结所见`）。此判据=S 在 β2 CHECKPOINT 给 grep 证据（同 E b-4 grep 纪律）。默认 D2。
- **P3 测试**：新建 `test_b4_acceptance_freeze_s.py`（直建后改配置→`get_turn_context` 读 digest=冻结非活行，修前红=E3 回退/修后绿；replay 先行幂等不重冻；N1 强制交错）+ **翻转**既有 `test_block3_freeze_gap_characterization_s.py`（O-B3-1 块3 预裁「INC1b 落地 T2 随批翻转」）。**翻转须显式记账为「表征 bug → 断言修复」的收紧、非静默改用途、非弱化**。

## §2 跨腿交接接口（confluence shape）—— C 裁如下，两腿须**一次合批、半批不同步=拒**
> **22:20Z C 预核 E β2 E-leg `2c69343`（committed、稳定）**：accept 删装配/publish+profiles-import、改读**原始** `context["effective_config_object_digest"]` 逐件属实；**null-digest typed 拒绝已验真**——`AgentBoxProfileV1.__post_init__`（`resource_contracts/agent_box_profile_v1.py`）对 `digest` 非非空 str 即 `raise ValueError("…digest is required")` ⇒ 无 COALESCE 拾活行、非 KeyError、typed 失败。**confluence 门须重点看的唯一残留**：历史/`effective=NULL` 行若曾抵达 `accept()` 现会被 typed 拒绝（prior 曾 live-pickup）——若任一既有测试/流程在无冻结 digest 下调 accept，全量差量会显红（届时按 S-block1 fake-sweep 法定夺：要么该路径本不该 dispatch、要么测试夹具补冻结）。
> **22:42Z 合批就绪 dry-run（读、未触候选）**：`git cherry-pick -n 2c69343`（E β2 E-leg，锚 `b15c435`）于现候选 `67e5c52`（已含 β1 改同文件）＝**干净、零冲突**（accept 段 :245-277 不与 β1 的 :729 壳删 / :885 stop 重叠，三文件照常并入）。⇒ **β2 合批的 E 半边确认可无摩擦集成、集成风险仅剩 S 腿本身**（S 未 commit）；S 交后 C 直接 S-leg⊕E-leg 合批跑门，无预期冲突需排。
> **22:43Z accept-scan（confluence 残留风险再降）**：候选 `67e5c52` 的 `tests/**` **无任何 `.accept(` 调用点** ⇒ 先前担心的「历史 `effective=NULL` 行经 root 测试调 accept → typed 拒绝显红」**不会在 root 门发生**（E 的 β2 钉自带场景构造）。合批门余险收窄至＝S 腿自身正确性 + E β2 钉套在合批树绿（S mint 非空 digest 后）。
- **冻结值经现有列流转**：S（本批 §1）在直建行落 `effective_config_object_digest`；
- **`get_turn_context` 暴露原始冻结键**：S（P2 文件、+1~2 行）新增**读字段 `effective_config_object_digest`（原始、无 COALESCE）**，与现有 `config_object_digest`（COALESCE 活回退、为 legacy/Q3 保留）并存。E 消费**原始冻结键**、非 coalesced 值。
- **E 腿**：`accept` 读该冻结键直用、**删** `sidecar_backend.py:247-274` 受理时装配/publish（β2 已批内部冻结+核心钉）。
- **`overrides` 退役 + accept 签名（joint，勿单边）**：S 直建 `self.execution.accept(turn_id, overrides=overrides)` call-site（S 文件）与 E 的 accept 消费形状**同批对齐**。`TurnExecutionPort` Protocol 签名**零改**（E 批文已定）；具体 accept 的 `overrides` 形参去留 = **E+S 在 β2 CHECKPOINT 提交一份 joint 签名说明**（倾向：E 先忽略 overrides，S call-site 随之去传，死参随合批清），**C 据 joint note 一次批**，不拆成两次改。
- **两写点同语义不变量（C 锚定）**：直建 HTTP `create_turn`（S，本批）与委派 `_create_child_turn` 裸 INSERT（E7、**E 域、延 INC1c**）＝「两入口一对象家族」两 turn-row 写点，**各在自己写点落同一 digest 语义、勿造跨域 helper**。b-4 先闭直建写点；委派写点 INC1c 由 E 闭 ⇒ 全局单生产者届时方成立（分两批、语义一致、中途 strict-xfail 不谎称绿）。

## §3 N1 入口界 **澄清（纠正 S v2 的交叉引用）**
S §3 引「C 令 E 双入口都锁」＝**已被 21:19 E 批文精修覆盖**：委派入口延 INC1c ⇒ **b-4 N1＝单直建入口**（S 侧直建 HTTP accept 竞态 + E 侧 sidecar-accept 消费竞态，各一钉）；**委派自驱 accept 的 N1 双入口锁随 delegation 一起落 INC1c**。S 本批 N1 现即直建 HTTP 入口（正确），删去「双入口」措辞免歧义。

## §4 a-3（execution_key/correlation/落库归 S）—— **另立逐路径申请，不并入 b-4**（采 S 自查建议）
与「受理时冻结输入」不同因、且可能改响应形状 ⇒ 折入 b-4=scope-creep。S 默认另立即**认可**。

## §5 Q3（legacy 有效=NULL 行 COALESCE 回退）**保留**、随 INC1c 处置——✅
本批只停**新**直建行回退活行；删历史行回退=改历史可见语义，**归 INC1c**（与 `resolve_all` 直读删同题）。

## §6 INC1c 范围（C 本次合并登记，勿丢）
1. `delegation._merged_posture` 冻结输入化 + `delegation.py` 零-import leg 转绿（X18-half-split §5 延此）；
2. 委派自驱 accept 的 **N1 双入口钉**；
3. legacy `effective=NULL` 行 COALESCE 回退删 + `resolve_all` 直读删；
4. （承块4）E→S 反写族若届时到位另计。

## §7 集成序 / Sol
- **β2＝S 腿 b-4 ⊗ E 腿 b-4 合批**：两腿各编至约定接口 + joint 签名 note → C 一次性集成 onto 候选、跑全量 0 新增 + N1(直建) 双份红-绿 + 矩阵/block1 51P/1xf 不移动 + intent 路径不回归（helper 复用面）。**任一腿单边 CHECKPOINT=不集成（半批不同步=拒，S-block1 先例）。**
- **Sol**：β2 语义最重（跨腿冻结 + 派生时机 + 双入口家族）。C 自跑红-绿+交错钉+D2 锚 grep 若足证则免；不足则**机动花 1**（依 `budget.json`，现 4/10 未动）。
- 纪律：两腿各**自带全量 0 新增**再交（ENV-NOTICE-001 (b)）、锚 `b15c435`、S 只 `sessions/**`、E 不碰 `server/sessions/**`、strict-xfail 只减不增、不 push。β1（E 的 b-1/b-3/N2/N4）可**独立先行**集成（不依赖 β2）。
