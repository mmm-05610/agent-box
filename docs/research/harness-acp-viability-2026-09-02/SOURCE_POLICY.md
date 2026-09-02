# SOURCE_POLICY — 证据来源政策（本轮）

观察日期：2026-09-02（环境：WSL2 x64 Linux）。本轮为**只读产品研究**：不修改产品代码、
不实现 ACP、不执行 Git 写操作、不发起真实模型请求、不读取任何 credential 内容。

## 1. 来源权威级（source class，按优先级降序）

| class | 含义 | 备注 |
| --- | --- | --- |
| `VENDOR_SOURCE` | Harness 厂商官方源码 / 官方发行包内源码与元数据 / 官方 release/tag | 最高 |
| `VENDOR_DOC` | Harness 厂商官方文档 | 最高 |
| `ACP_SPEC` | agentclientprotocol 官方规范 / schema / changelog | 最高（协议事实） |
| `ACP_SDK` | ACP 官方 SDK 源码（TS/Python/Rust） | 高（仅证明 SDK 行为，不证明某 Harness 兼容） |
| `ACP_ADAPTER_ORG` | agentclientprotocol 官方组织名下维护的专用 adapter | 高（仅证明 adapter 行为，**不等于**厂商原生支持） |
| `ZED_DOC` | Zed 官方 External Agents 文档 / Zed 维护的 adapter 仓库 | 中高（Zed 是协议发起方，但不是 Harness 厂商） |
| `CODEG_LOCAL` | 本地 Codeg/Agent-Box Studio 源码只读审计 | 高（对 Codeg 行为本机版本） |
| `CLI_OBSERVED` | 本机对官方 CLI 的只读探测（--version / --help / package metadata） | 高（对本机版本） |
| `REGISTRY_ENTRY` | ACP Registry / Zed agent registry 中的 manifest 条目 | 中（证明"可被列出/安装"，不证明官方原生支持） |
| `PEER_PROJECT` | 其他活跃开源 adapter / 集成项目的实现 | 中（仅证明该项目自身行为） |
| `ISSUE_DISCUSSION` | issue / discussion | 低；只能作为**限制或故障证据**，不能单独证明正式能力 |
| `INFERENCE` | 由上述证据推断 | 低，必须显式标注 `inferred` |

## 2. 必须分离的六类事实（禁止混写）

1. **ACP 有官方 SDK** —— 协议组织发布 SDK，与任何 Harness 无关。
2. **某 Harness 有 ACP Registry manifest** —— 被 registry 列出/可被 Zed 或 Codeg 安装。
3. **某 Harness 有第三方 ACP wrapper** —— 社区/其他公司写的适配层。
4. **ACP 组织维护专用 adapter** —— adapter 仓库在 agentclientprotocol / 协议方名下。
5. **Harness 厂商官方原生支持 ACP** —— 厂商在自己的产品里实现/内建 ACP。
6. **Codeg/Zed 能安装并运行某个 Agent** —— 宿主应用能力，不代表协议兼容质量。

"存在 SDK"绝不构成"该 Harness 已兼容 ACP"的证据。每一类事实必须独立给出处。

## 3. 每项事实的标注字段

- `source`：URL 或本地 `file:line`（Codeg 用 `<agent-box-studio>/...:NNN`；本仓库用仓库内相对路径）。
- `source_class`：上表之一。
- `observed`：观察日期。
- `version`：CLI/包版本或 commit/tag。
- `confidence`：HIGH / MEDIUM / LOW。
- `status`：PROVEN / PARTIAL / UNKNOWN / CONTRADICTED。
- `stability`（协议/启动事实）：STABLE / VERSION_SENSITIVE / UNKNOWN。

## 4. 实验边界（本轮全部遵守）

允许：`--version`、`--help`、package metadata 查询、读取已安装包公开源码/目录结构、
`/tmp` clone 官方 repo、官方 offline/unit/conformance tests、synthetic fake ACP
Client/Agent、向完全隔离无 credential 的 synthetic/fixture agent 发送 `initialize`、
temp HOME/XDG/CODEX_HOME/CLAUDE_CONFIG_DIR、检查启动产物文件名与进程树、
实验脚本仅位于知识目录或 `/tmp`、官方 ACP SDK 构造 fake frames、fake Harness 验证 transport。

禁止（本轮全程未执行）：真实模型请求；登录任何账号；读取 credential 内容
（auth.json、.credentials.json、keychain、token DB 等，仅允许记录文件名/存在性/mtime）；
把真实 HOME 交给被测 adapter；可能自动发模型请求的 session/prompt；修改产品代码；
全局安装；长期 daemon；Git 写操作；MCP Resource 实现。
无法证明某命令不读 credential 或不调模型时，不执行，改源码审计。

## 5. 脱敏规则

- 用户真实 home（含用户名）→ `<user-home>`
- 临时目录 → `<temp-home>`
- 本仓库路径 → `<workspace>`（仓库内相对路径允许）
- Codeg 仓库路径 → `<agent-box-studio>`（其仓库内相对路径允许）
- 二进制绝对路径 → `<binary>`
- npm 全局前缀 → `<npm-global>`

## 6. 能力状态词（ACP coverage 专用）

`SUPPORTED` / `PARTIAL` / `NOT_SUPPORTED` / `UNKNOWN` / `VERSION_SENSITIVE`。
UNKNOWN ≠ NOT_SUPPORTED：无证据时必须写 UNKNOWN 并进入 OPEN_QUESTIONS。

## 7. 裁决等级（每 Harness 最终 admission decision）

`ACP_PRIMARY` / `ACP_OPTIONAL` / `NATIVE_PRIMARY` / `ACP_REJECTED` / `INSUFFICIENT_EVIDENCE`。

## 8. 双 spawn / sandbox 裁决等级

`SAFE_WITHIN_EXISTING_RUNTIME` / `REQUIRES_RUNTIME_CHANGE` / `UNSAFE` / `UNKNOWN`。
