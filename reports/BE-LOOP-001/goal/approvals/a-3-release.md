# a-3 逐路径批文（K1/K2/K3'/K4 放行；β 单列；S⊗E confluence）

发布：C · 2026-09-22 03:37Z · 申请件＝`server/reports/a-3-perpath-application-v1.md`（sha `0708223e…`，零开放点；§0 勘误 C 独立核验属实、CP-INC1c 已加性更正）
**基线＝候选 `8c437cd`**（S-DM1 合批顶，`checkpoint/CP-S-DM1.md`）· 三裁（02:43Z）已并入 v1 形状
**结构判定（C 增补）**：K2/K3' 均为 S⊗E confluence（K2-S 提交后步＋K2-E accept 摘除建档；K3'-S 受理冻结侧补 posture 节＋K3'-E `_merged_posture:380-408` 摘除）——**单腿先落会双建档/断供**，故本批**四路全批准、两腿齐了 C 才合批一次**（β2/INC1c 法）。

## 逐路径
| # | 路径与写者 | 批与约束 |
|---|---|---|
| **K1.1** | S `sessions/repository.py` 两写点＋`_migrate` 加列 | 批准。`execution_key TEXT`＝落库＋**自 turn_id 可推导初值**（幂等/可调试/零秘密）；历史行原始 NULL（s-c1＋平面 (b) 自洽）。**数据迁移逐路径格**：零回填、DDL 加列仅此 |
| **K1.2（β）** | 同上同窗 | 批准**单列格**：captured `profile_revision` 落列＝可观测数据语义变化——同一迁移窗、两列语义分钉；**若 INC2 节奏挤压可拆随 INC2、不夹带**（S 自律照准）。批＝形状；实施序随 confluence 齐动 |
| **K2** | S 主（service 两入口提交后步＋铸键＋correlation 只存不算）＋E 配合（`sidecar_backend.py:257/:260/:287` 建档摘除，键改入参） | 批准（**提交后紧随＋幂等先行**照 C 裁 4.1）。联动硬注：字段/内部锚与 **B2 公开表达一次对齐**（`S-b2-fields-half.md` `4d00e735…` 互引；批文出 B2 时若撞形状以本批 K 形为内锚、B2 为出面）。块 4（E→S 反写）相邻**不并入**、另线候程 |
| **K3'** | S 冻结侧（受理处父 posture 算一次进冻结件）＋E 删点（`delegation.py:380-408` `_merged_posture` 活读→读父 turn 冻结件；`resolve_all` 活行读清零、顶层 :36 import 随删） | 批准。方法学＝c-1B 已验形状；父无历史 permissions 节构型＝β2 typed 拒绝先例；「版本冻结≠内容冻结」最后一条**本批后清零**。V2/V3 族账随 CP 记 |
| **K4** | 各按域测试面 | 批准。钉全集＝K1 键落行/重放幂等／β captured-vs-活行可分辨（红-绿双向）／K3' 两半语义（本 turn 冻结/下 turn 新值）／`set_turn_dispatch` 回写等价 |

## 门与序
1. **前置**：E 活动任务＝INC2-A（在工），K2-E/K3'-E 排其后；S 半随时可写（K1/K2-S/K3'-S/K4-S 不依赖 E）。
2. 各腿 CHECKPOINT：全量门对**届时基线** `8c437cd`（INC2-A 若先合则随之滚动）FAILED-ID/ERROR **同形树对比**（worktree↔worktree——你 S-DM1 教训已采纳入验收口径）0 新增；strict-xfail 只减不增；红-绿双向。
3. C 合批：两腿 HANDOFF 齐→串行 cherry-pick→权威门→`CP-a3`。M-1 零动自证随件。
4. 勘误/命名：`provider_correlation_ref` 命名面 v0 §1.4 登记照旧不夹带改名。

领取＝S、E 各 ACK（引本件 ID）；Sol 零；不 push。

---
## 〔04:37Z 批文补格·K2-S′ 增格批准＋两确认（承 S msg.40 会签/E-053）〕
- **K2-S′ 批准成格**（S 半最后一枚），含两部件：①**完成点后置建档钩子**——`complete_turn` 提交后经 `claim_next` 认领的 `next_execution_id` 走**同一入口** `file_core_records(turn_id)`（幂等先行、先于派发）；②~~filer 组装翻转归 S~~ **〔04:39Z 再补正〕翻转改归 E 腿同窗一行**（承 S msg.41 预警论据：与其 accept 改造成对、免两轮；`bootstrap/runtime.py` 单行组装 filer 依赖入 SessionService 组合点）——**S K2-S′ 收缩为仅①完成点钩子**；C 前一时点"勿动 runtime.py"示对 E 撤回，以本补正为准。原子性仍由合批保证。入口签名按你会签现形（回执三件、correlation 只存不算）。
- **E 缺键码确认**＝`IDEMPOTENCY_CONFLICT`/409（既有词表、零新码值，照批）；K3'-E 父无节码 `PROFILE_CONFIGURATION_INVALID` 照批。
- **4.2 会签闭环**：S 零行使 veto、形与发布全等——记档。**措辞按 S③ 勘误更正**：`delegation.py:36` 顶层 import＝**保留、消费面缩子侧单点**（父侧推导已亡＝批意达成）；β 一行与翻转行均落 E 同窗。
