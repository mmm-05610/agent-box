# 矩阵：平台支持（platform-support）

来源：各 candidate.toml `[platform]` 节 + FACTS.md B 节。观察日期 2026-09-01/02。
三态规则：supported / unsupported / unknown（unknown 不作 false 处理）。

| harness | Linux | WSL | Windows native | macOS | 沙箱引擎 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| codex | supported | WSL2 官方支持路径 | WSL2 是文档目标；native Windows sandbox 代码存在但 experimental（windows-sandbox-rs、`[windows]` 配置节） | supported | Linux: Landlock+seccomp（`codex-linux-sandbox` argv[0] helper；bwrap 分支已移除）；macOS: Seatbelt（`CODEX_SANDBOX=seatbelt`） | 官方系统要求"Windows 11 via WSL2" |
| claude-code | supported（Ubuntu 20.04+/Debian 10+/Alpine 3.19+） | supported，但 sandboxing **要求 WSL2**（bubblewrap；WSL1 不行） | Windows 10 1809+/Server 2019+，**native Windows sandboxing unsupported** | supported（≥13.0） | macOS: Seatbelt；Linux/WSL2: bubblewrap（依赖 bwrap+socat） | ripgrep 内置 native binary；musl 需 `USE_BUILTIN_RIPGREP=0`；Alpine 需额外 bash/curl/libgcc/libstdc++/ripgrep |
| opencode | supported | unknown（本机 WSL2 下无异常，但官方 WSL 专门支持未证实） | supported（native + desktop app） | supported | 无自有 OS 沙箱（应用层 permissions 配置） | 每日发版，行为全部 VERSION_SENSITIVE |
| hermes | supported | WSL2 supported | native Windows supported（`%LOCALAPPDATA%\hermes`、pywinpty；source-read，未本机验证） | supported | 无自有 OS 沙箱 | Termux 亦文档化 |
| pi | supported | WSL2 可用（本研究即在 WSL2 下进行） | supported（Git Bash 为默认 shell；0.84.3 起可选 powershell 工具） | supported | 无自有 OS 沙箱 | Termux 文档化；Node ≥22.19 |
| grok-build | supported | unknown | supported | supported | 未验证 | beta |
| kilo-code | supported | unknown | supported | supported | 未验证 | Node ≥20 |
| zcode | linux 安装包存在 | unknown | supported | supported | N/A（桌面 ADE） | 无 CLI 面 |

## 对 Agent-Box 的含义

1. **Sandbox 协议矩阵必须按 harness×平台区分**：codex/claude 自带 OS 沙箱（Landlock/Seatbelt/bwrap），
   在 Agent-Box bwrap 沙箱内再嵌套可能冲突（landlock 不可嵌套、Seatbelt 不可用）；opencode/pi/hermes
   无自有 OS 沙箱，依赖宿主投影。→ `harness.runtime.sandbox_capabilities` 声明若被消费，
   必须能表达"自带沙箱 vs 依赖外部沙箱"（现状：字段未消费）。
2. **WSL2 亲和性**：RuntimeHost 已有 native-linux/wsl realm 与 affinity（runtime-local provider）；
   claude-code 的"WSL2 才能沙箱"和 codex 的"WSL2 是 Windows 官方路径"与 realm 概念天然对齐。
3. musl/Alpine 平台 claude 需额外依赖 → bundle 声明若实现，需要平台条件成员。
4. 本知识库全部 CLI_OBSERVED 证据均在 linux-x64（WSL2）取得；macOS/Windows 行为除 hermes/pi 文档外
   多为推断，标注 confidence MEDIUM 以下。
