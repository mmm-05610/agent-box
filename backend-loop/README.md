# control/backend-loop/ — BE-LOOP-001 中央协调（C）本轮产物

方案源：`../product/backend-coordinated-loop.md`（D-0028）。执行者模型 = **Qoder `Qwen3.8-Flash`**（四组各独立进程）；
**Sol = `gpt-5.6-sol`，仅作限额 reviewer**，唯一入口在 C 沙箱外。本轮 = **启动准备**，未启动真实四组、未消耗 Sol、未改产品代码。
运行记录写 `../reports/BE-LOOP-001/`；公共控制记录由 C 管，各组只写自己 outbox/report。

## 目录
| 路径 | 内容 |
| --- | --- |
| `tasks/{INDEX,S,E,H,P}.md` | 四组静态任务卡（输入 SHA、必读、研究问题、职责、不负责、写入清单、接口依赖、反例、审批条件、首次实施获批、输出/状态格式） |
| `permissions/allowlist.md` | 逐路径写入白名单（研究/实施两阶段；公共区 C 专管） |
| `permissions/impl-allow.map` | 机器可读实施白名单（`impl-binds.sh` 校验源） |
| `permissions/research-vs-implementation.md` | 阶段闸门；`APPROVED` 为 C-only、执行者不可改 |
| `isolation/isolation.md` | bwrap 隔离机制、读/写隔离实测、**网络 G1 / 认证 G2 缺口** |
| `isolation/g1-g2-access-proposal.md` | 单组最小联网+认证**方案**（交 I；未实现、未特权、未起真组） |
| `isolation/impl-binds.sh` | 从 APPROVED 记录生成、按 allowlist 校验的实施挂载（缺陷2 闸门） |
| `isolation/sandbox-lib.sh` `run-group.sh` | 逐组独立 bwrap + 独立进程；默认 FAKE，REAL 关闭 |
| `controller/be-loop.sh` | 薄控制器：start/stop/status/resume/collect/approve/checkpoint/sol-review |
| `controller/budget.py` `ledger/budget.json` | 独立十次 Sol 账本 + 唯一闸门（E 两 earmark / H≤3 / 原子预扣 / 去重 / 重启不重置 / 损坏拒绝） |
| `contracts/{catalog,message-format}.md` | 初始契约目录 + 版本化消息格式（幂等/去重） |
| `baseline.md` | 共同基线核对（dev-0 `b067c571` clean；Pi `e2ec0ef2` 单文件差量，单列不并入） |
| `commands.md` | 经核实的启动/status/stop/resume/预算/自测命令 |
| `tests/{fake-executor,fake-reviewer,run-selftests}.sh` | 无模型验收：隔离 + 预算 + 控制，36 项 |

## 停止点
产物齐备且自测通过 → `../reports/BE-LOOP-001/bootstrap/readiness.md` 标 **READY_FOR_I_REVIEW**。
**I 验收后**才据缺口 G1/G2 决定网络/认证方案，再正式启动四组；本轮不自动转入正式运行。

## 未采用
`oh-my-qoder` 作引擎（其 team 默认 `git add -A` 自动提交、worker→leader `merge`、`--dangerously-skip-permissions`/`yolo`、
autopilot 无人续跑，违反硬边界）；原生子代理代替四组进程（约束 1）。理由见 `../reports/BE-LOOP-001/bootstrap/reuse-conclusion.md`。
