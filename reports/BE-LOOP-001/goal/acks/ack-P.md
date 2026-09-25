# ACK platform (P) — 收到，非批准

- 收到：P `reports/status-goal.md` 阶段 DESIGN_READY（P-DESIGN@v1）+ 4 份产物（01/02/03/04，SHA 已录）。
- 质量：研究扎实、逐行核源码、边界/秘密/幂等先例分辨清楚，主动把 D4 交由 C 组织——认可。
- 处置：
  - **批准** 见 `approvals/P-T1-idempotent-cleanup.md`（D1/D2/D5 逐路径实施，未用 Sol）。批准与 ACK 分列。
  - D4 → 登记 `contracts/interface-requests.md#IFR-01`，**不批准单方实施**，待 E/H 设计后组织协商。
  - D3 → 排队为 P 第二增量（T1 落地后批）。
- 下一步（P）：按 P-T1 批准范围实施三项内部修复 + 本组 tests，交 CHECKPOINT（diff/测试命令+结果/已知缺陷/反例回归）；同时可继续不依赖审批的组内准备。获批文件之外不写产品源码。

## 更新 17:48 — 接受 IFR-05 答复 + 批准 P-T2
- 收到 `07-ifr05-p-answers.md`（逐条源码核实 + 新查出 **D6/D7** 同族失败窗口泄漏 + pytest-free 实测）与 `08-increment-P-T2-drafts.md`。P 的答复**质量高、自证充分**，认可。
- **批准 P-T2**（D3/D6/D7 + runtime-local 显式 no-op D8a + bwrap 内 entrypoint 字面量收敛 D8b；纯内部、不触公共出口）→ `approvals/P-T2-failure-window-leaks.md`。未用 Sol（内部收敛，同 T1 口径直批）。
- **C 裁定**（P §1/§4 请决项）：
  - **P-4**：采 P 论 → **不合并、`sandbox_port` 侧改名消歧（`RoomProcessSpec`）**。属公共区→ C 随 C-RUNTIME 发布，非 P/E 自改。
  - **P-7 / P-1**：release/terminate **动词加性进 `runtime_composition/protocol.py` Protocol = C 公共区契约发布**；次序按 P 建议：**先发动词、再 E-INC2 上端口**。C 将在 E design-final 时发布该动词节。
  - **P-5**：采 P 分级答（目标零创建成立；provider 登记不原子；P 插件内自补偿 D6/D7）→ **E 不必建失败登记路径**，转 E design v1 依赖闭环。
  - **P-2 home provider / D5 change_set 明文 / D4 artifacts 明文**：涉**秘密留存策略 + 可能新 provider（格局）**→ 已随 **IFR-01 升级 I**（`escalations/IFR-01`）；未决前 D4/D5 释放实现挂起，P 不擅设 home provider。
  - **P-6 ssh**：属新插件/格局，本轮不接收，C 排期。
- P 侧推进：T1 已集成 `4674a2a`；实施 T2 → 交 CHECKPOINT → C 核+真跑测试 → 集成 → 派下增量。P-7/P-4 公共区改动等 C 发布。

## 更新 18:42 — goal-platform-P-T2-CHECKPOINT-005 + msg.platform.5 收讫
- 确认 T2 交付记录（提交 `d484547`，12 文件逐路径 1:1、真跑 pytest 非替身、clean-clone 证 21 既有失败、红-绿可证）——该增量 C 已于 18:24 集成候选 `4917f56`，并于 **18:42 追加 C 独立全仓根 `tests/` baseline↔candidate 差量**（21/1328/33 逐字节相同，0 新增失败，见 `checkpoint/CP-P-T1T2.md` 追加节）。
- **决定 (b)（D7 `_secret_sources` 宽窄）与 (c)（新缺陷 D9）均已在 `approvals/P-T3-d9-token-reclaim.md` 答复**：(b) **维持现状**（wrap 失败不注销 caller 登记的 `_secret_sources`，已集成即定案、非新批）；(c) **已批 P-T3**（D9 `_paths`/`_envs`/`_consumed` 回收，硬约束=**绝不削弱 `_consumed` 重放守卫**、只回收 transport 自签绑定、不改公共面）。此处登记 P 已收追认，不重裁。
- **item (4) 你的读法正确、予以确认**：`CP-P-T1T2.md`「P 可继续补强 D6/D7 反例钉 / 按 `C-RUNTIME@v1` §2 自审插件回执形状」= **已授权的非产品工作**（仅 `tests/` + 只读自查报告），**不**解释为新产品源码授权。新产品源码改动仅限已批的 **P-T3 逐路径**。
- 当前 P 应实施 **P-T3** → CHECKPOINT（全量 `tests/` + clean-clone 证 21 既有失败、红-绿可证、回收后已消费 token 重放仍拒）→ C 集成候选 `4917f56` 续接。D4/D5→IFR-01 挂 I、动词→E 单写者、ssh→C 排期，均不变。Sol 无请求（正确，P 未用）。

## 更新 18:48 — goal-platform-P-AUDIT-CHECKPOINT-006 + msg.platform.6 收讫 + 裁定
- 收到 §2 自审 + D6/D7 补强 CHECKPOINT（提交 `2c7a925`）。**C 亲读码核实**：D16 属实（`tmux.py:117` 注释自陈补偿不应掩真因，但 `check=False` 吞不下 spawn 级 `OSError` → `allocate` 违反已批「原样重抛」）；D10 属实（`git/provider.py:116 cleanup->None`）；D11 属实；**D12 你已在 P-T3 在途 `runtime-local:302-307` 把 `owned`→`managed` 收敛三态族**（覆盖、无需另批）；**D13 确属公共区 `src/agent_box/.../coordinator.py`、你只报不修正确**。
- **裁定**：批 **P-T4**（D16 修复 + D10/D11 形状对齐 + D14 卫生，插件内加性、无新词、不申请 Sol）；D12 归 P-T3；D13 归单写者线（E，已登记 `C-RUNTIME@v1` 合规缺口）；D15 延后。全文 `approvals/P-T4-shape-alignment-d16-fix.md`。
- **时序**：先交 **P-T3 CHECKPOINT** → C 核+集成 → 再交 **P-T4 CHECKPOINT**（可并 `2c7a925`，一次集成/一次全量差量）。**两批源改动勿混在同一未提交工作树交付**（分 CHECKPOINT 窗口）。你的 (b) `_secret_sources`/维持现状 与 (c) D9/已批 P-T3 均已在 `approvals/P-T3-*` 答复，本条登记收讫不重裁。
- 认可你**撞出并对已批准收未达（D16）不自行改、不写固化现状的测试**——正是集成验收要的行为。
