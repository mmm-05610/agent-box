# Executor prompt

The canonical brief for a construction run. **Point the executor at this file, or
copy it verbatim — do not retype it from memory.** If you catch yourself restating
the batch list or the target ledger number in a message, stop: master plan §0
explains why that is the one thing that must not be frozen into a prompt.

It is a file rather than a message for exactly that reason. A prompt pasted into a
chat is a snapshot; this one is versioned with the plan it points at, and can be
re-read when the plan changes. The first version of it was a message, and it froze
"01–07, 27 edges, 85 → 58" — which was wrong within the hour.

**This file is the only prompt. There is nothing else to hand over.** A run that is
already going cannot be re-prompted, so if one was started before a plan change, it
needs one *message* — not a second prompt:

> 总方针变了。重新读 `renderer-layer-master-plan.md` §0/§3/§4 和
> `renderer-layer-status.md`，重跑 `batch-collisions.mjs` 算你现在的工作列表和目标数字
> （目标 = 当前账本 − 你要做的那些项的边数之和）。已经完成的项不用重做。

That message exists because the run predates the fix, not because the system needs
two briefs. Once a run is started from this file it re-reads the plan per item and
needs no correction — the correction is a one-off, and the fact that one was needed
is a symptom of the frozen prompt, not a step in the process.

---

```
/goal 按 docs/architecture/renderer-layer-master-plan.md 施工，清掉 Desktop 渲染器的分层债务。

**工作范围不是这份提示词里的一份清单。** 开工时、以及每完成一项之后，都重新读：
  - docs/architecture/renderer-layer-master-plan.md
      §0 谁说了算 · §3 阶段与顺序 · §4 并行 · §5 验收 · §6 静默失败清单 · §7 不派的活
  - docs/architecture/renderer-layer-status.md
      工作列表 = 这份文件里状态不是 merged 的行（**所有批次**，没有阶段权限之分）
  - docs/architecture/renderer-layer-batches/
      每一项的自包含派工单

目标数字也不要背。跑：
  cd apps/desktop/src && node ../../../.agents/skills/architecture-tree-report/scripts/batch-collisions.mjs \
    ../../../docs/architecture/renderer-layer-batches/batch-manifest.json

它会打印每一项声称的边数、当前账本、以及全部做完后的账本，并在总方针的数字与它算出来的
不一致时以退出码 1 报错。你的目标 = 当前账本 − 你要做的那些项的边数之和。

要求：
1. **做完 batches 目录里的所有派工单，不要停在某一阶段。**
   §3 的 Phase 只是**顺序约束**，不是权限：05 不能和 Phase 1 的项交错，是因为它们文件重叠。
   做完 Phase 1 就交差，等于只做了三分之一。
   §7 现在是空的：**账本里每一条边都有派工单**，目标 0。
   总方针是**会被更新的**：如果它在你跑的过程中变了，以新版本为准，并重新算目标数字。
   如果变化让你不确定某件事还做不做，停下来报告，不要自行扩大或缩小范围。
2. 并行按 §4：同样跑上面那个脚本拿碰撞分组；并发上限 3；并行必须各自独立工作树
   （不能共用——会互相踩账本，并让他人的测试运行读到半成品而假失败）。
   账本是生成物：工人不手改它，集成时在合并后的树上重算一次，那份为准。
3. 每一项结束跑：typecheck → test:ui → 层序守卫 → npm run ledger:layers → 再跑一次 test:ui。
   账本必须正好少掉该派工单声称的条数；多一条少一条都要停下来报。
4. 每一批合并后开一个独立子代理做 review + 测试（§5）：它要自己跑命令、自己核账本数字、
   逐条过 §6 的静默失败清单、确认测试数没掉。它说通过才算完。
5. 每完成一项立刻更新 docs/architecture/renderer-layer-status.md（§8）：commit + reviewer 的
   实测数字。没有 commit 和数字的行不算完成。
6. 禁止：改宽账本、削弱或删除测试、顺手重构、改行为。
   总方针和派工单是权威的；发现覆盖不到的东西，报告，不要即兴发明做法。

完成标准：batches 目录里**所有**派工单都 merged 且 review 通过，账本等于上面脚本算出的目标。
若做到那一步账本仍不为零，剩下的就是 §7 里还没有决策的结——报告还剩什么然后停下，
这是唯一正当的停止点；不要为了凑到零而自己发明某个结的解法。
```
