# FIELD_GLOSSARY — 知识字段表

每个 Harness 的 FACTS.md 至少覆盖 A–J 十组字段。字段定义如下；
candidate.toml 中的对应节名在括号中给出。

## A. Identity and distribution（`[identity]` `[distribution]`）

- `harness_id`：Agent-Box 内的 canonical ID（snake-case，如 `claude-code`）。
- `aliases`：社区/别名/旧名（如 `claude`、`codex-cli`）。
- `display_name`、`upstream_org`、`official_repository`、`official_documentation`。
- `license`、`package_names`（npm/pip/brew 名）、`binary_names`。
- `verified_version`：本机或官方源确认的版本。
- `maintenance_status`：active / dormant / unknown，附最近发布证据。

## B. Executable discovery（`[executable]`）

- 各 OS 的 binary 候选；PATH 行为；npm wrapper / 原生二进制 / bundle 布局；
  companion 文件（如 codex-app-server）；解释器/运行时依赖；
  version 命令与输出格式；安全的可用性探测（不触发模型）；
  WSL / Windows / macOS 差异；安装提示。

## C. Launch modes（`[launch_modes.*]`）

每种真实模式（headless / interactive / server / app-server / resume）分别记录：
`argv` 模板；prompt 传递（argv/stdin/file/protocol）；cwd 行为；必需 env；
stdio/pty/socket/http；输出格式；原生 sandbox/approval flag；resume 调用；
attach 能力；退出语义（进程退出 == 任务完成?）；网络要求。

## D. Profile and configuration（`[profile]`）

- 各 OS 的 native home；可覆盖的 env（如 `CLAUDE_CONFIG_DIR`、`CODEX_HOME`）；
  配置文件名、格式；user/project/local/managed 作用域与优先级；
  model/provider 字段；native payload schema 候选；
  可持久化字段 vs 必须保持 opaque 的字段；
  初始化行为、配置写行为、并发写行为。

## E. Credentials（`[credentials]`）

只记录形状、位置类别和机制，绝不记录值：
API key env vars；OAuth/subscription 机制；credential 文件相对名；
OS keychain 使用；优先级；login/logout 命令与作用域；
profile 隔离可行性；subscription 身份隔离可行性；
安全 materialization 分类；禁止进入 Profile/Binding/Evidence 的字段。

## F. State isolation（`[isolation]`）

按 multi-cli 分类：account state / normal shared state / session state /
cache state / unsafe state；文件 vs 目录路径；
只读共享安全路径；需 copy-on-write 的路径；需 execution-local 可写 overlay 的路径；
绝不投影的路径；并发级别；singleton 范围；
跨 profile session 续接可行性；跨平台差异。

## G. Native resource surfaces（`[resource_surfaces]`）

对 instructions / skills / MCP / prompts / rules / agents(subagents) / commands /
hooks / plugins(extensions) / memory 逐项记录：
supported / unsupported / unknown；原生发现目标；文件格式；递归规则；命名规则；
作用域；优先级；相关 env；目标可否只读；是否必须可写；嵌套还是聚合；
重名是否冲突；版本敏感度。
（MCP 本轮仅记录原生事实，不做 Agent-Box 实现。）

## H. Execution events and observation（`[events]`）

支持的结构化输出模式；事件 envelope/版本；message delta；final message；
reasoning 事件（如公开）；tool call；tool result；permission request/result；
session ID；model；token usage；cost；warning；stderr 诊断；进程退出语义；
native completion marker；取消；malformed/unknown 事件处理；
session log 位置与一致性。

## I. Runtime control（`[control]`）

interrupt；cancel；steer/follow-up；attach；permission response；
native resume；model switch；effort/reasoning switch；terminal resize；
detach/reconnect；已知限制。

## J. Agent-Box mapping（FACTS.md J 节）

每项事实归属且仅归属一个 owner：

| owner | 含义 |
| --- | --- |
| harness-registry-declaration | 声明化放入 Harness Registry（harnesses.toml） |
| harness-native-adapter | 必须由 Harness-native Adapter 代码实现 |
| profile-store / native-payload | Profile Store 与原生 payload 的所有权 |
| credential-materializer | Credential 材料化协议 |
| resource-projector | Resource Projector（Skill 等资源投影），不属于 Adapter |
| runtime-host-protocol | Runtime Host 协议（stage/transport） |
| sandbox-protocol | Sandbox 协议（wrap/mounts） |
| terminal-session-protocol | Terminal Session 协议 |
| host-control | HostControl contribution（observe/finish/attach） |
| observation-envelope-candidate | Observation/事件信封候选 |
| not-agent-box | 不应进入 Agent-Box |

同一事实出现两个合理 owner 时标记 `AUTHORITY_CONFLICT`，不得隐藏。
