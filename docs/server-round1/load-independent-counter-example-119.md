# 119 — `080` 的反例门不再把"绿不绿"交给机器忙闲（`QA-011`，墙钟判据 → 事件序判据）

**终态**：`LOAD_INDEPENDENT_COUNTER_EXAMPLE_DONE`（计数见 §5）
**写面**（本单声明）：`tests/**` · `docs/server-round1/**` · `docs/implementation/status.md`
**真实模型调用 0 / ¥0**（用的是仓库内的假 peer ＋ bwrap 房间；`FAKE_TOKEN` 是字面假值，未访问任何凭据内容）。

---

## 1 前提复核（一手，含一处对工单表述的更正）

| 工单/`QA-011` 的说法 | 本树一手 |
| --- | --- |
| 反例门在 `tests/server/test_first_run_lock.py:180` | **成立**（`test_without_the_gate_the_same_first_runs_overlap`，改前 def 在 180 行；docstring 自述 "the same shape overlaps when the gate is not there"） |
| 判据是墙钟区间相交 | **成立**：`_overlap(spans)` 只吃 peer 写进 `windows.txt` 的 `min/max(stamp)`，`start_a < end_b and start_b < end_a` |
| 该守卫是唯一的串行化点 | **不成立（更精确的说法）**：守卫在 `sidecar_backend.py:301` 是**唯一** `acquire` 调用点，但"整场并发"还受别的调度影响——**反例真正要说的是"拆掉守卫以后，产品允许两个首跑同时待在创建窗口里"** |

**改前基线**（本树，`tests/server/test_first_run_lock.py -q -k first_runs`）：正例 2.03 s、反例 **~110–130 s**（墙钟等两条窗口相交）——
`QA-011` 记的"整文件 114 s / 132 s、加 8 个 busy loop ⇒ 1 failed / 4 passed"就是这一条。

## 2 换判据：从"抓到了重叠"改成"把重叠做出来，读事件序"

新增 `_SeamSpy` / `_Section`（`tests/server/test_first_run_lock.py`）：包在**产品真正用的那个缝**上
（`backend_module.first_run_gate`），记录 `events`（`in`/`out` 的程序序，锁保护）与 `peak`（同时在窗口内的最大数）。

- **反例腿（`hold_first_open`）**：守卫被拆掉时，**第一个窗口不许离开，直到第二个进来** ⇒ 重叠是**造出来的**，不是**等来的**
  ⇒ `events == ["in","in","out","out"]`、`peak == 2` 恒定成立，与机器忙闲无关。
- **正例腿（真实守卫）**：不施加任何力 ⇒ `consults == 2`、`peak == 1`、`events == ["in","out","in","out"]`。
  这条同时补上了 118 那一族"声明了但没人用"的洞：**若产品哪天不再问守卫，`consults` 掉到 0**，
  墙钟判据永远不会发现（没守卫照样可能"看起来没重叠"），这条会立刻红。
- **等待只当活性上界，不当判据**：两处 `Event.wait(timeout=60)` 都在**超时即响亮失败**（消息写明"这不是负载问题，先查产品"），
  判定本身只看 `events`/`peak`。G3 的门另有一条源码扫描（新代码里不许出现 `time.sleep`）。

**踩到的一条一手教训（写下来防重犯）**：第一版把"等同伴"放在 `acquire()` 里 ⇒ **自己在派发线程上锁死自己**
（A 卡在 acquire，而 A 的完成与 B 的派发在同一线程 ⇒ 60 s 超时，报 `DispatchAmbiguous`）。
挪到 `leave()`（跑在该 run 的完成线程上）后 1.22 s 绿。**缝上施力必须施在"不会挡住被观察者前进"的那一侧。**

## 3 假红的历史：可复算，但不靠烧 CPU

- 命令（写在门 docstring 里，`QA-011` 的原始形状）：
  ```bash
  for i in 1 2 3 4 5 6 7 8; do (timeout 240 python3 -c 'while True: pass' &) ; done
  python3 -m pytest tests/server/test_first_run_lock.py -q     # QA-011：1 failed / 4 passed
  ```
  **本树本轮没有跑这条**：Auto 模式的执行者不得在宿主上批量起 CPU 燃烧进程（分类器当场拦下）。
  替代做法是把那件事**变成不依赖负载的演示**——`test_the_old_judge_was_a_function_of_timing_not_of_the_product`：
  同一个"守卫缺席"的结果，两份时钟形状（`0-5 / 10-15` 与 `0-12 / 10-15`）⇒ `_overlap` 一次真一次假；
  而事件序判据连做三轮都是 `in,in,out,out`。**判据翻不翻，从此与产品有关、与时钟无关。**
- **真负载下的复核（不模拟，用真实现场）**：在整棵 `tests/server`（800＋条）后台跑的同时，连跑本文件两遍
  ⇒ **7 passed / 38.35 s** 与 **7 passed / 36.86 s**（日志 `118-artifact-presence/119-under-load.txt`）。
  改前那条反例在同样的负载下是 `QA-011` 量的 1 failed。

## 4 门与反例

| Gate | 覆盖 | 反例 |
| --- | --- | --- |
| G1 不假红 | `test_without_the_gate_the_same_first_runs_overlap`（重写，1.22 s）· `test_the_guard_keeps_one_first_run_inside_the_window_at_a_time`（1.78 s）· 负载下两遍 7 passed · 空闲下 3×`4 passed / 8.2–9.1 s` | **退回墙钟判据必须红**：`test_the_old_judge_...` 直接对 `_overlap` 断言"两份时钟形状给两个答案"——它红的时刻就是有人把判据换回时钟的时刻 |
| G2 仍可咬 | 守卫在场 `peak==1 / consults==2`；拆掉守卫 `peak==2 / events=in,in,out,out`；**产品若不再问守卫 ⇒ `consults==0` 立刻红** | 若把 `hold_first_open` 去掉（反例变弱：不再制造重叠），`peak==2` 就不再恒成立 ⇒ 该门随时序回归而红（本轮一手：把力施错位置时它就是红的） |
| G3 无新 sleep | `test_the_new_judges_never_reach_for_the_clock`：扫本文件自己的文本——`_Section`/`_SeamSpy` 里不许出现 `time.sleep`；两条新判据里既不许有 `time.sleep` 也不许有 `_overlap(`，并且必须真的读 `spy.peak`/`spy.events` | 把判据换回时钟、或加一次 sleep ⇒ 门红。本轮一手代价写在 §2：第一版把力施在 `acquire` 里，等于让被观察者挡住自己 ⇒ 那 60 s 的超时就是「把等当判」的现场 |
| G4 不回归 | 该文件其余用例（含正例 G1 与 layer-3 的真 harness 七次冷跑）**一字未改**并全绿（7 passed）；`_overlap` 与 `_two_profile_first_runs` 保留原形 | 任一变红即门红 |

## 5 计数与终态

```
整文件：pytest tests/server/test_first_run_lock.py -q → **8 passed / 36.33s**
  （同一条命令空闲连跑一致；整棵 `tests/server` 后台并发时连跑 **2× 7 passed / 38.35s、36.86s**——
    那两遍跑在 G3 扫描门落地之前，所以是 7 条）
子集：pytest -k "first_runs or window or timing or clock" → **5 passed / 5.14s**；重写后 3× **4 passed / 8.2-9.1s**
批末：见 status.md 本单终态行（118 的自报行现在会自动带出 VERDICT=）
```

DoD 五项：1 一手复现两种负载（§1 改前耗时 ＋ §3 负载现场）· 2 判据与负载无关（§2）·
3 反例仍能咬（§4 G2，且比改前多咬住"不再问守卫"这一形）· 4 假红历史可复算（§3：命令在场，
且换成了不依赖 CPU 燃烧的确定性演示——**这一条按"该形态已不可能靠本树复算"如实写明**）· 5 账与证据。

**终态 `LOAD_INDEPENDENT_COUNTER_EXAMPLE_DONE`**。
交回一条（不属本单写面）：`086` 的真父轮门与 `080` 正例的 `wait_turn`/120 s 上限同族（都吃墙钟），
§待开单里已登记；119 的方法（把"等它发生"换成"让它发生，读事件序"）可以照搬过去，但那是别的门的写面。
