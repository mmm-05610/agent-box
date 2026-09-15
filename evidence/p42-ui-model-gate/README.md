# 四家真实 UI 模型门：逐家结果（2026-09-15）

证据：`evidence/p42-ui-model-gate/*.json`（每家一份驱动报告）。驱动：
`apps/desktop/e2e/p42-ui-model-gate.mjs`，用法
`node e2e/p42-ui-model-gate.mjs <family> <sandboxRoot> <outDir>`，一家一次运行。

每家共用同一套流程：真实 Server（Windows）+ 该家真实生产部署 + c8 release Worker + bwrap →
主进程安装 lifecycle connection → **经界面自己的录入路径**加凭据 → 建 Provider/Model 并挂上它 →
建角色并选中该配置 → 两轮真实 DeepSeek 调用。**不打印、不落盘、不入证据**任何凭据内容
（驱动在写证据前先扫描自身输出，命中即拒绝写出）。

## 逐家

| 家 | 结果 | 说明 |
| --- | --- | --- |
| **Pi** | **8/8 PASS，exit 0** | 两轮真实答复：首轮 17 字符即回忆 nonce（`P42-1F4A9C` 时代为长 nonce 的一轮，后统一为短 nonce），次轮 104 字符且 nonce 出现 3 次；凭据经界面录入并挂到模型；清理干净 |
| **OpenCode** | **6/8，exit 1** | 链路跑通：两轮都到 `terminal=true`、答复确实到达（`answerChars` 非零），但**首轮的助手文本是片段**——delta 合起来是 `P42-1F4A9`（提问的是 `P42-1F4A9C`），`message.final` 只有 `P42`。这不是链路失败，但**没有验证到完整回忆**，因此这一家**不记为通过** |
| **Hermes** | **8/8 PASS，exit 0**（合同增补后） | 首跑在派发前被 `CREDENTIAL_REQUIRED` 拒（产品缺口，见下）；给 `profiles.create` 增加可选 `credentialId` 后复跑全绿：真实答复 720 / 1866 字符，nonce 回忆到、次轮出现 5 次 |
| **Codex** | **8/8 PASS，exit 0** | 两轮真实答复：首轮 10 字符即回忆 nonce，次轮 60 字符且回忆到；凭据经界面录入并挂在角色上 |

## 两个必须记录的真实问题

### 1. Hermes：wire 无法把凭据挂到 Profile 上（**已修，两端重锁**）

- Hermes 的生产部署**不声明 model 控件**（`modelControlId=None`、`controlOptions=[]`）：Hermes 0.19 不播发 ACP configOptions，模型由部署自己的配置钉死，这是既有设计。
- 另外三家声明了 `model` 控件，于是"角色选中 Provider/Model 配置"这一步会把该配置的
  `credentialId` 带进执行上下文（`sessions/service.py:105` 的
  `(execution or {}).get("credentialId") or profile.get("credential_id")`），链路因此拿到凭据。
- 而 Hermes 没有那个控件，只能靠 `profile.credential_id`；**wire 的 `profiles.create`
  不接受凭据**（`profiles/service.py:72` 的 `create_wire` 硬编码 `credential_id: None`）。
  结果：任何"没有 model 控件"的 Harness 都无法从 wire/UI 侧被授权。
- **已按 (a) 修复**：`profiles.create` 增加**可选且可空**的 `credentialId`（缺省/null = 角色不携带凭据；
  给值时校验存在性与 kind 与 Harness 声明一致）。后端与前端分别提交，工件重生成并重锁：
  TS `7746404984…`、工件 `14f7f736…`（旧 `11e3b3e7…`/`5d4fa3bf…` 已被取代）。
  后端对新工件 `tests/server/test_wire_v1.py` **32 passed**；Hermes UI 门复跑 **8/8 PASS**。

### 2. OpenCode：这条路会丢答复尾部（**已定因**，待修）

**诊断跑（让它"从 1 数到 40，每行一个"）给出了决定性证据**：

```
deltas = "1\n2\n…\n31"      ← 83 字符，停在 31
final  = "1\n2\n…\n31"      ← 与 deltas 逐字相同
次轮   = "…You didn't ask me to remember anything. Your only instruction was to count fr…"
```

- **两轮都到 completed**，所以链路通；**次轮答复语义正确**，所以模型答得对。
- **delta 与 final 丢失的是同一段尾巴且逐字相同** → 丢失发生在两者共同的上游，
  即 **OpenCode 这条路**（中立 driver 接缝 / 托管 `opencode serve` 的读取），
  **不是** Server 的投影、也不是我的组装。
- 截断位置随答复长度变化（早先 18 字符、9 字符，本次 83 字符），且**总是尾部** →
  符合"回合结束事件与最后一批流式分片竞态"：回合被判定结束得比最后一片落库早。
- 官方文档（`opencode.ai/docs/acp`、`/docs/server`）只说明有 SSE 事件流与消息 parts，
  **没有任何关于 parts 更新时序或截断的说明**，无法据此定论。
- 结论：**该家不记通过**；根因层级为**后端**（OpenCode 读取路径），下一步是对同一回合比对
  harness 自身 `GET /session/:id/message` 的 parts——若 harness 侧完整而我们侧不全，则是我们
  的读取时序问题；若 harness 侧也缺，则在其上游。

## 成本

四家 UI 门尝试合计约 **24 次真实请求**（含 Hermes/Codex 的通过轮与各次重跑）（Pi 2 轮、OpenCode 4 轮含重跑、Hermes 0 轮因派发前被拒），
输入数百 tokens、输出受各家部署上限约束（≤64 tokens）→ 增量 **< ¥0.01**；
与后端四家门合计仍 **< ¥0.08**，远低于 ¥10 上限。未充值、无第三方代理。
