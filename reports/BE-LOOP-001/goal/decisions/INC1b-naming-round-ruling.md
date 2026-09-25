# 裁定 — INC1b 命名轮（E-013 三征询）预裁，降 INC1b 起草摩擦（非开实施门）

裁定者：中央 C（20:25Z）。据 E `reports/E-INC1b-naming-round-proposal.md`。**仅裁命名/契约文档面，不前置任何实施门**（实施仍候 `1a→Sblk1→1b` 链、S-block1 合批集成后逐一开批）。

## 三征询
1. **类名 `DeliveryOutcome`：采**（E 荐）。与 `CancelOutcome` 对称（动作端口 `cancel_execution`→停止事实、`decide_outcome`→投递事实），事实命名而非动作命名，骨架同构。拒 `DecideOutcome`（动作名返回值不符事实命名法）。
2. **`refused_*` 蕴含「零派发·重放安全」入 C-EXEC@v1 追加节：准**（E 荐）。此为各钉公共前提，值得契约层显式；但**登记为待随 INC1b 落地时正式追加**（现不单独发契约补丁，避免契约版本与未落地代码脱节）。措辞：`refused_<单数原因>` = 确定拒绝态蕴含该 key 无任何下发、重放返回原判为安全；`unknown` = 应答丢失、禁盲重投（仅显式重放路径可补投）。
3. **S 侧同步方式沿用块 1 先例（一次性改名 + 夹具同步，随 S-block2 逐路径批，E 不代改 S 树）：准**。与 Q1 单写者纪律一致。

## 统一骨架（认可 E §1，未来 E 域端口三态同此生成）
`{正确认=原生事实snake_case, refused_<单数原因>=蕴含零派发·重放安全, unknown=应答丢失·禁盲重投}`；类名 `<Fact>Outcome`、str 值枚举、成员 `UPPER_SNAKE`。**不合并值词**（停止确认≠投递确认，强同会造不诚实类型）。
- `decide_outcome(...) -> DeliveryOutcome` **返回枚举非 str**：采（O-3 加性、公开投影仍 M-1 冻结 `{recorded,already_recorded,invalid}`，枚举不妨碍该墙、三态仅端口+测试可辨）。
- **不铸第二套 bool/None 壳**（壳删成本 block1 案 B 已付一次）：认可；若 S 切换期确需过渡壳须在批准件点名，E 方按案 B 登记删壳增量。
- `CancelOutcome` 三值拼写一字不动、既有 4/4 形状锁 / 消费锁 / E 矩阵 28 钉零影响：确认（命名轮纯新增 `DeliveryOutcome` + 文首骨架注释）。

## 门
本裁定**不开 INC1b 实施门**。INC1b 正式逐路径批准（含 O-B3-1 单生产者受理时冻结、新 rubric 三枚并发钉、P8/P9 后的 cancel 腿）待 **S-block1 合批集成** 后由 E 交 INC1b 草案 v-next 候 C 批。现 E 树继续 S-block1 E 腿（P8/P9）。
