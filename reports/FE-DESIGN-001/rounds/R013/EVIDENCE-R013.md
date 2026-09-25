# R013 未决反例的执行证据（证据，不是判定）

范围：本轮新立 `FE-CE-028`…`FE-CE-037`（含 `FE-CE-007` 不在此列，挂已淘汰 B，不许动）。
模型：`_pt/model/core.py`（一个模型跑全部）+ `run.py` + `scenarios.py`。
证据文件：`_pt/model/run.repro.txt`（本会话 2026-09-22 复跑，期望 20/20 全中，exit 0）。

**这些只是"模型按候选自己的规则执行后的表现"。反例是否 `holds` 只能由独立上下文的
verifier 判定；场景是否 `trajectory_ok` 只能由 candidate-reviewer 判定。本文件不产生任何判定。**

## 1. 逐条证据

| CE | 主题 | 模型证据（可复跑） | 证据强度 |
| --- | --- | --- | --- |
| 028 | S08 step 7 断言了无机制的投递 | `S08 as-written` **FAIL**：`sD received 0 envelope(s) on data-1 but the scenario requires 1`；`S08 R013-repaired` **PASS** | 强（执行复现 + 修法跑通） |
| 029 | 观测到丢失即 teardown，与同 ns 追赶分支互斥 | `S09 as-written` **FAIL**：`NamespaceGone(namespace ns_1 was torn down)`；`S09 R013-repaired` **PASS** | 强 |
| 030 | 步进表缺 register / 铸 scope 前置行 | `S01 as-written` **FAIL**：`invoke returned ('CapabilityAbsent','send')`；`MC_reg_missing` **PASS**（机制确认） | 半强：**register 半边已执行复现**；**六表裸 `h`/`s` 未铸 scope 的半边是文本发现，模型未覆盖** |
| 031 | invoke-spawned 资源何时 announce 未声明 | `MC_spawn_announce_missing` **FAIL**（本会话新增）：无 announce 行 ⇒ `subscribe` 得 `ExplicitAbsent`、投递 0。另注：模型里 S04 **自带 announce 行**，即模型替候选假设了候选未声明的一步 | 强（删除即失败） |
| 032 | `ExplicitAbsent` / `CapMap="unknown"` 无渲染规则 | `S11` **GAP**：`CapMap value 'unknown' has no declared rendering` | 半强：CapMap 半边已复现；`open_scope`/`directory_lookup` 的 `ExplicitAbsent` 渲染半边**未建模**，仍属文本 |
| 033 | 声明式 schema 记号未定义 | 无模型：模型自选了 Python dict/list 记号 —— 正好说明两个符合实现可以各自选记法 | 弱（纯文本） |
| 034 | 认领按挂载顺序、卸载静默换渲染器 | 无模型：`core.py` 无 view-mount 概念 | 弱（纯文本） |
| 035 | `payload_schema_id` 认领未命名空间化 | 无模型 | 弱（纯文本） |
| 036 | 分类成本只给扩展侧定价 | 编辑性，无模型 | 弱（纯文本） |
| 037 | `retire` 对在线订阅者不可见；`retire` 后 `invoke` 未定义 | `S04` **GAP** + `MC_capacity_gap` **GAP**：`retire(): a live subscriber of the retired resource has no declared termination signal (Subscription only has onNext/close)`；`core.py::invoke` 对未 announce 的 local_id 抛 `Unspecified("…the artifact defines ExplicitAbsent for subscribe/cursor_resolve only")` | 强（两条路径都执行到静默处） |

## 2. 修订前的闭合面（`run.py repaired` 模式，负向对照恒 FAIL 是设计）

```
3 verdict(s) differ from expectation:
  GAP S04                expected PASS UNEXPECTED   ← FE-CE-037 的订阅者终止信号
  GAP S11                expected PASS UNEXPECTED   ← FE-CE-032 的 unknown 渲染
  GAP MC_capacity_gap    expected PASS UNEXPECTED   ← FE-CE-037 的容量杆静默路径
```

其余 17 项符合期望：`S01/S08/S09` 的**修复变体已 PASS**（说明修法在模型里成立），
四条负向对照（`S01 as-written`、`S08 as-written`、`S09 as-written`、`MC_events_before_sub`、
以及新增的 `MC_spawn_announce_missing`）恒 **FAIL**——它们靠删掉修订要加的那一行来构造，
若"通过"就说明对照已失效。

⇒ **修订（integrate 阶段）的验收面已经确定**：S04/S11/MC_capacity_gap 三项转 PASS，
负向对照继续 FAIL，且**必须写进候选文本、过独立核验**才算数——模型通过只证明模型。

## 3. 本轮对共享模型的两处维护（同一个模型，不为单场景补专用规则）

1. **`EXPECTED["repaired"]` 校准缺陷已修**：原表为空 ⇒ `want.get(k,"PASS")` 把四条负向对照也
   期望成 PASS，`repaired` 永远不可能全中。现显式声明为 `FAIL`。
2. **新增 `MC_spawn_announce_missing`**（FE-CE-031）：候选从未声明 invoke-spawned 资源何时
   announce，删除该行 ⇒ head 规则无从生效。

两处都是**模型自身**的校准与覆盖，不改任何场景的判定规则。
