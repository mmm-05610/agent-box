# BE-LOOP-001 复用结论 · 证据与限制

配套 `reuse-conclusion.md`。本轮**只读核实**，无模型生成调用、无 Sol 消耗、无插件安装/启用。

## 1. 版本与真实 help
| 命令 | 结果 |
| --- | --- |
| `qodercli --version` / `qoder --version` | `1.1.60` |
| `codex --version` | `codex-cli 0.155.1` |
| `qodercli --help` | 有 `--agent/--agents`、`--worktree`、`--tools/--allowed-tools/--disallowed-tools`、`--permission-mode {default,accept_edits,bypass_permissions,dont_ask,auto}`、`--dangerously-skip-permissions`、`--config-dir`、`--plugin-dir`、`--add-dir`、`--strict-mcp-config`、`-c/-r/--resume/--fork-session/--list-sessions/--no-session-persistence`、`--max-model-request-retries`、`--max-output-tokens` |
| `codex --help` | 子命令 `agents/exec/review/queue/resume/fork/archive/sandbox/remote-control/app-server/features`；`exec -s {read-only,workspace-write,danger-full-access}` |

限制：qodercli 是打包单文件二进制，`/loop` 无独立 SKILL.md 落盘，其语义取自 CLI 内置工具（`ScheduleWakeup`、`Cron*`、`/loop` skill 描述）。`docs.qoder.com/cli/loop-reference` WebFetch 被服务端限额（API code 115）拒绝，未取到网页正文——结论不依赖它。

## 2. 模型标识
| 命令 | 结果 |
| --- | --- |
| `qodercli --list-models` | 18 项，含 `Qwen3.8-Flash`、`Qwen3.8-Max`、`Qwen3.7-*`、DeepSeek/GLM/Kimi/MiniMax 等；**无 "sol"** |
| grep `~/.codex/config.toml`（仅取 model/profile/sandbox 行，不取密钥） | `model = "gpt-6-astra"`，`sandbox_mode = "workspace-write"` |

结论：四组执行者模型 `Qwen3.8-Flash` 已核实可用。Sol(`gpt5.6sol`) 确切 codex 标识**本机无凭据不可核实**；codex 无本地离线模型清单，核实需一次账户级调用——留 I 决策，本轮不调用、不替换。

## 3. 物理隔离能力
| 命令 | 结果 |
| --- | --- |
| `command -v bwrap/unshare/podman/docker/firejail` | bwrap `/usr/bin/bwrap` ✓、unshare ✓；podman/docker/firejail 缺 |
| `bwrap --ro-bind / / --dev /dev --unshare-all true` | 退出 0 → 非特权用户命名空间 + 只读绑定挂载**实际可用** |

限制：该测试证明隔离**原语**可用；逐组"精确可写白名单 + 隐藏指定路径 + 网络策略 + 服务/凭据不可达"的完整封装仍需在启动方案 B 构造并实测，不得据此宣称"隔离已完成"。

## 4. oh-my-qoder（已 clone 到 `/tmp/be-loop-001-reuse-eval/oh-my-qoder`，HEAD `9ba1359`）
只读代码，**未安装/未启用**。决定性引用（均为实现，非 README）：
- `src/team/worker-commit-cadence.ts:85`：`git add -A && (git diff --cached --quiet || git commit -m "auto-commit by worker …")` — worker 周期性 `git add -A` 自动提交。
- `src/team/conflict-mailbox.ts:72-75`：产出 `git checkout <leader> && git merge --no-ff <worker>` + `git commit` 指令 — 合并编排。
- `src/team/model-contract.ts:189` 起：worker 启动参数 `['--dangerously-skip-permissions']`；`:216` `--dangerously-bypass-approvals-and-sandbox`；`:246` `--approval-mode yolo`；`src/team/mcp-team-bridge.ts:472/477` 同类。
- `skills/`：`autopilot`、`ralph`、`ralplan`、`ultrawork`、`ultraqa`、`ultragoal`、`autoresearch`、`team`；`templates/hooks/persistent-mode.mjs`、`stop-continuation.mjs` — 无人值守持续续跑。

判定：作为**引擎**与本轮硬边界冲突（git add -A 覆盖脏改、worker→leader merge、bypass/yolo、自动续跑），弃用；其"独立上下文子代理 + tmux 并行 + 状态持久化 + 模型路由"能力，本轮由 Qoder 原生等价物覆盖且更安全。

## 5. Agent Orchestrator
`git clone --depth 1 https://github.com/Untrivial-ai/agent-orchestrator.git` 打印"正克隆到…"但目录未落地（clone 未成功 / 空）。因原生+bwrap 已覆盖，属"必要时再看"项，未继续、**未读其代码**——不对它作任何能力断言。

## 6. 共同基线核对（本轮只读）
| 目标 | 结果 |
| --- | --- |
| `worktrees/integration-linux/backend` | HEAD `b067c5718556c8efa93b054e6573ad3d186b3cf6`，branch `integration/linux-native-0`，`git status` clean；与 `development-baseline.json` 后端 SHA 一致 → 四组共同起点 |
| `worktrees/pi-loop/backend` | HEAD `e2ec0ef2029b7b4905332eb97106b104ccb47ee5`，branch `work/pi-loop-0`（含未提交改动）→ 已有 Pi 修复，单列、不并入、不悄改基线 |

限制：完整 diff（Pi 线相对 dev-0 的具体差异清单）与逐文件写入 allowlist 属启动方案实施项，本轮不产出、不修复所发现问题。
