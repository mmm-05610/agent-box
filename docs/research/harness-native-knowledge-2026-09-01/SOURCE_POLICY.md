# SOURCE_POLICY — 证据来源政策

本知识库的每一项事实都必须可追溯。本文件定义来源分类、标注要求与禁止事项。
所有记录的观察日期为 2026-09-01 / 2026-09-02（环境：WSL2 x64 Linux）。

## 1. 来源分类（source kind）

| kind | 含义 | 可信度权重 |
| --- | --- | --- |
| `OFFICIAL_DOC` | 官方产品文档（含官方 SDK 文档） | 高 |
| `OFFICIAL_SOURCE` | 官方仓库源码 / 官方发行包内的源码与元数据 | 高 |
| `CLI_OBSERVED` | 本机对官方 CLI 的实际探测（`--version` / `--help` / 隔离 HOME 行为） | 高（对本机版本） |
| `RELEASE_NOTE` | 官方 changelog / release notes | 高 |
| `PEER_PROJECT` | 第三方参考项目的实现或 README | 中（仅证明该项目自己的行为，**不是**官方 CLI 事实） |
| `INFERENCE` | 由上述证据推断、未经直接验证的结论 | 低，必须显式标注 |

硬性规则：

1. **不得把第三方项目的实现写成官方 CLI 能力**。参考项目只能作为 PEER_PROJECT 证据，
   用于说明"某种做法可行/某事实曾被发现"，不能证明 CLI 原生行为。
2. `documented`（官方文档写的）、`observed`（本机实际看到的）、`inferred`（推断的）
   三类信息在 FACTS.md 中必须分开呈现，不得混写。
3. 未经任何来源验证的事实必须进入该 harness 的 `UNRESOLVED` 列表，不得写成
   `unsupported`（unknown ≠ false）。

## 2. 每项事实的标注字段

- `source`：URL 或 `repository file:line`（本地仓库用 `src/...` 相对路径）。
- `source_kind`：上表之一。
- `observed`：观察日期。
- `version`：CLI 版本或 commit。
- `confidence`：HIGH / MEDIUM / LOW。
- `stability`：STABLE / VERSION_SENSITIVE / UNKNOWN。
  - CLI 频繁发版（如 opencode、pi、claude-code）上的 flag/事件格式默认 VERSION_SENSITIVE。
  - 配置目录位置、登录机制等通常 STABLE，但需单独判断。

## 3. 实验规则（本轮全部实验均遵守）

允许：`command -v`；`<binary> --version`；`--help` / `<sub> --help`；官方仓库 clone 到
`/tmp`；隔离 `mktemp` HOME 下不触发模型请求的探测；fake executable 验证 argv/env 解析；
临时目录 before/after diff；依赖仅装入 `/tmp` 隔离前缀/venv。

禁止（本轮全程未执行）：

- 任何真实模型请求或收费 API 调用；
- 登录/退出任何账户；
- 读取任何真实 credential 文件内容（auth.json、.credentials.json、keychain、.env 等）；
  仅允许记录文件名/存在性/mtime；
- 修改真实 `~/.codex`、`~/.claude`、`~/.config/opencode`、`~/.hermes`、`~/.pi` 等
  原生 home（仅允许只读 ls 目录名）；
- 使用用户真实 HOME 做会产生文件的实验；
- 全局 npm/pip 安装；git 写操作；修改本仓库任何产品文件。

## 4. 脱敏规则

文档中禁止出现真实用户路径、用户名、token、credential、session 内容：

- 用户真实 home（含用户名）→ `<user-home>`
- 临时目录 → `<temp-home>`
- 本仓库路径 → `<workspace>`（仓库内相对路径如 `src/...` 允许）
- 二进制绝对路径 → `<binary>`
- npm 全局前缀 → `<npm-global>`

## 5. 分级（Tier）定义

- **Tier A**：官方文档 + 源码 + 本地/隔离实验充分，可形成完整 Adapter 候选。
- **Tier B**：主要事实明确，但事件、session、credential 或隔离信息不完整。
- **Tier C**：仅登记身份与已知能力，不建议进入正式 Registry。

只有 Tier A 可建议进入正式支持；Tier B/C 仅入知识库。
