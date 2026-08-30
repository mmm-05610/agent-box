# Agent-Box Preview Live Runbook
>
> Historical record — describes an earlier architecture or validation state and is not current implementation guidance.

这份文档用于现场跑通和录制 Agent-Box Preview。命令按实际演示顺序追加；每次只执行当前步骤，不代表预定义完整 Workflow。

## 当前 tmux 布局

- `%0`：左侧 WorkBoard
- `%1`：右上 Host / Control
- `%2`：右下 interactive Execution

查看精确 pane identity：

```bash
tmux list-panes -F 'pane=#{pane_id} index=#{pane_index} command=#{pane_current_command} path=#{pane_current_path}'
```

## Step 1 — 创建模糊 Work

在右上 Host / Control pane `%1` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
python -m agent_box.work_core.cli create-work \
  "给 DeepSeek Harness 开发一个多会话配置插件：不同会话使用独立配置，同时共享 MCP、插件和凭证等外部能力。" \
  | tee /tmp/agent-box-demo-work-id
```

## Step 2 — 启动 WorkBoard

在左侧 pane `%0` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
WORK_ID=$(cat /tmp/agent-box-demo-work-id)
agent-box-workboard watch "$WORK_ID"
```

预期：Work 为 `OPEN`，尚无 Execution。

## Step 3 — 创建当前 investigation Execution

在右上 Host / Control pane `%1` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
python scripts/preview_demo/create_investigation_execution.py
```

预期：

- 命令打印并保存真实 `execution_id`；
- WorkBoard 出现第一个 Execution 卡片；
- Provider 为 `codex-tmux-interactive`；
- Execution 已创建，但尚未 Dispatch。

下一步将在确认卡片出现后追加：准备 exact Git revision、context artifact、Codex profile 和 `%2` TmuxPaneRef，然后 Freeze & Dispatch。

## Step 4 — Binding freeze 前检查

在右上 Host / Control pane `%1` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
python scripts/preview_demo/inspect_dispatch_inputs.py
```

该命令只读取并显示：

- 当前 Git `HEAD` 和 tree；
- 尚未进入 frozen commit 的 dirty/untracked 文件；
- 当前可用 Agent-Box profiles；
- 右下 `%2` 的 exact tmux pane identity。

此步骤不创建 Ref association、不冻结 Binding，也不启动 Provider。确认输出后，再选择 Codex profile 和 source revision。

本次 Human/Host 选择的主 Author profile：

```text
codex-plus
```

它将在 Dispatch 前解析为 exact `agent-box.profile@1` 输入并冻结；Profile 选择不会改变 accountable ExecutionProvider（仍为 `codex-tmux-interactive`）。

## Step 5 — 准备独立的目标项目仓库

当前 Agent-Box 开发仓库包含大量尚未提交的实现，不能把旧 `HEAD` 冒充当前真实源码，也不应把 Agent-Box 本身与被开发的 DeepSeek Harness 插件混在一起。

在右上 Host / Control pane `%1` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
python scripts/preview_demo/prepare_target_repository.py
```

脚本会安全地准备：

```text
/home/maoqh/projects/deepseek-harness-multisession-plugin
```

它只写入模糊 Work objective 和 `.gitignore`，不预设实现方案；随后产生一个干净、可冻结的真实 Git commit/tree。脚本不会修改、提交或清理 Agent-Box 仓库。如果目标路径已存在且不是安全的干净仓库，脚本会拒绝覆盖。

## Step 6 — Freeze & Dispatch investigation Execution

本次 Binding 输入：

- Workspace：目标项目 `HEAD` 解析出的 exact commit/tree；
- Responsibility context：immutable investigation prompt artifact；
- Profile：`codex-plus` 的 exact profile digest；
- Console：右下 `%2` 的 exact `TmuxPaneRef`。

在右上 Host / Control pane `%1` 执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
sqlite3 "$HOME/.agent-box/agent-box.db" ".backup '$HOME/.agent-box/agent-box.db.pre-v006'"
python scripts/preview_demo/run_investigation_execution.py
```

首次运行如果遇到 `core_execution_refs` 缺少 `contract_id`，说明本地数据库曾把另一份 schema 记录为 migration 005。当前代码已将 Resource Contract migration 正确升级为 006，并在迁移前通过 SQLite `.backup` 保留数据库。006 会把旧 Dispatch 原始字段保留在 `core_dispatches_pre_v006_archive`，旧 `starting` 只映射为 `legacy-unverifiable`，不会伪装成当前协议下的 accepted Dispatch。

该 Host runner 会保持运行。Dispatch 成功后：

1. 左侧 WorkBoard 将 Execution 显示为 `ACTIVE`；
2. 右下 `%2` 自动被 Codex TUI 替换；
3. 用户在 `%2` 与 Codex 多轮交互；
4. 一轮回复或 idle 不会结束 Execution；
5. 责任完成后回到右上 `%1`，输入大写 `FINISH`；
6. Provider 才会固定 scrollback、native SessionRef、workspace facts 和输出 artifact，并把 Execution 观察为 terminal。

不要通过 `Ctrl+C` 代替 `FINISH`。当前 Preview Host runner 故意不伪造跨进程 provider-handle recovery。

### Recovery — Dispatch 已 accepted，但 Host evidence 写入失败

如果右下 Codex 已启动、WorkBoard 已是 `ACTIVE`，但右上 Host runner 因 evidence persistence 异常退出，不得再次 Dispatch。执行：

```bash
cd /home/maoqh/projects/agent-box
source .venv/bin/activate
python scripts/preview_demo/recover_investigation_control.py
```

该命令从 frozen inputs、existing accepted Dispatch、native SessionStart evidence 和 exact tmux pane 重建插件 handle。它不会重新启动 Codex，也不会创建第二个 Dispatch。恢复后继续在右下交互，最终回到右上输入 `FINISH`。

## 附 — 预览 WorkBoard（scratch home，不碰真实数据库）

用独立 scratch `AGENT_BOX_HOME` 播种一个预览 Work：E1 为已结束调查（带 frozen Dispatch、inputs、native/output 与 observations），E2 为未 Dispatch 的实现 Execution（可在 UI 直接练习 Binding Composer 的 Add/Replace/Remove → Resolve → Review）。

```bash
cd /home/maoqh/projects/agent-box
AGENT_BOX_HOME=$PWD/.workboard-preview-home .venv/bin/python scripts/preview_demo/seed_preview_board.py --reset
AGENT_BOX_HOME=$PWD/.workboard-preview-home .venv/bin/agent-box-workboard work_<打印的 work id>
```

选中 E2 后按 `c`（Compose Binding）即可打开 Binding Composer。静态检查：

```bash
AGENT_BOX_HOME=$PWD/.workboard-preview-home .venv/bin/agent-box-workboard --once work_<work id>
```
