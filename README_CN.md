# Agent-Box 2.0.0a1 Developer Preview

Agent-Box 是面向 AI coding agent 的执行治理层：解析精确的外部资源，将其冻结为
Execution Binding，调度原生 Harness，并在多次执行之间保留输出与证据。

这是 Developer Preview / Experimental API，不是生产稳定版，也不是完整的
Agent Workflow 平台；不内置 workflow engine、scheduler、routing、retry 或生产级
sandbox。

## 安装

### GitHub wheelhouse

下载 release 的全部 assets 到同一目录后执行：

```bash
pip install --pre --find-links . "agent-box-cli[preview]==2.0.0a1"
agent-box doctor --json
agent-box plugins list --json
agent-box launch
```

### Source checkout

从 GitHub clone 后从源码安装 Preview；本 Preview 尚未发布到 PyPI，不能使用无条件
的普通 PyPI 安装命令。

仅安装 Root 也可运行 `plugins list`、`doctor`、版本和帮助；未安装 Web 时，
`web`/`launch` 会输出可操作的安装提示。贡献者安装使用 `pip install -e .`，
再以 editable 方式安装正式插件。

## 正式路径

Quick Launch 准备 Work、责任明确的 Execution、精确 repository/revision、不可变
Profile revision、Fresh/Continue 输入和 managed/existing tmux。用户显式审核、
Freeze、Dispatch、打开或复制 provider 生成的 terminal attach 命令，并显式 Finish。
终端输出成为新 Execution 的 WorkspaceRef。

官方 Harness 统一由一个 registry wheel 提供，包含 Codex、Claude Code、OpenCode、Hermes 与 Pi；Profile provider 统一为 `harness-profile`。旧 1.x fixed workflow、Profile/session 数据库、TUI、PyWebView 和浏览器 shell 均已
退休。详见 [docs/README.md](docs/README.md) 与
[当前 Phase 6 RC 证据](docs/validation/current/REPOSITORY_RESTRUCTURE_PHASE_6_RELEASE_CANDIDATE.md)，以及[五 Harness 合并报告](docs/validation/current/FIVE_HARNESS_REGISTRY_CONSOLIDATION.md)。
