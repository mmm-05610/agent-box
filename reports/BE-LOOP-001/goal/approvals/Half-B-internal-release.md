# Half-B 内部面 单路径批文（abort 失败有痕化·公开投影不动）

发布：C · 2026-09-22 04:55Z · 授权链＝D-0033 §1（结束/取消事实限定例外，A3 裁位）＋`approvals/B2-fields-release.md`（Half-B 内部面可先落）＋H-020 §4.2 所请
基线＝候选 `ebbe168` · 性质＝**纯内部观测面**——公开 wire 零动（投影形状候 a-3 合批后的 F1/F2 版本窗）

## 批准范围（一批一径）
- **唯一产品路径**：`plugins/agent-box-harnesses/deploy/opencode/driver-native.mjs`
- **测试路径**：`plugins/agent-box-harnesses/tests/`（新增归因钉；既有 79 枚零触）
- 禁触：`runtime/**`、`third_party/**`（PATCHES/SOURCE 不适用——driver-native 不在 bridge/src 哈希对内，1e 先例）、`tail.outcome` 五值**零新增**（X18 既定）、事件名零新增（复用 `abort-failed` 族既有词，证据分级走载荷字段）。

## 实施形状（H9 提案照批）
`AbortOutcome ∈ {ABORTED, REFUSED_NO_ACTIVE_TURN, UNKNOWN}` 为**内部事实枚举**（命名轮 `refused_<单数>` 骨架同族）；X18④ 修复＝控制腿 fetch 非 2xx/抛错时**当场记有痕 `UNKNOWN`**（此前无痕＝1e 前科族），三值各自可观测、不冒充（"已发出≠已停"的镜像："停失败≠没在跑"与"未知"不互并）。

## 验收（H 交 CHECKPOINT 必附，C 亲跑）
1. node 门 **79/79 只增不减**；
2. 红-绿双向：pristine 驱动上"abort 抛错无痕"红→新形绿（沿用 1e 整树前缀反证法，勿用会假红的浅拷贝）；
3. 三值归因钉：REFUSED（对端明拒）与 UNKNOWN（断/超时）**不同线**、ABORTED 仅确认停后落；
4. 根权威门 C 跑：对届时基线 FAILED-ID 逐字节 0 新增（同形树对比）；
5. M-1 自证：公开出口/`tail.outcome`/事件名零变化 diff 为空的声明＋抽查。
免 Sol。停写声明随件。CHECKPOINT 到→C 验→单独小批合批（与 a-3/P B② 文件零交集，随到随排）。
