# CP-E-INC1b-β1 — INC1b β1（b-1 删壳 + b-3 命名 + b-5 N2/N4）集成检查点

> **✅ 验收通过（21:57Z）：入候选 `f97e96f`**（`b15c435` ⊕ E `1dec494`）。**C 权威门全绿**：全量 baseline `b067c571`(21F/1328P)↔candidate(21F/1388P/33skip/1xfail) **FAILED-ID 逐字节同 → 0 新增失败**（β1 净 +9 通过钉）；定向三钉套（`test_e_inc1b_b5_pins`+矩阵+block1）**60P/1xf/0F**（E-029 申报口径精确复现）。**免 Sol**（β1 = 已 Sol#2 双确认的 INC1a 消费面延续 + b-1 壳删 + 加性命名 + 强制交错钉；C 逐件亲验红-绿）。随批发布 `C-EXEC@v1` `refused_*` 追加节。

## 组成（E `1dec494`，逐路径批 `approvals/INC1b-batch-E-approved.md`）
| 项 | 内容 | C 核验 |
| --- | --- | --- |
| b-1 | 删 bool `cancel` 壳：`execution/__init__.py` Protocol decl 删 + docstring 更正；`sidecar_backend.py` shell impl（`return …is CONFIRMED_STOPPED`）删；`stop()` 内 `self.cancel`→`self.cancel_execution`（答复仍弃、`run.done.wait` 不变、行为等价） | 读 diff 确认三处、**端口腿 `sb:768`/`sidecar.py:1483` 未动**、M-1 投影零差 ✅ |
| b-1 反证钉 | 矩阵 O-3 塌缩测试→**反证族**（`not hasattr(Port/Backend/实例,"cancel")` ×2 + 公开 cancel 词表锁 `["cancel_execution"]`）；block1 重放两呼改呼三动词（REFUSED 逐字等价） | strict-xfail 只减不增、零断言弱化 ✅ |
| b-3 | `execution_contract.py` 加性定义 `DeliveryOutcome{DELIVERED,REFUSED_UNKNOWN_ROUTE,UNKNOWN}` + 统一骨架注释；**本批零消费者、`__init__` 不 re-export** | 命名骨架一致、`CancelOutcome` 三值未动 ✅ |
| b-5 N2 | 新 `test_e_inc1b_b5_pins.py`：公开答复面唯一性、AST 单写者锁（`_cancel_receipts` 下标写仅 `cancel_execution`）、**强制交错**（`_GateLock` 停车于派发→落账间隙、replay 定时注入）证重放不铸第二取消源 | 强制交错非压力钉、红-绿双向 ✅ |
| b-5 N4 | 纯 characterization 绿钉五枚（port 四答复形 → 终局回执 + raise launder）；retriable-unknown 对称性留 E-022 另候 | 无 strict-xfail（采 E v1.1 修正）✅ |

## 爆炸半径亲验（承 S-block1 教训）
- `git grep '.cancel('` 全仓 `b15c435` 预核净：端口腿/`SidecarHarnessPort`/op 名词汇串/9 fake 自有 cancel **均不触**；删 shell 后无既有测试依赖 `OSError`/塌缩 bool（E-029 报的 2 枚 "S 域滞后假红" 系 E 本树未含 S-block1 switch，**候选树已 switch `cancel_execution`**、实测不在 f97e96f 的 21F 集）。
- 范围账：6 文件（3 src execution/*、3 tests/server），**零 `sessions/**`、零 bootstrap、零 b-2/b-4/门3 面**。

## 发布
`C-EXEC@v1` §追加节「词表族规则」（`refused_<单数原因>` 零派发·重放安全 / unknown 禁盲重投 / `<Fact>Outcome` 值集不合并）随 b-1 入正文（`contracts/C-EXEC-v1-block1.md`）。block-1 三值拼写不动。

## 边界 / 后续
- **β2（b-4 单生产者冻结）＝S⊗E confluence**，待 S 腿 b-4 码 + joint 签名 note → C 另批集成；**不随 β1 混读**（E 树 β2 未 commit，`1dec494`＝纯 β1）。
- b-2/b-6/N3 仍挂门3(=IFR-06)。
- 候选续 `f97e96f`；下一步待 β2/1d/P-T6 CHECKPOINT。
