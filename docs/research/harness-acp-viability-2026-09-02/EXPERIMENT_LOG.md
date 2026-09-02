# EXPERIMENT_LOG — 本轮只读实验记录

主理人实验（协议/Harness 代理的实验见各自 research-notes/ 与 EVIDENCE.md）。

| # | 日期 | 命令/动作 | 目的 | 结果 | 风险评估 |
| --- | --- | --- | --- | --- | --- |
| E1 | 2026-09-02 | `pwd`/`git branch --show-current`/`git rev-parse HEAD`/`git status --short`/`git diff --check`（本仓库） | 记录基线 | branch `feat/resource-routing-phase2`；HEAD `1a3c3083c0adaee644a58714040fc402eda28d7f`；dirty worktree 与预期一致；diff --check 干净 | 只读 |
| E2 | 2026-09-02 | `command -v` codex/claude/opencode/hermes/pi/gemini/qwen/grok/acp | 本机资产盘点 | codex/claude/opencode/hermes 存在（`<npm-global>`、`<user-home>/.local/bin`）；pi/gemini/qwen/grok/acp 不在 PATH | 只读 |
| E3 | 2026-09-02 | `codex --version` / `claude --version` / `opencode --version` / `hermes --version` | 版本固定 | codex-cli 0.152.0；Claude Code 2.1.247；opencode 1.18.21；Hermes Agent v0.19.0 (2026.7.20, upstream f15a38ee, git 安装) | 只读，无模型调用 |
| E4 | 2026-09-02 | 四个 CLI `--help` 输出 `grep -i acp` | 本机 ACP 原生支持探测 | **codex：无**；**claude：无**；**opencode：`opencode acp` "start ACP (Agent Client Protocol) server"**；**hermes：`acp` 子命令 "Run Hermes Agent as an ACP (Agent Client Protocol)"** | 只读 |
| E5 | 2026-09-02 | `opencode acp --help` | 启动面审计 | 选项含 `--print-logs --log-level --pure --port(default 0) --hostname(127.0.0.1) --mdns --mdns-domain --cors --cwd`；存在网络监听面（port/hostname/mdns/cors），transport 细节待源码级确认 | 只读 |
| E6 | 2026-09-02 | `hermes acp --help` | 启动面审计 | 选项 `--accept-hooks`（无 TTY 时自动批准未知 shell hooks！）、`--version`、`--check`、`--setup`、`--setup-browser`（向 `<user-home>/.hermes/node/` 安装 agent-browser+Playwright Chromium，约 400MB 下载确认）、`--yes` | 只读；**未执行 --check/--setup**（无法证明不触碰 credential/config 内容） |
| E7 | 2026-09-02 | `hermes acp --version` / `opencode acp --version` | ACP 模式版本 | hermes ACP 0.19.0；opencode ACP 1.18.21 | 只读 |
| E8 | 2026-09-02 | `codex app-server --help` | native app-server 启动面 | `[experimental]`；子命令 `daemon`（管理本地 app-server daemon）、`proxy`（stdio 代理到 control socket）、`generate-ts` | 只读 |
| E9 | 2026-09-02 | `<agent-box-studio>` 源码只读审计（见 CODEG_ACP_RUNTIME_ARCHAEOLOGY.md） | Codeg 链路 file:line | 完成 | 只读，无写操作 |

## 明确不执行清单（本轮）

- `hermes acp --check`：官方语义为"验证 ACP 依赖与 adapter imports 后退出"，但无法证明其
  不读取 `~/.hermes` 配置/credential 内容 → 按政策改源码级审计。
- 任何 `--setup`/`--setup-browser`：涉及交互与下载。
- `codex app-server`（实际启动）、任何 ACP `initialize` 发向真实 CLI、任何 session/prompt。
- pi 未安装：全部走 npm metadata + /tmp 安装（由 pi 代理执行）。
