# 实验记录（experiments/）

本目录存放全部本地实验的**脱敏**记录。政策见 `../SOURCE_POLICY.md`。

全部实验遵守：

- 无真实模型请求、无收费调用、无登录/登出；
- 不读取任何 credential 文件内容；
- 不修改真实原生 home（`~/.codex` 等），只做只读目录名列举；
- 临时 HOME 均为 `mktemp` 创建，实验后记录 before/after diff；
- 依赖只装入 `/tmp` 隔离前缀。

## 记录索引

| 文件 | 内容 |
| --- | --- |
| `baseline-probes.md` | 主会话对四个本机二进制的版本探测（codex/claude/opencode/hermes） |
| `codex.md` | Codex CLI 探测（帮助文本、CODEX_HOME 隔离探测） |
| `claude-code.md` | Claude Code 探测 |
| `opencode.md` | OpenCode 探测 |
| `hermes.md` | Hermes 探测 + 安装包布局 |
| `pi.md` | Pi 探测（/tmp 隔离安装） |
| `candidates-1.md` | zcode / grok-build / kilo-code 探测 |
| `candidates-2.md` | gemini-cli / aider / qwen-code 探测 |

## 环境基线

- OS：WSL2 x64（Linux kernel 6.18，`WSL_DISTRO_NAME` 存在）。
- 观察日期：2026-09-01 / 2026-09-02。
- npm 全局前缀：`<npm-global>`；用户 home：`<user-home>`。
