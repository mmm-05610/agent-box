---
id: 070
slug: real-endpoint-probes
batch: b1
baseline: "e39959f"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0011
terminal: ["REAL_ENDPOINT_PROBES_DONE", "REAL_ENDPOINT_PROBES_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 070 — 55 的 G2–G4：真实端点探测（授权已放开）

## Objective

55 的 G1（记录扩展 schema 8 + provenance 面）已落地；**G2–G4（有界探测、类型化错误、未知即未知）此前因为
"无授权凭据"停在未开始**。用户 2026-09-19 放开真实调用（**R-0011：允许 DeepSeek 官方端点，不设预算上限（用尽额度为止），
凭据只作 locator，逐笔记账**）。本单把 55 的探测面做完：用真实端点跑通一次**有界、可取消、可审计**的探测，
并证明**凭据零日志**、错误**类型化**、无来源的窗口/能力**留空**（不内置默认值）。

## Current state

- 55 现状（本树 status）：`G1 记录扩展完成；G2–G4 探测未开始`；证据 `docs/server-round1/fullstack/provider-model-55.md`（若存在）
- 授权：`rulings.md` R-0011（2026-09-19）；凭据 locator：`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`（0600）
- 55 的四个门原文（G2 有界/可取消/可审计 + 凭据零日志；G3 认证失败/不可达/超时/格式不符各有类型化码且探测结果不写配置；
  G4 窗口/能力无来源留空、不得内置默认值、有反例测试）——本单按此执行

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 探测实现（`src/agent_box/**`，随 55 的落点） | 补齐/接线有界探测与类型化错误面 | 55 的 G2/G3 |
| `tests/**` | 四类类型化错误各一条反例；"未知即未知"反例 | 55 的 G3/G4 |
| 真机一轮 | 真实端点一次（明示授权下） | 把"未开始"变成一手事实 |

- **凭据只作 locator**：绝不复制、不落盘、不进 argv/日志/事件/证据；报告只写路径与权限位
- 探测**有界**：超时、响应大小上限、白名单端点；**结果不写入任何配置**
- 不碰 wire 形状；若确需新方法，停下记阻塞交回调度者

## Requirements

### Requirement: 真实端点的一次有界探测

#### Scenario: 探测成功

**WHEN** 以授权 locator 触发一次探测（模型槽白名单内的一个模型）
**THEN** 记录：端点、耗时、响应大小、**是否可得窗口/能力**（可得则记值，不可得则留空）、以及**探测结果未写入任何配置**
的证据；报告不含凭据内容与宿主绝对路径

#### Scenario: 失败一律类型化

**WHEN** 分别制造认证失败、端点不可达、超时、响应格式不符
**THEN** 各返回**自己的类型化码**（可被前端翻成人话），且**无一条落成"未知写成默认值"**

### Requirement: 未知即未知

#### Scenario: 无来源的窗口

**WHEN** 某模型没有可得的上下文窗口来源
**THEN** 记录为**空**（不写 4096/8192 之类的内置值），并有反例测试锁住

## Stages

- [x] 1. 复核 55 的落点与授权口径；确认凭据 locator 可读且权限 0600（提交）
- [x] 2. 接线有界探测 + 四类类型化错误（提交）
- [x] 3. 真实端点一轮 + 凭据零命中扫描（提交）
- [x] 4. 反例测试（未知即未知、格式不符）+ 账与证据（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 有界 | 探测带超时与响应大小上限；端点白名单 | 去掉大小上限即失败 | fail (typed) |
| G2 凭据零日志 | argv/日志/事件/证据 JSON 扫描注入值 = 0 命中 | 往 argv 里加一次凭据即失败 | fail (typed) |
| G3 类型化 | 四类失败各有独立码（有测试） | 两种失败共用一个码即失败 | fail (typed) |
| G4 未知即未知 | 无来源时为空；无可内置默认值 | 写入任何内置窗口值即失败 | fail (typed) |
| G5 不写配置 | 探测前后受审配置逐字不变 | 探测写入任一配置文件即失败 | fail (typed) |

## Validation

```bash
ls -l /home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key   # 只看权限位，不读内容
python3 -m pytest -q tests/server -k "probe or provider_model"
grep -rn "DEEPSEEK_API_KEY\|sk-" docs/server-round1/fullstack/ | grep -v "credentialEnvironment\|环境变量名" || echo "零命中"
git diff --check && git status --short
```

## DoD

1. 实现：探测与类型化错误面。2. 反例：G2/G3/G4/G5 各演练一次并写进报告。3. 真实环境：一次真实端点探测。
4. 回归：套件计数与退出码（沿用最近一次 879 并标明新计数）。5. 账务：**真实请求数逐笔**（R-0011 口径）+ 清理。
6. 账：55 行刷新 + 本单终态行。

## Acceptance

- 绿：`REAL_ENDPOINT_PROBES_DONE`
- 否则：`REAL_ENDPOINT_PROBES_PARTIAL` + 精确剩余项（哪一类失败未验、为什么）
