# AgentBox 后端连续执行与固定 Reviewer 闭环

状态：**USER_AUTHORIZED_CONTINUOUS_EXECUTION**
日期：2026-09-15
适用工作树：`/home/maoqh/projects/agent-box-server-round1`
适用分支：`feature/server-harness-extension-v1`

本文件是用户对现有 39→40→41→42 goal 的增量执行方式。它不扩大已批准产品范围，
不替代 `master-plan.md`、`manifest.json`、当前工单和安全边界；它取代此前“每阶段完成后停止、
等待主对话再给下一阶段提示词”的工作方式。执行者现在应在固定只读 Reviewer 的监督下连续推进，
直到后端独立门、双门接管、前后端联调、Windows 真实用户路径、真实模型门、两仓提交与最终状态
全部完成。普通 bug 和阶段切换不再请求继续。

## 1. 总目标与终止条件

执行者接管当前未完成修改，不重做已经可靠验证的 38/39/40/41 成果，持续完成：

1. 当前 state capture / Worker 错误边界返修与 c7 证据。
2. Codex、Pi、Hermes、OpenCode 四家 DeepSeek 官方真实模型后端门。
3. 登记真实的 `BACKEND_IMPLEMENTATION_READY`。
4. 重新核对前端 `DESKTOP_IMPLEMENTATION_READY`、同一 wire、released lease 与无并发写入。
5. 满足双门后取得 42 明确授予的 Desktop 执行工作树写权，登记
   `FULLSTACK_INTEGRATION_OWNER`。
6. 安装 Desktop lifecycle connection，完成正式 HTTP/WS wire、28 方法、事件、配置、队列、
   审批、附件、取消、恢复与正常退出的全栈联调。
7. 完成真实 Windows Desktop → Server → WSL Worker → bwrap → Harness 用户路径。
8. 在总费用上限内完成四家真实 UI 模型验证及至少一家 Server/Worker 重启恢复门。
9. 修复联调缺陷，分别提交前后端执行分支，最终复核状态、费用、清理、启动与恢复说明。

只有以上目标实际完成或诚实收口为 `FULLSTACK_CORE_PARTIAL`（列清无法解决的真实原因）时才能结束
goal。后端代码完成、某一家 Harness 通过、Reviewer `ACCEPT`、前端 READY 或某次 Windows GREEN
都不是整个 goal 的终止条件。

## 2. 固定权威与不可变边界

每阶段开始、结束、Reviewer 调用前和最终回复前，重新读取：

- `AGENTS.md`
- `docs/implementation/master-plan.md`
- `docs/implementation/status.md`
- `docs/implementation/manifest.json`
- 当前可执行 work order
- 本文件

始终遵守：

- Work Core provider-neutral；Server 只做产品状态和中立编排；插件拥有 Harness 原生语义。
- 生产执行必须经过 Server → Core → Worker → bwrap → Harness，不绕隔离层或复制执行引擎。
- Windows 是 Profile、Session、checkpoint 和凭据记录的权威；Worker 仅持有有界执行投影。
- 不读取用户真实 Harness HOME、`~/.codex` 或其他登录态。
- 不 reset/stash/clean，不自动 merge main，不 push。
- 只显式 stage 自己的路径；保留用户和并发执行者已有修改。
- 禁止降低断言、扩大 skip、吞异常或用假数据/旧证据凑 GREEN。
- 组件、假端点、真实二进制握手、真实模型、Windows、Desktop UI 证据分别记账，不能互相替代。

常规实现、Provider 无模型准备、组件测试、定向修复和证据整理优先交 Luna/Terra；实现子代理最多
两个并行，写集必须不重叠。Reviewer 是只读串行审查者，不参与写入。共享 Server/Worker 接缝、
合同、status、锁文件、Windows 构建和真实模型请求由主执行者唯一串行调度。

## 3. 固定 Reviewer

Reviewer 已在仓库外创建并完成 bootstrap：

- session ID：`01a0a0f8-2df5-7be0-93c6-a8603a07534b`
- session 文件：`/home/maoqh/.agentbox-reviewer/server-round1.session`
- 锁：`/home/maoqh/.agentbox-reviewer/server-round1.lock`
- bootstrap verdict：`/home/maoqh/.agentbox-reviewer/bootstrap-verdict.md`
- Reviewer 模型：`gpt-5.6-sol`
- 本机 CLI：`codex-cli 0.154.0`

Reviewer 只能读，不能修改、stage、commit、运行真实模型、读取凭据、启动 Windows 构建或改变调度。
执行者不能用 `--last` 猜会话，不能用 `--ephemeral`，不能使用任何 bypass approvals/sandbox 参数，
不能并发 resume 同一会话。所有调用使用明确 session ID、`flock` 和只读 sandbox。

Reviewer 原始事件、prompt 和 verdict 留在 `/home/maoqh/.agentbox-reviewer/`，不入 Git。仓库证据只记
reviewed HEAD、verdict、发现摘要和修复检查点；不记 session ID、长 transcript 或秘密。

## 4. 第一步必须完成：Reviewer 自动化实走

用户要求在无人值守持续执行前先证明整套流程真实可用。执行者收到本单后，在安全命令边界立即完成
以下两道门；不得只检查文件存在或沿用 bootstrap 的 `REVIEWER_READY`。

### 4.1 通道连接门

先机械核对 session：

```bash
review_store=/home/maoqh/.agentbox-reviewer
expected_reviewer_session=01a0a0f8-2df5-7be0-93c6-a8603a07534b
actual_reviewer_session="$(tr -d '\r\n' < "$review_store/server-round1.session")"
test "$actual_reviewer_session" = "$expected_reviewer_session"
```

再真实 resume 一轮：

```bash
umask 077
review_store=/home/maoqh/.agentbox-reviewer
reviewer_session="$(tr -d '\r\n' < "$review_store/server-round1.session")"
channel_verdict="$review_store/channel-check-verdict.md"

cd /home/maoqh/projects/agent-box-server-round1

flock -n "$review_store/server-round1.lock" \
  codex exec resume \
    -m gpt-5.6-sol \
    -c 'sandbox_mode="read-only"' \
    -c 'model_reasoning_effort="high"' \
    -o "$channel_verdict" \
    "$reviewer_session" - <<'REVIEW_CHECK'
阶段名称：REVIEWER_CHANNEL_CONNECTIVITY
执行工单：42 reviewer automation
本次不是代码验收，只验证固定 Reviewer 身份、上下文连续性和只读规则。

请只读核对当前仓库路径、分支、HEAD 和 worktree 状态，确认 bootstrap 中的 Reviewer 协议仍生效。
不修改文件、不运行测试、不读取凭据、不发模型请求。

按固定 Reviewer 格式返回 VERDICT: ACCEPT，并在 ACCEPTANCE_BASIS 中包含精确字符串：
REVIEWER_CHANNEL_OK
REVIEW_CHECK

rg -q '^VERDICT: ACCEPT$' "$channel_verdict"
rg -q 'REVIEWER_CHANNEL_OK' "$channel_verdict"
```

记录命令退出码、Reviewer 的实际 `REVIEWED_HEAD`、`WORKTREE_STATE`、两个机械命中结果，并复核
Reviewer 调用前后工作树没有由 Reviewer 造成的变化。

### 4.2 当前阶段真实审查闭环

通道门通过只证明可以对话。执行者还必须完成当前 state capture/c7 返修，按 §5 更新证据、提交稳定
检查点、清理资源，然后把该真实阶段交给同一 Reviewer。若 Reviewer 返回 `CHANGES_REQUIRED`，执行者
实际修复、测试、提交并再次 resume；只有该阶段取得 `ACCEPT`，才登记
`REVIEWER_AUTOMATION_READY` 并进入付费真实模型阶段。

这两道门全部通过后无需等待用户确认，立即继续后续阶段。若通道失败，保留 session 文件，不另建会话；
检查 CLI、模型、锁和 session 后只重试一次。连续两次失败时完成当前仍可安全进行的工作，报告准确错误，
不得假称 Reviewer 仍在运行或绕过审查进入下一大阶段。

## 5. 每个大阶段的审查协议

大阶段固定顺序：

1. 读取权威与实际状态。
2. 实现并先跑定向验证。
3. 运行该阶段要求的集成、Windows 或模型门。
4. 更新证据和现行 status。
5. 显式提交阶段检查点，使证据对应已提交 HEAD。
6. 清理进程、端口、临时根、DataRoot、Worker view/secret 和模型投影。
7. 暂停全部写入，使用固定 Reviewer 审查实际提交范围。
8. 按 verdict 修复、复测、提交；必要时再次审查。
9. `ACCEPT` 后立即进入下一阶段，不请求继续。

调用模板：

```bash
umask 077
review_store=/home/maoqh/.agentbox-reviewer
reviewer_session="$(tr -d '\r\n' < "$review_store/server-round1.session")"
review_verdict="$review_store/last-verdict.md"

cd /home/maoqh/projects/agent-box-server-round1

flock -n "$review_store/server-round1.lock" \
  codex exec resume \
    -m gpt-5.6-sol \
    -c 'sandbox_mode="read-only"' \
    -c 'model_reasoning_effort="high"' \
    -o "$review_verdict" \
    "$reviewer_session" -
```

每次通过 stdin 提供简洁阶段包，不重复粘贴完整历史 status。阶段包至少列：

- 阶段名与工单小节
- 起点/当前 HEAD 和提交范围
- 修改文件与声称完成项
- 先失败后修证据
- 测试/Windows/model 命令、退出码与计数
- 明确未运行项
- 凭据读取、请求数、token、费用累计
- 前端只读状态（如相关）
- 清理结果与已知风险
- 需要 Reviewer 重点核对的边界

verdict 处理：

- `ACCEPT`：进入下一阶段。
- `CHANGES_REQUIRED`：逐项修复；任何 P0/P1、影响合同的 P2 或实质代码/状态改动都必须复审。
- `USER_DECISION_REQUIRED`：按 §6 立即向用户形成问题，同时继续不受影响的工作。
- `REVIEW_BLOCKED`：补齐 Reviewer 点名的证据后再次 resume。

Reviewer `ACCEPT` 后如果又改了生产代码、合同或现行 status，该 `ACCEPT` 自动失效。连续两轮修复无
实质进展时才升级给用户，不能无限循环。Reviewer 的意见不替代执行者自己的验证，也不自动构成 GREEN。

必须审查的阶段边界：

1. 当前 state capture/c7 返修收口。
2. 真实模型付费 preflight（读取 secret 之前）。
3. 四家后端真实模型门与 `BACKEND_IMPLEMENTATION_READY`。
4. 双门、前端接管与 lifecycle/no-model 全栈联调。
5. Windows 真实 UI/四家模型与跨端修复。
6. 两仓最终提交和最终交付审计。

## 6. Harness 配置阻塞必须主动提问

任何 Harness 的模型名、Provider、base URL、wire API、凭据变量、模型目录、原生 HOME、
resume/load、审批、附件、取消或协议行为存在歧义时，执行者和 Reviewer 都不得猜测、私换模型、
换 Provider、建协议代理或在 Server/Core/Desktop 增加品牌分支。

必须立即向用户提供：

1. Harness、adapter、agent、二进制的精确版本。
2. 已检查的原生配置入口。
3. 脱敏错误和准确失败层级。
4. 两到三个可行方案及影响。
5. 推荐方案和理由。

等待裁决时继续其他 Harness 和不受影响的代码/测试，不把单家问题冒充全局外部阻断。普通 bug、配置
拼写错误和已有合同内的实现缺口自行修复，不向用户逐步请示。

## 7. 当前阶段：state capture / c7 返修

接管现有 dirty worktree，以实际 diff 为准，不重写已经开始的修改。目标：

- `VIEW_INVALID` 不再被泛化为全部 transient churn。
- 真正的 live-state 变化使用窄类型错误，例如 `VIEW_CHANGED`。
- 特殊文件、traversal/file limit、非法请求保留准确 hard error，不被改写成
  `SIDECAR_STATE_NOT_SETTLED`。
- 不通过匹配英文 message 判断语义。
- secret 和 state bound 继续立即硬失败。
- symlink 不跟随、不读取、不捕获，但计入 traversal。
- 跨 Worker→Sidecar 反例锁定准确失败层级。
- 新建 c7，不覆盖/删除 c4/c5/c6。
- c7 上串行复跑 runtime-artifact、Codex/Pi/Hermes/OpenCode 假端点门、Windows r4 和独立
  `PostCheck`。
- 修正 status 中仍把 Codex 封装、四家 HOME 或前端 READY/lease 写错的现行矛盾。

本阶段禁止读取真实 secret、禁止真实模型调用，费用增量必须为 ¥0。完成后执行 §4.2 的真实 Reviewer
闭环；取得 `ACCEPT` 后继续 §8。

## 8. 四家后端真实模型门

仅允许 42 §D 已授权的 DeepSeek 官方 API，模型固定 `deepseek-flash`。locator：

`/home/maoqh/.agentbox-acceptance-secret.CnsAonj6/deepseek-api-key`

四家、全部重试和后续 UI 联调共享人民币 10 元累计上限，继承已有 1 次/12 tokens/`<¥0.01`，不得
重置。请求前只读核对官方当前价格和模型支持，按完整上下文、最大输出、重试/后台请求上限预留最坏
费用；累计预留达到 ¥8 时停止新增测试留结算余量。禁止充值、第三方代理和其他凭据。

付费前先完成 Reviewer preflight：只交配置、请求上界、输出/deadline、重试、最坏费用、secret 注入和
清理方案；Reviewer 不读 secret、不调用模型。只有 `ACCEPT` 后主执行者才能读取 locator 并串行调用。
子代理不得接触 secret 或付费请求。

四家分别验证：

- 生产 Server→Core→Worker→bwrap→真实 Harness/adapter/agent
- 模型线上值精确为 `deepseek-flash`
- 首轮真实回答，terminal 前 delta 到 Server 并持久化
- 第二轮上下文
- 关闭/重开和真实 native resume/load
- cancel 与清理
- 未知模型发包前拒绝
- secret 不进 deployment、argv、日志、事件、state、checkpoint、workspace 或 Git
- 精确请求数、usage、费用和脱敏失败层级

Codex 另验证 Responses API、codex-acp→app-server、完整官方 models.json、隔离 `CODEX_HOME`、
`ephemeral` 下无 `auth.json`、默认 5 秒 lease 下静默响应和真实续接。每家结果独立记账；失败一家的
配置按 §6 提问，不拖住其他家。

四家后端门完成后更新 status、提交并 Reviewer closure。只有实际证据和 Reviewer `ACCEPT` 都成立才
登记 `BACKEND_IMPLEMENTATION_READY`。

## 9. 双门与前端接管

前端参考快照（必须重新只读核对，不直接沿用）：

- 工作树：`/home/maoqh/projects/agent-box-desktop-next-wsl-round1`
- 分支：`feature/agentbox-desktop-product`
- HEAD：`8e7c138c96337fc20ed61d3c21100e6449c8ec95`
- `DESKTOP_IMPLEMENTATION_READY`
- `writer_lease=RELEASED`
- worktree/index clean、无子代理或写入进程
- Windows r3：28 PASS / 0 FAIL / 0 SKIP / 0 PENDING
- TS 摘要：`11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`
- schema 摘要：`5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`

重新检查实际 status、`evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md`、HEAD、dirty、进程、两个摘要和
启动证据。只有后端 READY、前端 READY、同 wire、lease released、无并发写入和无未交接修改同时成立，
才在两端记录 `FULLSTACK_INTEGRATION_OWNER`、前后 HEAD、摘要与接管时间，然后取得 42 限定的前端执行
工作树写权。发布源 main 仍只读。

## 10. 无模型全栈联调

在真实 Windows Electron 中安装前端 handoff 指明的 lifecycle connection：`{endpoint, sessionToken}`；
token 只在 Electron main，renderer 不可见。完成正式 Windows Electron→本机 Server→WSL Worker→
bwrap 链，逐项验证 28 方法和生产 WS 事件流：

- `server.hello`
- Workspace open/list/browse/archive
- Profile list/create/update/archive/updateConfig
- Provider/Model list/create/update/archive
- config.describe/config.resolve
- Session list/update/archive/switchProfile/createAndSend/send
- sendOutcome.query
- queue.get/withdraw
- runs.stop
- approvals.decide
- history.snapshot
- event subscribe、gap resync、重订阅与 cleanup

覆盖中立角色维护、Provider/Model 动态配置、默认/覆盖、草稿恢复、发送拒绝、幂等 requestId、历史、
队列终态/续派/暂停、审批失效、附件授权/投递/回收、取消/断连、Server/Worker 重启、正常 Desktop/Server
退出、DataRoot/workspace 清理、无服务诚实状态和零 legacy REST 回落。

普通跨端 bug 按权威层修复，不往 UI 塞 Harness 特例、不让 Server 解释原生协议。每类 bug 保留复现→
定向回归→真机步骤→检查点。完成后两仓分别提交并交 Reviewer 只读审查两仓实际 HEAD；取得
`ACCEPT` 后继续 §11。

## 11. Windows 真实 UI 模型门与最终交付

在剩余费用允许时，从正式 Desktop UI 对四家逐家验证：Profile/Harness/Model 选择、首轮发送、terminal
前内容、第二轮上下文、关闭/重开历史、原生续接、stop、按有效能力执行审批/附件，以及至少一家
Server/Worker 重启恢复。后台直接链和 UI 门分别记账，不能互相替代。

最终集中完成：

- 前后端受影响全套测试、typecheck、lint、架构守卫
- Windows build 与原应用用户路径
- secret 泄漏扫描与费用最终结算
- 正常退出、进程、端口、view、secret、临时根、DataRoot 清理
- 后端和前端执行分支分别提交
- 两端 status、合同摘要、检查点和实际结果一致
- 启动入口、隔离数据路径、恢复/退出说明
- 四家组件/后端模型/UI 模型实际结果及剩余问题
- 未 push、未 merge main

最终交付前再次调用 Reviewer，覆盖两个最终 HEAD、wire 摘要、提交链、Windows、四家、费用、凭据、
清理、启动/恢复和未完成项。只有 Reviewer `ACCEPT` 且执行者自己的终验全部成立才结束 goal；否则继续
修复。最终状态只能按证据登记 `FULLSTACK_CORE_GREEN` 或诚实的 `FULLSTACK_CORE_PARTIAL`，不能用核心
GREEN 冒充尚未下单的外围完整产品 GREEN。

## 12. 持续执行纪律

- 首先实走 Reviewer 通道门和当前阶段真实 review loop；两者通过后自动继续，不等待用户回应。
- 每个大阶段都调用同一 Reviewer；不得另建会话或用 `--last`。
- Reviewer 正常返回、前端状态未变和普通 bug 都不是停止理由。
- 有安全可推进任务就不能宣称“全部可推进工作完成”。
- 平台步骤失败只暂停受影响步骤，记录命令/退出码/错误，继续独立任务；不得绕沙箱权限。
- 每阶段与最终回复前检查 status 是否一致、完整、最新。
- 真正需要新增授权、安全裁决或 Harness 配置选择时才提问，并继续其他不受影响任务。
- 本 goal 不是在后端 READY 或首次 Reviewer `ACCEPT` 时结束，必须完成前后端联调与最终两仓交付。
