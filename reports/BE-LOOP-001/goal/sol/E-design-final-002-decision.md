# Sol#2 决定 — E design-final v1.2：概念接受，**INC1a 范围须收紧后再批**（真 gpt-5.6-sol）

- request E-DESIGN-FINAL-002 · model gpt-5.6-sol · read-only · 退 0 · used 2/10（机动，E impl-accept #2 仍预留）· raw `E-design-final-002.raw`
- reviewer 判定：**reject-as-scoped**。明言「概念所有权与迁移规则大幅改进，保留 bool cancel、延后 resolve_all 可接受」；**但 INC1a 按现范围不可实施**，3 条 impl 门：

## INC1a 必改（C 采为批准前置，逐条）
1. **补 `execution/sidecar.py` 进 INC1a 范围**：现清单漏它 → E 的 `agentbox-sidecar/runtime/**` 与 `subagent-bridge.mjs` 路径假设并未真正删除（#2 未闭）。a 路径须含删这些字面量、改传不透明 `bundle_ref`。
2. **修 a-3 的 Core 记录权威**：a-3 仍让 E 造 Core 记录、且引用 `ExecutionRequest` 里没有的 `objective` → 违反「S 拥有 Session-Turn 记录铸造」，逼 E 伪造/推断产品状态。改法：`ExecutionRequest` **补中性 `objective`（由调用方 S 适配层给）**，且 **INC1a 内 E 不写业务 Core 记录**——中立 `submit` 只落执行域事实（dispatch/attempt），Session-Turn 的 Core 记录/仓储留 **INC1b（S 适配器）**。
3. **补 `observe_execution` 的实现/对账契约**：INC1a 声称覆盖 R4/R5 迁移，但 observe 无规定实现与「带证据对账」语义。要么在 INC1a 里给出最小可验对账（观测→态迁移仅由类型化事实/证明触发），要么把相关矩阵行**移出 INC1a 验收**、显式记为后续，不得空头声明。

## 正确延后（非 INC1a 阻断，登记在契约/路线）
- #1 provider 补偿 + coordinator「先登记后变更」→ 门于 **P-T2 集成 + C 发布 Protocol/coordinator**（IFR-05/P-7）。
- #3 S 适配器 / 删 resolve_all / 删兼容壳 → **INC1b/INC1c**；S 公开形状锁测作永久回归（正确）。
- #4 Protocol release/terminate 动词 + `terminate@1` → **INC2 前置**（C 先发布动词）。
- #6 inventory 现仍读 Session/Turn 表 → 需具体后续路径 + 验收测试改为「投影 Work Core 事实」。

## C 处置 / 预算
- 请 E **只收紧 INC1a 逐路径范围**（上述 3 条）重交；**不再花第三次 Sol 核设计**——概念已 accept，3 条是范围明确性修正，C 亲审即可批 INC1a；其正确性由 INC1a 实现 CHECKPOINT（真跑 xfail 转绿 + S 锁测仍绿）+ 后续 **impl-accept Sol#2（E 预留）**兜底。
- E-INC1 其余部分（INC1b/1c/2）继续按门延后；不写未批路径。
- E design-final **视为通过（概念层）**，唯 INC1a scope 待修。C 将据此发布 C-EXEC 相关动词包时把 #6 inventory 与 #4 动词一并纳入。
