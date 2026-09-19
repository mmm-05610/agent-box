---
id: 096
slug: native-reasoning-controls
batch: c2
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: [{"order": "092", "condition": "模型事实（capabilities.reasoningOptions）与描述符的多控件声明可用"}, {"order": "093", "condition": "逐家原生配置写入器可用（本单要往它上面加旋钮的键）"}]
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["NATIVE_REASONING_CONTROLS_DONE", "NATIVE_REASONING_CONTROLS_PARTIAL"]
waive: []
parallel_units: ["pi","dsh"]
---

# Work Order 096 — 思考/推理旋钮：逐家声明 + 取值域动态 + 落盘

## Objective

用户报障的根因之一：**所有 8 家的部署只声明了 `controlOptions: {model: []}`**，所以"思考强度"这类原生旋钮
在界面上**根本不存在**。本单让它们真的能配：

1. **逐家声明旋钮**（哪些家有哪些开关、写进哪个原生键）——旋钮是 **harness 绑定**；
2. **取值域动态**——档位是**模型绑定**：模型声明了 `reasoning_options` 就用它（按该家方言翻译），
   否则用该家钉死的枚举，两边都没有就**不声明**（界面显示"未声明"，不发明档位）；
3. **校验与落盘**：服务端接受"声明枚举内的值"或"该模型事实声明的值"（按方言翻译后），其余类型化拒绝；
   093 的写入器把值写进原生键，钉不死的家类型化拒绝。

**明确不做**：发明档位；把通用档位表当某家的方言；把旋钮做成 **provider 级**（旋钮是 harness 级、取值域才是模型级——
这是用户提问的答案，见设计 §10.2）；前端改动（P31 只做"声明了就能动态渲染"的机制）。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 8 家只声明模型槽 | `plugins/agent-box-harnesses/src/agent_box_harnesses/{claude:204,qwen:194,dsh:221,hermes:446,codex,opencode,kilo,pi}/production.py` 的 `controlOptions: {model: []}` |
| 各家原生键（一手） | codex `model_reasoning_effort`；claude `MAX_THINKING_TOKENS` 与 effort 档；opencode·kilo per-model `options.reasoningEffort`；pi thinking level（`samplingParams`，见 `deploy/pi/models.json` 的 `samplingParams.thinking`）；hermes `extra_body.thinking`；dsh `thinking`/`reasoningEffort`（`deploy/dsh/settings.yaml`） |
| 档位是**模型相关**的一手证据 | cc-switch `codexProviderPresets.ts:642`（codex 只能 low/medium/high，none/xhigh/max 另说）、`opencodeProviderPresets.ts:142-157`（low/medium/high/xhigh）、`piThinkingProfiles.ts`（off/minimal/low/medium/high/xhigh/max + 逐模型映射；**缺键与 null 含义不同**） |
| 模型事实字段 | 092 的 `models[].capabilities.reasoningOptions`（models.dev 的 `reasoning_options`：`{type: effort, values:[…]}` / `{type: budget_tokens, min}`） |
| 描述符与投影已支持多控件 | 092 的 `model_controls` + `config.describe` 的控件投影 |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 逐家部署 | 声明旋钮（`modelControls`/`controlOptions` 的新项），每项带：controlId、role/label、**原生键**、取值域来源（`model-facts:reasoningOptions` 或钉死枚举） | 界面上有得配 |
| 描述符 | 控件声明可携带"取值域来自模型事实"的**来源标注**（不把档位写死在描述符里） | 动态 |
| `config.describe`/`config.resolve` | 生效值域 = 声明枚举 ∪ 当前模型事实（方言翻译后）；`describe` 返回来源标注供界面渲染 | 动态 |
| 校验 | 值不在生效域内 ⇒ 类型化拒绝（`CONTROL_VALUE_UNSUPPORTED`，指名控件与该值） | 不猜 |
| 093 的写入器 | 把旋钮写进原生键（逐家钉死；"未选/跟随"= **不写该键**）；钉不死的家类型化拒绝并在 status 逐家登记 | 生效 |

**必须保持不变**：模型槽的既有行为（092 修订后）；`security_locked_controls` 的锁定；值不落日志/证据；
部署文档的其它字段与摘要语义。

**明确不做**：给 pi 的"逐模型 thinking 映射表"发明我们自己的版本（**只**用模型事实或家钉死的枚举；
映射表是 pi 自己的语义，钉不死就类型化拒绝）；把 provider 的通用档位（如 models.dev 的 `effort` 值域）
直接当成某家方言——**必须**经该家方言翻译。

## Requirements

### Requirement: 逐家声明旋钮（钉死原生键）

#### Scenario: codex 与 opencode 各声明一个

**WHEN** 部署声明 codex 的推理档（原生键 `model_reasoning_effort`）与 opencode 的推理档（原生键
`provider.<id>.models.<mid>.options.reasoningEffort`）
**THEN** `config.describe` 出现这两个控件（带 label 与来源标注）；在 profile 里设值后冻结执行配置含该值；
093 的写入器把它写进**对应层级**的原生键

#### Scenario: 钉不死的家不声明（反例）

**WHEN** 某家的原生键无法一手钉死（例如 qwen 的 env 形态未定）
**THEN** **不声明**该旋钮（界面自然不显示）；gate 的反例：给未钉死的家声明一个猜的键必须门红

### Requirement: 取值域动态（模型事实优先）

#### Scenario: 模型声明档位

**WHEN** 当前模型的事实声明 `reasoningOptions=[low,medium,high]`，某家方言把它们映射为 `low/medium/high`（或等价）
**THEN** `describe` 的生效域恰为这三档；提交 `xhigh` ⇒ 类型化拒绝 `CONTROL_VALUE_UNSUPPORTED`

#### Scenario: 两边都没有就不给域（反例）

**WHEN** 控件既没有钉死枚举、当前模型也没有事实
**THEN** 该控件以"未声明"呈现（不可编辑或按声明隐藏）；gate 的反例：凭空给出一组档位必须门红

### Requirement: 落盘且缺席不写

#### Scenario: 设值与不设值

**WHEN** 用户设了推理档；另一 profile 没设
**THEN** 前者原生文件里出现该键与该值；后者**不出现**该键（不是空串、不是默认档）；gate 断言两边的字节差异

## Stages

- [ ] 1. 观测：逐家原生键与方言映射的一手核对（含"钉不死"清单）（提交）
- [ ] 2. 描述符与投影：旋钮声明 + 取值域来源标注 + `describe`/`resolve` 生效域（提交）
- [ ] 3. 校验与拒绝（含反例测试）（提交）
- [ ] 4. 写入器接线：逐家把旋钮写进原生键（钉不死拒绝）（提交）
- [ ] 5. 门与账：套件 + 反例 + 证据 + status 逐家登记（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 声明 | 已钉死的家出现旋钮且层级正确 | 给未钉死的家声明猜的键必须门红 | 不声明（界面不显示） |
| G2 动态域 | 域 = 模型事实 ∪ 钉死枚举（方言翻译后） | 域外值必须 `CONTROL_VALUE_UNSUPPORTED` | 无域 ⇒ "未声明"，不可编辑 |
| G3 落盘 | 设值写进原生键；未设不写键 | 未设却写默认档必须门红 | fail (typed) |
| G4 锁定与回归 | 安全锁定控件不可设；模型槽与 092/093 的既有门全绿 | 解锁或改动既有行为必须门红 | fail (typed) |
| G5 诚实 | 未钉死的家逐条在 status 记"未声明 + 缺什么证据" | 把未声明写成已支持必须门红 | 未声明 |

## Validation

```bash
python3 -m pytest tests/ -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（声明 + 动态域 + 校验 + 落盘）· 2. 反例（G1/G2/G3）· 3. 真实环境（至少两家跑一轮假端点，断言原生键）
· 4. 回归计数 · 5. 账务与清理 · 6. status 逐家登记。缺一项 ⇒ `NATIVE_REASONING_CONTROLS_PARTIAL`。

## Acceptance

- 绿：`NATIVE_REASONING_CONTROLS_DONE`
- 否则：`NATIVE_REASONING_CONTROLS_PARTIAL` + 逐家剩余

## Notes for the executor

- 本单在 **b4**，接在 093 之后（共用写入器）。设计 §10.2 在
  `docs/server-round1/model-settings-two-layer-design.md`（主树）。
- pi 的逐模型 thinking 映射表**不要**照抄成我们的表：那是 pi 自己的语义；钉不死就类型化拒绝。
- 需要人拍的事 → 本树 status §Questions；契约问题交回调度者。

---

## 修订 v2（2026-09-19，用户批准 AQ-0001：把"思考"真正打开）

用户批准：**逐家打开思考并按档位可配**（审批队列 `AQ-0001`）。本单原范围是"声明旋钮 + 动态取值域 + 落盘"，
现追加**让思考真的产生**这一条——否则前端接好了 `thought.delta` 也没有数据（实测：pi 轮次里一个 thought 事件都没有）。

### 追加 Scope

| From | To / action | Reason |
| --- | --- | --- |
| `deploy/pi/models.json` 的 `reasoning:false` + `samplingParams.thinking.type="disabled"` | 改为**由旋钮决定**：profile 未设时按 §默认值规则；设了就用设的值 | 现在写死关闭 |
| `deploy/dsh/settings.yaml` 的 `thinking:"disabled"` | 同上（接入 dsh 的 `thinking`/`reasoningEffort` 键） | 同上 |
| 其余家（codex `model_reasoning_effort`、claude 思考预算、opencode/kilo per-model `options.reasoningEffort`、hermes `extra_body.thinking`） | 按本单原有的"钉死键或类型化拒绝"纪律逐个接 | 统一到同一旋钮语义 |
| 模型事实 | 模型声明 `reasoning:false` 或**没有** reasoning 能力 ⇒ 该旋钮**不声明/不可开**（如实显示"该模型不支持思考"） | 不假装 |

**默认值规则（本单定稿，可由用户一句话改）**：模型事实声明支持推理（`reasoning:true`）且该家方言钉死 ⇒
**默认开**，档位取该家方言的**中间档**（例如 `low/medium/high` 取 `medium`）；模型不支持 ⇒ 不声明该旋钮。
理由：用户要"像成熟 harness 客户端一样看到思考"，默认关就等于永远看不到；同时档位可关、可调，成本可控。

**门与反例（追加）**：

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G6 思考真的产生 | 支持推理的模型 + 默认档 ⇒ 一轮里出现 `thought.delta` 事件（假端点可给出 thought 块） | 关掉旋钮后仍出现 `thought.delta` 必须门红 | 模型不支持 ⇒ 无 `thought.delta` 且旋钮不显示 |
| G7 不越界 | 成本相关：默认档**不是**最高档；关掉即完全不产生思考 | 默认给最高档必须门红（说明理由或改档） | fail (typed) |
