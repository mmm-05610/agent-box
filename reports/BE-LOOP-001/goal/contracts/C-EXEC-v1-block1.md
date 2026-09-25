# C-EXEC@v1（block 1：取消三态事实）— C 发布

提供方 E · 消费方 S · 基线 `b067c571` · 由 C 于双方（S `EXEC-MIG-block1-draft`、E `E-D1 §1/§4`）语义一致后发布。
本文件固定 block-1 范围；E-INC1 产品实施仍受 **E design-final Sol#1** 门（H/P 确认未齐）。C 独立复核前提属实：
`execution/__init__.py:54 def cancel(turn_id)->bool`；E `sidecar_backend.py:691` no-active 与 abort-error 均塌成 False；
S `handlers.py:2173`→`unconfirmed/STOP_NOT_CONFIRMED`、`service.py:237`→`accepted:false`。
> **〔加性更正 22:37Z〕**：上列为 **`b067c571` block-1 基线**之 C 复核锚（当时 bool `cancel` 壳存在）。**E-INC1b β1（候选 `f97e96f`）已删该 bool `cancel` 壳**（`__init__.py` Protocol decl + `sidecar_backend.py` 壳 impl；`stop()` 改呼 `cancel_execution`），故 `:54 def cancel`／`:691 塌 False` 在现候选上**不再解析**——**取消答复唯一面＝`cancel_execution`**（三值语义不变，见文末「词表族规则」追加节）。`handlers.py:2173`/`service.py:237` 投影锚点亦随集成漂移，行号以 `b067c571` 为准、语义仍有效。

## 契约语义（block 1）
一次执行的取消协调返回三值（拼写归 E，S 只要求可分辨；E 不发明原生停止原因）：
- `confirmed_stopped`：E 确认停止生效（现 True）。
- `refused_no_active_run`：**确定**该 turn 在 E 域无在飞执行可停（`_active` 缺席且无残留 run）。
- `unknown`：停止已下发但结果未知（超时/通道断）或 E 无法诚实归类。
终局（确定完成）不在此接口：留 S ledger `already_finished`。禁止把 refused 压成 unknown 或反之；禁止以重试掩盖 unknown 派发。

## C 裁定（两开放问题）
- **O-3 协议归属**：`TurnExecutionPort`（在 `execution/__init__.py`）即 **C-EXEC 载体**，非冻结的 `execution/protocols.py`/`extensions/api.py`/`work_core`/bootstrap/`runtime_composition/protocol.py`·`sandbox_port.py` 签名。
  → block-1 允许在该 port **加性**新增方法 + 结果类型（bool `cancel` 暂留兼容壳，S 切换后 E 删）。属 C 发布契约变更，非 E 擅改公共内核。
- **M-1 公开 reason 值**：本轮 **不新增公开 Wire/REST reason 值**（公开形状冻结）。三态分辨只落：E 端口返回 + S 现有投影（`unconfirmed/STOP_NOT_CONFIRMED` 不变）+ S/E `/tests` 断言。
  公开快照须与基线一致（防漂移）。若日后产品要公开区分 refused/unknown → **公开协议变更，交 I**。

## 状态权威 / 失败·重试·清理 / 兼容（要点）
- 权威：单次在飞状态=E；Turn 业务终态与取消留痕=S ledger；产品答复=S 对两者有来源投影。本块不搬权威，只把 E 已有内部区分抬到接口面。
- unknown：客户端重试 cancel 走同一 `Idempotency-Key`，重放返回原回执、不重复下发 abort。
- 兼容：公开 wire/1、REST `POST /turns/{id}/cancel` 形状不变；无 schema 迁移。`cancel_descendants` 级联留 S。

## 反例（缺失/退化）
bool 退化：派发已失败无进程在跑→永远报 unconfirmed，客户端空等；与真 abort 超时不可分辨→无法验 C1 场景5「不重复触发」；S 猜 E 内部（读 `_active`/异常）→双权威+E 细节外泄；终态判断移进 E→E 需读业务 ledger，违反「实现不知产品身份」。

## 实施门（时序）
1. **E-INC0（批准，见 approvals）**：E 先把五攻击「钉住测试」写进本组 `/tests`（不写 `server/` 产品、不改公开）。
2. **E design-final → Sol#1（预留，未花）**：待 H 落 `C-HARNESS`（H-1..4）、P 答 `C-RES/C-RUNTIME`（P-1..6）→ E 定稿 → C 用真 `codex review -c model=gpt-5.6-sol` 核验 #1 → 批 E-INC1（block-1 产品实施）。
3. **S-block1**：批准 S 现在就位夹具/契约投影测试（不依赖审批）；S 实际切换 `handlers.py`/`service.py` 四处调用点，待 **E block-1 检查点经 C 集成验证后** 再批切换。

## 追加节 — 词表族规则（随 E-INC1b b-1 生效 · 21:57Z · block-1 三值拼写一字不动）
> **发布依据**：`decisions/INC1b-naming-round-ruling.md`（措辞 + 命名轮骨架）＋ `approvals/INC1b-batch-E-approved.md`（b-1/b-3 批准）＋ E 定稿草案 `E-C-EXEC-appendix-refused-draft.md`。随 β1（b-1 壳删 + b-3 `DeliveryOutcome`）验收入候选 `f97e96f` 同批发布。

取消/投递等「事实答复」枚举共用一族骨架，各枚举**独立发布、值集永不合并**（停止确认 ≠ 投递确认，强同＝不诚实类型）：
- **正确认** ＝ 原生事实 snake_case 名（如 `confirmed_stopped`）；
- **`refused_<单数原因>`**（如 `refused_no_active_run`、`refused_unknown_route`）＝**确定拒绝态**：蕴含该 key 在答复方域内**无任何下发**；对该 key 重放返回原判为**安全**（回执终局化即此规则的兑现）；
- **`unknown`** ＝ 应答丢失/无法诚实归类：**禁盲重投**；仅显式重放路径（同 `Idempotency-Key`）可补投。禁止把 refused 压成 unknown 或反之。

类名按事实命名 `<Fact>Outcome`（`CancelOutcome`/`DeliveryOutcome`）、str 值枚举、成员 UPPER_SNAKE；返回枚举非 str，**公开投影墙（M-1）不因枚举松动**。
- `CancelOutcome` 三值（`CONFIRMED_STOPPED/REFUSED_NO_ACTIVE_RUN/UNKNOWN`）拼写**一字不动**；既有 4/4 形状锁、S 消费锁、E 矩阵钉零触碰。
- `DeliveryOutcome{DELIVERED, REFUSED_UNKNOWN_ROUTE, UNKNOWN}` 定义落 `execution_contract.py`（b-3、随 β1 入仓），`decide_outcome` 统一＝**S-block2 改名轮**（S 树 S 改）。
- abort/停止原因等 H 侧新词（X18 (a)）若入命名轮，按本骨架**另枚**、不与本追加节混写。
