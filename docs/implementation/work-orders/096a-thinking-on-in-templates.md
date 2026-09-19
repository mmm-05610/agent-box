---
id: 096a
slug: thinking-on-in-templates
batch: b2
baseline: "75db678"
depends_on: []
write_paths: ["plugins/agent-box-harnesses/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0020
terminal: ["THINKING_ON_DONE", "THINKING_ON_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 096a — 把 pi / dsh 的思考**打开**（配置层最小单）+ 门：真一轮出现 `thought.delta`

## Objective

**来源：R-0020 ②（用户 2026-09-19）**：把 **096 拆成两半**——

- **本单（096a）**：pi 与 dsh 的生产模板里，思考是**写死关闭**的 ⇒ 把它们**打开**（配置层，逐家写清"打开"在这家的语义），
  并加一道门：**真一轮**必须出现 `thought.delta`（前端 P35 才有东西可渲染）；
- **另一半（096b）**：096 原文的"逐家旋钮声明 + 取值域动态 + 落盘"**留在 b4**，不在本单。

**不改的东西**：`maxTokens: 64`（截断上限属 **AQ-0004**，**待用户批**，本单不碰）；wire；队列语义；其它配置键。

## Current state（调度者只读核对，第 1 阶段请自己复核）

| 事实 | 出处 |
| --- | --- |
| pi 模板：`models[0].maxTokens: 64`、`models[0].samplingParams.thinking.type: "disabled"`、`models[0].reasoning: false` | `plugins/agent-box-harnesses/deploy/pi/models.json:14-19` |
| dsh 模板：`llm-deepseek.maxTokens: 64`、`thinking: "disabled"`、`reasoningEffort: "off"`（注释说明 `off` 必须带引号，YAML 1.1 会把裸 off 解析成 false） | `plugins/agent-box-harnesses/deploy/dsh/settings.yaml:19-25` |
| 两份模板的**字节被测试钉死**（模板不得漂移成第二实现） | `pi/production.py:18-19`、`dsh/production.py:19-20`（模块自述）+ 各自模板相等测试 |
| 输出上限常量：`OUTPUT_TOKEN_LIMIT = 64` | `pi/production.py:57`、`dsh/production.py:65` |
| no-model 门的 loopback 副本**只替换 baseUrl**（"provider/model/ceiling/thinking 都保持模板值"） | `pi/production.py:136-141`、`dsh/production.py:133-137` |
| pi 的 `--thinking <level>` 由投影层下发（`projection.py:27`），配置类默认 `thinking="high"` | `pi/projection.py:27`、`pi/config.py:28/51` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| pi 模板 | 按 pi 的语义把思考**打开**（`samplingParams.thinking` 的 type/档位；若 pi 要求 `reasoning: true` 才产 thought 事件，一并按实测改） | P35 要有数据 |
| dsh 模板 | 同理改 `thinking`（与 `reasoningEffort`）——"打开"在 dsh 里的合法取值以**实测/官方 schema**为准，不发明 | 同上 |
| 门 | **真一轮出现 `thought.delta`**：真 harness + 假端点优先（R-0017）；门要能咬（关回去必须红） | 缺席即失败 |
| 逐家登记 | 哪家产 thought、哪家不产（若不产，如实写"该家不产"，不假绿） | 不说假话 |

**必须保持不变**：模板的其它键（provider、model id、baseUrl、cost、retries、`maxTokens`）；loopback 副本"只换 baseUrl"的性质；
模板字节相等测试的**强度**（改了值就同步改钉死测试，不许放宽成"包含"）。

**明确不做**：动 `maxTokens`（AQ-0004 待批）；逐家旋钮声明/取值域/落盘（096b，b4）；改 wire 或协议；
新增对"思考"的产品语义（档位可配是 096b 的事，本单只是**打开**）。

## Requirements

### Requirement: 模板层打开思考

#### Scenario: pi

**WHEN** 用生产模板起一轮
**THEN** 思考为**开**（模板与模块常量一致、钉死测试同步更新），且 `maxTokens` 仍为 64

#### Scenario: dsh

**WHEN** 用生产模板起一轮
**THEN** 同上（dsh 的合法值按其 schema/实测）

### Requirement: 门（真一轮出现 thought.delta）

#### Scenario: 正例

**WHEN** 真 harness 跑一轮
**THEN** wire 事件流里出现 `thought.delta`（并记下它来自哪一层：ACP chunk / 各家原生）

#### Scenario: 反例（关回去）

**WHEN** 把模板改回 `disabled`
**THEN** 该门**必须红**（证明门咬的是模板值，不是"这个宿主恰好会产"）

#### Scenario: 某家不产（缺席即失败）

**WHEN** 某家跑完没有 `thought.delta`
**THEN** 门红或按"该家不产"**如实登记**（二者选一必须写明），不得跳过

## Stages

- [ ] 1. 观测：pi/dsh 各自"思考打开"的合法键与取值（一手：pi 语义 + dsh schema/实测），以及今天为什么不产（提交）
- [ ] 2. 模板 + 常量 + 钉死测试同改（pi / dsh 各自提交）（提交）
- [ ] 3. 门：真一轮 `thought.delta` 正例 + 关回去反例（提交）
- [ ] 4. 收口：账 + 逐家登记（产/不产）+ 回归计数（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 模板层 | 两家的思考为**开**，且与钉死测试一致；`maxTokens` 未动（64） | 退回 `disabled` 必须门红；`maxTokens` 被顺手改掉 ⇒ 门红 | fail (typed) |
| G2 真一轮 | 真 harness 一轮出现 `thought.delta`（含来源层） | 关回去仍绿 ⇒ 门红（门没咬） | 该家不产 ⇒ 如实登记，不得静默 |
| G3 变更面 | diff 只含思考族键 + 常量 + 钉死测试 + 证据/账 | 触碰 provider/model/baseUrl/cost/retries ⇒ 门红 | fail (typed) |
| G4 零成本口径 | 真实调用逐笔记账（R-0017）；机械部分用假端点 | 无记账 ⇒ 门红 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k "pi or dsh or thinking"
python3 -m pytest -q tests/  # 根套件计数照实登记
git diff --check && git status --short
```

## DoD

1. 模板与常量（两家）· 2. 门正例 + 反例 · 3. 逐家登记 · 4. 回归计数 · 5. `§Spend` 与清理 · 6. 终态行。缺一项 ⇒ PARTIAL。

## Acceptance

- 绿：`THINKING_ON_DONE`；否则 `THINKING_ON_PARTIAL` + 精确剩余

## Notes for the executor

- **配对**：A 线 **P35**（把 `thought.delta` 接进对话流）等本单；P35 现排在 P43 之后 ⇒ 本单**尽早**落地。
- 本单是 096 的**拆分前半**：096b（逐家旋钮 + 取值域 + 落盘）仍在 **b4**，别顺手做掉。
- 用户已批准"思考默认打开、档位可配"（AQ-0001）——**本单只做"打开"**；档位是 096b。
