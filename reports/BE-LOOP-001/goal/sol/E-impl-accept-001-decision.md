# Sol#2 E impl-accept 决定 — **REJECT**（两处并发 blocks:impl，C 独立确认）→ 撤回候选、返 E

- 请求：`--group E --milestone E-impl-accept --request-id c71fcc4f-62bd-4d5a-9337-8d17326e584f`，`consume` GRANTED → used **3/10**（path=flexible；**具名 E-impl-accept 预留仍未耗**、`record ok`）。模型真实 `gpt-5.6-sol`（`codex exec -s read-only`），raw `sol/E-impl-accept-001.raw`。
- 候选审阅对象 `ee39270`（INC1a cherry-pick）。**本决定 = 不批准 INC1a**；候选已 `reset --hard` 回 `4917f56`（C 自己的单条集成 commit，未及他人工作）。

## C 独立确认（不盲信 Sol，读 `ee39270` 源码逐条复核，两条均属实）
1. **blocks:impl — `submit` 非并发安全（TOCTOU）**：`sidecar_backend.py` `submit` 的检查 `self._neutral_runs.get(execution_key)`（≈:819，`with self._lock`）与登记 `self._neutral_runs[execution_key] = run`（≈:848，**另一** `with self._lock`）之间有 **锁间隙**，其间 `context=` 构造、`self.port_factory(...)` 建 port、`run=_NeutralRun(dispatch_id=uuid4())`。并发同 key → 各自建 port、各自 `open_execution` 派发、各得不同 dispatch_id（Sol 4-调用者 barrier 实测 4 port/4 派发/4 dispatch_id）→ 违背「replay 返回原回执、绝不重派发」。**确认。**
2. **blocks:impl — 并发 `cancel_execution` replay 可重派发**：`port.cancel(...)` 在**第一个**锁段内派发并算出 `outcome`，随后**出锁**，再于**第二个** `with self._lock` 才写 `self._cancel_receipts[execution_key] = outcome`（≈:769）。等待方在间隙拿锁→见无前回执→再次 `port.cancel` → 一 key 两 abort 派发（Sol 实测 2）。**既有并发钉可能假绿**（未强制该 post-unlock 窗口）。**确认。**
- Sol 同时肯定：`submit` 无 objective/无 Core、`correlation` 不透明拷贝、`observe` 纯读、runtime 字面量计数未变、bool 壳 unknown→False 不泄异常、恰 4 声明文件——与我核验一致。**读-only 环境无临时目录，Sol 未跑 pytest，但两阻断为不写盘的确定性复现**（功能性单跑无法触发，正合我此前单线程核验漏检）。

## 返 E（INC1a 修复轮，不新批路径、仍限批准 4 文件；Sol#2 预留仍可用）
1. **submit 原子化**：把「查存在→建 port→登记」并入**单一临界区**（或先原子占位 key 再建 port），使并发同 key 仅**首个**建 port/派发、其余必得 `replayed=True` 原回执。禁止 port 创建落在检查与登记之间的无锁窗口。
2. **cancel 回执与派发同锁/先登记后放锁**：在持有查找/声明该 run 的同一临界区内写回执（或先登记 `in-flight cancel` 占位），杜绝「派发完到写回执之间」被并发第二次派发；即 **receipt-before-release**。
3. **并发钉须真能证伪**：加**强制交错**的钉（如带屏障/手工调度解锁窗口的桩），使修复前红、修复后绿——现有假绿钉不可作数。
4. 交 CHECKPOINT：真跑 E 套 + S 公开形状锁 + **并发钉** +（C 侧）候选集成前查 dirty。**C 复核后重花 Sol（用 remaining 具名 E-impl-accept 预留或 flexible，视申请）**。

## 下游时序
- **S-block1 保持挂起**：触发器（INC1a 经 Sol 通过 + 集成）未达成，S 不切换；候选回 `4917f56` → S 此前对 `ee39270` 的 `:1184` 重锚暂作废，待 E 修复版重新集成后按新候选再核。
- H/P 增量与本轮无关，各自继续 CHECKPOINT。
