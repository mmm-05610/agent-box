# ACP_IMPLEMENTATION_IDENTITY_MATRIX — 实现/官方性身份矩阵

观察日期 2026-09-02。来源分级与六类事实分离见 [SOURCE_POLICY.md](SOURCE_POLICY.md)。
每行是一家 Harness 的 ACP 实现；六类事实**逐项独立判定**，"有 SDK"不构成兼容性证据。
dossier：`harnesses/<id>/{ACP_FACTS,EVIDENCE,candidate-acp}.toml`（同目录）。

## 六类事实图例

- **F1** ACP 官方 SDK 存在（协议级事实：TS `@agentclientprotocol/sdk` 1.4.0 / Py `agent-client-protocol` 0.12.1 / Rust `agent-client-protocol` 2.0.0 + Kotlin/Java；对全表同真，不逐行重复举证）
- **F2** 该 Harness 有 ACP Registry manifest（`agentclientprotocol/registry`，43 条目，curated，仅收有 authentication 的 agent）
- **F3** 存在第三方 ACP wrapper
- **F4** agentclientprotocol 协议组织名下有专用 adapter
- **F5** Harness 厂商官方原生支持 ACP
- **F6** Codeg/Zed 能安装并运行该 Agent

## 五家必选对象

| Harness | ACP 实现名 | 实现仓库 / 分发 | 维护方 | F1 | F2 | F3 | F4 | F5 | F6 | 版本（pin 建议） | license | 活跃度 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Codex** | `codex-acp`（包装 `codex app-server`） | github.com/agentclientprotocol/codex-acp；npm `@agentclientprotocol/codex-acp` | ACP 协议组织（authors: OpenAI/JetBrains/Zed；近期 commits 为 JetBrains 员工）；前身 zed-industries/codex-acp(Rust) 已弃 | YES | YES（条目 `codex-acp`，列的是 adapter 非 codex 本体） | YES（主 wrapper 即该 adapter；另有 cola-io/codex-acp 142★ 等） | YES | **NO**（0.152.0 无 flag；二进制 strings 0 命中；openai/codex#30052 open 无回应） | YES（Zed external agents；Codeg pin 1.7.0） | **@agentclientprotocol/codex-acp@1.8.0**（2026-09-01；Codeg 尚 pin 1.7.0）+ `@openai/codex` 0.152.0 | Apache-2.0 | 极高（日发布；registry 每日 conformance 探测） |
| **Claude Code** | `claude-agent-acp`（包装 Claude Agent SDK→内嵌 claude 二进制） | github.com/agentclientprotocol/claude-agent-acp；npm `@agentclientprotocol/claude-agent-acp` | ACP 协议组织（实际维护者 Zed Industries，package.json author）；前身 zed-industries/claude-code-acp 已整体移交 | YES | YES（条目 `claude-acp`=adapter；**无** `claude-code` 厂商条目；manifest authors "Anthropic, Zed Industries, JetBrains" 与 repo 事实矛盾 CONTRADICTED） | YES | YES | **NO**（claude 2.1.247 `--help` 零 ACP；原生二进制 strings 0；anthropics/claude-code#24411 open） | YES（Zed Registry "Claude Agent"；Codeg 内置） | **@agentclientprotocol/claude-agent-acp@0.73.0**（2026-09-01；Codeg 尚 pin 0.69.0）+ 内嵌 CLI 由 claude-agent-sdk 0.3.257 决定（与宿主 2.1.247 可分叉） | Apache-2.0（registry manifest 写 proprietary = CONTRADICTED） | 极高（0.68→0.73 全部在 2026-08-14 后） |
| **OpenCode** | **vendor 内建**（`opencode acp` 子命令，packages/opencode/src/acp/ 12 模块 3537 行，基于官方 TS SDK 0.21.0） | github.com/anomalyco/opencode（**sst/opencode 2026-09-02 起 301 重定向**）；官方文档 opencode.ai/docs/acp/ | OpenCode/Anomaly 官方（PR #2947 2025-10-20 合入） | YES | YES（条目 `opencode` v1.18.26，六平台二进制**带 sha256**） | NO（社区 PR #2422 关闭未合；无维护中 wrapper） | NO | **YES（PROVEN）** | YES（Zed docs external agent；Codeg Binary 分发 pin 1.18.25） | **opencode 1.18.26**（本机 1.18.21；近每日发版） | MIT | 极高 |
| **Hermes** | **vendor 内建**（`hermes acp`；官方 in-tree `acp_adapter/`，基于 Py 官方 SDK，pin `agent-client-protocol==0.9.0`） | github.com/NousResearch/hermes-agent（随官方分发：PyPI 0.19.0 wheel / shell 安装 / Docker / Nix）；官方文档两个 ACP 专页 | Nous Research 官方 | YES | **NO**（registry.json 39→43 条目无 hermes；4 个 PR #255/#436/#529/#546 全部 open，阻塞于官方 npm launcher 未发布 404） | YES 但冗余（hermes-agent-acp-bridge 4★ 等，官方原生实现使其无价值） | NO | **YES（实现级 PROVEN：in-tree 模块+专页+15 专测）** | 部分（Zed 可 custom agent_servers 手工注册；Codeg 走社区 npm 桥 `hermes-agent@0.20.6` 或官方安装） | **hermes 0.19.0 + agent-client-protocol==0.9.0**（上游 0.21.0 已出；0.20+ 改 configOptions 通道=VERSION_SENSITIVE） | MIT | 高 |
| **Pi** | `pi-acp`（社区 adapter；spawn `pi --mode rpc`） | github.com/svkozak/pi-acp；npm `pi-acp` | 个人（Sergii Kozak）；Pi 作者（badlogic/Mario Zechner）**零参与** | YES | YES（条目 `pi-acp` v0.0.33，agents 页 "Pi (via pi-acp adapter)"） | YES | NO（org 13 repo 无 pi） | **NO（PROVEN ABSENT）**：monorepo 与 0.84.4 产物零 ACP 引用；issue #175 厂商明言"no need for ACP…trivial to build on RPC mode"；PR #241/#836 `--mode acp` 均关闭 | YES（Zed Registry；Codeg `acpInstallPiBinary`+pi-acp） | **pi 0.84.4 + pi-acp 0.0.33**（2026-07-30 后无发版；单维护者 MVP，Zed-centric） | pi: MIT；pi-acp: 见 repo | pi 极高；pi-acp 低-中 |

## 辅助对象（证据等级：AUXILIARY，仅用于扩展性判断）

| Harness | ACP 实现 | F5 厂商原生 | F2 Registry | pin 建议 | 决策 | confidence |
|---|---|---|---|---|---|---|
| Gemini CLI | vendor 内建 `gemini --acp`（`--experimental-acp` 已是 deprecated alias，2026-03 改名） | YES | YES（条目 `gemini` v0.58.0） | @google/gemini-cli@0.58.0 | ACP_PRIMARY | 高 |
| Qwen Code | vendor 内建 `qwen --acp`（gemini-cli 深分叉 + acp-bridge/daemon 超集） | YES | YES（条目 `qwen-code` v0.22.3） | qwen-code 0.22.3 | ACP_PRIMARY | 高 |
| Grok Build | vendor 内建 `grok agent stdio`（Rust，依赖协议方官方 crate agent-client-protocol 0.10.4） | YES（xai-org/grok-build） | YES（条目 `grok-build` v1.0.17） | @xai-official/grok@1.0.5（版本信号 CONTRADICTED：registry 1.0.17 vs changelog 0.2.97 vs 镜像 0.1.4） | ACP_PRIMARY | 协议面高/版本号低 |

## 横向结论

1. **F5（厂商原生）是唯一稳定的兼容性信号**：五家必选里只有 OpenCode、Hermes 为 YES；
   Codex/Claude 靠协议组织 adapter（质量高但非厂商，版本与厂商 CLI 解耦）；
   Pi 连 adapter 都是个人社区件且厂商明拒。
2. **F2 ≠ F5**：Registry 43 条目里 pi-acp（社区）、claude-acp/codex-acp（adapter）都在列，
   Hermes（厂商原生）反而不在列——Registry 是"可安装性"清单，不是"官方支持"清单。
3. **adapter 移交潮**：claude/codex 两个最重要的 adapter 已从 Zed 名下移交 agentclientprotocol
   协议组织（2026-02~03 窗口），并由 OpenAI/JetBrains/Zed 联合署名维护——第三方 wrapper
   的"组织信誉"在 2026 年显著上升，但**仍非 Harness 厂商代码**。
4. **协议版本号不是兼容性键**（协议代理 + 辅助代理双源确认）：wire protocol 全部是 1，
   但各家 SDK pin 从 0.9.0 到 1.4.0 不等、schema artifact v1.21.0——能力判定必须按
   initialize 的 agentCapabilities 逐项探测，不能看版本号。

来源：各 dossier EVIDENCE.md（编号 E-x 对应其表）；协议事实 [ACP_PROTOCOL_CAPABILITY_MATRIX.md](ACP_PROTOCOL_CAPABILITY_MATRIX.md)。
