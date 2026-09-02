# PROCESS_TOPOLOGY_AND_SANDBOX_MATRIX — 进程拓扑与沙箱/双 spawn 审计

观察日期 2026-09-02。裁决等级定义见 [SOURCE_POLICY.md](SOURCE_POLICY.md) §8。
Agent-Box 不变量参照：Runtime Coordinator 是唯一 execution target creation authority；
single-use start token；replay 不重复 spawn；response loss → START_AMBIGUOUS；
sandbox/terminal/runtime refs frozen；process exit ≠ Finish。

## 1. 拓扑总览

```text
Agent-Box Runtime (bwrap)
  └─ 唯一 spawn 点：Runtime lowering HarnessCommandSpec
       ├─ Option-NATIVE: harness 进程本身（现状，单层）
       └─ Option-ACP:    见各家行（0/1/2 层额外间接）
```

## 2. 五家必选对象

| Harness | ACP 路径进程树 | 层数 | wrapper 再 spawn harness? | 同一 process tree (bwrap 内)? | 沙箱外进程? | execution 内自动下载? | 双 spawn 判决 | 关键证据 |
|---|---|---|---|---|---|---|---|---|
| **Codex** | host → node `codex-acp` → `codex app-server`（每 wrapper 恰 1 个，启动即 spawn，无 daemon）→ 启动期短命 git/git-remote-http | 2+1 | YES（adapter spawn app-server） | 是（全在树内） | 无（但启动期即有 git 网络外呼——"pre-prompt 无网络"不成立） | 风险在 `npx -y`：未预装时 spawn 期自动下载；预装+pin 后无 | **SAFE_WITHIN_EXISTING_RUNTIME**（条件：预装+精确 pin；`CODEX_PATH`/PATH pin codex；进程组/bwrap kill） | codex EVIDENCE E-x（实测 stdin 关→2s kill 兜底→exit 0 无残留） |
| **Claude Code** | host → node `claude-agent-acp` → 内嵌 claude（SDK spawn，stream-json+control）→ /bin/bash 孙进程 | 3 | YES（SDK query() spawn） | 是 | 无 | `npx` 冷启动 + 每版本 ~100MB 原生二进制（预装可避） | **REQUIRES_RUNTIME_CHANGE**：协议换轨 + 沙箱需 node≥22 + 三层清理链 + kill -9 孤儿 UNKNOWN（U-1） | claude EVIDENCE E-31/E-35/U-1 |
| **OpenCode** | host → `opencode acp` **单进程**（进程内 HTTP server 127.0.0.1 临时端口，无子进程） | 1 | NO（vendor 自身即 ACP server） | 是 | 回环监听面（默认无鉴权；`--mdns` 默认关） | 无（binary 静态分发，registry sha256） | **SAFE_WITHIN_EXISTING_RUNTIME**（条件：沙箱允许回环 listen；建议口令/netns；mdns 保持关） | opencode EVIDENCE（stdin EOF→exit 0；/proc 无子进程实测） |
| **Hermes** | host → python `hermes acp` **单进程**（asyncio 主循环 + ThreadPoolExecutor 内 AIAgent；MCP/浏览器为子进程） | 1 | NO（vendor in-tree acp_adapter） | 是 | 无（lazy_deps 首启动可能触网装可选依赖——需预置/禁用） | 可能有（lazy_deps；对策：预热或环境禁用） | **SAFE_WITHIN_EXISTING_RUNTIME**（条件：stdout 保持 pipe；隔离 HERMES_HOME；lazy_deps 策略） | hermes EVIDENCE（实测隔离 initialize 1s 级握手成功） |
| **Pi** | host → node `pi-acp` → 每个 ACP session 一个 `pi --mode rpc` → bash 子进程 | 3 | YES（adapter 按 session spawn） | 是 | 无 | `npx` 冷启动（须预装 pi≥0.80.4 + pi-acp） | **REQUIRES_RUNTIME_CHANGE**：三层 + 单维护者 adapter 无 reaper、孤儿风险 UNKNOWN | pi EVIDENCE（34 天未发版；npx 冷启动依赖） |

## 3. 辅助对象（AUXILIARY）

| Harness | 拓扑 | 判决方向 |
|---|---|---|
| Gemini CLI | host → `gemini --acp` 单进程（进程内 AgentSideConnection over stdio） | SAFE_WITHIN_EXISTING_RUNTIME 方向 |
| Qwen Code | host → `qwen --acp` 单进程；（超集：`qwen serve` daemon 会 spawn `qwen --acp` 子进程——Agent-Box 不用该形态即无 daemon） | SAFE_WITHIN_EXISTING_RUNTIME 方向 |
| Grok Build | host → `grok agent stdio` 单进程；注意 npm 分发把平台二进制解压到 `~/.grok/bin`（runtime 代码落盘） | SAFE 方向 + 代码落盘审计点 |

## 4. 双 spawn 八问（对每个 ACP adapter 的统一回答）

| # | 问题 | Codex(acp) | Claude(acp) | OpenCode | Hermes | Pi(acp) |
|---|---|---|---|---|---|---|
| 1 | Agent-Box 启动的是 harness 还是 wrapper？ | wrapper | wrapper | **harness 本身** | **harness 本身** | wrapper |
| 2 | wrapper 再启动 native harness？ | 是（app-server） | 是（内嵌 claude） | 否 | 否 | 是（`pi --mode rpc`） |
| 3 | wrapper 与 child 同树？ | 是 | 是 | n/a | n/a | 是 |
| 4 | 能否逃逸沙箱外 spawn？ | 无证据 | 无证据 | 无 | 无 | 无证据 |
| 5 | Runtime 统一 kill/reap 整树？ | 可（进程组 kill；优雅路径实测） | 可；kill -9 孤儿 UNKNOWN（U-1） | 可（单进程） | 可（单进程） | adapter 无 reaper，UNKNOWN |
| 6 | replay 重复 spawn 风险？ | 无（single-use token + load/resume 重挂前提；session locator 与 native threadId 同空间） | 低（session/load 重挂，in-flight 不可恢复） | 无（session id 即 native id，持久 opencode.db） | 无（load/resume/fork/list 全有） | 低-中（JSONL 持久化可 resume） |
| 7 | execution 内下载/更新？ | npx 冷启动（预装规避）；adapter 不自更新 | npx + 每版本 ~100MB（预装规避）；SDK 不自更新 | 无 | lazy_deps 可触网（需预置） | npx 冷启动（预装规避） |
| 8 | wrapper crash 后 child 残留？ | 实测优雅退出无残留；SIGKILL UNKNOWN | SDK SIGTERM→5s→SIGKILL 链在案；kill -9 UNKNOWN | n/a | n/a | 无 reaper，UNKNOWN |

**通行兜底**（Codeg 已验证的三件套，见 [CODEG_ACP_RUNTIME_ARCHAEOLOGY.md](CODEG_ACP_RUNTIME_ARCHAEOLOGY.md) §4-5）：
`kill_tree`（SIGTERM）+ detached reaper 持 child 至 reap（pin pid 防复用误杀）+ 宿主退出前以
记录的 pid 同步 kill_tree。Agent-Box 若引入任何 wrapper 型 ACP driver，Runtime 必须具备：
进程组/pdeathsig 级清理 + pid 记录 + reap 确认，这是 Option B/C 的隐性成本。

## 5. 对 Agent-Box 不变量的影响

- **唯一 spawn authority**：vendor-native 路径（OpenCode/Hermes/辅助三家）不引入新 spawn 主体，
  不变量无损。wrapper 路径（Codex/Claude/Pi）把"harness 由谁 spawn"变成"adapter 由 Runtime
  spawn、harness 由 adapter spawn"——Runtime 失去对孙进程的直接 authority，只能靠
  进程树收割（kill_tree/pdeathsig/bwrap --unshare-pid）重建不变量。
- **START_AMBIGUOUS 语义**：ACP 路径上，spawn 成功但 initialize 失败必须同样映射为
  START_AMBIGUOUS/FAILED——协议失败不改变 start token 语义。
- **process exit ≠ Finish**：ACP `session/prompt` 的 stopReason 与进程退出是两个事件源；
  adapter 必须把 child exit 映射为 TerminalCondition.PROCESS_EXIT 观测，而非 Finish
  （与现有 observation.py 的边界一致，file: <workspace>/plugins/agent-box-harnesses/src/agent_box_harnesses/adapters/observation.py）。
