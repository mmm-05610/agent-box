# 人手 UI 验收运行记录（2026-09-16）

执行者：用户本人（点界面）；助手负责环境、逐步指路与后端核对。方案见
[ui-manual-test-plan.md](ui-manual-test-plan.md)。

## S0 启动与连通 — 通过（含一次我方的环境缺陷）

- 第一次启动失败：`SIDECAR_DEPLOYMENT_INVALID`。**原因是我生成的部署文档把 `pluginRoot`
  写成 Linux 路径**（`/home/maoqh/...`），Windows 上被解析成 `C:\home\...`，Server 读不到
  投影文件。我的预检当时从 UNC 工作目录跑，恰好掩盖了它。
- 修法：`pluginRoot` 改为 Windows 可见的 UNC 路径（`\\wsl.localhost\Ubuntu\...`），并在启动
  脚本里 `Set-Location` 固定工作目录，避免"驱动器相对路径"这类语义随调用位置漂移。
- 修复后在用户的原始工作目录（`C:\WINDOWS\system32`）复跑 Server：`SERVER_LIVE`、退出无残留。
- 应用侧：`hermes-home/logs/desktop.log` 记录 `[agentbox-wire] lifecycle connection installed`，
  即生命周期连接已装上（`AGENTBOX_SERVER_ROOT`/`PORT` + Server 自写的 `secrets/http-token`）。

## S1 凭据录入 — 录入成功；方案里的一处期望是我写错

- **后端事实（第一手）**：Server 数据根里出现
  `credential_15afe78b037445aea72f0d21010938f7`，`kind=api-key`，
  `secret_locator=…dpapi`（密钥落在 Server 自己的 DPAPI 密钥库；Desktop 的记录文件
  `credentials.json` 只有 `{credentialId, kind, label}`，**没有内容**）。
  即：renderer → IPC → main → 临时 0600 文件 → `POST /api/v1/credentials` → 密钥库，
  这条**人手录入路径首次被真实走通**。
- **方案错误（已改）**：这个界面**没有"凭据列表"**。凭据只作为 `新增 / Add`（新建 provider
  model）表单里 `凭据` 下拉的选项出现。S1 的正确判据是"保存成功且无报错"，"看得见"属于 S2。

## 观察到但尚未定性的界面提示（记账，不改产品）

### O1 没有工作区时，提示只写"不可用"

`agentbox-chat-view.tsx` 的 `unavailableReason` 三个分支里，第二个分支在
`catalogReady && !workspace` 且 `workspaceOpen.status === 'idle'`（压根没有可登记的行）时
落到兜底串 `profiles.agentBoxUnavailable`，即界面上只有孤零零一个"不可用"。
同一状态下，如果存在工作区行，提示会是 `发送前请选择角色`（明确、可行动）。

- 事实基础：用户截图里侧栏为空态（暂无会话 + 打开文件夹 / 打开远程文件夹），主区顶部一条
  `不可用`，输入框置灰。
- 判据：这不是服务故障——`catalogReady` 为真（该分支的前置条件）说明
  `service.phase === 'ready'` 且 sessions/workspaces 目录都已加载。
- 定性：**提示可读性问题（候选 P2）**，需要与"发送前请选择角色"这类明确提示一致；
  是否改产品留给用户裁决。

## 尚未执行

S2 模型与角色、S3 工作区、S4–S10。本记录随执行推进增补。

## S2 模型与角色 — **被人手路径堵住（产品缺陷 F1，冷启动）**

用户按方案点开 `角色`，界面显示：

> **角色维护当前不可用**
> 服务可以列出角色，但尚未声明创建、编辑、归档或原生记忆控制能力。

这句话把原因说反了。第一手事实：

- Server 的 `server.hello` 明确声明 `profiles.create/update/updateConfig/archive` **全部 supported=true**
  （实测返回值，见本轮记录），并没有"尚未声明"。
- 真正的原因是**空白服务上不可能创建第一个角色**：`features/profiles/index.tsx` 里
  `harnessChoicesFromProfiles(profiles)` 从**已存在的角色**推导可选 harness；没有角色 ⇒ 选择集为空 ⇒
  `productionMaintenance` 为 `undefined` ⇒ 整个维护界面（含"新建角色"）不渲染。
  函数注释写着"harness 选择只来自服务的不透明数据，绝不制造品牌行"——规则本身对，
  但它把来源取成了"角色自身"，于是形成鸡生蛋。
- 没有别的入口：composer 的角色控件（`profile-controls.tsx`）只是已存在角色的单选列表，
  没有"新建"；`features/profiles/create-profile-dialog.tsx` 走的是 `@/api/profiles`（另一套 Hermes
  产品面），不创建 AgentBox 角色。

**F1 = 冷启动缺口 + 误导文案**：空白 Server 上人手无法建第一个角色；界面还把原因归咎于服务能力缺失。

现状：用户在 S2 处停下（正确的做法——这正是要测出来的东西）。

### F1 的修复（同日，前端执行树）

- **改法**：`features/profiles/index.tsx` 的 harness 选择改从**服务的 provider/model 目录**
  推导（`harnessChoicesFromProviderModels`，archived 记录排除）；仍然只来自服务数据、不造品牌行。
  编辑/归档既有角色**不再**依赖选择集存在——只有"新建"入口依赖它（有模型才有可选的 harness）。
  空态文案按真实原因分流：能力未声明 vs 服务正常但目录为空（后者指向"先新增 provider/model 配置"）。
- **测试**：新增冷启动用例（服务 ready、能力齐、目录空 ⇒ 文案指向模型，且不出现"新建"按钮）、
  目录驱动 harness 选择用例、以及 archived 记录不入选/空目录不猜行的端口级用例。
  改动面 6 个测试文件 62 项通过；`tsc --noEmit` 与 eslint 干净。
- 发现并修掉一处我自己的过度约束：最初把"端口可用"也绑在选择集上，导致**已有角色但目录为空**时
  连编辑都不给——测试当场抓到，已改为只约束"新建"。
- 提交：`5b647a47`（前端执行树，分支 `feature/agentbox-desktop-product`）。

## 附：前端套件在 Windows 检出上的既有失败（与本次改动无关）

改完后在 Windows 检出跑 `vitest --project ui`：**7952 passed / 24 failed（6 个文件）**。
6 个文件全是**路径扫描类**结构测试：`api/import-boundary`、`dev/contracts/renderer-layers`、
`store/store-boundaries`、`store/profile-store-purity`、`store/session-store-purity`、
`plugins/hermes-bots/cron-prompt`（后者是 `sh` 依赖）。

- 证据：失败信息里出现的路径是 Windows 反斜杠（如 `"api\\client.ts names the preload REST bridge directly"`），
  而测试内的期望表用正斜杠；模块枚举用 `path.relative` + `readdirSync`，在 Windows 上产出
  `store\profile.ts`，于是 `'store/profile.ts'` 之类的相等断言必然失败。
- 这与上一轮记录的 **35 个既有失败**（`test:desktop:platforms`，POSIX/darwin 专属）同一类：
  **本地检出平台的既有问题**，不是本轮改动引入，也不是产品缺陷。
- 改动面的 6 个测试文件 62 项全部通过；`tsc --noEmit`、eslint 干净。

## S2bis：模型槽（F2，后端一处描述缺陷，已修）

F1 修完后用户建出了角色（`pi-test`，harness=pi），但**模型槽选不了**。第一手探测（直接问 Server）：

- `providerModels.list`：`pi-deepseek` 已在界面里建好——harness=pi、provider=deepseek、
  `credentialId=credential_15afe78b…`、模型 `deepseek-flash`（界面这条路径是通的）。
- `config.describe`（该角色）：**只有一个控件** `{"kind":"enum","controlId":"model","values":[]}`
  ——**空枚举**，界面上没有可选项。

根因在后端 `wire/handlers.py` 的 `_controls()`：部署把模型控件声明为
`modelControlId="model"` + `controlOptions={"model": []}`（目录驱动，值必须是
`{providerId, modelId}` 引用，`freeze_execution_configuration` 也拒绝别的形状），
但描述器只在**已经存了引用**时才输出 `kind: "model_slot"`，否则退化成"空枚举"——
于是"第一次选模型"没有入口（与 F1 同型的鸡生蛋）。

**修法（后端）**：当控件就是部署声明的模型控件、且声明值列表为空时，直接描述成
`kind: "model_slot"` + `slots: [{"name": controlId, "model": null}]`（wire schema 本就允许
`model: null`）；已有引用时照旧带回引用；**声明了值列表的控件仍然是枚举**（不猜）。

- 测试：`tests/server/test_wire_v1.py` 新增两项——目录驱动的新角色在未选模型时描述为
  空槽、选完之后带回引用；以及"声明了值列表仍是枚举"的反例。
- `tests/server/test_wire_v1.py` 34 passed；全量后端套件见下。
- 前端无需改动：`ModelSlotSelect` 已支持 `model: null`（显示"未设置"+目录选项），
  `buildProfileConfigValues` 会发 `{providerId, modelId}`。

## S3 工作区 + S4 第一轮真实对话 — **通过（人手路径）**

修完 F1/F2 后，用户重启（我用新后端代码重起了 Server）并完成：

- **工作区**：通过向导建了两个 WSL 工作区记录——`agent-box`(`/home/maoqh/projects/agent-box`，
  conn=unverified) 与 `agent-box-desktop-next`(`/home/maoqh/projects/agent-box-desktop-next`，
  conn=verified)。
- **角色**：`pi-test`（harness=pi），配置 rev=2，里面是
  `{"model":{"modelId":"deepseek-flash","providerId":"provider_123fd827…"}}` ——
  即**模型引用是经界面选出来保存的**（这正是 F2 修好的那条路）。
- **一轮真实对话**（后端第一手事实，`inspect.py`）：
  - session `session_83a27512…`，workspace=`ws_c40a0aec…`，profile=`pi-test`，
    **native session id `01a0a809-216c-799f-864d-b72b6f5b85ba`**（原生 Harness 真的跑了）；
  - turn `execution_f605dd06…`：state=**completed**、error=None、capture=captured、cleanup=cleaned；
  - 事件：**message.delta × 42**、message.final × 1、turn.accepted、turn.capture、turn.state × 2
    ——**流式先于终态**，与门里的观测同型。
- 界面上表现为：消息框可用、回答流式出现、最后稳定。用户原话："完成一次对话了，非常好"。

**这一段的证据意义**：人手路径（打开工作区 → 选角色 → 输入 → 流式回答 → 终态）
**首次走通**，此前只有脚本路径。它同时证明了 F1/F2 两处修复对真实手感有效。

遗留：用户建了第二个 provider model `pi专属`（模型 id `deepsee-flash`，拼写少一个 k）。
不影响链，但建议在界面上归档它（顺带覆盖归档路径）。

## 尚未执行

S5 第二轮上下文、S6 工具/文件改动、S7 停止、S8 重启续接、S9 负例、S10 收尾。

## S5 第二轮上下文 — **发现 F3：每轮答复都重复上一轮全文**（后端已修）

用户实测第 2/3 轮：**每条答复都以相同开场白开头，并把上一轮全文重复一遍**；越答越长。
用户问"前端还是后端问题"。第一手判定（后端原始事件，不是界面观感）：

- 三轮的**输入**是干净的：`{"message":{"text":"你好"}}`、`"我刚才给你发了啥"`、`"你啥意思"`
  ——产品没有把历史塞进用户消息。
- 三轮的 **delta/final 文本本身**在累加：81 → 130 → 275 字符，且第 N 轮的文本**以第 N−1 轮
  全文为前缀**。也就是说重复发生在**原生输出流里**，前端只是如实显示 → **不是前端问题**。

机制（已在链路上定位）：Pi 的原生会话重开走 `session/load`，而 ACP 的 `session/load`
**按定义会回放**历史（`harness_remote` 的 Pi profile 自己写了 `replaySettleMs: 250`，
注释是"reopen 时保留 replay 尾流"）。回放块与实时输出走同一个
`agent_message_chunk` 通道：Worker 把**每条** ACP 通知原样上报
（`runtime/worker-entry.mjs` 的 `agent.on("notification", …)`），Server 又把每条
`agent_message_chunk` 当成这一轮的 `message.delta` —— 于是历史成了答复的前缀。

**修法（后端 `execution/sidecar.py`）**：以 **prompt 是否已发出**为界——
`prompt()` 在发包前把该执行标记为"已提示"，`_forward()` 只把**标记之后**到达的
`agent_message_chunk` 当作本轮增量；prompt 之前到达的一律排除（并计数
`replayed_history_chars()` 记账，便于事后核对）。规则与 harness 品牌无关：
prompt 之前到达的内容在定义上不是这一轮的答复。

- 测试：`tests/server/test_server_capability_contract.py` 新增
  `test_history_replayed_before_the_prompt_is_not_this_turns_answer`——脚本化通道在 open 时
  回放一段历史、prompt 时给一段实时输出，断言本轮的增量**只有**后者、回放计入计数。
- 全量后端套件 **599 passed / 3 skipped**。
- 残余风险（如实记录）：回放若在 prompt 之后仍在排空（Pi 的尾流），可能有少量历史漏进本轮；
  桥自己用 `replaySettleMs: 250` 防这件事，本轮观测到的形状是"整段回放都在 prompt 之前"
  （第 N 轮文本精确以第 N−1 轮全文为前缀，没有交错），故本次以该边界为准。

## S5bis 停止之后：审批是真，连续性断在"取消不捕获"（F4）

用户报告两件事：界面上出现"执行批准"，以及"会话连续性很奇怪"。两者的后端事实：

### 审批提示是**真的**，而且是设计中的权限往返

被取消的那一轮（`execution_3595c07c…`）事件序列：

```
approval.requested {options: [allow_always "Always allow bash", …]}  → approval.settled {decision: allow}
approval.requested … → approval.settled {decision: allow}
approval.requested … → approval.settled {decision: allow}
approval.requested {… "Always allow read" …} → turn.state {cancel_requested: true} → approval.settled {decision: invalidated, reason: execution_terminal}
```

即：原生（Pi 的 ACP 权限请求）在跑命令前问了三次，用户批了三次，第四次时用户取消了那一轮，
未决的审批被 `execution_terminal` 作废。**这是权限往返正常工作**，不是幻觉。
注意一致性的另一面：注册表里 pi **没有**声明 `permissions` 能力（因为"没观测到运行时裁决"），
而权限请求仍然如实上报——这正是 Server 的既定规则（如实上报，不据此声明能力）。

### 连续性断在"取消的那一轮不捕获状态"

- `repository.py` 的 `finish_cancelled()` 明确写 `state='cancelled', capture_state='not-captured'`
  ——取消的执行**不**进检查点（避免把半执行状态固化，这个取舍本身站得住）。
- 后果（第一手）：第 6 轮（`继续`）恢复的是**第 4 轮**那次捕获的原生状态，因此第 5 轮那句
  「那你看看这个项目如何」**从未进入模型的上下文**。模型说"我这边没有收到过你让我看项目的指令"
  是**真话**。
- 但产品的转写里那句话还在，于是**转写与模型的上下文互相矛盾**——用户感到"很奇怪"的来源。

**F4 = 取消轮次的输入在转写里可见、在模型上下文里不存在，而界面没有任何说明。**

建议（未实施，等用户裁决）：

1. 小改（推荐）：取消的那一轮在转写上标出来（例如"这一轮被取消，其输入未进入下一轮上下文"），
   让界面不再与模型各说各话；
2. 大改（不建议现在做）：取消时也捕获原生状态——会把半执行状态固化，需要单独的有界规则。

即时办法：把要求重说一遍即可（第 7 轮用户重说后，模型就开始扫仓库了）。

