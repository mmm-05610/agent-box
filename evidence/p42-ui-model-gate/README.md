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
| **Hermes** | **5/5 步后失败，exit 1** | 前 5 步全绿（Server 起来、连接装好、凭据经界面录入、Provider/Model 挂上凭据），随后 `sessions.createAndSend` 报 `CREDENTIAL_REQUIRED：Profile has no authorized credential`——**产品缺口**，见下 |
| **Codex** | **未运行** | 上下文/时间预算耗尽；工件与部署已就绪（`/tmp/agentbox-codex-ui-artifact`，tree digest `sha256:9051b844…`），命令与上面三家相同 |

## 两个必须记录的真实问题

### 1. Hermes：wire 无法把凭据挂到 Profile 上（产品缺口）

- Hermes 的生产部署**不声明 model 控件**（`modelControlId=None`、`controlOptions=[]`）：Hermes 0.19 不播发 ACP configOptions，模型由部署自己的配置钉死，这是既有设计。
- 另外三家声明了 `model` 控件，于是"角色选中 Provider/Model 配置"这一步会把该配置的
  `credentialId` 带进执行上下文（`sessions/service.py:105` 的
  `(execution or {}).get("credentialId") or profile.get("credential_id")`），链路因此拿到凭据。
- 而 Hermes 没有那个控件，只能靠 `profile.credential_id`；**wire 的 `profiles.create`
  不接受凭据**（`profiles/service.py:72` 的 `create_wire` 硬编码 `credential_id: None`）。
  结果：任何"没有 model 控件"的 Harness 都无法从 wire/UI 侧被授权。
- 三条出路（需裁决）：(a) 给 wire 的 `profiles.create` 增加可选 `credentialId`（合同增补，需两端重锁）；
  (b) 保留 REST `POST /api/v1/profiles` 的 `credential_id` 并让界面用它（界面会多一条非 wire 路径）；
  (c) 让 Server 在角色没有凭据时按"唯一同 kind 凭据"推导（隐式，多凭据时歧义，不推荐）。

### 2. OpenCode：首轮助手文本是片段（未定因）

- 现象：两轮都完成，但首轮文本 `P42-1F4A9`（差一个字符），`message.final` 仅 `P42`。
- 已排除：链路失败（`terminal=true`）、部署输出上限（配置为 64 tokens，足够）、我的 delta 组装
  （改用 `message.final` 后更短，说明是文本本身而非组装）。
- 未定因：是模型对这条短提示的答复本身被截，还是 OpenCode 这条路在"短答复"上少发最后一个 chunk。
  后端侧的 OpenCode 真实门（15 字符 nonce）曾拿到完整文本，故不认为链路有系统性问题——
  但**这一点没有被证明**，故不记通过。

## 成本

四家 UI 门尝试合计约 **20 次真实请求**（Pi 2 轮、OpenCode 4 轮含重跑、Hermes 0 轮因派发前被拒），
输入数百 tokens、输出受各家部署上限约束（≤64 tokens）→ 增量 **< ¥0.01**；
与后端四家门合计仍 **< ¥0.08**，远低于 ¥10 上限。未充值、无第三方代理。
