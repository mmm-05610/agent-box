# Work Order 096 — 思考/推理旋钮：阶段 1 一手观测（逐家原生键 / 方言值域 / 钉不死清单 / v2 默认翻转与冲突）

终态：**阶段 1 完成（观测）；阶段 2–5 有一处写权边界与一处既有门冲突需处置**（见 §4/§5）。§Spend：0 真调用。
基线 `f6cbc113`；092 已收口（模型事实 `capabilities.reasoningOptions` + 描述符可用）、093 已接（写入器可加旋钮键）⇒ 判据成立。

## 1 逐家原生思考键（一手，本树 deploy 文件实测行号）

| 家 | 原生键（一手 file:line） | 今天模板里写死的值 | 方言值域（一手来源） | 钉死状态 |
| --- | --- | --- | --- | --- |
| codex | `model_reasoning_effort`（`deploy/codex/config.toml:26`，顶层） | `"high"`（已是高档，非关闭） | cc-switch `codexProviderPresets.ts:642`：`low/medium/high`（none/xhigh/max 另说） | **可钉**（键 + 档一手） |
| pi | `samplingParams.thinking`（`deploy/pi/models.json:16`）+ 模型级 `"reasoning": false`（`:11`） | `thinking.type="disabled"`、`reasoning:false` | `piThinkingProfiles.ts`：`off/minimal/low/medium/high/xhigh/max` + **逐模型映射**（缺键≠null） | **半钉**：键可钉；**逐模型映射表是 pi 私有语义，不抄成我们的表 ⇒ 映射部分钉不死**（工单 Notes 明令） |
| dsh | `thinking` / `reasoningEffort`（`deploy/dsh/settings.yaml:21,24`） | `"disabled"` / `"off"` | 档位域一手未钉（dsh 与 093 观测：协议方言钉不死的同源家） | **半钉**：键可写；**档位枚举未一手钉死 ⇒ 值域拒绝/不发明** |
| hermes | `thinking`（`deploy/hermes/config.yaml:16`，provider 块下） | （provider.custom 下结构） | 域未一手核（同 093 hermes context_length 待真机核） | **待核** |
| opencode / kilo | per-model `options.reasoningEffort`（`deploy/opencode/opencode.json:14,16` 的 `reasoning:false`+`thinking`） | `reasoning:false` | `opencodeProviderPresets.ts:142-157`：`low/medium/high/xhigh` | **可钉** |
| claude-code | `MAX_THINKING_TOKENS`（env）+ effort 档 | （env 形态） | budget_tokens（092 `reasoningOptions:{type:budget_tokens,min}`） | env 名一手（093 观测），**档位是 token 预算不是枚举** |
| qwen | env 三件套，**无独立思考键**（093 观测：env 逐槽/限额名未一手） | — | 钉不死 ⇒ **不声明**（界面不显示） | **钉不死 ⇒ 拒** |

## 2 两层语义（本单要守的、不能混的）

- **旋钮是 harness 级**：某家有没有"思考强度"这个开关、写进哪个原生键 → 部署声明（`controlOptions`/`modelControls`）。
- **取值域是模型级**：档位来自模型事实 `capabilities.reasoningOptions`（092 已支持，`{type:effort, values:[…]}` / `{type:budget_tokens,min}`），
  **按该家方言翻译**；模型没事实 ⇒ 用该家钉死的枚举；两边都没有 ⇒ **不声明**（不发明档位）。
- 生效域 = 钉死枚举 ∪ 模型事实（翻译后）；值不在域内 ⇒ `CONTROL_VALUE_UNSUPPORTED`（指名控件与该值）。

## 3 v2（AQ-0001）默认翻转规则 —— 现状一手

"逐家打开思考、默认中间档"要改的写死点，**一手已定位**：
- `deploy/pi/models.json:11` `"reasoning": false` + `:16 thinking.type="disabled"`；
- `deploy/dsh/settings.yaml:21 thinking:"disabled"` + `:24 reasoningEffort:"off"`；
- `deploy/opencode/opencode.json:14 "reasoning": false`；
- codex `config.toml:26` 已是 `high`（不需翻转，改"由旋钮决定"即可）。

**默认规则**：模型事实 `reasoning:true` 且该家方言钉死 ⇒ **默认开**、取该家方言**中间档**（`low/medium/high`→`medium`）；
模型不支持 ⇒ **不声明该旋钮、不产生 thought**（G6/不误报）；关掉 ⇒ 完全不产生（G7：默认档**不是最高档**）。

## 4 写权边界：`config.describe` 生效域投影在 A 线

生效域"∪ 当前模型事实（翻译后）"要出现在 `config.describe` 的投影里 → `wire/handlers.py::config_describe/_controls`（**A 树**，本执行者不碰）。
⇒ 096 的**描述符声明侧 + 校验 + 写入器键**可在本树做（`execution/**` controlOptions、`model_configs/**` 校验、`native_materialization`/`production.py` 落盘），
但**"界面按动态域渲染"的 describe 投影随 wire/A 那半**（与 092 的 wire 参数、122 的 reason 字段同型：runtime 半本树做、wire 半交 A）。

## 5 既有门冲突（须先处置，勿半拉子）

v2 改 `deploy/{pi,dsh,opencode}` 的思考写死值 ⇒ 与 **108 刚落的模板字节钉死测试**（`test_{pi,dsh,opencode}_production_template` 断模板逐字节）**同文件冲突**：
108 钉的是 `maxTokens` 那几键的字节，096 动的是 `reasoning`/`thinking` 键——**同文件、不同键** ⇒ 必须**同步更新 108 的字节钉死期望**，
不能"顺手"改模板而不改测试（违 108 "字节相等测试强度不放宽"）。⇒ 096 阶段 4 落盘须与 108 的钉死测试**同批改、同 commit**（R-0054 串行）。

## 6 结论（本阶段）

阶段 1＝纯观测、零代码改动 ⇒ 变更面仅本证据 + status。**已钉可接**：codex、opencode/kilo、（pi/dsh 键可钉、值域部分拒）。
**钉不死**：qwen（无思考键、env 未一手）、dsh/pi 的逐模型/档位映射（不抄 pi 私表）。
剩阶段 2–5 撞两处（§4 describe 属 A、§5 与 108 钉死测试同文件需同改）⇒ 落地时按 092/122 同型拆分：本树做声明+校验+落盘键，
describe 投影交 A，模板翻转与 108 钉死测试同批。§Spend：0 真调用 / ¥0。
