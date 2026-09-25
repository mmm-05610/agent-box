# INC1c 批文（放行）— 生产者归一批 · S⊗E 合批 · 新基线 `57e91ec`

发布：C · 2026-09-22 01:17Z · 机制 COORDINATION-V2 · 依据：`decisions/INC1b-b4-confluence-interface.md` §6（INC1c 四项在册）＋ E 草案 `execution/reports/E-INC1c-application-draft-v0.md`（v0.1 修正版收讫）＋ S handover 队列。
**基线＝候选 `57e91ec`**（INC1b β2 合批，`CP-INC1b-beta2`）。契约锚：C-EXEC@v1（无新公开面）、C-RES@v1 不涉。**每组一个活动实施任务＝INC1c；BE-PROFILE-001 的 S/E 输入排在其 HANDOFF_READY 之后。**

## C 三裁（E 草案开放点，职责内裁定）
1. **c-1 采 B 案**（保留委派 posture 语义、归一生产形状）：posture 唯一合法生产者仍在委派创建点，但按 Session 同构语义——**事务外算 digest、事务内 `expected_profile_revision` 锚定**；勿造跨域 helper（E 在自己写点复制同语义、接受双处实现）。**理由**：INC1c＝生产者归一批、非权限语义变更批；A 案（整删活拼、子 turn 直取 profile 冻结件）改变委派子 turn 的权限 posture 语义＝产品取舍，且与 BE-PROFILE-001 盘点直接相关——**A 案登记为 BE-PROFILE-001 研究输入之后的产品问题，本批不做**。
2. **`_merged_posture` 保留不整删**（随 B 案：创建点冻结件的一部分，受锚定约束）；`:31` import `subagents` 私拆面按 c-2 翻绿要求收敛（实现细节归 E 正式申请）。
3. **死参微批并入本批＝c-5**（省轮次；joint 签名 note 两半已齐、随本批终稿归档）：`overrides` 形参从 impl＋Protocol 同删（Protocol＝内部端口契约、C 职权内）；S 侧 `_override_mapping` 退役同批。c-4 类审计（波及面 grep）提交前重跑并随申请件交清单。

## 范围（逐路径写域，越界即拒收）
**E 域**（`src/agent_box/server/execution/`＋in-tree `tests/server/test_e_*`）：
- c-1(B)：`delegation.py` `_create_child_turn` 归一（单文件；`objects=None` 边缘构型语义照 E 实测 1b 处理——生产路恒非空，测试构型不得依赖 NULL 兜底）。
- c-2：`test_delegation_does_not_import_product_domain_privates_yet` strict-xfail→**永久绿**（reason 整删；净减 1 xfail）。E-035 词面自曝更正照准（先例 E-027），不滚新 commit。
- c-3：**双入口 N1 钉**——委派自驱 `accept` 入口（`delegation.py:195`）强制交错钉：子 turn 创建→accept 窗口内改活 profile 行⇒子 turn 绑定仍＝创建点冻结件；红-绿双向＋plain-clone sim 自证（β2 方法沿用）。
- c-5(E 半)：`accept` 的 `overrides` 形参 impl＋Protocol 同删。
- c-4：提交前重跑全树 `create_turn(`/`accept(` 波及面审计、清单随件。
**S 域**（`sessions/`＋`wire/handlers.py` 死体＋in-tree `tests/server/` S 钉）：
- s-c1：legacy `effective=NULL` 行 **COALESCE 读回退删**（`get_turn_context`/`sessions/repository.py`）——裁定语义：历史 NULL 行读侧暴露**原始 NULL**（不再活行回退）；accept 侧维持 β2 的 typed `AgentBoxProfileV1` 拒绝（已是现行为）。**F5 钉按「翻转记账」显式收紧**（从"回退保留"翻为"原始 NULL 暴露"；方向=收紧、非弱化，checkpoint 记账）。
- s-c2：`_override_mapping` 退役（handlers 死体删）＋S 侧假件/fake 的 `overrides` 形参清扫（c-4 审计为准）。
**联合**：joint 签名 note 终稿（两半拼合）随批归档于 `decisions/`。

## 验收点（C 门）
1. 两腿各自：全量权威门（ENV-NOTICE-001 配方、单目录串行）**FAILED-ID/ERROR/skip/xfail 相对 `57e91ec` 基线 0 新增**；strict-xfail 净减 1（c-2）、不新增。
2. 定向：双入口 N1 钉红-绿双向；F5 翻转钉红-绿双向（旧语义红/新语义绿）；委派 posture **对外行为零变化**钉（B 案证明：同输入同冻结件字节）。
3. 合批：S⊗E 两 commit 由 C 串行 cherry-pick 上 `57e91ec`（树同一性核对法照 β2）；全量门 0 新增→`CP-INC1c`→闭。
4. 量面：不 push、不 add -A、Sol 按预算另计（本批预期免 Sol——形状归一＋已有方法学；若 E 正式申请含新语义面再议）。

## 流程（V2 §2）
E：草案 v0.1→**正式申请**（含 c-1B 实现要点＋c-4 清单）→C 核→实施→验证→HANDOFF_READY。S：按 s-c1/s-c2 直接实施（本批文即逐路径批准，无需另申请件；疑义先问）。两腿完成先后不限，**C 只合批一次**。基线对齐：两树留在各自 HEAD 续作（S `405b8b4`/E `2c69343`），语义锚＝`57e91ec`，不做 rebase（降险；cherry-pick 法已两验）。
