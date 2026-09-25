# 研究阶段 / 实施阶段 的写入闸门（约束 2）

一句话：**研究阶段产品源码全部只读，仅研究输出可写；只有 C 批准了某组的具体任务，
才为该组开放该任务列出的实现路径；`APPROVED` 文件执行者不能自行修改。**

## 两阶段的沙箱差异
| | 研究阶段 RESEARCH | 实施阶段 IMPLEMENT |
| --- | --- | --- |
| `/source` | `--ro-bind` 全量只读 | 仍 `--ro-bind` 只读为底 |
| 实现路径 | **无任何**产品路径可写 | 仅该任务 `APPROVED` 里逐条列出的路径以 `--bind` 覆盖为可写（over-mount）|
| 组私有可写 | outbox/reports/tests/work/home/tmp | 同左 |
| 产物 | 规范/研究地图/方案差量/反例 → `/reports` | 代码改动 → 经 C 核验后生成检查点 |

实测证明（`selftest/checks.md`）：
- `IMP-open-allowed`：`impl` 阶段仅 `/source/a` 被列入 approved bind → `A-writable`。
- `IMP-ro-sibling`：兄弟目录 `/source/b` 未列 → 仍 `B-denied`。
- `ISO-ro-source`：`research` 阶段写 `/source` → `denied`。

## APPROVED 文件是谁写的、谁能改
- 生成者：仅 C。位置 `control/backend-loop/controller/state/approvals/<group>.<task>.APPROVED`，内容含任务号与逐条 `writable=`（**source 相对路径**）。
- 由 `be-loop.sh approve` 写入前**逐条按 `impl-allow.map` 校验**（拒绝越权/公开/遍历/绝对宿主路径），C 在沙箱外执行。
- 实施沙箱的 `--bind` **不是**自由传入：由 `isolation/impl-binds.sh` 从该 APPROVED 记录生成、`sandbox_build` 再核 host∈source 且 target=`/source/<同rel>`（缺陷2 闭合）。
- 在沙箱里，`controller/` 是 `--ro-bind /control-loop` 的子树，故执行者**能读不能写**（`ISO-ro-controller`、`ISO-ro-budget` 实测 `denied`）。
- `APPROVED` 不是执行者自证通过的凭据：它只在该任务通过 `sol-review`/中央审阅后由 C 落；执行者把方案交 outbox，C 处理，执行者改不动状态机。

## 阶段与状态机对应（`backend-coordinated-loop.md` §持续循环）
```
IDLE → RESEARCH → DESIGN_READY → CENTRAL_REVIEW → (可选 SOL_REVIEW)
     → APPROVED → IMPLEMENTING → CHECKPOINT_READY → INTEGRATION_VERIFY → DONE
```
- RESEARCH/DESIGN_READY：源码只读（研究阶段沙箱）。
- APPROVED 之后，C 才以 `impl` 阶段 + 该任务 `APPROVED` 路径重启该组进程 → IMPLEMENTING。
- 被驳回：回到 DESIGN_READY 或 RESEARCH（`be-loop.sh sol-review` REJECT/INVALID 均落回 CENTRAL_REVIEW，实测 `CTL-invalid-state`）。
- 无已批准任务：组停在 IDLE，控制器不会为该组开任何写路径、不派活、不调模型（实测 `CTL-no-tick-spin` 空闲零调用）。
