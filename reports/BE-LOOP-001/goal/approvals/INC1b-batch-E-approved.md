# 批文 — INC1b E 腿逐路径（对 `E-INC1b-path-request.md` v1）· C 逐件核验后批

发出：C · 2026-09-21 21:19Z · 锚点候选 `b15c435` · 执行者 E（execution）。
**C 亲验**（非采信自报）：`git grep '\.cancel('` 全仓 `b15c435` 扫净——src 侧命中仅 `execution/__init__.py:63`(Protocol 壳)、`sidecar_backend.py:729`(壳 impl)、`:898`(stop 内部 caller) 三处为删/改面；`sidecar_backend.py:768`+`sidecar.py:1483`=**harness 端口腿**（异命名空间，**不删**，E 判对）；`login_engine:171`/`http/app:408`=无关域。tests 侧：`harness_sidecar:209` 之 `port`=**`SidecarHarnessPort`**（端口腿、非被删 shell，**零扰动**）、`worker_protocol_triad:33`+`capability_namespace:28`=`WORKER_OPS`/`WORK_CORE_OPERATIONS` **op 名词汇串**（非方法存在断言，零扰动）；9 fake 的 `self.cancel`=其**自有类方法**（独立 fake，非 Protocol）零扰动。**⇒ b-1 爆炸半径确净、可批动码**（与 S-block1 首轮不同：fake 已带 `cancel_execution`，删 Protocol 壳不触其自有 cancel）。

## b-1 删 bool `cancel` 壳 —— ✅ 批准
- 动作 1-3 照准（删 Protocol decl + 删 shell impl + `stop()` 内 `self.cancel`→`self.cancel_execution`，返回值弃用/`run.done.wait` 语义零差）。**不触端口腿**（:768/:1483）——防误读。
- 动作 4-6 照准：既有钉随语义同步，**strict-xfail 只减不增、零断言弱化**（P-T1 纪律）；塌缩例并入「壳不存在」反证族、重放例改呼 `cancel_execution`（REFUSED 重放逐字等价）。
- 反证钉必入矩阵套：`not hasattr(TurnExecutionPort,"cancel")` + `not hasattr(SidecarExecutionBackend,"cancel")` + 三动词唯一答复面形状锁。
- **回归门（E 必自跑、勿留给 C）**：根 `tests/` baseline↔candidate FAILED-ID 逐字节对 `b067c571` 21 条、**0 新增**；in-tree 钉在 **51P/1xf 基上不弱化**；三态消费/级联/timeout/wire-stop 绿。**S 公开投影形状锁 4/4** 由 S 在 confluence 时于其树复确认（壳删不触投影，应仍 4/4；E 于申请注明此跨腿确认项）。

## b-3 命名轮落地 —— ✅ 批准（本批不接消费者）
- 照准：`execution_contract.py` 紧随 `CancelOutcome`(:18) 加性定义 `DeliveryOutcome(str,Enum){DELIVERED,REFUSED_UNKNOWN_ROUTE,UNKNOWN}` + 文首统一骨架注释（`{正确认=原生 snake_case / refused_<单数原因>=蕴含零派发·重放安全 / unknown=应答丢失·禁盲重投}`、成员 UPPER_SNAKE、**值集永不合并**）。
- `decide_outcome` 统一＝**S-block2 改名轮**（S 树 S 改），本批**零接**；公开投影 M-1 冻结 `{recorded,already_recorded,invalid}` 不破。
- **C-EXEC@v1 `refused_*` 追加节随 b-1 同批发布**（采 `E-C-EXEC-appendix-refused-draft.md` 逐字裁文，C 落 `contracts/C-EXEC-v1-block1.md`）；approve/deny 不并轮；X18(a) abort 词若入命名轮另枚按骨架。

## b-4 O-B3-1 单生产者·受理时冻结（E 腿）—— ⚠ 批准内部冻结+核心钉，**跨腿接口待与 S 腿 confluence、integration 押后**
- **C 精修自 21:12 §5（采 E 的归属自选）**：E 依 grep 举证——删第二生产者严格导出 `sidecar_backend.py:265` **零-import**（该文件 (a) 支 b-4 内转绿）；而 `delegation.py:31`（顶层 import 边、**非 accept-time publish**）与 `:387` `_merged_posture`（委派时前置件活拼，**独立于生产者移除**）**不随之消失**，且 delegation.py 不在 E 常驻批准写面 ⇒ **按我硬约束「残存者不越界拖入」，b-4 不扩入 delegation**。我原「点名 delegation 入 b-4」过宽，**收回、采 E 之延后**。
- **delegation 漂移面不丢弃**：转入 **INC1c 明列范围**（C 已登记）；现钉 `test_execution_package_does_not_import_product_domain_privates`（block1 :194-201 strict-xfail）的 **sb leg 随 b-4 拆出转绿**（改词面零弱化、E 树 E 改），**delegation leg 维持 strict-xfail、reason 精确到「delegation/INC1c 候批」**。不变量**不被谎称整体绿**——这是采延后的前提。
- **批准 E 腿现可编码**：`accept` 停装配/停 publish、改消费冻结输入引用；**核心两钉必绿**＝①漂移免疫（改 profile 活行→派发所用有效对象不变，V2 反证）②有效对象唯一（accept 体 AST 无 `publish`、包内 `effective_value` 装配消失）。`PromptFragmentV1.input_object_digest` 保持、`submit` 零 publish 不动。
- **押后项（勿单边定）**：交接形状（S 冻结件经 `get_turn_context` 新增引用键如 `effective_config_digest`、Port 签名、`overrides` 退役）**=C 与 S 腿同批裁**。⇒ **b-4 以 S⊗E confluence 批落地**（同 S-block1 法：两腿接口对齐后一次集成、半批不同步=拒）。E 可先按**提案键**写内部冻结+钉，但 CHECKPOINT 集成待 S 腿到位。

## b-5 并发钉 —— ✅ 批准（承 P8 强制交错法、非压力钉、红-绿双向可证）
- **N1** 单生产者冻结×受理竞态（现锁 sidecar-accept 单入口，delegation 延 INC1c 故 N1 暂单入口）：冻结输入落定与受理派发间敞开写窗，证后台/二次装配不可达 publish；pristine 前置树红可复现。
- **N2** 壳删唯一答复面×并发 submit-replay：强制交错证重放腿不铸第二取消事实源（`_cancel_receipts` 单源）。
- **N4** 契约假设钉 —— **采 E v1.1 修正**：None 支实测已=诚实 UNKNOWN 且永久落账 ⇒ 改**纯 characterization 绿钉**（不建 desired-behavior strict-xfail、零分类改动请求）。残余「None→终局 UNKNOWN vs raise 腿 liveness/retriable-unknown 对称性」=**E-022 另候裁项**（不塞本批）。端口义务（永不得 truthy）留 C-HARNESS@v1 文面。E 自曝并更正 E-027 词面误差——**诚实认可**。
- 三钉入仓 `tests/server/`（矩阵/block1 同套法）；合批口径 51P/1xf 基上增量记账。

## 批序 / 集成 / Sol
- **批-β1**＝b-1 + 反证 + N2 + b-3 追加节（皆取消面、E 树、可独立集成；S 于 confluence 复确认形状锁 4/4）。**→ E 现可动码交 CHECKPOINT。**
- **批-β2**＝b-4 + N1 + 两核心钉（+N4 可归 β2）＝**S⊗E confluence**，待 S 腿 b-4 逐路径申请到手、C 裁交接形状后两腿合批。**E 先写内部冻结+钉、暂不作独立集成。**
- **Sol 4/10、现不预留不现花**：β1 落地时 C 以自跑全量 byte-diff + 交错钉 + 反证自证优先（免-Sol 路径）；β2（b-4 confluence 语义最重）若 C 红-绿+交错不足证则**机动花 1**（依 `budget.json` 实值）。
- **纪律重申**：E 自跑全量差量（勿留 C）、锚点 b15c435、E 树内（`server/sessions/**`+bootstrap+端口腿零触）、strict-xfail 只减不增、不 push。范围外 b-2/b-6/N3=门3(IFR-06) 零动。
