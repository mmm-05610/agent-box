# 放行 INC1b — 实施门开（承 `CP-S-block1`）+ b-4 归属裁

> **21:19Z 更新**：E 腿逐路径批文已发 `approvals/INC1b-batch-E-approved.md`。其中 **§b-4 依 E 的 grep 举证 + 本件硬约束「残存者不越界拖入」精修本件 §b-4**：删第二生产者仅严格导出 `sidecar_backend.py` 零-import（(a) 转绿）；`delegation.py` 属独立前置面 ⇒ **b-4 不扩入、其漂移 leg 维持 strict-xfail 延至 INC1c**（本件下文「点名 delegation」的倾向收回；INC1c 范围已登记该漂移闭）。b-4 以 S⊗E confluence 落地。

发出：C · 2026-09-21 21:05Z · 触发：S-block1 合批验收入候选 `b15c435`（0 新增失败、51P/1xf 复现）。
适用：E（execution）、S（server）。**次序不变：1a→Sblk1→1b→1c→块3V4。** 本件只开 **实施门 + 逐路径申请的资格**；每条路径**仍须 E/S 提交逐路径申请、C 逐件批文**后方动码（同 S-block1 纪律）。

## 重锚约定
INC1b 一切申请/实施锚点**对候选 `b15c435` 重 grep**；E-INC1b 草案 v3 的行号仅时点近似、不作批文依据。

## 开批（前置已满足）
- **b-1 删 bool `cancel` 壳**（`execution/__init__.py` Protocol 声明+实现壳 + `sidecar_backend.py` cancel 腿）：消费端已离 bool 面（S-block1）→ 前提达成。`CancelOutcome` 成唯一取消答复面，三值拼写**一字不动**（裁文）。**回归门**：S 公开投影形状锁 `test_block1_cancel_public_shape_s.py` 锁的是投影非 port 壳，壳删后须仍 **4/4**。
- **b-3 命名轮登记**：`decisions/INC1b-naming-round-ruling.md` 已预裁（`DeliveryOutcome` 采、`refused_*`=零派发·重放安全、`decide_outcome->枚举非 str`、公开投影 M-1 冻结 `{recorded,already_recorded,invalid}` 不破、统一骨架不铸第二 bool/None 壳、`CancelOutcome` 三值不动、approve/deny 不并轮）。**其 `refused_*` 语义的 C-EXEC@v1 正式追加随 b-1 落地同批发**（勿现发脱节补丁）。实施=随批文。
- **b-4 O-B3-1 单生产者·受理时冻结（跨 S/E）**：见下 §归属裁。**E 腿**＝删第二生产者、`submit` 只吃冻结输入、E 不碰 `server/sessions/**`；**S 腿**＝受理时冻结输入（S 树 `sessions/**`，S 逐路径申）。
- **b-5 钉族**（`tests/server/`，合批口径矩阵+block1 **51P/1xf**）：随 b-1/b-4 各批；**N1 单生产者冻结×受理竞态、N2 壳删唯一答复面×并发 submit-replay、N4 X18 边界声明钉**（据 `decisions/H-009-X18-abort-audit-honesty-ownership.md` 已裁准建）——**强制交错、红-绿双向可证**（承 P8 两钉同法，pristine 前置树红可复现、修后绿，**不用压力钉**）。N3（closure 表×零可达）随门 3、不提前铸空转钉。

## 仍挂起（前置未满足 = 门 3：H bundle 声明可消费形状 / IFR-06 已在 I）
- **b-2**（删 `sidecar.py` `closure=None` 兼容壳 + bootstrap 两参形状）、**b-6**（observe 探测腿对账，输入形状=IFR-04/C-HARNESS closure 声明）、b-5 **N3**：**无码可写**，待门 3。**bootstrap 属 INC1a 冻结区，届时单列申请，越界即驳。**

## § b-4 归属裁（C 权限内：增量拆解决策，非产品取舍、非扩权 → 不交 I）
**问题**：`server.profiles.*` 零-import 静态断言，(a) 随 INC1b b-4 转绿（E 同批改 block1 钉 xfail reason 词面）／(b) INC1b 只删第二生产者、import 归一留 INC1c。
**裁定＝采 (a) 为默认，附一条硬约束**：
1. b-4 核心验收（**必须绿**）＝**漂移免疫钉 + 有效对象唯一**——这两枚证明「冻结输入」性质本身。
2. 零-import `server.profiles.*` 断言**随 b-4 转绿**——理由：第二生产者若真删净，其受理时所需的 `server.profiles.*` import 必随之消失，**该 import 溯源即「生产者已除」的结构证据**。
3. **硬约束（防 scope creep）**：E 在 b-4 逐路径申请须给 **grep 证据**——受理路径残存的 `server.profiles.*` import 若**仅源自被删的第二生产者** ⇒ 采 (a)、b-4 内转绿；若发现它**经由 legacy start 路径存活**（须把 legacy 也冻结输入化才能清零）⇒ **INC1b 不得扩入 legacy start 路径**，该断言**改归 (b) 延至 INC1c**，b-4 仅带两枚核心钉绿落地。
   即：**零-import 随 b-4 当且仅当它是生产者移除的严格后果；否则延后、不越界拖入 legacy。** E 据此自选并在申请中列明落在哪支。

## 预算与 Sol
INC1b 含 b-4 并发面 + b-5 三枚强制交错钉，语义量级类 INC1a。**是否花 Sol 实施验收在实现落地时按 `budget.json` 实值定**（承 INC1a 教训：C 可执行红-绿 + 强制交错钉若足证则免 Sol，不自动花）。**现不预留、不现花。**

## 队列
S：交集成树 `b15c435` **第二见证**（形状锁 4/4+三态消费+51P/1xf），并可起 **S 腿 b-4** 逐路径申请（受理时冻结）。E：起 **b-1/b-3/b-4/b-5(N1/N2/N4)** 逐路径申请。H/P 本轮无 INC1b 动作（H 增量 2 on IFR-06；P 维持 IDLE，D17/verbs/ssh 分流不变）。
