# baseline-probes — 主会话基线探测（CLI_OBSERVED）

日期：2026-09-01。环境：WSL2 x64 Linux。命令均为只读探测，无模型请求。

| binary | `command -v` 结果 | `--version` 输出（原样） | 备注 |
| --- | --- | --- | --- |
| codex | `<npm-global>/bin/codex` | `codex-cli 0.152.0` | npm 全局安装；wrapper→native 布局待 codex.md 细查 |
| claude | `<npm-global>/bin/claude` | `2.1.247 (Claude Code)` | npm 全局安装 |
| opencode | `<npm-global>/bin/opencode` | `1.18.21` | npm 全局安装 |
| hermes | `<user-home>/.local/bin/hermes` | `Hermes Agent v0.19.0 (2026.7.20) · upstream f15a38ee · local 7df3aa34 (+1 carried commit)` + `Install directory: <site-packages>` + `Install method: git` | Python 安装，git 方式 |
| pi | 未找到 | — | 需 /tmp 隔离安装探测（见 pi.md） |
| zcode | 未找到（本沙箱 PATH） | — | 本会话运行于 ZCode 内；布局观察见 candidates-1.md |
| gemini / aider / qwen / grok / kilo | 未找到 | — | 见 candidates-*.md |

source_kind：CLI_OBSERVED；confidence：HIGH（对各自本机版本）；
stability：版本号 VERSION_SENSITIVE，binary 名称 STABLE。

## 对 Agent-Box 的即时含义

1. Agent-Box registry 声明的五个 harness 中四个本机可探测（pi 除外），
   后续 FACTS 的 CLI_OBSERVED 证据可以直接锚定这些版本。
2. `hermes --version` 输出携带 upstream/local 双 commit 与安装方式，
   说明它是从 git 安装的 Python 包；其官方仓库身份仍需 OFFICIAL_SOURCE 确认。
