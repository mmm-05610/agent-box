# Agent-Box Work Core v0.1 原型开发与验证全过程汇报
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

## 1. 汇报范围与记录口径

本文记录 Agent-Box Work Core v0.1 从工程基线确认、方案落位、原型编码、单元测试、真实 ACP 环境调试、正式跨 Provider E2E、结果固化到 cleanup 的全过程。

记录以以下材料为准：

- 当前实验分支中的实际代码与 migration；
- `~/.agent-box/agent-box.db` 中两个真实 Work 的持久化记录；
- Work Artifact 目录中保存的 Plan、Implementation Report、Review Report、Handoff 和 Git Patch；
- 实际执行时返回的 ACP runtime、native session ID 和 diagnostic log ref；
- 本轮执行过的 pytest、Git 和 CLI 命令输出；
- 调试过程中出现的原始错误信息及修复后的复测结果。

本文不把原型描述为通用 Work 平台。报告中的实现范围严格限定为固定的 `Plan → Execute → Review` 闭环、Role/Profile replacement、provider-neutral continuation、Git worktree、SQLite correlation 和 CLI 控制面。

## 2. 仓库基线与实验分支

### 2.1 主线基线

实验分支基于以下主线提交：

```text
commit: 986b221bc635aed535709b9ef1b40808dcc5c9e4
short:  986b221
title:  chore(main): release 1.9.0 (#62)
date:   2026-08-16T19:47:20+08:00
```

核对结果：

```text
main                                  986b221bc635aed535709b9ef1b40808dcc5c9e4
merge-base(experiment, main)          986b221bc635aed535709b9ef1b40808dcc5c9e4
experiment/work-core-v0.1 HEAD        986b221bc635aed535709b9ef1b40808dcc5c9e4
```

### 2.2 实验分支

当前工作分支：

```text
experiment/work-core-v0.1
```

本轮执行环境对 `.git` 只有读权限，同时工作树内还存在用户已有的其他修改。因此 Work Core 改动保持在实验分支工作树中，没有由本轮代理创建 Git commit，也没有对已有修改执行 reset、checkout 或覆盖。

### 2.3 与既有系统的边界

原型没有迁移或替换以下既有能力：

- Profile 的创建、元数据、provider、prompt、skills、MCP 和 harness 配置；
- Project 选择与既有 project/launch 组合能力；
- Claude、Codex、Hermes、OpenCode 的旧 launch 入口；
- 旧 session 表和旧 session/launch 查询路径；
- 既有 bubblewrap launch plan；
- 既有 CLI/REPL 和 GUI 数据路径。

Work Core 通过新的独立包、repository/service 边界和 CLI command set 接入。ACP Attempt 的进程命令由 Work Core 生成，但它仍调用既有 `launch.build_launch_plan()`，把 ACP bridge 放入既有 sandbox/挂载/环境投影中运行。

## 3. 原型目标与验收路径

原型唯一核心验收路径被落实为：

```text
Claude Planner
→ Codex Executor
→ Claude Reviewer
→ Reviewer 返回 needs_replan
→ Planner Profile 从 Claude 替换为 Hermes + DeepSeek
→ Hermes Planner 不加载旧 Claude native session
→ Hermes 只读取 Effective Work State、Handoff、Decision、Git 和 Artifact refs
→ Codex Executor 修复 Review finding
→ Claude Reviewer 返回 approved
→ Work complete
→ Git patch Artifact 持久化
→ Git worktree cleanup
```

原型未实现：

- 通用 workflow DSL 或 workflow engine；
- LangGraph、Temporal、Prefect 或 Kandev runtime；
- 通用 Task domain；
- transcript migration；
- native conversation 的跨 harness 恢复；
- mid-tool-call hot swap；
- universal event schema；
- object store；
- distributed scheduler；
- OTel Collector；
- 新 sandbox runtime；
- GUI 驱动的 E2E。

## 4. Core Domain 落位

### 4.1 独立持久化对象

最终实现五个独立 Core domain object：

| 对象 | 持久化位置 | 用途 |
|---|---|---|
| `Work` | `works` | Work identity、objective、acceptance criteria、ProjectRef、workflow cursor、Role bindings、WorkspaceRef、final result、cleanup state |
| `Attempt` | `work_attempts` | 某个逻辑 Role 在某次 binding revision 下的一次实际执行，以及 resolution、native session ref、输入/输出 Handoff、outcome 和错误 |
| `Decision` | `work_decisions` | Review finding、Profile replacement 等必须跨 Provider 保留的判断 |
| `Handoff` | `work_handoffs` | 从一个 Attempt 到目标 Role 的 continuation correlation，并引用 durable handoff Artifact |
| `ArtifactRef` | `work_artifacts` | Plan、Implementation Report、Review Report、Handoff、Git Patch 的 locator、digest 和 provenance index |

### 4.2 嵌入值对象

以下对象没有单独建表：

- `RoleBinding` 嵌入 `Work.role_bindings`；
- `EffectiveResolution` 嵌入 `Attempt.effective_resolution`。

`RoleBinding` 保存：

- `role_key`；
- `profile_ref`；
- `revision`；
- `changed_at`；
- `changed_by`；
- `change_reason`。

`EffectiveResolution` 保存：

- `profile_ref` 和 `profile_digest`；
- `harness` 和协商后的 `harness_version`；
- `provider_ref` 和协商后的 `model`；
- `transport`、`adapter_version`；
- `workspace_ref`；
- `environment_refs`；
- `permission_intent`；
- `capability_report`；
- `launch_plan_digest`；
- 最小 `native_overrides`，当前主要是 ACP command。

没有把整个 Profile config 复制到 Work DB。Profile 仍是权威配置来源，Attempt 只保留执行时所需的不可变摘要和引用。

### 4.3 Role、Profile、Harness、Session 的分离

原型中的关系为：

```text
Role logical identity
→ RoleBinding(profile_ref, revision)
→ Profile
→ EffectiveResolution
→ ACP/native harness process
→ NativeSessionRef
```

正式 E2E 中，逻辑 Role `planner` 始终没有变化。发生变化的是：

```text
planner binding revision 1 → profile learn       → harness claude
planner binding revision 2 → profile hermes-main → harness hermes
```

因此 Role 不等于 Profile，Role 不等于 Harness，Role 也不等于 native session。

## 5. SQLite Migration 与 Repository

### 5.1 Migration

新增 migration：

```text
src/agent_box/migrations/003_work_core.sql
```

Migration 使用既有 Agent-Box SQLite 和 migration 体系，新增：

- `works`；
- `work_attempts`；
- `work_decisions`；
- `work_artifacts`；
- `work_handoffs`；
- 按 Work、Role、binding revision、Artifact kind 建立的小型索引。

未修改旧 session 表，也未把 native transcript、Git object 或 Artifact body 存入 SQLite。

### 5.2 Repository 事务边界

`WorkRepository` 只负责数据访问，不执行 provider 或文件系统副作用。

关键写入路径：

- `create()`：写 Work identity、ProjectRef、bindings 和 WorkspaceRef；
- `add_attempt()`：在启动 native session 前先写 pending Attempt 和 EffectiveResolution；
- `set_attempt_resolution()`：ACP initialize/new session 完成后，在 Attempt 仍为 pending 时补入协商后的 model 和 harness version；
- `start_attempt()`：保存 NativeSessionRef 并进入 active；
- `complete_attempt_and_advance()`：在一个 SQLite transaction 中同时完成 Attempt 和推进 Work phase/status；
- `update_binding()`：更新嵌入的 RoleBinding；
- `add_decision()`、`add_artifact()`、`add_handoff()`、`consume_handoff()`：保存 continuation 与 provenance；
- `set_final_result()`：写最终 workspace snapshot、最终 Review Artifact 和 Git Patch Artifact ref；
- `set_cleanup_state()`：记录 cleanup 是否完成。

## 6. 固定 Workflow 状态机

实现文件：

```text
src/agent_box/work/workflow.py
```

固定 transition：

| 当前 phase | outcome | 下一 phase | Work status | 下一 Role |
|---|---|---|---|---|
| `plan` | `planned` | `execute` | `running` | `executor` |
| `execute` | `implemented` | `review` | `running` | `reviewer` |
| `review` | `approved` | `complete` | `completed` | 无 |
| `review` | `needs_replan` | `plan` | `running` | `planner` |
| `review` | `needs_fix` | `execute` | `running` | `executor` |
| 任意可运行 phase | `blocked` | 原 phase | `waiting` | 原 Role |
| 任意可运行 phase | `failed` | 原 phase | `failed` | 无 |

每个 phase 的允许 outcome 由 Work Core 追加到 prompt 末尾：

```text
AGENT_BOX_OUTCOME: <value>
```

ACP provider 只接受响应最后一行为该 marker。缺少 marker、marker 为空或 outcome 不属于当前 phase 时，Attempt 不会被当作成功 transition。

## 7. Provider Interfaces 与实现

### 7.1 SessionProvider

接口包含：

- `probe(harness)`；
- `create_session(resolution)`；
- `prompt(native_session_ref, prompt)`；
- `cancel(native_session_ref)`；
- `close(native_session_ref)`。

v0.1 实现为 `AcpProcessSessionProvider`。

### 7.2 WorkspaceProvider

接口包含：

- `inspect_project(path)`；
- `create(work_id, project_ref)`；
- `snapshot(workspace_ref)`；
- `export_patch(workspace_ref)`；
- `cleanup(workspace_ref, discard_changes=False)`。

v0.1 实现为 `GitWorktreeProvider`。

### 7.3 ArtifactProvider

接口包含：

- `write_text(...)`；
- `read_text(artifact_ref)`。

v0.1 实现为 `FilesystemArtifactProvider`。Artifact body 位于文件系统，SQLite 只保存 ref、digest 和 metadata。

### 7.4 WorkStateProjector

接口负责把 Core record 与 provider 状态组合成 Effective Work State。v0.1 实现为 `EffectiveWorkStateProjector`。

## 8. Profile Resolution 与 Capability Closure

实现文件：

```text
src/agent_box/work/resolution.py
```

### 8.1 Resolution 输入

Resolution 从以下权威来源读取：

- Work 当前 `RoleBinding`；
- 既有 Profile metadata 和 harness-specific profile directory；
- 既有 agent type library；
- SessionProvider probe；
- Work 的 WorkspaceRef 和 ProjectRef。

### 8.2 Profile digest

Profile digest 由 metadata 和 harness-specific profile directory 内容计算。常见 secret 文件名和包含 `secret` 的文件名不读取内容，只纳入 redacted size，避免把 secret 内容带入 digest 计算路径或日志。

### 8.3 最小 capability vocabulary

Session probe 与现有 launch/workspace 投影报告以下能力：

- `headless`；
- `session_resume`；
- `workspace_read`；
- `workspace_write`；
- `terminal`；
- `mcp`；
- `background`；
- `user_approval`；
- `network_control`；
- `sandbox_enforcement`。

当前 Role requirement：

| Role | Required capabilities |
|---|---|
| Planner | `headless`, `workspace_read` |
| Executor | `headless`, `workspace_read`, `workspace_write`, `terminal` |
| Reviewer | `headless`, `workspace_read`, `terminal` |

Capability resolution 规则：

- 值为 `True`：进入 `effective`；
- 字符串以 `degraded` 开头：同时进入 `effective` 和 `degraded`；
- `False`、缺失或其他值：进入 `unsupported`；
- `unsupported` 非空：Profile resolution fail closed，不创建 native session。

真实运行中 `sandbox_enforcement` 被报告为：

```text
degraded: broad rw root/share-net
```

`network_control` 为 `false`，`session_resume` 为 `false`。

## 9. ACP-first Session Execution

实现文件：

```text
src/agent_box/work/acp.py
```

### 9.1 ACP command mapping

默认映射：

| Harness | ACP command |
|---|---|
| Claude | `claude-agent-acp` |
| Codex | `codex-acp` |
| Hermes | `hermes acp` |
| OpenCode | `opencode acp` |

每个 command 可以通过 `AGENT_BOX_ACP_<HARNESS>_COMMAND` 覆盖。

### 9.2 复用现有 launch/bwrap

ACP provider 不直接在宿主机裸启 bridge。它先调用：

```python
launch.build_launch_plan(profile_ref, cwd=workspace_path)
```

随后在既有 launch plan 的 `--chdir` 边界内插入 ACP command。因此 Profile mounts、environment、bwrap 权限和 workspace 映射继续由现有 Agent-Box launch 路径拥有。

### 9.3 ACP lifecycle

每个 Attempt：

1. 创建独立 event loop thread；
2. 以 stdio 启动 ACP bridge；
3. `initialize()`；
4. `new_session(cwd=worktree, mcp_servers=[])`；
5. 从 ACP response 快照 protocol version、harness name、harness version、current model；
6. 保存 NativeSessionRef；
7. 发送 provider-neutral Work prompt；
8. 收集 `AgentMessageChunk`；
9. 解析末尾 outcome marker；
10. 关闭 ACP connection、stdin 和子进程；
11. 停止 event loop thread。

native session 被标记为：

```json
{
  "provider": "acp",
  "portable": false
}
```

Work Core 从未把它当作跨 Provider continuation state。

### 9.4 Permission

ACP permission request 通过 CLI callback 呈现选项。真实 E2E 中用户选择 `2 / Allow Once`。未配置 handler 或无效选择时返回 deny，不自动扩大权限。

### 9.5 Startup diagnostics 与关闭修复

早期 Codex ACP 启动失败时只返回 `Internal error`，同时出现 event loop 已关闭、ACP sender/dispatcher task 被销毁但仍 pending 的异常。

为此补充：

- stderr 持续读取；
- 启动失败时关闭 ACP connection；
- terminate/kill 子进程；
- 等待并消费 stderr task；
- 输出 stderr tail；
- Codex 设置 `APP_SERVER_LOGS`；
- NativeSessionRef 保存 `diagnostic_log_ref`；
- close 时等待 thread 结束，超时则报错。

## 10. Git Worktree 与 Artifact

### 10.1 Worktree 创建

`GitWorktreeProvider.inspect_project()` 获取：

- repository root；
- selected path；
- `HEAD` base SHA；
- dirty state。

v0.1 要求 Project base 已提交。dirty source repository 会被拒绝。

创建格式：

```text
path:   ~/.agent-box/workspaces/<work-id>
branch: agent-box/<work-id>
base:   ProjectRef.base_sha
```

### 10.2 Snapshot

每次 Effective Work State projection 动态读取：

- `head_sha`；
- branch；
- dirty；
- `git status --porcelain=v1`；
- `git diff --stat HEAD`。

SQLite 不复制 Git object 或完整 diff。

### 10.3 Artifact kinds

原型实际产生：

- `plan`；
- `implementation-report`；
- `review-report`；
- `handoff`；
- `git-patch`。

所有文本 Artifact 保存 SHA-256 digest。`read_text()` 每次重新计算 digest，不匹配则拒绝读取。

### 10.4 Git patch 与 cleanup

正式 E2E 首次完成后暴露出 cleanup 边界问题：实现结果仍是 dirty worktree，旧 cleanup 正确地拒绝直接删除，但这意味着闭环没有完成 cleanup。

修复后的行为：

1. 导出 tracked `git diff --binary --full-index HEAD`；
2. 枚举未跟踪且未被 `.gitignore` 排除的文件；
3. 对新增项目文件生成 `git diff --no-index --binary`；
4. 排除 Agent-Box 已知 runtime injection path；
5. 写入 `git-patch` Artifact；
6. 把 base SHA、head SHA、included untracked 和 excluded runtime paths 写入 Artifact metadata；
7. cleanup 前从 ArtifactProvider 重新读取 patch 并验证 digest；
8. 只有验证成功后才对受管 Work path 执行强制 worktree remove；
9. 保留 Work branch ref 和全部 Core/Artifact provenance。

受管路径还会根据 `managed_root / created_by_work` 重新计算并核对，避免使用伪造 WorkspaceRef 清理其他目录。

## 11. Effective Work State

Effective Work State 不是新的持久化实体，而是动态 projection。

### 11.1 Core-owned 内容

- Work ID、objective、acceptance criteria；
- workflow ref/version/phase/status；
- 当前 Role bindings；
- 已完成 Attempt 摘要；
- Decision ledger；
- Review findings；
- open questions；
- pending role/phase；
- Artifact index；
- Handoff index和消费关系；
- Attempt provenance；
- 当前 runtime constraints 引用。

### 11.2 Provider-owned 动态内容

- Git head、dirty、status、diff stat：来自 WorkspaceProvider；
- Profile、provider、harness、capabilities：来自 resolution/probe；
- Artifact body：来自 ArtifactProvider；
- native session runtime identity：来自 ACP initialize/new session response。

### 11.3 明确不读取的内容

- 旧 Claude transcript；
- Claude conversation ID 的恢复内容；
- Codex transcript；
- Hermes transcript；
- 任何 provider-native message history。

给每个 Role 的 prompt 开头明确写入：

```text
Treat the following provider-neutral state as authoritative.
Do not assume access to any prior native session.
```

## 12. Handoff Continuation

每个 Handoff 同时存在两部分：

- SQLite `Handoff` record：correlation、to role、reason、producer/consumer、Artifact ref；
- Markdown Artifact：完整 provider-neutral Work State projection 和 continuation rule。

普通 phase transition 会生成 Handoff。Profile replacement 还会额外生成 replacement Handoff。

替换流程曾修复一个顺序问题：如果先基于数据库中的旧 binding 渲染 Handoff，再写新 binding，新 Planner 会在 Handoff 里看到旧 Profile。当前实现先在内存中构造包含新 binding 的 projected Work，再渲染 replacement Handoff，然后提交 binding 和 `profile_replacement` Decision。对应测试验证 Handoff 中 Planner 已指向新 Profile，同时 provenance 仍保留旧 Claude Planner Attempt。

## 13. CLI 控制面

新增命令集：

```text
work create
work list
work show
work state
work step
work run
work replace
work stop
work cleanup
```

命令集在普通 REPL 和 `agent-box exec` 路径注册，没有替换原有 CoreCommands。

真实验证以 `work step` 为主，逐阶段观察 Attempt、permission、Handoff 和 transition，没有依赖 GUI。

## 14. 测试夹具与确定性 Reviewer

### 14.1 Git fixture

真实 E2E 项目：

```text
e2e/work-core-v0.1-fixture
```

base SHA：

```text
500449e303a731f9c58c700345f8099a5d64b04f
```

初始 `capability_resolver.py` 故意只把值为 `True` 的 required capability 视为 effective，把 degraded capability 错误归入 unsupported，并始终返回空 degraded map。

初始测试期望：

- `headless=True` → effective；
- `terminal=False` → unsupported；
- `sandbox_enforcement="degraded: ..."` → effective 且记录 degraded。

因此基线测试必然失败，Executor 有真实缺陷可修复。

### 14.2 Reviewer Profile prompt

新增 E2E prompt：

```text
e2e/work-core-v0.1-reviewer.md
```

创建 Profile：

```text
work-e2e-reviewer (claude)
provider: maomaokingdom
```

Reviewer prompt 的确定性规则：

- 第一次 Review 若 Decision ledger 中没有 `E2E_ENFORCEMENT_REVIEW`，验证分类修复后报告真实的 fail-open enforcement gap，并返回 `needs_replan`；
- 后续 Review 若已存在该 marker，则验证 `enforce_required_capabilities(report)`、两个 enforcement 测试和完整 pytest；全部满足才返回 `approved`；
- Reviewer 不修改文件；
- 不根据 Implementation Report 自报成功直接批准，必须检查 workspace 和测试。

该 prompt 只服务于原型 E2E 的可重复性，不是通用 Reviewer workflow 规则。

## 15. 原型编码后的自动化测试

### 15.1 测试文件

新增：

- `tests/test_work_core.py`：migration、repository round trip、binding revision、Attempt transition、Decision/Artifact/Handoff index、固定 workflow；
- `tests/test_work_providers.py`：resolution fail closed、Artifact digest、Effective Work State、Git worktree create/snapshot/cleanup、patch export；
- `tests/test_work_service.py`：六阶段 provider replacement、取消 active Attempt、waiting behavior、Handoff continuation；
- `tests/test_work_cli.py`：CLI create/run/show/cleanup 和 replace E2E；
- `tests/test_work_acp.py`：outcome marker、ACP runtime snapshot、Windows path 到 WSL path 投影。

### 15.2 中间测试结果

在真实 ACP 调试前后，Work Core 定向测试曾达到：

```text
21 passed
```

补充 patch export/cleanup 测试后：

```text
22 passed
```

cleanup 最终调整后再次执行 providers/service/CLI 定向测试：

```text
11 passed
```

同时执行：

```text
python3 -m compileall -q src/agent_box/work scripts/work-acp-probe.py
git diff --check
```

均通过。

## 16. 真实运行环境准备

### 16.1 ACP SDK 与 bridge

真实环境最终使用：

| 组件 | 版本 |
|---|---|
| `agent-client-protocol` Python SDK | `0.9.0` |
| `@agentclientprotocol/claude-agent-acp` | `0.70.0` |
| `@agentclientprotocol/codex-acp` | `1.6.2` |
| `hermes-agent` | `0.19.0` |

早期尝试表明更新的 ACP Python SDK 与 Hermes 0.19.0 不兼容，因此 optional dependency 固定为：

```toml
acp = ["agent-client-protocol==0.9.0; python_version >= '3.10'"]
```

安装期间 pip 报告：

```text
hermes-agent 0.19.0 requires rich==14.3.3,
but rich 15.0.0 is installed
```

该 packaging 冲突没有在本轮重构 dependency graph。Hermes `acp --check` 和实际 ACP handshake 均成功，但版本约束不一致仍是环境事实。

### 16.2 独立 probe 脚本

为避免多行 here-doc 在终端粘贴时出现重复行或漏括号，新增：

```text
scripts/work-acp-probe.py
```

用法：

```bash
python3 scripts/work-acp-probe.py \
  --work <work-id> \
  --role <planner|executor|reviewer> \
  --profile <profile-name>
```

probe 只执行 Profile resolution、ACP initialize 和 new session，然后关闭，不发送 Work prompt。

## 17. 第一次真实 Smoke Work

### 17.1 初始路径错误

第一次创建命令使用：

```text
--project /tmp/agent-box-work-e2e/fixture
```

该目录不存在，Git provider 报错：

```text
agent-box: cannot run git: [Errno 2] No such file or directory:
'/tmp/agent-box-work-e2e/fixture'
```

随后 `work step` 和 `work show` 都返回 Work not found。该错误发生在 Work 持久化前。

### 17.2 dirty base 拒绝

切换到仓库内 fixture 后，`git status --short` 显示：

```text
?? __pycache__/
```

Work create 被拒绝：

```text
project has uncommitted changes; v0.1 requires a committed base
```

清理 fixture 并通过 `.gitignore` 避免缓存污染后，ProjectRef 成功解析为 base SHA `500449e...`。

### 17.3 Smoke Work identity

```text
Work ID:    work_real_claude_smoke_20260820_01
created:    2026-08-20 13:59:26
branch:     agent-box/work_real_claude_smoke_20260820_01
workspace:  ~/.agent-box/workspaces/work_real_claude_smoke_20260820_01
Planner:    learn / Claude
Executor:   codex-main / Codex
Reviewer:   decision / Claude
```

### 17.4 Claude Planner 成功

Attempt：

```text
id:             attempt_ad2c8fdb37ea4176
role:           planner
profile:        learn
harness:        claude
session:        ff012fbd-7641-4e2c-b77c-237a3a78810f
outcome:        planned
started:        2026-08-20 13:59:28
ended:          2026-08-20 14:00:31
output handoff: handoff_700d82297b104380
```

该阶段证明 Claude ACP、CLI permission callback、Plan Artifact 和 Planner→Executor Handoff 可工作。

### 17.5 Codex Executor 启动失败

Attempt：

```text
id:            attempt_327de53f6bcf4694
role:          executor
profile:       codex-main
status:        failed
input handoff: handoff_700d82297b104380
error:         failed to start ACP session: Internal error
created/ended: 2026-08-20 14:04:02
```

native session 未创建，Work 被置为：

```text
phase:  execute
status: failed
```

v0.1 对 infrastructure failure 没有 retry/reopen 命令，因此这个 Smoke Work 被保留为失败证据，正式验收另建新 Work。

## 18. Codex ACP 故障定位与修复

### 18.1 原始症状

直接启动 `codex-main` 或 `test-litellm-codex` 时均出现：

```text
Error loading configuration: No such file or directory (os error 2)
```

ACP probe 返回：

```text
AcpSessionError failed to start ACP session: Internal error;
diagnostic log: ~/.agent-box/works/.../logs/codex-acp-.../app-server.log
```

### 18.2 根因

相关 Codex Profile 的 `config.toml` 包含 Windows 路径：

```toml
model_catalog_json = 'C:\Users\maoqh\.codex\cc-switch-model-catalog.json'
```

实际运行发生在 WSL+bwrap 中。Profile 的 `dot-codex` 被映射到：

```text
/home/maoqh/.codex
```

Windows 盘符路径在该 runtime 中不可解析，所以 native Codex 和 `codex-acp` 都在读取 config 时失败。该配置位于 `codex-main` 和 `test-litellm-codex`，与没有该字段的 `codex-plus` 无关。

### 18.3 Profile 侧修复

把 Windows catalog 复制到每个 Profile 的 `dot-codex`：

```text
~/.agent-box/profiles/codex-main/dot-codex/cc-switch-model-catalog.json
~/.agent-box/profiles/test-litellm-codex/dot-codex/cc-switch-model-catalog.json
```

并将两个 `config.toml` 修改为：

```toml
model_catalog_json = '/home/maoqh/.codex/cc-switch-model-catalog.json'
```

由于 Profile `dot-codex` 在运行时挂载为 `/home/maoqh/.codex`，该路径在 sandbox 内有效。

### 18.4 Adapter 侧防护

ACP provider 同时增加 WSL path projection 防护：检测 Codex config 中的 Windows absolute path，尝试解析为 `/mnt/<drive>/...`，在源文件存在时生成 Work-scoped projected config，并通过现有 bwrap launch prefix 把 projected config bind 到 runtime 的 Codex config path。

正式 E2E 使用的是已修复的 Profile-local path，所以 adapter fallback 没有成为正式验收的必要条件；单元测试覆盖了 Windows path 到 WSL path 的转换。

### 18.5 Codex handshake 复测

修复后：

```text
ACP_HANDSHAKE_OK
harness_name:    @agentclientprotocol/codex-acp
harness_version: 1.6.2
model:           deepseek-v4-pro[high]
```

## 19. Hermes 与 Reviewer ACP Handshake

### 19.1 Hermes

使用 `scripts/work-acp-probe.py`：

```text
profile:         hermes-main
harness:         hermes
harness_name:    hermes-agent
harness_version: 0.19.0
model:           custom:deepseek-v4-pro
session_id:      34e9e4f7-6dec-45ce-b45f-664c5608f925
result:          ACP_HANDSHAKE_OK
```

### 19.2 E2E Reviewer

创建并应用 provider 后：

```text
profile:         work-e2e-reviewer
harness:         claude
harness_name:    @agentclientprotocol/claude-agent-acp
harness_version: 0.70.0
session_id:      02c18c02-e02d-47bc-9616-b796edc4e76c
result:          ACP_HANDSHAKE_OK
```

至此正式 E2E 所需 Claude Planner、Codex Executor、Claude Reviewer 和 Hermes replacement Planner 的 ACP create-session 路径均完成独立验证。

## 20. 正式 E2E Work 创建

### 20.1 Work 参数

```text
Work ID: work_core_e2e_20260820_01
created: 2026-08-20 14:43:20
```

Objective：

```text
Fix capability_resolver.py so required capabilities are classified correctly,
pass all tests, and resolve every subsequent review finding.
```

Acceptance criteria：

1. true capabilities are effective；
2. degraded capabilities remain effective and are recorded as degraded；
3. false or missing capabilities are unsupported；
4. `python3 -m pytest -q` passes；
5. all reviewer findings are resolved。

初始 Role bindings：

| Role | Profile | Revision | Harness |
|---|---|---:|---|
| Planner | `learn` | 1 | Claude |
| Executor | `codex-main` | 1 | Codex |
| Reviewer | `work-e2e-reviewer` | 1 | Claude |

Workspace：

```text
base SHA:  500449e303a731f9c58c700345f8099a5d64b04f
branch:    agent-box/work_core_e2e_20260820_01
path:      ~/.agent-box/workspaces/work_core_e2e_20260820_01
```

## 21. 正式 E2E Attempt 1：Claude Planner

```text
Attempt:          attempt_46e26a28203845c7
Role:             planner
Binding revision: 1
Profile:          learn
Profile digest:   sha256:45c74d2352e7e2c6753d36f77e7ce803f80ccfa06d5efda948fedad47892edd8
Harness:          claude
Harness version:  0.70.0
Native session:   7597c0da-6fb5-4cbd-ab3e-6294bd7a50fd
Input Handoff:    none
Output Handoff:   handoff_69c5d8b399794d6e
Outcome:          planned
Started:          2026-08-20 14:43:22
Ended:            2026-08-20 14:44:21
```

Core 在该阶段：

- 从 Work phase 选择逻辑 Role `planner`；
- resolution 读取 `learn` Profile；
- 创建新的 Claude ACP session；
- 将 runtime version 写回 Attempt resolution；
- 投影初始 Effective Work State；
- 追加 Plan outcome contract；
- 保存 Plan Artifact `artifact_db385aa417cf4883`；
- 保存 Handoff Artifact `artifact_84a5501f46994e5e`；
- 保存 Handoff record `handoff_69c5d8b399794d6e`；
- 推进 Work phase 到 `execute`。

Planner 执行后 tracked code 未修改。Git status 中只有运行时注入 surface：`.agent-box/`、`.mcp.json`、`CLAUDE.local.md`、`CLAUDE.md`。

## 22. 正式 E2E Attempt 2：Codex Executor 首次实现

```text
Attempt:          attempt_32b3fef75cfd466b
Role:             executor
Binding revision: 1
Profile:          codex-main
Profile digest:   sha256:84026281ff370147e0176cfc52ae10b96124c82042a4cacafd73296de4b96bf4
Harness:          codex
Harness version:  1.6.2
Model:            deepseek-v4-pro[high]
Native session:   01a01fa1-fc92-7360-bc70-0b67efe98492
Diagnostic log:   ~/.agent-box/works/work_core_e2e_20260820_01/logs/codex-acp-a5c96ebd/app-server.log
Input Handoff:    handoff_69c5d8b399794d6e
Output Handoff:   handoff_3c85f0ccf5b74602
Outcome:          implemented
Started:          2026-08-20 14:45:04
Ended:            2026-08-20 14:45:30
```

Executor 消费 Claude Planner Handoff，并修改 `capability_resolver.py`：

- degraded string capability 保持 effective；
- degraded capability 同时写入 degraded map；
- false/missing 保持 unsupported；
- effective/unsupported 保持稳定排序。

独立执行测试：

```text
1 passed in 0.00s
```

Core 保存：

- Implementation Report `artifact_1c0aa2b7ba69474d`；
- Executor→Reviewer Handoff Artifact `artifact_19569dc41bc54e26`；
- Handoff record `handoff_3c85f0ccf5b74602`；
- Work phase 推进到 `review`。

## 23. 正式 E2E Attempt 3：Claude Reviewer 首轮退回

```text
Attempt:          attempt_931a3a9c52da4eb2
Role:             reviewer
Binding revision: 1
Profile:          work-e2e-reviewer
Profile digest:   sha256:60a19eccd38e95f7a3db9c02840f4e8178e4933eb1c95c7d5c19d0b8b8d0f69c
Harness:          claude
Harness version:  0.70.0
Native session:   37eb308c-2a1a-4a09-99fd-67c1b5e7e4cf
Input Handoff:    handoff_3c85f0ccf5b74602
Output Handoff:   handoff_eb0e898b5eab44bb
Outcome:          needs_replan
Started:          2026-08-20 14:46:09
Ended:            2026-08-20 14:47:01
```

Reviewer 独立检查 workspace，确认分类修复正确且 `1 passed`，随后报告实际 enforcement gap：分类器只报告 unsupported，但没有 fail-closed API 阻止调用方继续运行。

Review report 中写入 marker：

```text
E2E_ENFORCEMENT_REVIEW
```

要求：

- 新增 `enforce_required_capabilities(report)`；
- `unsupported` 非空时抛出 `RuntimeError`；
- `unsupported` 为空时正常返回；
- 两个分支都有测试；
- 完整 pytest 通过。

Core 保存：

- Review Report `artifact_58474d37d4b045b2`；
- `review_finding` Decision `decision_178c02e0e52541a3`；
- Reviewer→Planner Handoff Artifact `artifact_3c7575a6cdec4955`；
- Handoff record `handoff_eb0e898b5eab44bb`；
- Work phase 回到 `plan`。

## 24. Planner Profile Replacement

执行替换：

```text
Role:       planner
Old:        learn / Claude
New:        hermes-main / Hermes + DeepSeek
Revision:   1 → 2
Changed at: 2026-08-20T14:47:55.119051+00:00
```

Reason：

```text
Replace Claude Planner with Hermes + DeepSeek; continue only from Work State,
review finding, Handoff, Git, and Artifact refs.
```

Core 保存：

- 更新后的 embedded RoleBinding；
- `profile_replacement` Decision `decision_bbe44350499943f3`；
- replacement Handoff Artifact `artifact_e6fa15e6449d4c65`；
- replacement Handoff record `handoff_8c99f76e7b724492`。

replacement Handoff 使用包含新 binding 的 projection，因此其中 `planner.profile_ref` 已是 `hermes-main`；provenance 中仍保留旧 Claude Planner Attempt 和 session ref。

## 25. 正式 E2E Attempt 4：Hermes Planner 接续

```text
Attempt:          attempt_96307c8c281e478c
Role:             planner
Binding revision: 2
Profile:          hermes-main
Profile digest:   sha256:e4450ba264b1b49ded7af506f5a14ac8ca405ada9d47a3726f9df19fcd3effac
Harness:          hermes
Harness version:  0.19.0
Model:            custom:deepseek-v4-pro
Native session:   fac855cf-8a2a-4e12-b0fc-bdfa6fe324db
Input Handoff:    handoff_8c99f76e7b724492
Output Handoff:   handoff_7a704d8f24ad4261
Outcome:          planned
Started:          2026-08-20 14:48:46
Ended:            2026-08-20 14:49:34
```

Hermes durable report 明确引用：

- 当前 objective；
- Reviewer 的 fail-open finding；
- 当前 Git branch/base/diff；
- 已完成的分类修复；
- 需要新增的 API；
- 两个 enforcement test；
- 预期完整测试为 `3 passed`。

Hermes 给出的执行计划包括函数签名、异常条件、测试结构和 acceptance criteria mapping。

旧 Claude Planner session：

```text
7597c0da-6fb5-4cbd-ab3e-6294bd7a50fd
```

新 Hermes Planner session：

```text
fac855cf-8a2a-4e12-b0fc-bdfa6fe324db
```

两者完全不同。Hermes capability report 中：

```text
session_resume: false
```

Work Core 没有调用任何 load/resume API，也没有把旧 Claude transcript 加入 prompt。Hermes 的输入来自 replacement Handoff、Effective Work State、Decision ledger、Git snapshot 和 Artifact index。

## 26. 正式 E2E Attempt 5：Codex Executor 二次修复

```text
Attempt:          attempt_7a0564465c314a2b
Role:             executor
Binding revision: 1
Profile:          codex-main
Profile digest:   sha256:bad7ae76b0cc9a83f0c66ae84da84a2d4c679a1eb1c8cf9b957e4e0c5f94ff7f
Harness:          codex
Harness version:  1.6.2
Model:            deepseek-v4-pro[high]
Native session:   01a01fa6-d646-7673-a5e9-fbe8e6e2895f
Input Handoff:    handoff_7a704d8f24ad4261
Output Handoff:   handoff_83e883c76a0c4d35
Outcome:          implemented
Started:          2026-08-20 14:50:22
Ended:            2026-08-20 14:50:45
```

Codex 消费 Hermes Handoff 后：

- 在 `capability_resolver.py` 增加 `enforce_required_capabilities(report)`；
- unsupported 非空时抛 `RuntimeError`；
- unsupported 为空时不抛错；
- 在 `test_capability_resolver.py` 增加两个 enforcement test；
- 保留原分类测试。

独立复测命令：

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider
```

结果：

```text
3 passed in 0.00s
```

Core 保存：

- Implementation Report `artifact_a5aac8873b664c01`；
- Executor→Reviewer Handoff Artifact `artifact_6bac719fa5d54a86`；
- Handoff record `handoff_83e883c76a0c4d35`；
- Work phase 推进到 `review`。

## 27. 正式 E2E Attempt 6：Claude Reviewer 最终批准

```text
Attempt:          attempt_e3edfb7659b24756
Role:             reviewer
Binding revision: 1
Profile:          work-e2e-reviewer
Profile digest:   sha256:7f9f48f2ad06acb081a2d59ce9655d473d279b386b35efbe24fcbdabe48e14bf
Harness:          claude
Harness version:  0.70.0
Native session:   2d8578b0-fe74-4f5c-ace0-b8a3fc9cf4f0
Input Handoff:    handoff_83e883c76a0c4d35
Output Handoff:   none
Outcome:          approved
Started:          2026-08-20 14:51:14
Ended:            2026-08-20 14:51:44
```

Reviewer 从 Decision ledger 看见已有 `E2E_ENFORCEMENT_REVIEW`，进入后续 review 分支，检查实际函数、两条新测试和完整测试结果后返回 `approved`。

Core 保存最终 Review Report：

```text
artifact_b047f487a8b14b85
digest: sha256:ce504efa012369f4fc5bcaec965e9b2ac1a4a824ce991dfcf3314f4a71dc4f5e
```

Work 状态变为：

```text
phase:  complete
status: completed
```

## 28. 正式 E2E Correlation 全表

### 28.1 Attempt chain

| 顺序 | Attempt | Role | Binding rev | Profile | Harness / model | Native session | Input Handoff | Outcome |
|---:|---|---|---:|---|---|---|---|---|
| 1 | `attempt_46e26a28203845c7` | Planner | 1 | `learn` | Claude 0.70.0 | `7597c0da-...` | 无 | `planned` |
| 2 | `attempt_32b3fef75cfd466b` | Executor | 1 | `codex-main` | Codex 1.6.2 / `deepseek-v4-pro[high]` | `01a01fa1-...` | `handoff_69c...` | `implemented` |
| 3 | `attempt_931a3a9c52da4eb2` | Reviewer | 1 | `work-e2e-reviewer` | Claude 0.70.0 | `37eb308c-...` | `handoff_3c85...` | `needs_replan` |
| 4 | `attempt_96307c8c281e478c` | Planner | 2 | `hermes-main` | Hermes 0.19.0 / `custom:deepseek-v4-pro` | `fac855cf-...` | `handoff_8c99...` | `planned` |
| 5 | `attempt_7a0564465c314a2b` | Executor | 1 | `codex-main` | Codex 1.6.2 / `deepseek-v4-pro[high]` | `01a01fa6-...` | `handoff_7a70...` | `implemented` |
| 6 | `attempt_e3edfb7659b24756` | Reviewer | 1 | `work-e2e-reviewer` | Claude 0.70.0 | `2d8578b0-...` | `handoff_83e8...` | `approved` |

### 28.2 Handoff chain

| Handoff | Producer | Target Role | Consumer | Reason |
|---|---|---|---|---|
| `handoff_69c5d8b399794d6e` | Claude Planner Attempt 1 | Executor | Codex Attempt 2 | `planned` |
| `handoff_3c85f0ccf5b74602` | Codex Attempt 2 | Reviewer | Claude Attempt 3 | `implemented` |
| `handoff_eb0e898b5eab44bb` | Claude Reviewer Attempt 3 | Planner | 未消费 | `needs_replan` |
| `handoff_8c99f76e7b724492` | Claude Reviewer Attempt 3 | Planner | Hermes Attempt 4 | Profile replacement |
| `handoff_7a704d8f24ad4261` | Hermes Attempt 4 | Executor | Codex Attempt 5 | `planned` |
| `handoff_83e883c76a0c4d35` | Codex Attempt 5 | Reviewer | Claude Attempt 6 | `implemented` |

Profile replacement 创建了一个比普通 Reviewer→Planner Handoff 更新的 replacement Handoff。dispatcher 选择目标 Role 最新的未消费 Handoff，因此 Hermes 消费 `handoff_8c99...`。原 `handoff_eb0e...` 保留未消费状态，没有丢失，但 v0.1 尚未增加 `superseded_by` 语义。

### 28.3 Decision ledger

| Decision | Kind | Actor | Related Attempt | 内容 |
|---|---|---|---|---|
| `decision_178c02e0e52541a3` | `review_finding` | `work-e2e-reviewer` | `attempt_931a...` | `E2E_ENFORCEMENT_REVIEW` 与 fail-closed remediation |
| `decision_bbe44350499943f3` | `profile_replacement` | `user` | `attempt_931a...` | `planner: learn -> hermes-main` |

### 28.4 Artifact inventory

正式 E2E 最终保存 13 个 Artifact：

- 2 个 Plan；
- 2 个 Implementation Report；
- 2 个 Review Report；
- 6 个 Handoff document；
- 1 个 Git Patch。

Artifact index 与 body 分离。SQLite 中保存 locator、digest、producer Attempt 和 metadata；body 位于：

```text
~/.agent-box/works/work_core_e2e_20260820_01/artifacts/
```

## 29. Cleanup 补强与真实执行

### 29.1 完成时 workspace 状态

最终 Review 后 snapshot：

```text
base_sha: 500449e303a731f9c58c700345f8099a5d64b04f
head_sha: 500449e303a731f9c58c700345f8099a5d64b04f
dirty:    true
```

tracked diff stat：

```text
capability_resolver.py      | 30 ++++++++++++++++++++++++++----
test_capability_resolver.py | 17 ++++++++++++++++-
2 files changed, 42 insertions(+), 5 deletions(-)
```

同时存在 Agent-Box runtime injection files：

```text
.agent-box/
.mcp.json
AGENTS.md
CLAUDE.local.md
CLAUDE.md
```

### 29.2 首次 cleanup 观察

旧实现发现 dirty worktree 后拒绝自动移除。这避免了结果丢失，但无法满足完整闭环的 cleanup。随后增加 Git Patch Artifact 与 digest gate。

本轮代理环境对真实 `~/.agent-box/agent-box.db` 只读，因此从受限环境尝试写 cleanup state 时还观察到：

```text
sqlite3.OperationalError: attempt to write a readonly database
```

该错误是验证代理 sandbox 对用户 home 的写权限限制，不是用户本机 Agent-Box 的数据库权限问题。最终 cleanup 由用户终端执行成功。

### 29.3 Patch 验证

cleanup 前对真实 workspace 导出的 patch 执行：

```text
git apply --reverse --check -
```

结果：

```text
PATCH_REVERSE_CHECK_OK
patch bytes: 2796
included_untracked: []
```

被排除的 runtime path 包括根目录注入文件和 `.agent-box/profiles/.../root/` 下的 Profile runtime surfaces。

### 29.4 最终 cleanup

执行：

```bash
agent-box exec "work cleanup work_core_e2e_20260820_01 --json"
```

返回：

```json
{
  "removed": true,
  "discarded_dirty_workspace": true,
  "retained_branch": "agent-box/work_core_e2e_20260820_01",
  "patch_artifact_id": "artifact_91dd7c9988804925"
}
```

Git Patch Artifact：

```text
id:      artifact_91dd7c9988804925
kind:    git-patch
path:    ~/.agent-box/works/work_core_e2e_20260820_01/artifacts/artifact_91dd7c9988804925.patch
digest:  sha256:2e5c07fae02164a2f2dc0f4654e42be1776841a824c19aee7439561e7e163234
bytes:   2796
created: 2026-08-20 14:56:32
```

cleanup 后审计：

```text
Work status:      completed
Work phase:       complete
cleanup_state:    completed
workspace exists: false
patch exists:     true
patch digest:     verified
attempts:         6
handoffs:         6
artifacts:        13
decisions:        2
```

`retained_branch` 仍指向 base commit，因为 Executor 没有提交代码；真正可恢复的未提交实现结果由 Git Patch Artifact 持有。`final_result.workspace.path` 是历史 provenance snapshot，cleanup 后路径不存在是预期行为。

## 30. 最终测试执行记录

### 30.1 真实 home 下的完整测试

第一次运行完整测试：

```text
192 passed, 1 skipped, 2 failed
```

两个失败均位于 GUI RPC parity 的 session list 路径。测试会在读取 session 时顺带清理 zombie session，需要写真实 `~/.agent-box` SQLite；本轮受限执行环境只能读取该路径，因此失败为：

```text
sqlite3.OperationalError: attempt to write a readonly database
```

### 30.2 隔离 AGENT_BOX_HOME

随后使用临时 `AGENT_BOX_HOME` 运行全套。跨 Windows `wsl.exe` parity 用真实 WSL home，而 Linux library 用隔离 home，因此两侧 Profile list 不同；该测试不适合在隔离 home 条件下比较，单独 deselect。

最终命令：

```bash
test_agent_box_root=$(mktemp -d /tmp/agent-box-tests.XXXXXX)
AGENT_BOX_HOME="$test_agent_box_root" \
  python3 -m pytest -q -rs -k 'not transport_wsl_matches_library'
```

结果：

```text
190 passed, 4 skipped, 1 deselected in 2.07s
```

Skip 原因：

- 1 个测试检测到 bwrap + Claude 可用，为避免真正 launch 而跳过；
- 3 个 GUI parity 测试在隔离 home 中没有可用 ASCII Profile sample 而跳过。

## 31. 新增与修改文件清单

### 31.1 Work Core package

| 文件 | 职责 |
|---|---|
| `src/agent_box/work/models.py` | 五个持久化实体、两个嵌入值、phase/status enums |
| `src/agent_box/work/repository.py` | SQLite repository 和 transaction boundary |
| `src/agent_box/work/workflow.py` | 固定 Plan/Execute/Review 状态机 |
| `src/agent_box/work/providers.py` | Session、Workspace、Artifact、State provider protocols |
| `src/agent_box/work/resolution.py` | Role→Profile→EffectiveResolution、capability closure |
| `src/agent_box/work/state.py` | Effective Work State projection 和 role prompt rendering |
| `src/agent_box/work/service.py` | Work lifecycle orchestration、replace、handoff、completion、cleanup |
| `src/agent_box/work/acp.py` | ACP process/session/permission/stream/cancel/diagnostics adapter |
| `src/agent_box/work/workspace.py` | Git worktree、snapshot、patch export、安全 cleanup |
| `src/agent_box/work/artifacts.py` | 文件系统 Artifact body 和 digest 校验 |
| `src/agent_box/work/__init__.py` | Work Core package exports |

### 31.2 Persistence 与 CLI

| 文件 | 职责 |
|---|---|
| `src/agent_box/migrations/003_work_core.sql` | Work Core 五表 migration |
| `src/agent_box/cli/commands/work.py` | Work CLI control plane |
| `src/agent_box/cli/shell.py` | 注册 WorkCommands，不替换旧 CoreCommands |
| `pyproject.toml` | ACP optional extra 固定 Python SDK 0.9.0 |

### 31.3 Tests 与真实验证资产

| 文件 | 职责 |
|---|---|
| `tests/test_work_core.py` | model/repository/workflow/migration |
| `tests/test_work_providers.py` | resolution/state/artifact/worktree/patch |
| `tests/test_work_service.py` | provider replacement 六阶段闭环 |
| `tests/test_work_cli.py` | CLI E2E |
| `tests/test_work_acp.py` | ACP marker/runtime/path projection |
| `scripts/work-acp-probe.py` | 真实 Profile ACP handshake probe |
| `e2e/work-core-v0.1-fixture/` | 可实际修改和测试的 Git fixture |
| `e2e/work-core-v0.1-reviewer.md` | 确定性两阶段 Reviewer prompt |
| `docs/architecture/WORK_CORE_V0_1_PROVIDER_AND_MODEL_PROPOSAL.md` | provider/model 选型文档 |

## 32. 兼容性检查记录

原型采用独立 `agent_box.work` 包和独立 CLI command set。没有：

- 删除旧 command；
- 修改旧 session schema；
- 把旧 session 转成 Attempt；
- 要求 GUI 使用 Work；
- 修改 Profile domain ownership；
- 要求 Profile 保存 Work ID；
- 要求 native harness 支持 session resume；
- 替换 bwrap；
- 引入新的 runtime daemon。

ACP optional dependency 仍是 optional extra。未安装 SDK 时旧 launch 路径仍可使用，Work Attempt 会在 probe/create session 边界给出明确缺失错误。

## 33. 验证过程中暴露但未扩展处理的工程事实

### 33.1 Failed Work 没有 retry

第一次 Smoke Work 的 Codex infrastructure failure 把 Work 置为 terminal `failed`。v0.1 没有 `work retry`、Attempt retry policy 或把 failed Work 恢复到 running 的命令。正式验收通过创建新 Work 继续。

### 33.2 Handoff supersession 未建模

Reviewer `needs_replan` 生成的普通 Planner Handoff 在随后 Profile replacement 时没有被消费；replacement 创建了更新的 Handoff，dispatcher 选择最新一个。旧 Handoff 保留 `consumed_by_attempt_id=null`。当前可以审计，但没有显式 `superseded` 状态。

### 33.3 Profile digest 在同一 Profile 的不同 Attempt 间变化

正式记录中两次 `codex-main` Attempt 的 profile digest 不同，两次 `work-e2e-reviewer` Attempt 的 digest也不同。digest 会读取 Profile harness directory 的非 secret 文件，因此运行过程中 Profile materialization 或配置变化会反映到新 Attempt。每个 Attempt 的 snapshot 是不可变的，但后续需要决定哪些 runtime-generated Profile 文件应排除，以提高 digest 稳定性。

### 33.4 Rich dependency 冲突

Hermes 0.19.0 声明 `rich==14.3.3`，当前环境安装 `rich 15.0.0`。真实 Hermes ACP handshake 和 Work Attempt 成功，但 packaging resolver 仍报告不一致。

### 33.5 Runtime injection 清理依赖已知路径

Git Patch exporter 当前排除固定的 Agent-Box runtime surface 名称。新增新的 launch materialization 文件时，需要同步扩展 provider-owned injection manifest；否则可能把 runtime 文件纳入 patch。

### 33.6 Branch 与 Patch 的关系

cleanup 保留的 Work branch 没有包含 Executor 的未提交修改。代码结果由 patch Artifact 持有。v0.1 没有自动 commit、merge 或 patch import CLI。

### 33.7 TraceRef 仅预留

Attempt model 有 `trace_ref`，正式 E2E 中全部为 `null`。没有接入 OTel SDK、Collector 或外部 tracing platform。

### 33.8 ACP session 不可跨进程操作

`AcpProcessSessionProvider` 的 active handle 存在当前 CLI 进程内。每个 `work step` 在同一调用中 create、prompt、close。NativeSessionRef 用于 provenance，不支持在另一个 CLI 进程中重新获得 active connection。

### 33.9 MCP negotiation 范围

ACP `new_session()` 当前传入空 `mcp_servers`。Profile 自身的 MCP/config 仍通过现有 Profile launch/mount 路径生效；Work Core 没有复制或重新声明一套 MCP server schema。

## 34. 正式 E2E 的可复现命令序列

以下序列省略环境安装，只展示 Work lifecycle：

```bash
agent-box exec "work create \
  --id work_core_e2e_20260820_01 \
  --objective 'Fix capability_resolver.py so required capabilities are classified correctly, pass all tests, and resolve every subsequent review finding.' \
  --accept 'true capabilities are effective' \
  --accept 'degraded capabilities remain effective and are recorded as degraded' \
  --accept 'false or missing capabilities are unsupported' \
  --accept 'python3 -m pytest -q passes' \
  --accept 'all reviewer findings are resolved' \
  --project $PWD/e2e/work-core-v0.1-fixture \
  --planner learn \
  --executor codex-main \
  --reviewer work-e2e-reviewer \
  --json"

agent-box exec "work step work_core_e2e_20260820_01 --json"
agent-box exec "work step work_core_e2e_20260820_01 --json"
agent-box exec "work step work_core_e2e_20260820_01 --json"

agent-box exec "work replace \
  work_core_e2e_20260820_01 \
  planner \
  hermes-main \
  --reason 'Replace Claude Planner with Hermes + DeepSeek; continue only from Work State, review finding, Handoff, Git, and Artifact refs.' \
  --json"

agent-box exec "work step work_core_e2e_20260820_01 --json"
agent-box exec "work step work_core_e2e_20260820_01 --json"
agent-box exec "work step work_core_e2e_20260820_01 --json"

agent-box exec "work show work_core_e2e_20260820_01 --json"
agent-box exec "work state work_core_e2e_20260820_01 --json"
agent-box exec "work cleanup work_core_e2e_20260820_01 --json"
```

每次 Claude/Codex ACP permission request 在本轮真实验证中选择 `Allow Once`，没有设置全局永久授权。

## 35. 当前仓库工作树记录

当前分支仍为：

```text
experiment/work-core-v0.1
```

实验代码尚未 commit。仓库根目录还存在 Agent-Box 本次及其他运行产生的未跟踪 surface：

```text
.agent-box/
.mcp.json
AGENTS.md
CLAUDE.local.md
```

这些文件不属于 Work Core source commit。仓库中同时存在本轮之前或其他并行工作的 tracked/untracked 修改；提交 Work Core 时需要按文件边界选择，不能直接把整个 dirty worktree 无差别加入 commit。
