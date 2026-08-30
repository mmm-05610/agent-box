# Agent-Box Preview：真实 Provider 集成验证与 Demo Storyboard
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 验证日期：2026-08-24（Asia/Shanghai）
> 验证分支：`spike/real-governed-binding`
> 验证基线 commit：`e340f3b89d85c13d63fe8fc962cb2126177000c2`

## 结论先行

真实 Provider 组合足以证明 Agent-Box 的独立价值，但当前 Agent-Box 产品代码还不足以真实拍摄这支 Demo。Provider 层不需要再做市场发散；需要做的是收敛 Stack、补齐生产 Binding/Finish/Evidence/Team adapter。

本轮最重要的实测结论是：

- Git/worktree、Codex App Server、GitHub Actions、三 participant ACP/acpx + thin Gateway 已经端到端跑通。
- LangGraph local Agent Server 能真实提供 Thread、Run、Checkpoint、state 和 immutable snapshot，但本机 `inmem` dev runtime 重启后的 latest pointer/history 行为不可靠，只能标为 `PARTIAL`。
- bwrap 很适合证明 runtime/config projection 和局部只读隔离，不是高可信 sandbox。
- Claude Code 的 TTY、显式 session UUID、SessionStart hook、transcript 和 resume 已实测；当前第三方 Anthropic endpoint TLS 失败，模型交互未完成，因此不能作为拍摄关键路径。
- ACP 是 client↔agent 控制协议，不是 peer collaboration authority；acpx 是 ACP client/session runtime；thin Gateway 才是本次 Collaboration Authority；MCP 最多只是把 Gateway tools 投影给 Harness。
- 当前生产 Core 有 Work、Execution、Dispatch、Ref 和 provider-neutral projection，但没有生产 Binding、slot assurance、Evidence/ResourceFact、explicit Finish、Team provider。现有 `resume_execution` 还会对旧 Execution 调用 provider resume，与“new Execution + previous SessionRef”原则冲突。

验证等级严格使用：

- `DOCUMENTED`：官方资料或本地 CLI/schema 声明；未等同于本机成功。
- `LOCAL VERIFIED`：在当前机器复现了该单项行为。
- `END-TO-END VERIFIED`：实际跨过目标 adapter/provider 边界，取得 native identity、结果和可保存 evidence。
- `BLOCKED BY EXTERNAL REQUIREMENT`：被账号、凭证、远端服务或当前机器外部配置阻断。

# 1. Real environment baseline

完整机器可读记录见 [environment-baseline.json](../../spikes/preview_provider_validation/evidence/environment-baseline.json)。

## Environment baseline

| 项目 | 实测结果 |
|---|---|
| OS | Ubuntu 24.04 userland on WSL2，kernel `6.18.33.2-microsoft-standard-WSL2` |
| Shell | GNU bash 5.2.21 |
| Python | 3.12.3 |
| Node / npm | 22.23.2 / 10.9.8 |
| Git | 2.43.0 |
| Docker | Windows shim 在 PATH，但 WSL integration 未启用；`docker --version/info` 不可用 |
| bwrap | 0.9.0 |
| GitHub CLI | 2.45.0；已登录 `mmm-05610`，token 具备 `repo`、`workflow` |
| Branch / HEAD | `spike/real-governed-binding` / `e340f3b…` |
| Worktree | 验证开始前已有大量用户改动；本轮不覆盖、不回滚这些改动 |
| Project DB | `.agent-box/` 下没有现成项目 DB；默认 `$HOME/.agent-box` 在本执行环境不可写 |
| Migration files | 001、002、003、004 均存在 |

## Current test baseline

- 默认 home：`210 passed, 1 skipped, 3 failed`。其中两项是 `/home/maoqh/.agent-box` 只读导致，另一项仍断言 migration version 为 3，但仓库已有 004。
- 使用隔离可写 `AGENT_BOX_HOME`：`208 passed, 4 skipped, 2 failed`。剩余问题是 WSL/native profile parity 和过期的 migration-version 断言。
- 真实 GitHub Actions 在 exact commit `e340f3b…` 上另发现已提交分支中的 `LaunchPlan` import 断裂，详见 CI 章节。它不是本轮 spike 新增代码造成的。

因此 tests baseline 不是绿色，拍摄前不能把“CI failure”完全当作剧情道具；必须先让最终 repair commit 真的修好并取得真实 green run。

## Existing Agent-Box capabilities

生产 `src/agent_box/work_core` 已有：

- provider-neutral `Work`、`Execution`、`Ref`；
- `SessionRef`、`WorkflowInstanceRef`、`RunRef`、`WorkspaceRef`、`ArtifactRef`；
- Dispatch idempotency record；
- provider descriptor/capability registry；
- native/output Ref attachment；
- observation projection、freshness、terminal outcome；
- Codex CLI start/resume/JSONL parser 的早期 adapter。

另有两个隔离 spike 已验证 frozen Binding 候选：`spikes/binding_flow_stress` 和 `spikes/real_governed_binding`。这些是可复用设计与测试资产，不是 production feature。

## Existing reusable code

- `launch.py` 和 profile isolation：可复用为 Harness config projector，但当前已提交 HEAD 与工作区/测试间存在 `LaunchPlan` 接口漂移。
- Git worktree provider：可复用 selector resolve、worktree create/snapshot/cleanup。
- bwrap launch projection：可复用 mount/env/profile projection；策略名称必须降低为“local projection policy”，不能宣传为 hardened sandbox。
- `work_core` repository/service：可承载 Work/Execution/Dispatch/Ref 的最小生产骨架。
- Codex JSONL parser：可复用部分事件归一化；Preview 独立 reviewer 应优先接 App Server，而非继续扩 CLI 文本解析。
- TUI 新 terminal launcher：可复用可见 terminal 启动，但还没有 execution attach/finish ownership。

## Missing pieces

当前 production path 明确缺少：

- Execution Binding draft、resolve、freeze、immutable revision；
- Binding slot requested/resolved/projected/observed/consumed assurance；
- Evidence / ExecutionResourceFact persistence；
- explicit Finish/Submit 与 FINALIZING；
- interactive attach/reattach；
- continuation input 创建新 Execution；
- LangGraph resource adapter；
- GitHub Actions ExecutionProvider；
- Collaboration Gateway plugin/adapter；
- TeamInteractiveExecutionProvider 与 participant runtime manifest；
- Binding/Evidence/History UI。

## Risks before integration

1. 当前 `ExecutionService.resume_execution(execution_id, ...)` 会直接恢复旧 Execution 对应 provider；Preview 语义必须改成 Host 创建新 Execution，并把旧 SessionRef 作为 Binding input。
2. 旧 `src/agent_box/work` 是固定 plan/execute/review progression，容易让 Demo 看成内置 workflow engine；Preview 不应以它作为叙事主干。
3. 当前 tests 不绿且 CI 已真实失败；若不先修复，CI Hero Moment 会像预设故障而非治理闭环。
4. Claude 当前 endpoint 不可用；不能在宣传脚本里假定它会完成实现。
5. LangGraph dev inmem 重启恢复存在实测偏差；Demo 只能在单次 server lifetime 使用 latest state，Binding 必须存 exact checkpoint。
6. acpx pre-1.0，queue owner/TTL 有真实失败案例；Team provider 必须把 session creation、owner health 和 cleanup 做成显式状态。

# 2. Provider installation / versions

## Installed versions and commands

| Provider/runtime | Version | 安装/启动方式 | 本轮等级 |
|---|---:|---|---|
| Claude Code | 2.1.241 | 已安装 binary；bwrap 投影 `.claude` profile | LOCAL VERIFIED / model blocked |
| Codex CLI/App Server | 0.149.0 | 已安装 binary；`codex app-server` | END-TO-END VERIFIED |
| Git | 2.43.0 | 系统 binary | LOCAL VERIFIED |
| bubblewrap | 0.9.0 | 系统 binary | LOCAL VERIFIED |
| ACP stable wire | v1 negotiated | `initialize` handshake | END-TO-END VERIFIED |
| acpx | 0.13.1 | task-local npm cache/install | END-TO-END VERIFIED，pre-1.0 risk |
| codex-acp | 1.6.2 | 已安装 binary | END-TO-END VERIFIED |
| claude-agent-acp | 0.70.0 | 已安装 binary | version only |
| LangGraph CLI | 0.4.31 | isolated venv | END-TO-END live / PARTIAL restart |
| LangGraph | 1.2.11 | isolated venv | 同上 |
| langgraph-api | 0.13.0 | isolated venv | 同上 |
| runtime-inmem | 0.33.0 | isolated venv | 同上 |
| langgraph-sdk | 0.4.3 | isolated venv | 同上 |
| GitHub Actions hosted | native service | `workflow_dispatch` through `gh` | END-TO-END VERIFIED |

LangGraph 实际启动命令：

```bash
LANGSMITH_TRACING=false \
LANGGRAPH_CLI_NO_ANALYTICS=1 \
langgraph dev --no-reload --no-browser --port 2024
```

官方资料也明确把 `langgraph dev` 定位为 development/testing 的 in-memory Agent Server；Thread/checkpoint API 本身支持 exact checkpoint get、history 和 `update_state` 新建 checkpoint：[local server](https://docs.langchain.com/oss/python/langgraph/local-server)、[persistence](https://docs.langchain.com/oss/python/langgraph/persistence)。本报告仍以本机重启结果为准，不用文档覆盖实测偏差。

## Claude Code spike

证据见 [claude-code.json](../../spikes/preview_provider_validation/evidence/claude-code.json)。

实测完成：

- 指定 workspace/cwd；
- 投影 `CLAUDE.md`、execution context、settings/permissions 和 provider profile；
- 用指定 UUID 创建 fresh interactive session；
- 真实 TTY attach；
- SessionStart hook 得到 `session_id`、`transcript_path`、`cwd`、`source=startup`；
- 退出后以同一 UUID resume，第二次 hook 得到 `source=resume`；
- transcript 文件存在且取得 SHA-256；
- SessionEnd/UserPromptSubmit hook 可取事件。

官方 hook contract 也列出 SessionStart 的 `session_id`、`transcript_path`、`cwd` 和 `source`，且 hook stdout/additional context 可进入模型上下文：[Claude Code hooks](https://code.claude.com/docs/en/hooks)。权限规则和 settings projection 有官方配置面：[settings](https://code.claude.com/docs/en/settings)。

未完成：

- 当前配置的第三方 `ANTHROPIC_BASE_URL` 从 HTTP IP redirect 到同 IP HTTPS，TLS 失败；没有一轮模型响应成功。
- MCP 仅由 `--help`/文档确认，未在本轮 Claude path 实测。
- 没有建立独立于 SessionRef 的 provider-native RunRef。
- CLI idle、process exit 与 Agent-Box Finish 的分离尚无 production implementation。

结论：Claude Code `PARTIAL`，且 `BLOCKED BY EXTERNAL REQUIREMENT`。拍摄关键路径不得依赖它；修好 endpoint 后必须重跑 interaction、tool event、finish、new Execution resume 全链。

## Codex App Server spike

证据见 [codex-app-server.json](../../spikes/preview_provider_validation/evidence/codex-app-server.json) 和 [codex-recovery-steer.json](../../spikes/preview_provider_validation/evidence/codex-recovery-steer.json)。

端到端结果：

- exact commit：`3c4fb8a2745e2fb33e39dacec00d77080085721c`；
- tree：`e3028e053553b693d6f460f9dfd831531438aa07`；
- native thread：`01a0337d-d28d-7fd2-8abf-9a7b28ae9e6d`；
- review turn：`01a0337d-d2f3-75f3-8246-c7c4206b2b9d`；
- resume 后同一 thread；server restart 后仍可恢复同一 thread；
- fork 得到新 thread `01a0337e-1ab9-7d73-b97f-afc99368ee4f`；
- steer 被同一个 active turn 接受；
- `outputSchema` 产出结构化 reviewer JSON；
- reviewer 找到缺失 `count == 0` regression test；
- review artifact digest：`82cb0c49…4304`；
- outer bwrap read-only workspace 下没有写入。

App Server 当前官方 contract 明确支持 `thread/start`、`thread/resume`、`thread/fork`、`turn/start`、`turn/steer`、streamed events、`outputSchema` 和 commit review；`thread.sessionId` 与 fork root 的关系也应直接读取而非猜测：[Codex App Server](https://developers.openai.com/codex/app-server/)。本轮同时以本地 0.149.0 生成的 JSON schema 为真实版本面。

Ref 映射：

- `SessionRef`：`thread.id`；如 UI 需要展示 session tree，再把 `thread.sessionId` 放 bounded metadata，不自行推导。
- `RunRef`：`turn.id`。
- detached review/fork：新 SessionRef；不得把 root/fork 混成同一 reviewer responsibility。

一个关键失败也被保留：Codex 内层 sandbox 在 outer read-only bwrap 上尝试创建 lock 时失败。最终做法是由 Agent-Box 外层 bwrap 提供只读 authority，App Server 使用 `externalSandbox`/等价声明，避免双重 sandbox 相互冲突。

## Git / git worktree spike

证据见 [git-bwrap.json](../../spikes/preview_provider_validation/evidence/git-bwrap.json)。

实测链：

1. freeze 前：`main` resolve 为 commit `e3e049fa…603`，tree `3cfd8476…405`；
2. Dispatch 后：创建 writer worktree；
3. Harness start 前：实际 HEAD 与 frozen commit 一致；
4. writer 产生 output commit `2be646f8…a43` 和 tree `71317234…fd9`；
5. diff digest `6f082461…bc9`；
6. reviewer worktree 绑定 output commit，bwrap overlay 阻止写入；
7. dirty source 能被检测；
8. worktree cleanup 成功，output branch 保留。

正确时序已经被本机证明：

- freeze 前只做 selector→exact commit/tree；
- worktree 是 Dispatch 后 materialization；
- Harness start 前重新观察 actual HEAD；
- Submit 时固定 output commit/tree/diff digest；
- cleanup 不应删除尚未固定的 dirty output。

Git 本身足以担当 Preview 的 Workspace/Material Authority；GitHub 不需要介入本地 worktree authority，只在 remote repository 和 CI authority 域出现。

## bwrap spike

支持：

- workspace bind/ro-bind；
- context/config/profile projection；
- env injection；
- ipc/pid/uts namespace；
- process PID/exit observation；
- PTY attach；
- 三个并发 process；
- reviewer workspace read-only 实测。

部分支持：

- filesystem policy 取决于具体 mount argv；当前 root `/` 被 host read-write bind；
- network 明确 `--share-net`；
- runtime identity 只能由 command digest、PID、mount/env manifest 和 observed process 组成，不是云 sandbox identity；
- 没有 image/snapshot attestation、seccomp policy attestation 或可信远端 isolation。

不支持：高可信租户隔离、独立 kernel/network、远端恢复、可信 image measurement。bubblewrap 官方也明确表示它只是构造 sandbox 的低层工具，安全边界完全取决于调用参数，而不是现成完整 policy：[bubblewrap](https://github.com/containers/bubblewrap)。

额外实测坑：若把 workspace 放在 `/tmp`，而 profile 又为 `/tmp` 建 tmpfs，workspace 会被遮蔽。Preview materialization path 必须位于专用 runtime root，不得依赖 `/tmp`。

## ACP / acpx / Collaboration spike

两 participant 结果见 [acpx-multi-harness-two.json](../../spikes/preview_provider_validation/evidence/acpx-multi-harness-two.json)；三 participant 结果见 [acpx-multi-harness-three.json](../../spikes/preview_provider_validation/evidence/acpx-multi-harness-three.json)；Gateway evidence 见 [collaboration-gateway.json](../../spikes/preview_provider_validation/evidence/collaboration-gateway.json)。

本机 handshake 协商到 ACP protocol v1。官方协议当前 stable wire 也是 v1；v2 仍是 experimental draft。ACP 的基本模型是 Client 和 Agent 间的 initialize、session/new/resume/prompt/cancel/update，而不是 peer mailbox：[ACP protocol](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/protocol/v2/overview.mdx)。

acpx 0.13.1 实测：

- session create、named session；
- native ACP session ID；
- resume 同一 native session；
- JSON/NDJSON event stream；
- handshake/capabilities；
- persistent client record；
- reconnect；
- queue owner/TTL/failure；
- 多个 named workstream 并发。

acpx 官方自己也标注 pre-1.0，session state 位于 `~/.acpx/`，支持 persistent named sessions、queue ownership、reconnect/cancellation 和 machine-readable events：[acpx](https://github.com/openclaw/acpx)。本机 profile projection 必须把 `~/.acpx` 变成 execution-aware writable projection；直接改 `HOME` 不可接受。

第一次并发失败具有产品价值：participant A 的旧 queue owner lock 仍在，等待 TTL 后 return code 143；B 正常运行但只读到空 mailbox。显式 close 并使用新 named sessions 后：

- 两个真实 codex-acp participant 并发约 25 秒，A↔B 双向交换完成；
- 三个真实 codex-acp participant 并发约 29 秒；
- native sessions：`01a033a2-fd59…`、`01a033a2-ff83…`、`01a033a3-01ac…`；
- Gateway 观察到 A→B→C→A，message IDs 3–5；
- Gateway event range 1–99；
- transcript digest `2797b976…dead5`。

角色结论：

- Collaboration Authority：thin execution-scoped Gateway。
- ACP：Harness control/session/event protocol。
- acpx：ACP client、session persistence、process/event adapter。
- MCP：可选的 Gateway tool exposure；不是 authority，不拥有消息 identity/evidence。
- Gateway evidence：token-authenticated participant handshake、send/read event range、message body/digest、endpoint version、cleanup。
- 仅 self-report：registration 中声明的 HarnessRef；Gateway 不能证明 token 背后 binary 一定是 codex-acp，也不能证明 Harness 未访问未绑定资源。

## LangGraph local Agent Server spike

证据见 [langgraph-phase1.json](../../spikes/preview_provider_validation/evidence/langgraph-phase1.json)、[langgraph-restart.json](../../spikes/preview_provider_validation/evidence/langgraph-restart.json) 和 [langgraph-persistence-check.json](../../spikes/preview_provider_validation/evidence/langgraph-persistence-check.json)。

真实 native identity：

- Thread：`01a0338e-a92b-70f0-bee0-ed901bfc3b35`；
- Run：`01a0338e-a932-7781-b2be-96604c0d9c5c`；
- C1：`1f19fb00-8a79-6d70-8001-3b58c3612ce3`；
- Host `update_state` 后 C2：`1f19fb00-8ab5-67ca-8002-dce1deab5068`；
- graph source digest：`da25cecf…3439`；
- C1 execution-context snapshot digest：`ed6c7750…64a`。

C1 state 实际包含 `values`、`next`、`tasks`、interrupt、`metadata.step`、source/writes 相关 metadata、checkpoint、parent checkpoint。Host update 产生同一 Thread 的新 checkpoint，C2 phase/round/upstream/expected outputs 均变化。这自然表达：

```text
E1 != E2
E1.workflow = Thread T + Checkpoint C1
E2.workflow = Thread T + Checkpoint C2
```

Adapter 可以非常薄：resolve exact thread/checkpoint/run，读取 exact state，选择责任相关字段，canonical serialize + SHA-256，输出 ArtifactRef，再由 projector 渲染为 `context.md`。Core 不保存 graph、edge、routing、checkpoint payload 或 next-node logic。

重启限制必须保留：

- graceful restart 后 exact C1/C2/C3 仍能按 checkpoint ID 查询；
- 但 current/latest checkpoint 变成 null，history count 变成 0；
- 基于旧 checkpoint 的 stale `update_state` 没有冲突错误，而是创建 branch/latest；
- 因而 adapter 必须在 live runtime 中 compare-latest-before-update；不能把 native stale update 当 optimistic lock。

Preview 可用策略：保持 dev server 整段拍摄期间存活；Binding 永远冻结 exact checkpoint；graph source 另做 digest；restart/recovery 不进入 Hero Moment。生产部署应换持久 Agent Server/Postgres，而不是让 Core 接管 checkpoint。

## GitHub Actions spike

证据见 [attempt 1](../../spikes/preview_provider_validation/evidence/github-actions-attempt-1.json) 和 [attempt 2](../../spikes/preview_provider_validation/evidence/github-actions-attempt-2.json)。真实 run 可在 [GitHub Actions](https://github.com/mmm-05610/agent-box/actions/runs/32723874455) 查看。

实际执行：

- 创建 execution-specific ref `agent-box-preview-ci-e340f3b8-20260824`，直接指向 commit `e340f3b…`；
- `workflow_dispatch` 后取得 run ID `32723874455`、run number 137、attempt 1；
- GitHub 回读 `head_sha=e340f3b…`，与 frozen commit 一致；
- workflow ID `328278696`，path `.github/workflows/ci.yml`；
- exact source 下 workflow definition digest `cb0326dc…f87a`；
- run operational status `completed`；
- frontend job success，backend verification failure；
- log digest `bef40dc8…a240`；
- rerun 后同一 run ID、attempt 2、同一 head SHA，再次真实失败。

失败是 pytest collection 期间无法从 `agent_box.launch` import `LaunchPlan`。这很好地证明了：

```text
CI Execution operational outcome = completed
Verification verdict = failed
```

两者不能压成一个布尔值。GitHub REST API 原生提供 workflow run、`head_sha`、rerun、cancel、logs 等查询面：[workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs)。

当前缺口：workflow 不上传 JUnit/test report，run artifact count 为 0；只能保存 native job/step state 和日志 digest。第三方 action 使用 `@v4/@v5` mutable major tags，workflow file 虽由 source SHA pin，action implementation 并非 digest-pinned。

# 3. Provider readiness matrix

| Provider / Adapter | Status | Native identity | Binding projection | Evidence | Interactive | Recovery | Demo value | Main limitation |
|---|---|---|---|---|---|---|---|---|
| GitAuthority + worktree | READY | commit/tree/worktree path | exact source + writer/reviewer workspace | HEAD/tree/diff/dirty | n/a | deterministic recreate | 最高 | cleanup/push policy 待产品化 |
| Codex App Server reviewer | READY | thread/sessionId/turn/fork | cwd, policy, schema, criteria | streamed events, structured artifact, diff | 可接 remote TUI | restart+resume verified | 最高 | outer/inner sandbox 必须协调 |
| Codex interactive author | PARTIAL | thread/turn | cwd/context/policy | events/diff | App Server remote TUI documented；本轮主要验证 reviewer | resume/steer verified | 高 | production interactive provider 未接 |
| Claude Code | PARTIAL | session UUID | workspace/CLAUDE.md/settings/context | hooks/transcript | TTY+resume verified | same session verified | 高但当前不可依赖 | model endpoint TLS blocked；RunRef 弱 |
| bwrap projector | PARTIAL | argv/PID/manifest | mounts/env/profile/context | observed mount behavior/process facts | PTY verified | recreate only | 高 | root rw + shared net，不是 hardened sandbox |
| ACP v1 + acpx | PARTIAL | acpx record + native ACP session | cwd/permissions/session config | handshake/event stream | headless stream；非 peer UI | resume/reconnect verified | 高 | pre-1.0，queue owner/TTL failure |
| thin Collaboration Gateway spike | READY | endpoint + participant token identity | execution endpoint/token/tools | handshake/message/event range/digests | via Harness tools | SQLite reconnect | 高 | binary identity 只是 registration claim |
| production Collaboration adapter | NOT READY | 应映射 endpoint Ref | 未接 Binding | 未持久化 Core Evidence | n/a | 未实现 | 必需 | 只有 spike |
| LangGraph local Agent Server | PARTIAL | thread/run/checkpoint | exact checkpoint snapshot | state/checkpoint/source/snapshot digest | Host/API | exact checkpoint survives；latest/history 不可靠 | 高 | dev inmem restart semantics |
| GitHub Actions Provider | READY | run_id/run_attempt/jobs | exact ref/workflow/test config | head_sha/status/conclusion/logs | no | rerun verified | 最高 | 无 JUnit/artifact；production adapter 未接 |
| TeamInteractiveExecutionProvider | NOT READY | aggregate dispatch + participant sessions | participant specs/resources | 应聚合 participant/runtime/gateway facts | 需 panes/PTY | 未实现 | Hero Moment 必需 | 底层 spike 成功不等于产品 adapter |
| production Binding/Evidence/Finish | NOT READY | Core IDs | 未实现 | 未实现 | 未实现 | 未实现 | 产品价值本体 | 当前最大 blocker |

## REQUIRED AND READY

- Git + git worktree authority/materializer。
- Codex App Server 独立 reviewer native integration。
- GitHub Actions hosted native service（provider adapter 仍需产品化）。
- ACP/acpx + Gateway 的底层三 Harness 可行性。

## REQUIRED BUT PARTIAL

- bwrap projection policy。
- LangGraph local Agent Server，限制为 single-lifetime Preview。
- Codex interactive author path；需补 visible remote TUI/Finish product integration。

## OPTIONAL

- Claude Code：外部 endpoint 修复后再加入；它能增强 heterogeneous Harness 叙事，但不能阻断 Preview。
- MCP：只在不增加手工配置时，用作 Gateway tools 投影。
- 最终 artifact attestation：P2，不替代 Git/GitHub facts。

## REMOVE FROM PREVIEW

- 把 Claude 作为唯一 author 的方案，直到模型调用端到端通过。
- 把 MCP 称为 Collaboration Authority。
- LangGraph Studio、完整 DAG、scheduler/retry 展示。
- cloud sandbox、Temporal、Prefect、额外 tracing backend。
- Human Task Provider；三个同步 Human decisions 用 Host decision artifact/event 更自然。

# 4. Failed or partial integrations

1. **Claude model call — BLOCKED BY EXTERNAL REQUIREMENT。** Session/runtime 面可用，第三方 endpoint TLS 不可用。不能用录屏剪辑伪装完成。
2. **Codex nested sandbox — 已找到可行绕法。** 内层 Codex lock 与 outer read-only FS 冲突；Preview 统一由 outer bwrap 提供 filesystem authority，App Server 声明 external sandbox。
3. **bwrap `/tmp` shadow — 已修复 spike。** runtime/workspace 不放 `/tmp`。
4. **acpx stale queue owner — 可恢复但必须产品化。** 第一次并发 A 在 TTL 后 143；clean named sessions 后 2/3 participant 均 E2E 通过。
5. **LangGraph dev restart — 未解决。** Exact checkpoint survives，latest/history 不 survives；只可限制 Demo，不可宣传 durable recovery。
6. **Git push local tracking ref — 部分失败但远端成功。** `.git` 在本环境只读，push 已创建远端 ref，但无法写本地 `refs/remotes/origin/...lock`。不影响 GitHub run authority。
7. **GitHub report artifact — 缺失。** 真实 logs 有 digest，但 workflow 没有 JUnit/upload-artifact。
8. **production explicit Finish — 未实现。** 不能把 process exit 当替代品。
9. **production Binding/Evidence/Team provider — 未实现。** 这是当前 No-Go 的原因，不是 Provider 生态不可行。

# 5. Final Preview Stack after real spikes

## Accountable ExecutionProviders

- `InteractiveCodexExecutionProvider`：Preview author 主路径；App Server thread/turn + visible remote TUI/terminal。
- `CodexReviewExecutionProvider`：独立 reviewer thread，read-only worktree，structured output。
- `GitHubActionsExecutionProvider`：exact SHA CI responsibility。
- `TeamInteractiveExecutionProvider`：一个 accepted Dispatch、aggregate responsibility；三个 participant 是 Binding resources/runtime manifest，不是三个 Core lifecycles。

Claude adapter 保留插件位，但从拍摄关键路径移除，直到 E2E model interaction 通过。

## Resource Authorities

- Git：commit/tree/HEAD/diff authority。
- LangGraph local Agent Server：live Thread/Run/Checkpoint/state authority；exact checkpoint only。
- Collaboration Gateway：endpoint/participant-token/message-event authority。
- GitHub Actions：run/attempt/head_sha/job state authority。

## Provisioners / Projectors

- Git worktree materializer。
- bwrap runtime/config/profile/context projector。
- Codex/ACP launch adapter。
- LangGraph context snapshot projector。
- optional MCP Gateway tool projector。

## Evidence sources

- Git actual HEAD/tree/diff digest；
- Codex thread/turn/event/structured artifact；
- ACP handshake/session/update stream；
- Gateway handshake/event range/transcript digest；
- LangGraph exact checkpoint/state snapshot/source digest；
- GitHub Actions run_id/run_attempt/head_sha/job/log digest；
- artifact SHA-256。

## Host / Workflow integration

- Host 选择当前下一次 Execution、提交 Binding draft、记录 Human decision、更新 LangGraph state。
- LangGraph 拥有 graph/state/routing/checkpoint；Agent-Box 只 resolve/snapshot/bind。
- Core 不调用 next node，不保存 graph/checkpoint payload，不自动完成 Work。

# 6. Demo topic candidates

| 题材 | 为什么适合 | 自然 Provider | 自然 failure/review point | 最终展示 | 风险 |
|---|---|---|---|---|---|
| **可分享账单分摊小工具** | 一句话目标模糊、UI 直观、规则可由 Human 改方向 | Codex author/reviewer、Git、CI、LangGraph、team review | 0 人/舍入/总额守恒/键盘可用性 | 直接输入金额和人数看结果 | 容易显得题目太小；需把重点放执行治理 |
| CSV 导入预览器 | UI 可视、解析/安全/错误恢复自然 | author、security reviewer、test analyst、CI | formula injection、编码、超大文件 | 拖入 CSV 即展示 | 业务边界较多，3–6 分钟易被细节抢走 |
| Feature flag 管理小面板 | Human 方向、权限、review/repair 自然 | author、correctness/security、CI | 键盘可访问性、错误状态、权限误配 | UI toggle/审计记录明显 | 容易被误解为真正后端权限系统，准备成本高 |

# 7. Recommended Demo topic

选择：**可分享账单分摊小工具**。

初始 Work 只写：

> 把这个账单分摊小工具做到可以交付。

它能自然产生而不预先编排未来：

- H1 决定“总额必须守恒，余数按确定规则分配，并支持键盘”；
- author 做第一版；
- independent reviewer 发现 `people=0` 或舍入边界；
- GitHub Actions 真实失败；
- H2 决定 repair scope，只修 correctness + regression，不顺手扩产品；
- continuation 新 Execution 使用旧 native session；
- 三 Harness 对 correctness/test/repair 做一次 execution-scoped collaboration；
- CI green 后 H3 实际操作 UI，再决定 Complete Work。

题材只提供可见载体。宣传主角始终是：一次 Execution 如何冻结依据、自动组装真实系统、允许交互、最后保留跨域证据。

# 8. Demo narrative thesis

主叙事：

> 用户只选择这次责任尝试所需的已有资源。Agent-Box 冻结依据、准备真实环境、交给一个 accountable Provider、允许持续交互，并在显式提交时固定跨系统输出与证据。

辅助叙事：

> 过去是受治理的事实，未来是开放的决策。

禁止使用的主叙事：

- “Agent-Box 自动跑完一个多 Agent workflow”；
- “Agent-Box 为你安排下一节点”；
- “三个 Agent 自动互相分工”；
- “bwrap 是安全云 sandbox”；
- “所有资源都已被模型消费”。

# 9. Full storyboard

目标时长：约 4 分 30 秒。任何 native 页面都使用拍摄时新产生的真实 ID；本报告中的 spike IDs 只作为能力证据，不应硬编码进 Demo。

## Scene 1 — 一个尚未被规划完的 Work（0:00–0:15）

### Viewer sees

干净页面只显示：

```text
Work
Open
把这个账单分摊小工具做到可以交付。
```

没有 DAG，没有未来 Execution 列表。

### User action

用户点击“决定当前下一步”。

### Agent-Box visible response

出现一个空的 Execution draft，objective 是“先确定本轮产品方向与交付约束”。

### Native systems visible

无。第一秒不展示 provider logos。

### Behind the scenes

Core 只创建 Work。Human/Host decision 随后作为 provenance artifact/event；不是 Human Execution。

### Why this scene exists

先让观众理解 Agent-Box 接受模糊长期目标，而不是要求先画 workflow。

### Risk

如果按钮写成“Start workflow”，整支视频会立即被误读。

## Scene 2 — H1 决定方向，而不是系统计算下一节点（0:15–0:35）

### Viewer sees

Host 给出三个当前可选方向，用户选择：

> 总额守恒；余数确定性分配；键盘可用。先做可交付最小版。

选择被保存为 `Product Direction` artifact。

### User action

点击“Use for next Execution”。

### Agent-Box visible response

Host 创建 E1 draft：“实现第一版并留下可审查 commit”。未来 review/CI/repair 仍未出现。

### Native systems visible

LangGraph detail 小字显示 Thread T、Checkpoint C1、phase implementation、round 1。

### Behind the scenes

Host 更新/读取 external LangGraph state；adapter resolve `ThreadRef + C1`，从 exact checkpoint 生成 context ArtifactRef。Core 不保存 graph/route。

### Why this scene exists

证明 Human decision 会改变下一次 Binding；Workflow continuity 是外部资源，不是 Core progression。

### Risk

候选动作若像自动 router 输出，应标明“Host suggestion；由用户决定”。

## Scene 3 — Freeze & Launch：Binding Hero Moment（0:35–1:05）

### Viewer sees

E1 的“本次执行依据”：

```text
Harness       Codex interactive profile
Workspace     source @ C1
Workflow      LangGraph Thread T / Checkpoint C1
Direction     Product Direction H1
Runtime       Local bwrap policy P2
```

用户点击 `Freeze & Launch`。进度依次变为：resolved exact commit、context snapshot、Binding frozen、worktree prepared、actual HEAD verified、profile/context projected、Harness started。

### User action

只选择已有资源并点击一次；不再复制 prompt、cwd 或 config。

### Agent-Box visible response

每项显示“已冻结/已准备”，同时保留 assurance detail，而不是笼统 `used=true`。

### Native systems visible

Git resolve/worktree，LangGraph API，bwrap argv digest，Codex App Server/thread start；随后打开真实 terminal/TUI。

### Behind the scenes

Binding freeze 在 worktree materialization 前；Dispatch accepted 只有一个 InteractiveCodexExecutionProvider。Dispatch 后 projector 创建 worktree/context/profile，start 前再次验证 actual HEAD。

### Why this scene exists

这是 Agent-Box 与普通 launcher 的分水岭：启动前已有不可变依据，启动后有 actual conformance facts。

### Risk

进度动画如果没有真实日志/ID 支撑会很假；每一项必须来自 adapter event，不能定时播放。

## Scene 4 — Interactive responsibility window 与显式 Finish（1:05–1:35）

### Viewer sees

真实 terminal 打开；Harness 已知道 workspace、责任、C1 context 和 expected outputs。它完成第一轮后，用户直接输入：

> 舍入后的最后一分钱不能凭空消失，再改一下。

Harness 继续工作。Agent-Box 侧边状态仍为 `ACTIVE`。

### User action

多轮交互后点击 Agent-Box 的 `Finish Execution`。

### Agent-Box visible response

状态进入 `Finalizing`，依次固定 output commit/tree/diff、SessionRef、turn/event range、runtime facts、Binding conformance，然后 E1 terminal。

### Native systems visible

真实 Codex terminal、Git commit、App Server events。

### Behind the scenes

一轮回答结束、idle、甚至 CLI process exit 都不自动 terminal。只有显式 Finish 关闭 responsibility window。`READY_TO_SUBMIT/FINALIZING` 先属于 Host/UI，不急着扩 Core projection enum。

### Why this scene exists

证明 Execution 是交互责任窗口，而不是一个 prompt 或后台 job。

### Risk

当前 production Finish 未实现。这一幕在 P0 完成前禁止拍伪 UI。

## Scene 5 — 当前事实产生独立 Review，而非预先 DAG（1:35–2:00）

### Viewer sees

E1 terminal 后页面才出现 “Possible next actions”。用户选择“独立审查当前 commit”，创建 E2。

Binding 显示 exact output commit、read-only reviewer workspace、review criteria、LangGraph same Thread/new observed revision（如 Host 已更新）。

### User action

点击 Freeze & Launch。

### Agent-Box visible response

Codex detached/independent thread 启动，随后展示结构化 finding：`people=0` 没有 regression coverage。

### Native systems visible

Codex App Server 新 thread/turn、read-only bwrap、structured review JSON。

### Behind the scenes

E2 有自己的 Binding、Dispatch、SessionRef/RunRef；不复用 author responsibility。Review artifact digest 成为后续 input。

### Why this scene exists

证明真正独立的责任边界和 typed artifact handoff，而非同一 agent 自评。

### Risk

如果 author/reviewer 都用 Codex，异构 Harness 观感较弱；UI 应强调独立 thread、权限和责任，而不是假装不同厂商。

## Scene 6 — 真实 GitHub Actions：运行完成不等于验证通过（2:00–2:25）

### Viewer sees

用户现在才选择“运行 CI”，创建 E3：

```text
source commit        C3 (exact)
workflow definition  .github/workflows/ci.yml @ C3
test config          preview-ci
```

GitHub Actions detail 显示 run ID、attempt、head_sha。运行 terminal 后出现：

```text
Execution: completed
Verification: FAILED
```

### User action

打开失败摘要。

### Agent-Box visible response

并排显示 expected SHA 与 actual head_sha 一致，失败日志/report artifact 作为 EvidenceRef；若 report 缺失，明确显示“结构化 test report：未产生”。

### Native systems visible

真实 GitHub Actions run 页面和 job failure。

### Behind the scenes

GitHubActionsExecutionProvider 负责 native run lifecycle；verification verdict 是 output artifact/fact，不新增 generic Core verdict enum。

### Why this scene exists

证明不同 responsibility domain，以及 operational outcome 与业务判断分离。

### Risk

当前真实 run 是仓库接口断裂，不是账单工具剧情。正式拍摄必须用 Demo 项目的真实 failure；不能复用本轮 ID 冒充。

## Scene 7 — H2 repair scope + Workflow/Session continuity（2:25–2:55）

### Viewer sees

Human 阅读 review/CI 后决定：

> 只修零人数和金额守恒边界，补 regression；不扩功能。

LangGraph detail 从同一 Thread T 的 C1/C2 更新到 C2。创建 E4：

```text
E1 TERMINAL
E4 ACTIVE
continuation SessionRef: S1
Workflow: same T / new C2
```

### User action

点击 Freeze & Launch；Agent-Box 选择 `resume S1`。

### Agent-Box visible response

新 Binding 同时加入 exact new workspace、review artifact、CI report/log、Human repair scope、C2 snapshot、old SessionRef。

### Native systems visible

LangGraph `update_state`/new checkpoint；Codex `thread/resume`；真实旧对话上下文恢复。

### Behind the scenes

E1 不 reopen。E4 是 new Execution + new Binding + new Dispatch；SessionRef S1 只是 continuation input。Workflow Thread 连续、Checkpoint 更新、Execution identity 仍断开。

### Why this scene exists

同时证明两种 continuity 都不等于 Core Execution continuity。

### Risk

当前 production `resume_execution` 语义相反，是 P0 blocker；修复前不能拍。

## Scene 8 — 三 Harness 由 Binding 自动组装（2:55–3:30）

### Viewer sees

修复后，用户决定做一次联合最终复查，创建 E5：

```text
Harness profile: Codex via ACP
  participant A  correctness reviewer  read-only
  participant B  test analyst          read-only
  participant C  repair analyst        scoped write/analysis
Collaboration     Gateway endpoint G
Workflow          Thread T / Checkpoint C3
Workspace         exact repair commit
Review criteria   Artifact R
Runtime policy    P2
```

点击 Freeze & Launch 后三个 terminal/pane 同时出现；A→B→C→A 的 finding/analysis/ack 在轻量 activity strip 可见。

### User action

用户只选择一次 participant specs 和共享资源，不逐 pane 配 cwd、role、token 或 context。

### Agent-Box visible response

显示 participant role/permission、join handshake、native session IDs、Gateway message range。整体 E5 仍只有一个 active/finish control。

### Native systems visible

三个真实 codex-acp/acpx process、三个 panes、thin Gateway、LangGraph snapshot、bwrap projected profiles。

### Behind the scenes

一个 accepted Dispatch 交给 TeamInteractiveExecutionProvider。Binding 明示三个 ParticipantSpec；provider-owned runtime manifest 管 PID/PTY/acpx record/native session/token projection。Core 不管理三个独立 lifecycle。若 A 需要独立 retry/outcome/SLA，Host 应升级为新 Execution。

### Why this scene exists

让观众直观看到“选择资源→自动得到正确团队执行环境”，并保持单一 accountable responsibility。

### Risk

这是最容易被看成 multi-agent workflow 的一幕。不要显示 delegation graph；activity strip 只显示已发生的 handshake/message，不显示 route。acpx queue-owner 锁必须预检。

## Scene 9 — Final verification 仍不自动完成 Work（3:30–4:00）

### Viewer sees

E5 Finish 后，用户选择创建新的 CI Execution E6。真实 GitHub Actions 以 exact final commit 运行并通过。页面显示 actual SHA、run/attempt、report/log digest。

Work 顶部仍为 `Open`。

### User action

用户打开最终账单工具，实际输入带小数和人数边界，查看 final review、CI 和 unresolved unknowns。

### Agent-Box visible response

提示“所有当前 Executions 已 terminal；Work 仍等待 Human decision”。

### Native systems visible

GitHub Actions green run、浏览器中的小工具。

### Behind the scenes

Provider terminal 不拥有 Work progression/closure。H3 作为 Human decision artifact/event 记录。

### Why this scene exists

把“任务运行成功”与“长期目标完成”明确分开。

### Risk

正式拍摄前必须取得真实 green run 和真实 product interaction，不能用静态 success badge。

## Scene 10 — Human Complete Work；历史不是计划（4:00–4:30）

### Viewer sees

用户点击 `Complete Work`。画面转为 Work History：

```text
Work Completed
6 Executions
3 accountable provider domains
3 Human decisions
1 native session continuation
3 workflow checkpoints bound
1 failed verification
N evidence facts (含 partial/unknown)
```

下方是按时间发生的 timeline，没有 runnable edges。

### User action

无；停留在一句话：

> A stable execution boundary for heterogeneous AI work.

### Agent-Box visible response

历史项可展开查看 frozen Binding、actual facts、EvidenceRef 和 unknown coverage。

### Native systems visible

不再切换原生工具；它们只以已发生的 Ref/Evidence 出现在历史中。

### Behind the scenes

WorkService 接受 Human completion；所有 Execution 仍保持各自 terminal，不重写过去。

### Why this scene exists

把最终印象锁定在责任、上下文和证据，而不是 workflow canvas。

### Risk

若 timeline 用节点箭头绘制，会再次像可执行 DAG；应使用审计时间线。

# Binding Hero Moment

时长 20–25 秒，使用 Scene 3 + Scene 8 的快速呼应：

1. 用户勾选三个 participant、Workspace@commit、LangGraph@checkpoint、Gateway、criteria、runtime policy。
2. 点击一次 `Freeze & Launch`。
3. UI 实时出现 exact resolve、snapshot digest、Binding frozen、HEAD verified、endpoint handshake。
4. 三个 pane 打开，每个 pane 顶部自动显示不同 role/permission，但 cwd、workflow snapshot 和 collaboration endpoint 已就绪。

画外音只说：

> “不是给三个 Agent 重复配置。你选择这次执行需要的资源，Agent-Box 把它们冻结并投影到同一个责任窗口。”

# Interactive Execution Hero Moment

真实 Codex terminal 第一轮完成后，用户继续输入“最后一分钱不能消失，再改一下”。Harness 继续修改，Agent-Box 一直显示 E1 ACTIVE。用户最后点击 `Finish Execution`，而不是等待 idle/process exit；Finalizing 固定 commit/session/events 后 E1 terminal。

# Workflow Hero Moment

只显示 detail card：

```text
External workflow: LangGraph
Thread T
E1 used Checkpoint C1
Host decision -> LangGraph update
E4 used Checkpoint C2
E1 TERMINAL / E4 ACTIVE
```

旁白强调 LangGraph owns state/checkpoint/routing；Agent-Box 只绑定 exact revision/context。

# Multi-Harness Hero Moment

使用本轮已验证的三 participant 结构。三个 pane 必须有真实 native session ID 和真实 Gateway tool call。不要用 “team-provider running…” 代替视觉存在；不要声称 Gateway 证明了 Harness binary identity。

# Evidence Hero Moment

并排显示：

| Binding expected | Actual evidence |
|---|---|
| Workspace commit C | actual HEAD=C；Git verified；complete |
| LangGraph checkpoint C2 | exact C2 retrieved；snapshot digest；complete for selected fields |
| `requirements.md` projected | mount observed；模型是否读取：unknown |
| bwrap policy P2 | argv/mount/env observed；host root isolation：partial |
| Collaboration participant A=Codex | token handshake observed；binary identity：unverifiable |
| CI source C | GitHub `head_sha=C`；complete |

必须让 `unknown/partial/unverifiable` 至少出现一次。核心文案：**可见不等于已消费；Provider 自报不等于证明没有使用未声明资源。**

# Session Continuation Hero Moment

屏幕固定显示 `E1 TERMINAL` 和 `E4 ACTIVE`，两个 Execution 都展开 SessionRef：same `S1`。E4 Binding 额外拥有 new workspace/review/CI/Human scope/C2。按钮叫“Continue native session in new Execution”，绝不能叫“Resume E1”。

# CI Hero Moment

显示真实 GitHub Actions run：exact execution ref、run ID、attempt、head_sha。第一次：Execution completed + Verification failed。Human 选择 repair scope。第二次 new CI Execution：new exact commit + new run，真实 green。Rerun attempt 只用于同一 CI Execution 的 native recovery，不替代 repair 的新 Execution。

# Work Completion Hero Moment

最后 CI/reviewer terminal 后，Work 仍 Open。Human 查看 product/evidence/unknowns，再点击 Complete Work。这个 5 秒镜头是避免观众把 Agent-Box 误解为 scheduler 的关键。

# Provider role confirmation

| 角色 | Preview 实例 | Core 是否拥有其内部 ontology |
|---|---|---|
| Accountable ExecutionProvider | InteractiveCodex、CodexReview、GitHubActions、TeamInteractive | 否；Core 只知 accepted Dispatch、native correlation、observation/outcome |
| Resource Authority | Git、LangGraph、Gateway、GitHub Actions | 否；只保存 Ref 和 bounded facts/evidence |
| Provisioner/Projector | worktree、bwrap、profile/context projector、optional MCP | 否；manifest 属 provider/plugin |
| Evidence Adapter | Git observer、App Server events、ACP/Gateway collector、LangGraph adapter、Actions collector | Core 只保存统一 evidence envelope，不吸收 native schema |
| Host/Workflow integration | Human/Host + LangGraph adapter | 不进入 Work Core progression ontology |

# Binding slot mapping

| Slot | Frozen value | Projected form | Actual check |
|---|---|---|---|
| `source.revision` | Git commit Ref + tree | worktree | actual HEAD/tree |
| `workspace.policy` | writer/reviewer intent | rw/ro bind | write probe + mount manifest |
| `workflow.instance` | ThreadRef | metadata/context header | native thread query |
| `workflow.revision` | checkpoint native ID | snapshot source header | exact checkpoint get |
| `workflow.context` | ArtifactRef digest | `context.md` | file/mount digest；consumption unknown |
| `harness.profile` | provider/profile descriptor Ref | projected config directory | binary/version/start event |
| `execution.participants` | three ArtifactRef participant specs | provider runtime manifest | process/session/role facts |
| `collaboration.endpoint` | Gateway Ref/version | token + optional MCP tools | handshake/event range |
| `review.criteria` | ArtifactRef | prompt/context file/outputSchema | visibility complete；consumption partial |
| `runtime.policy` | policy ArtifactRef/version | bwrap argv/mount/env | argv/process/mount observations |
| `continuation.session` | previous SessionRef | thread/resume/session resume | returned same native session |
| `ci.workflow` | path + source revision + config artifact | workflow_dispatch | run path/head_sha/workflow digest |

# Ref mapping

| Ref | Native ID |
|---|---|
| Git source `ArtifactRef`/`WorkspaceRef` | commit SHA + tree SHA；worktree path 是 materialization metadata，不是 source identity |
| Codex `SessionRef` | `thread.id`；`thread.sessionId` 为 bounded metadata |
| Codex `RunRef` | `turn.id` |
| Claude `SessionRef` | explicit/session hook UUID |
| Claude `RunRef` | 当前不可靠；不得伪造 |
| ACP client record Ref | acpx record ID；不是 Harness SessionRef |
| ACP Harness `SessionRef` | `session/new/resume` 返回的 native session ID |
| CollaborationRef | Gateway endpoint ID + execution ID + version |
| WorkflowInstanceRef | LangGraph `thread_id` |
| WorkflowRevisionRef | exact `checkpoint_id`；用 existing Ref + metadata 或 ArtifactRef 表达，不需新 Core entity |
| WorkflowRunRef | LangGraph `run_id`，只在相关 run 存在时绑定 |
| Workflow context `ArtifactRef` | canonical snapshot SHA-256 |
| CI `RunRef` | GitHub `run_id`；`run_attempt` metadata |
| EvidenceRef | provider locator + content/event/log digest |

# Evidence mapping

每条 Evidence 至少保存：authority、method、coverage、timestamp、EvidenceRef、related Binding slot。Preview 映射：

- Git：authority=local Git；method=`rev-parse/show/status/diff`；coverage source HEAD/tree complete。
- Runtime：authority=Agent-Box projector observer；method=argv/PID/mount/env observation；coverage partial。
- Codex：authority=App Server；method=JSON-RPC stream；coverage native thread/turn/events complete，resource non-use unverifiable。
- Claude：authority=hooks/transcript；method=native hook/transcript；coverage session identity complete，model work absent。
- ACP：authority=agent/client handshake stream；coverage session/event complete for captured range。
- Gateway：authority=Gateway；coverage token identity/message range complete，binary identity unverifiable。
- LangGraph：authority=Agent Server；method=exact checkpoint get；coverage selected snapshot fields complete，latest-after-restart unknown。
- GitHub Actions：authority=GitHub；method=REST/run logs；coverage run/head_sha/jobs complete，structured report absent。

# Demo weaknesses

1. **最弱的 Provider：Claude。** 目前只能证明 session shell，不可证明模型完成工作，应从关键路径删除。
2. **最弱的 Ref：Claude RunRef。** 没有可靠 provider-native invocation ID；不要用随机 UUID 包装成 RunRef。
3. **最弱的 evidence：Gateway Harness identity。** participant token 只证明 token 使用者，不证明 binary。
4. **最弱的 Binding consumption：context/criteria 文件。** 可证明 materialized/visible，不能证明模型读过。
5. **最弱的 runtime claim：bwrap isolation。** 当前 root rw、shared network；只能说 projection + partial isolation。
6. **最弱的 recovery：LangGraph dev latest/history。** Exact checkpoint 可读，不代表 current pointer durable。
7. **仍需手工的资源：Harness auth。** Codex/Claude 账号认证不能由 Execution 临时伪造；应预先注册 profile authority。
8. **自动化不可信点：acpx queue owner。** 不做 health/close/preflight 会出现 143。
9. **最像 workflow engine 的镜头：Workflow checkpoint change。** 必须由 Human/Host 显式触发，且只在 detail card 展示。
10. **最像普通 launcher 的镜头：三个 terminal 打开。** 必须紧接 frozen Binding 和 actual evidence，否则只是 pane launcher。
11. **UX 最复杂：assurance levels。** 普通页面只显示“已冻结/已验证/部分/无法确认”，详细 method/coverage 放 drawer。
12. **视频最拖节奏：native installs/CI waiting。** 安装不入正片；CI 用真实 run 的 live-to-complete 压缩剪辑，但不伪造状态。
13. **应从 Preview 删除：cloud sandbox、Temporal/Prefect、LangGraph Studio、Human Task Provider、OTel backend。** 它们不增强 Binding 核心证明。

# Implementation Gap Ledger

## P0 — 不完成就不能真实拍摄

| Gap | 为什么必须 | Owner | 最小实现 | 不该扩展成什么 | 验收条件 |
|---|---|---|---|---|---|
| Production Binding | Hero Moment 本体 | Core | binding revision + slots + canonical digest | workflow/input ontology | accepted Dispatch 只能引用 frozen revision；freeze 后不可改 |
| Binding resolve/freeze | exact resource pin | Core + adapters | authority resolve phase、freeze transaction | scheduler | mutable selector 被 exact Ref 替换并持久化 |
| Slot assurance | 区分 requested/projected/actual | Core evidence envelope | per-slot facts + coverage | generic policy engine | UI 能显示 complete/partial/unknown/unverifiable |
| Evidence/ResourceFact persistence | Finish 后保留 actual facts | Core | evidence table/ref/authority/method/coverage/time | tracing backend | restart 后仍能按 Execution 查询 |
| Explicit Finish/Submit | interactive window 语义 | Provider + Host/UI | ACTIVE→finalizing orchestration→terminal | 自动业务 verdict | idle/process exit 不 terminal；重复 finish 幂等 |
| Interactive attach | 用户必须看到并 steer | Provider + UI | PTY/App Server remote TUI handle | terminal platform | detach/reattach 后同一 SessionRef，Execution 仍 ACTIVE |
| Continuation semantics | 防止 reopen E1 | Core service + Host | create Enew with previous SessionRef slot | generic retry engine | Eold terminal；Enew active；same native session |
| Fix/remove current `resume_execution` behavior | 当前与原则冲突 | Core | 改 CLI/service 为“new execution from session ref” | resume lifecycle state | 测试禁止 terminal Execution reopen |
| GitAuthority production adapter | exact source/evidence | Plugin | resolve commit/tree、verify HEAD、snapshot output | remote workspace platform | spike 时序成为 automated test |
| Codex interactive/review adapters | 两个责任边界 | Plugin | App Server client、thread/turn events、schema output | agent Core entity | fresh/resume/review/recovery E2E test |
| LangGraph adapter | external workflow authority | Plugin | resolve exact checkpoint、snapshot/digest、compare latest | graph mirror | T+C1 与 T+C2 进入两个 Binding；Core 无 node/edge |
| GitHub Actions provider | 非 Harness Execution | Plugin | exact ref dispatch、observe run/attempt/head_sha/log | CI scheduler | actual SHA mismatch 会阻断/标 divergence |
| Collaboration Gateway plugin | collaboration authority | Plugin | endpoint/register/send/read/events/digest/cleanup | supervisor/memory/workflow | 三 participant chain 可重跑并生成 bounded evidence |
| TeamInteractive Provider | aggregate accepted Dispatch | Plugin | participant specs→runtime manifest→3 sessions/panes→aggregate finish | opaque CompositeProvider 或 participant Core entity | Binding 明示三 spec；Core 只有一个 provider lifecycle |
| Current committed CI break | 必须取得 green final run | Product code | restore/stabilize `LaunchPlan` API 或调用方 | 与 Demo 无关重构 | local + GitHub backend/frontend green |

## P1 — 明显提升可信度与拍摄稳定性

| Gap | 为什么必须 | Owner | 最小实现 | 不该扩展成什么 | 验收条件 |
|---|---|---|---|---|---|
| CI structured report | logs 不够友好 | workflow/plugin | pytest JUnit + upload-artifact + digest | generic artifact platform | failed/passed run 均有 report Ref |
| LangGraph server lifecycle | 防止拍摄中断 | Host/plugin | health/preflight、single-lifetime guard、exact checkpoint cache | Core checkpoint store | restart anomaly 明确阻断 latest update |
| acpx queue-owner preflight | 已发生真实 143 | Team plugin | ensure/health/close/TTL/unique names | session supervisor | stale lock 自动诊断，不静默丢 participant |
| Runtime manifest | 复现 projection | Provider | binary/version/argv digest/mount/env-name policy/PID | sandbox platform | Finish 产生 partial Runtime facts |
| Binding/Audit UI | 普通人理解 assurance | UI | summary card + evidence drawer | observability console | 15 秒读懂 expected vs actual |
| Work History UI | 结尾不是 DAG | UI | immutable chronological timeline | workflow canvas | 只展示已经发生的 event |
| Human decision artifact | H1/H2/H3 provenance | Host | bounded markdown/JSON artifact + actor/time | Human Task Provider | 后续 Binding 可引用 decision Ref |
| Visible three-pane launcher | Multi Hero Moment | Host/UI | Windows Terminal/tmux/PTY layout | terminal emulator product | 三 native sessions 可见且可聚合 finish |
| Claude endpoint remediation spike | 恢复异构 Harness | Plugin/ops | valid auth endpoint + repeat full test | Core vendor logic | model turn/tool event/finish/new Execution resume E2E |

## P2 — 可以推迟

| Gap | 为什么 | Owner | 最小实现 | 不该扩展成什么 | 验收条件 |
|---|---|---|---|---|---|
| Artifact attestation | 增强最终 provenance | Plugin | in-toto/SLSA statement over final digests | supply-chain platform | verifier 可独立验证 statement |
| Durable LangGraph deployment | Preview 后 recovery | Plugin/ops | Postgres-backed Agent Server | Core workflow DB | restart 后 latest/history 与 exact checkpoint 一致 |
| MCP projection | 统一 Harness tool exposure | Plugin | expose Gateway send/read/list only | collaboration authority | MCP down 只影响 projection，Gateway identity 保留 |
| Stronger bwrap policy | 降低 partial coverage | Plugin | ro root、network policy、new-session/seccomp where compatible | cloud sandbox | policy tests 与 evidence manifest 一致 |
| Claude Run correlation improvement | 精细事件范围 | Plugin | provider hook/message/tool IDs bounded mapping | invented native RunRef | 有官方/native ID 才升级 assurance |

# What can be mocked or thin

可以 thin adapter：LangGraph field selection/rendering、Gateway HTTP API、MCP exposure、Human suggestion UI、participant role markdown、review criteria artifact、History presentation。Thin 的含义是 adapter 代码小，但 native IDs 和 facts 必须真实。

可以临时 mock：Demo topic 的 Host “possible next actions”推荐文案、非关键视觉 loading skeleton、最终 in-toto attestation。Mock 必须被标成 Host/UI suggestion，不能生成虚假 provider event。

可以删除且不影响核心证明：Claude、MCP、artifact attestation、第三个 participant（3 分钟版）、LangGraph Studio、cloud sandbox。

# What must be real

绝对不能 mock：

- Git exact commit/tree/actual HEAD/output commit；
- frozen Binding revision/digest；
- accepted Dispatch 与唯一 accountable provider；
- interactive native session/turn 和真实 terminal；
- explicit Finish 触发的 output/evidence collection；
- continuation 使用同一 native SessionRef、但 new Core Execution；
- LangGraph native Thread/Checkpoint 查询与 snapshot digest；
- GitHub Actions run_id/run_attempt/head_sha/log/report；
- Multi-Harness native processes/sessions 和 Gateway handshake/message event；
- Evidence 中的 unknown/partial/unverifiable。

# Preview Go / No-Go Verdict

## C. STACK NEEDS REVISION

这不是“Demo concept 不可行”。真实 Provider 已经证明底层边界可行；No-Go 来自两件具体事实：Claude 不能完成模型交互，以及生产 Binding/Finish/Evidence/Team adapters 尚不存在。把 author 主路径切到 Codex、限制 LangGraph 为 single-lifetime local runtime，并完成 P0 后，可升级为 `B. READY WITH LIMITED GAPS`。

1. **当前真实 Provider Stack 是否足以证明 Agent-Box 的独立价值？** 足以。Git、Harness、Workflow、CI、Runtime、Collaboration 六个 authority domain 均产生了真实 Ref/fact；但 Agent-Box production composition 尚未闭合。
2. **三个最关键镜头？** Binding Freeze & Launch；Interactive multi-turn + explicit Finish；expected Binding vs actual evidence（包含 unknown）。三 Harness是 5–6 分钟版第四关键。
3. **不可替代地必须真实的 Provider？** Git/worktree、至少一个真实 interactive Harness、LangGraph native checkpoint、GitHub Actions。要保留 Multi Hero 时，ACP/acpx + Gateway 也必须真实。
4. **哪些可以 thin adapter？** LangGraph snapshot、Gateway、GitHub REST collector、Git observer、MCP projector、Human decision artifact。
5. **哪些绝对不能 mock？** exact refs、Binding freeze、native sessions/runs、actual HEAD、GitHub head_sha、explicit Finish evidence、continuation identity、Gateway event range。
6. **哪些可以删掉？** Claude（当前）、MCP、cloud sandbox、artifact attestation、LangGraph Studio、Human Task Provider；3 分钟版还可删 Multi-Harness scene。
7. **最大技术风险？** production Binding/Finish/Evidence 与 interactive provider lifecycle 未集成；其次是 acpx queue owner 和 LangGraph dev restart behavior。
8. **最大产品叙事风险？** 三 Harness + LangGraph 容易让观众误以为是 multi-agent workflow engine；必须坚持每次只展示当前下一次 Execution 和历史 timeline。
9. **只有 3 分钟保留什么？** Scene 1（5 秒）、H1（10 秒）、Binding Launch（30 秒）、interactive+Finish（40 秒）、independent review（25 秒）、CI fail + Human scope（30 秒）、new Execution continuation + C2（30 秒）、CI green + Human Complete（20 秒）、History/Evidence（10 秒）。删三 Harness或作为 8 秒 montage。
10. **路人一句话会怎么描述？** “Agent-Box 把真实 AI、代码、Workflow 和 CI 组装进一次有冻结依据、能交互、还能留下证据的执行。”

## Final recommendation

停止新增 Provider。以 Codex、Git/worktree、bwrap、LangGraph local Agent Server、GitHub Actions 为最小真实 Stack；三 Harness Gateway 作为 5–6 分钟版的强展示插件；Claude 在 endpoint E2E 修复前不进入关键路径。

下一阶段只做 P0 production integration，并以本目录 spike evidence 作为验收 oracle。任何实现若需要新增 WorkController、ProgressionAuthority、WorkflowStep/Node/Edge、Scheduler、Agent/Participant/Harness Core entity、Message ontology、generic retry engine 或 tracing backend，先证明现有 Work/Execution/Binding/Dispatch/Ref/Provider/Evidence 无法表达；当前没有这种证据。

最终产品边界保持：

> Workflow owns workflow state. Host/Human decides what happens next. Agent-Box binds identity, context and evidence into one accountable Execution.
