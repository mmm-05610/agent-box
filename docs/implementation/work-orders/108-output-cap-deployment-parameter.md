---
id: "108"
slug: output-cap-deployment-parameter
batch: c2
baseline: "a7b5dbe"
depends_on: []
write_paths: ["plugins/agent-box-harnesses/**", "src/agent_box/**", "scripts/server-round1/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "/home/maoqh/projects/agent-box-env-provider/**", "release/**"]
ruling: R-0021
terminal: ["OUTPUT_CAP_PARAMETERIZED_DONE", "OUTPUT_CAP_PARAMETERIZED_PARTIAL"]
waive: []
parallel_units: ["pi", "dsh", "hermes"]
revisions: [{"at": "49083af", "what": "write_paths 增补 scripts/server-round1/**：生产链门在 opencode-production-chain-gate.py 里断言 template==OUTPUT_TOKEN_LIMIT，不改它本单无法落地（执行者交回）", "after_stage": 1, "ruling": "R-0032"}]
---

# Work Order 108 — 输出上限参数化：`maxTokens: 64` 从生产模板里拿掉（AQ-0004，用户已批准）

## Objective

**来源：验收第 2 轮 `ACC-R2-4`（用户："上一轮输出不完整"——属实）⇒ [AQ-0004](../approval-queue.md) 用户已批准**（R-0021 ④："本来就不该砍掉长度"）。

**现象（第一手）**：回答在 `read/bash/edit` 列表处**断在 `edit —`**，事件 delta 也停在同一处 ⇒ 不是竞态、不是打断，是**输出被上限截断**；
三份生产模板把上限钉死在 **64**（`pi`/`dsh`/`hermes`）——那是**验收门时代控成本**的产物，不该约束日常使用。

**要的行为**：**真实使用按部署声明**（缺省用一个宽松值/模型声明值，例如 8k–32k），**门/夹具仍显式钉 64**（门的成本可控且不变）。

## Current state（调度者只读核对；阶段 1 请自己复核）

| 事实 | 出处 |
| --- | --- |
| `pi`：`models[0].maxTokens: 64` | `plugins/agent-box-harnesses/deploy/pi/models.json:14` |
| `dsh`：`llm-deepseek.maxTokens: 64` | `plugins/agent-box-harnesses/deploy/dsh/settings.yaml:19` |
| `hermes`：`max_tokens: 64` | `plugins/agent-box-harnesses/deploy/hermes/config.yaml:4` |
| 三份模板的字节都被**测试钉死**（模板不得漂移成第二实现） | 各家 `production.py` 自述 + 模板相等测试（pi `production.py:18-19`、dsh `:19-20`、hermes 同构） |
| 输出上限常量：`OUTPUT_TOKEN_LIMIT = 64` | `pi/production.py:57`、`dsh/production.py:65`（hermes 同构） |
| no-model 门的 loopback 副本**只替换 baseUrl**（其余保持模板值） | `pi/production.py:136-141`、`dsh/production.py:133-137` |
| 部署文档/描述符里**今天没有**"输出上限"这个字段（`capabilities`/`controlOptions` 只有 `model`） | 092 的模型事实与 `config.describe` 现状（阶段 1 请复核） |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 三份生产模板 | 上限**不再写死 64**：改为**部署可声明**（部署文档字段或模型事实，取实际可得者；缺省＝一个写明的宽松值，例如 8192） | 日常不被截断 |
| 门/夹具 | **显式钉 64**（或各自声明的门用值），且**写进门里**（不再依赖模板默认） | 门成本可控且不变 |
| 值来源 | 阶段 1 定：部署文档字段（需 runtime 线的部署文档解析）**或**模型事实（`maxTokens`/`max_output_tokens`）——**取一，另一个如实登记为未做** | 不发明两套 |
| 诚实面 | 上限生效值**可被读回**（部署文档/描述符或日志中可核）；缺席时写明用的缺省值 | 可审计 |

**必须保持不变**：模板的字节相等测试的**强度**（改了值就同步改钉死测试，不许放宽成"包含"）；loopback 副本"只换 baseUrl"的性质；
**思考开关**（107 管的 `thinking`）与本单无关；wire 与队列语义。

**明确不做**：把上限做成"每轮可以随便填"的用户输入；在 wire 上加字段（若确需，交回调度者走审批队列）；把门的 64 一起放飞。

## Requirements

### Requirement: 部署可声明上限

#### Scenario: 真实部署

**WHEN** 用生产路径起一轮（假端点优先）
**THEN** 请求的 `maxOutputTokens`/`max_tokens` **等于部署声明值**（或缺省宽松值），**不再是 64**

#### Scenario: 反例（门显式钉 64）

**WHEN** 门跑夹具
**THEN** 门里的上限仍是 **64**（显式声明，不继承模板默认）；把门的声明删掉 ⇒ 门红

### Requirement: 可读回

#### Scenario: 审计

**WHEN** 问"这一轮上限是多少"
**THEN** 能从**部署文档/描述符/证据**里读到该值；缺席时读到写明的缺省值

## Stages

- [ ] 1. 观测：三家的钉死点、部署文档今天有什么可承载该值、门的 64 从哪来（提交）
- [ ] 2. 参数化（三家模板 + 常量 + 钉死测试同改）（提交）
- [ ] 3. 门：真实部署用声明值 + 门显式 64（含反例）（提交）
- [ ] 4. 收口：逐家登记 + 回归计数 + 账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 参数化 | 生产模板不再写死 64；部署声明或缺省值生效（假端点可读回） | 仍发 64 ⇒ 门红 | fail (typed) |
| G2 门不变 | 门的 64 是门自己声明的；删掉声明 ⇒ 门红 | 门悄悄继承模板默认 ⇒ 门红 | fail (typed) |
| G3 变更面 | diff 只含上限相关键 + 常量 + 钉死测试 + 部署读取 + 证据/账 | 顺手改 thinking/模型/provider ⇒ 门红 | fail (typed) |
| G4 可读回 | 上限值可从部署文档/描述符/证据读到（或缺省写明） | 读到"未知" ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "pi or dsh or hermes or production"
python3 -m pytest -q tests/   # 根套件计数照实登记
git diff --check && git status --short
```

## DoD

1. 参数化（三家）· 2. 门（G1 + G2 反例）· 3. 逐家登记 · 4. 回归计数 · 5. `§Spend` 与清理 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`OUTPUT_CAP_PARAMETERIZED_DONE`；否则 `OUTPUT_CAP_PARAMETERIZED_PARTIAL` + 精确剩余

## Notes for the executor

- **用户可见**：这是验收里"回答被砍"的根因（用户原话"本来就不该砍掉长度"）⇒ 与 `107`（思考打开）同级优先，**排在 c2 首位**（若 091 正在长门，可在 090 收口后的下一个阶段边界插进 108）。
- 与 **107** 协同：两个都动同一批模板（`deploy/{pi,dsh,hermes}`）⇒ **不要同时改同一文件**；串行做，各自提交。
