# BE-LOOP-001 启动准备报告（本轮交付）

状态：**READY_FOR_I_REVIEW**。本轮按任务修正：**未从零开发通用循环/调度器**，改为复用 Qoder 原生 + bwrap + 极薄控制器；
**未启动真实四组、未消耗 Sol、未改产品代码、未装/启用插件、未动既有服务**；只读核实 + 隔离临时环境验证。

## 交付物
| 要求 | 位置 |
| --- | --- |
| 四组任务卡 | `control/backend-loop/tasks/{INDEX,S,E,H,P}.md` |
| 精确路径权限清单 + 隔离实现 | `control/backend-loop/permissions/{allowlist,research-vs-implementation}.md`、`isolation/{isolation.md,sandbox-lib.sh,run-group.sh}` |
| 控制器 + 测试证据 | `control/backend-loop/controller/{be-loop.sh,budget.py,ledger/budget.json}`、`tests/*`、`selftest/*` |
| 初始契约目录 + 独立预算账本 | `control/backend-loop/contracts/{catalog,message-format}.md`、`controller/ledger/budget.json` |
| 基线核对报告 | `control/backend-loop/baseline.md` |
| 经核实的启动/status/stop/resume 命令 | `control/backend-loop/commands.md` |
| 一页 readiness | 本目录 `readiness.md` |
| 复用结论（上一轮，方向已获 I 通过） | 本目录 `reuse-conclusion.md`、`evidence.md` |
| 原生调度未实测清单 | 本目录 `native-untested/native-scheduling-untested.md` |

## 要求检查 ↔ 实测映射（49 项全 PASS，见 `selftest/checks.md`）
工作六 9 项 + 约束6 预算项，逐条落点：
1 本组可写/公共&他组不可写 → `ISO-write-*` / `ISO-ro-source|inbox|controller` / `ISO-abs-othergrp`。
2 不可改预算/控制器/共享 Git 元数据 → `ISO-ro-budget`、`ISO-ro-controller`；Git 元数据经 `/source` 只读 + 宿主 gitdir 不存在两路封死。
3 重复消息不重复派工/消费 review → `CTL-dedup`。
4 并发不超 10、不侵 E 预留 → `BUD-concurrent-cap`(12→≤10)、`BUD-concurrent-E`。
5 H 第四次拒绝 → `BUD-H-cap4`。
6 调用失败仍计次、恢复计数不丢 → `BUD-fail-counts`、`BUD-restart-persist`。
7 无效输出不能晋升 APPROVED → `CTL-invalid-notpromoted`、`CTL-invalid-state`。
8 stop/resume 保全状态、只停本轮子进程 → `CTL-stop-own-only`（unrelated pid 存活）+ resume 演示。
9 无批准任务不调模型空转 → `CTL-no-tick-spin`（空闲零调用）、`CTL-sol-only-via-entry`（唯一入口）。
约束6 追加：总数10 `BUD-total`；E 两 earmark 独立不并 `BUD-E-reserve-not-flex`；预留保护
`BUD-flex-drained-used8`+`BUD-Eslots-held`+`BUD-9th-flex-denied`+`BUD-E-still-works`；损坏拒绝 `BUD-corrupt-refuse`；
错模型不替换 `BUD-wrong-model`；实施阶段只开 approved 路径 `IMP-open-allowed`+`IMP-ro-sibling`。

## 隔离/绕过探测（约束 3）
写隔离、读隔离、symlink 绕行、沙箱内再启 bwrap、codex 不在沙箱、`--unshare-net` 下宿主回环服务不可达 —— 均实测（`selftest/isolation-research.log`）。

## 明确缺口（不绕过，交 I）
- **G1 网络出口**：真四组需出站取模型，但 `--unshare-net` 无出口；"取模型又不暴露宿主/他组/凭据/宿主执行通道"需 netns+veth+iptables(特权) 或宿主 egress 代理 —— 本轮未构造。
- **G2 认证最小暴露**：真 `qodercli` 需读 Qwen 凭据而不让进程读取/复制原始 token、不给 Sol 凭据 —— 需短期作用域 token 或 C 侧代持注入，本机无此通道。
- Sol 真实调用成功**未证**（仅 `codex debug models` 列出 `gpt-5.6-sol` 这个 slug；本轮不探测、不消耗）。

## 修订：I 复审四缺陷（已修 + 端到端实测）+ G1/G2 方案
- 缺陷1 重复 request-id 不再二次调用 reviewer：`consume` 三态退出（新/已有=10/拒绝），`sol-review` 遇 10 直接不调；用**假 reviewer 调用计数**端到端证 `CTL-dup-nocall`（calls=1）。
- 缺陷2 实施挂载只从 **APPROVED 记录**经 `impl-binds.sh`+`impl-allow.map` 生成校验，`sandbox_build` 复核 host/target 对应；`D2-*` 覆盖 deny/绝对/遍历/跨组/错配。
- 缺陷3 reviewer 输出精确核对候选 sha/task/milestone/version；非零退出、错版本、错里程碑、无效 JSON 均不批准（`D3-*`），仅全匹配 ACCEPT 才 APPROVED。
- 缺陷4 start/stop/resume/approve/collect/checkpoint/sol 全部入**控制器单实例锁**；resume 不再降级状态；stop 按 pid+start-time+cmdline **核验身份**，PID 复用/外来 pid 不杀（`D4-*`）。
- 未扩控制器：仅上述四点的定向修复，命令集与职责不变。
- G1/G2 见 `../../backend-loop/isolation/g1-g2-access-proposal.md`：**未做特权网络改动、未装组件、未建大代理、未起真组**；诚实声明"只读挂载 ≠ 秘密不可读"。
- 验证三态：假执行者已验证 / 真实 Qoder 尚未验证 / 原生长期调度尚未验证。**49/49 ≠ 整条启动链通过**。
