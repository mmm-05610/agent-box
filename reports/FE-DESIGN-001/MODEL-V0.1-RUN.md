# v0.1 最小可执行模型 —— 可复现命令与真实结果

模型本体：`_pt/model/{core.py, scenarios.py, run.py}`（**复用现有共享实验，未另起炉灶**）
对应模型的规范文本：`candidates/best.md` @ `b4f5c5cc46c4`

## 1. 一条命令复现

```bash
cd /home/maoqh/projects/ordessa/control/reports/FE-DESIGN-001/_pt/model
python3 run.py repro       # 修订前文本的负向对照 + 修订后规则，期望表逐项比对
python3 run.py repaired    # 同一模型，期望 = 除负向对照外全部 PASS
```

**真实结果（2026-09-22T06:1xZ，本机执行）：**

```
repro     rc=0   5 FAIL, 0 GAP, 16 PASS   → all verdicts match expectation
repaired  rc=0   5 FAIL, 0 GAP, 16 PASS   → all verdicts match expectation
```

5 个 FAIL **全部是按设计必须 FAIL 的反向对照**（靠删掉修订新增的那一行来构造）：

```
S01 as-written (no register row)   未注册动作就调用
S08 as-written                     配对后未订阅就断言送达
S09 as-written                     观测到断连仍走同 ns 追赶
MC_events_before_sub               先出事件再取实时边
MC_spawn_announce_missing          invoke 生成的资源从未 announce
```

0 个 GAP = 模型已遇不到"规范沉默"的分支（修订后的候选声明了 `onEnd`、`unknown` 行、
`invoke→ExplicitAbsent`）。修订前那三个 GAP 的原始输出**逐字归档**在
`_pt/model/run.repro.pre-R013-integrate.txt`，未覆盖历史。

## 2. 六项必验点 —— 全部取自上面这次运行的真实输出行

| 验证点 | 真实输出行 | 说明 |
| --- | --- | --- |
| **注册资源/动作** | `PASS invoke returned Result as required` / `FAIL invoke returned ('CapabilityAbsent','send'), scenario/design requires Result` | 正向：注册后调用成功；**反向对照**：删掉注册行 → 结构性 `CapabilityAbsent`。注册是承重的 |
| **调用** | `PASS invoke returned Result as required`、`PASS invoke returned CapabilityAbsent as required` | 能力存在/缺失两条路径都有确定结果 |
| **事件订阅** | `PASS s received 2 envelope(s) on main (>= 2 required)`、`PASS sD received 1 envelope(s) on data-1`、`PASS s received 3 envelope(s) on job-7` | 含"先订阅后推送"与"补历史+实时"两种顺序 |
| **退出或断连** | `PASS the live subscriber learned its resource ended: onEnd(bound memory)`（retire）<br>`PASS ... onEnd(superseded)`（teardown）<br>`PASS ... onEnd(observed link loss)`（适配器观察到断连）<br>`PASS invoke returned ExplicitAbsent as required`（资源已退出后调用） | 三种终止路径都送达；退出后调用有定义结果，不是未定义 |
| **未知能力** | `PASS all 3 declared capability values render to an explicit row, including unknown -> [('resume', 'support for resume is unknown — the service has not declared it')]` | "服务没声明"被如实呈现，不被改写成"不支持"或"支持" |
| **扩展缺席** | `PASS no extension claims acme.plot.v1 -> fallback emits an explicit row (opaque: acme.plot.v1, no view installed); the pane is not blank` | 没有安装任何视图时，回退仍给出显式行，面板不空白 |

另有两条结构性事实由反向对照给出：
`PASS cursor_resolve(runner-1) -> ExplicitAbsent after teardown`、
`PASS open_scope -> ExplicitAbsent as required` —— 断连后既不假装存在，也不编造在线。

## 3. 候选缺陷 vs 实验工具缺陷（明确区分）

**A. 候选本身的缺陷**（改候选才能好，与实验工具无关）

| # | 反例/现象 | 证据 | 影响 |
| --- | --- | --- | --- |
| A1 | 独立评审判 **6/12 场景轨迹不成立**（S02/S03/S07/S08/S09/S11）、1 项证据不足（S10）：步进表引用了表里从未 announce/注册/开命名空间的对象 | `rounds/R013/review.md` 判定行 | **规范文本里的两条路径按表执行不通**；共享模型能跑，是因为 `scenarios.py` 补了缺失行——即"模型 ≠ 表" |
| A2 | 候选自带 10 个实验里 **2 个跑不过**：b03 把字段表当声明节点传（`KeyError: 'kind'`）；b06 把渲染标签 `current (fresh invoke at <ts>)` 当调用记号（断言失败） | `rounds/R013/SELFTEST-R013.md` | 候选宣称的证明不成立；b03 恰好落在 schema 记号（FE-CE-033）自己的证明上 |

**B. 实验工具的缺陷**（已修，与候选设计无关）

| # | 现象 | 处理 |
| --- | --- | --- |
| B1 | `EXPECTED["repaired"]` 原为空表 ⇒ `get(k,"PASS")` 把反向对照也期望成 PASS，`repaired` 永不可能全中 | 显式声明 5 条反向对照恒 FAIL |
| B2 | 模型缺少 invoke-spawned announce 的检查 | 新增 `MC_spawn_announce_missing`（删除即失败） |
| B3 | 我给 `MC_capacity_gap` 加 `expect_invoke` 时参数位写错（`IndexError`） | 修正为 `(skey, local_id, action, want)` —— 当次运行直接判 FAIL，未被误当设计结论 |
| B4 | 模型仍按**修订前**的沉默编码（retire 无终止信号、`unknown` 无渲染、retire 后 invoke 未定义） | 按 `b4f5c5cc` 的**声明**更新 `core.py`；修订前输出归档不覆盖 |

## 4. 这次运行证明了什么、没证明什么

**证明**：一个模型按候选自己声明的规则，把注册、调用、订阅、终止/断连、
未知能力、扩展缺席六条语义执行自洽；五条"删掉某行就失败"的反向对照如期失败。

**没证明**：
- 不证明**产品实现**通过——没有真实服务、协议、进程；
- 不证明**候选文本**通过——A1/A2 显示规范步进表与自带实验仍有缺陷；
- 不证明**收敛**——独立评审为 5/12，Sol 关键审阅未使用（预算 0/10 保留）。
