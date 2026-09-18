---
id: 085
slug: posture-config-write
batch: b2
baseline: "4c32992"
depends_on: []
write_paths: ["src/agent_box/**", "plugins/agent-box-harnesses/**", "tests/**", "docs/server-round1/fullstack/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**"]
ruling: R-0002
terminal: ["POSTURE_CONFIG_WRITE_DONE", "POSTURE_CONFIG_WRITE_PARTIAL"]
waive: []
parallel_units: []
---

# Work Order 085 — 60 遗留：把姿态翻译产物写进配置（先钉键）

## Objective

60 的**姿态逐家翻译**已实现（`posture_translation.py`：claude 的 `allowedTools`/`disallowedTools`、
codex 的 `sandboxMode`+`approvalPolicy`，规则是**只收紧或类型化拒绝**），但**翻译产物写进配置文件没做**——
当时的理由是"设置键位置/形状未逐家钉死"。本单先**第一手钉死键**（位置、形状、合并语义），再实现写入；
钉不死的家**类型化拒绝**，不许把未验证的键拼进真 harness 配置。

## Current state

- 60 账行：`PARTIAL`，剩余写明"翻译产物写进配置未做（键位置未逐家钉死）；P17 前端同步开放"
- 既有实现：`src/agent_box/server/profiles/posture_translation.py`（正例+拒绝反例各一）
- 平台事实：本机 Linux/WSL 侧各家配置路径与格式各异（toml/json/分组选项）

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| claude / codex 的配置物化 | 把翻译产物按**钉死的键**写进受审配置文件 | 姿态生效 |
| `tests/**` | 每家的"键形状"正例 + 不可钉死的拒绝反例 | 门有牙 |

- **先文档后代码**：钉键结果先写进 `docs/server-round1/fullstack/**`（位置/形状/合并语义/来源），再实现
- **只收紧**：写入不得放宽既有姿态；未知键、未知形状、未知合并语义 ⇒ **类型化拒绝**
- 不碰 wire；不改其它家的既有配置

## Requirements

### Requirement: 键是钉死的

#### Scenario: 某家的键形状有第一手依据

**WHEN** 实现某家的写入
**THEN** 报告里能读到该键的**位置、形状、合并语义**各自的依据（官方文档/binary/真实样例之一），且写入后有配置快照对比

### Requirement: 钉不死就拒绝

#### Scenario: 反例

**WHEN** 对某家把键设成未知形状
**THEN** 类型化拒绝（不是静默忽略、不是写入近似键）

## Stages

- [ ] 1. 逐家钉键（只写证据）（提交）
- [ ] 2. 实现 claude 写入 + 反例（提交）
- [ ] 3. 实现 codex 写入 + 反例（提交）
- [ ] 4. 未钉死的家类型化拒绝 + 60 收口（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 键有据 | 每个被写入的键都有依据与快照对比 | 无依据就写即失败 | fail (typed) |
| G2 只收紧 | 写入后姿态严格度 ≥ 原姿态（有测试） | 任一放宽即失败 | fail (typed) |
| G3 拒绝可验 | 未知形状/键 ⇒ 类型化拒绝（有测试） | 静默忽略即失败 | fail (typed) |

## Validation

```bash
python3 -m pytest -q tests/server -k posture
git diff --check && git status --short
```

## DoD

1. 实现：两家写入。2. 反例：G2/G3。3. 真实环境：配置快照对比。4. 回归：套件计数。
5. 账务：零调用。6. 账：60 行 + 本单终态行。

## Acceptance

- 绿：`POSTURE_CONFIG_WRITE_DONE`；否则 `POSTURE_CONFIG_WRITE_PARTIAL` + 精确剩余
