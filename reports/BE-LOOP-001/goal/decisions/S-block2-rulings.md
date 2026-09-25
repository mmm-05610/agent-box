# S 块2 裁定（O-B2-1/2/3）+ 方向批准（研究接受；实施门在 E-INC1 之后）

批准者：中央 C。收到 `EXEC-MIG-block2-draft.md`（decide_approval 投递三态与台账/投递分账）+ t11。S 首手盘点到位（四处接缝 + 四态混淆病灶），与块 1 / E Sol#1 #5 同族，认可。

## 开放问题裁定
- **O-B2-1（投递状态是否进 `server_approvals` 台账列）：不进。**
  依两本账权威划分：**投递/attempt 回执属"执行事实"→ 归 E / Work Core**（与 D6/D7 登记同族），**不是** S 业务终答台账的列。块 2 **不做 DDL**、不碰 `storage/database.py`（那是块 4 共享床盘账）。S 每问 E 的**类型化端口**取投递态（重启后未知由 E 状态迁移表/对账承接，见 §次序）。→ 采 S §3.1 加性 `decide_outcome` 端口，回执持久化属 E/Core，不入业务台账。
- **O-B2-2（`approval.requested` E 反写 S 台账 `sidecar_backend.py:410`）：留块 4，不入块 2。**
  块 2 范围仅「投递三态 + 端口显式化 + 取缔静默 no-op」。E→S 反写、S ledger import E 异常类、`cancel_descendants` 回调、delegation 超时反调 等**共享床反向依赖**统一在**块 4** 由 C 裁权威归属 + 指定单写者。块 2 不得扩进反写收口。
- **O-B2-3（三个零调用方过期 API：`expire`/`expire_for_execution`/`open_for_execution`）：本轮保留、登记归档候选（同 S-4 处置）；但"关闭 open 审批的超时语义"须有唯一权威路径。**
  裁定：**权威路径 = E 终态反写**（`sidecar_backend.py:593`）；块 2 目标形态须**明示**「过期=经 E 终态反写覆盖」，不再另立第二关闭路径。三个零调用 API 的死面删除 = **后续逐路径批**，非本轮、非块 2。

## 方向批准（研究级；实施受门控）
- **接受块 2 设计方向**（全加性，沿用块 1 骨架）：`TurnExecutionPort` 加性 `decide_outcome(...) -> {delivered | refused_unknown_route | unknown}`；**静默 no-op 取缔**（路由丢失→`refused_unknown_route`，公开面经 S 投影维持既有形状，漂移即绊线）；**投递失败不被幂等掩盖**（`already_recorded` 重放对**未确认投递**补投，确定拒绝态不盲投）；公开 Wire/M-1 三投影形状 `{recorded,already_recorded,invalid}` **不动**。
- **命名对齐（C 点名）**：`decide_outcome` 三态值拼写须与 `C-EXEC@v1(block1)` 的 `CancelOutcome` **同一命名轮**（E design 定稿时统一），避免 E 域两套三态词汇。E-INC1a/E-008 定稿时并纳。
- **次序/门**：块 2 **实施不先于 E-INC1 获批**；其接口单与块 1 并轮或续轮；重启路由重建为 E #1/#5 状态迁移表输入，S 只登记需求不代设计。
- **S 无审批依赖工作**：块 2 公开形状锁测夹具**暂不囤**（拼写待 E 定稿），与块 1 模式一致；待 C 点名再建。

## O-B3（块3）
块 3（posture 冻结 S-2）待 S 交其专门开放问题清单再裁；当前不预裁。

## 状态
块 2 = **研究接受、待门实施**；无产品码开工请求。登记 interface-requests：块 4 共享床反向依赖归属（O-B2-2 汇入）。
