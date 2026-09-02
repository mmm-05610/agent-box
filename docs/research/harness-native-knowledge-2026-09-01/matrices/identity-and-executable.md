# 矩阵：身份与可执行发现（identity-and-executable）

综合来源：各 `harnesses/<id>/candidate.toml` 的 `[meta]/[identity]/[executable]/[platform]`，
FACTS.md A/B 节，`experiments/baseline-probes.md`。观察日期 2026-09-01/02，
环境 WSL2 x64。tier 定义见 `../SOURCE_POLICY.md` §5。

## 1. 身份总表

| harness_id | 官方名 | 维护方 | 官方仓库 | 文档 | 许可 | 发行 | 已验证版本 | Tier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| codex | Codex CLI | OpenAI | github.com/openai/codex | learn.chatgpt.com/docs（developers.openai.com/codex 308 跳转） | Apache-2.0 | npm `@openai/codex`、brew、DotSlash | 0.152.0（CLI_OBSERVED） | A |
| claude-code | Claude Code | Anthropic | github.com/anthropics/claude-code | code.claude.com/docs | 专有（npm 元数据） | npm `@anthropic-ai/claude-code`（native binary 发行）、native installer | 2.1.247（CLI_OBSERVED） | A |
| opencode | OpenCode | sst | github.com/sst/opencode | opencode.ai/docs | MIT | npm `opencode-ai`、brew、deb/rpm/AppImage、desktop apps | 1.18.21（CLI_OBSERVED；repo HEAD 1.18.25） | A |
| hermes | Hermes Agent | Nous Research | github.com/NousResearch/hermes-agent | hermes-agent.nousresearch.com/docs | MIT | git 安装的 Python 包（pip 名 hermes-agent；PyPI 状态 UNRESOLVED） | v0.19.0 本机（upstream 已到 v0.21.0） | A |
| pi | Pi Coding Agent | Earendil Works（badlogic/mitsuhiko/rwachtler） | github.com/earendil-works/pi（badlogic/pi-mono 重定向） | in-repo docs + pi.dev | MIT | npm `@earendil-works/pi-coding-agent` | 0.84.4（/tmp 隔离安装 CLI_OBSERVED） | A |
| grok-build | Grok Build | xAI | github.com/xai-org/grok-build | docs.x.ai/build、x.ai/cli | Apache-2.0 | curl 安装脚本（Rust native）；beta | 源码 rev d761e8b（版本号 UNRESOLVED） | A |
| kilo-code | Kilo Code CLI | Kilo（Kilo-Org） | github.com/Kilo-Org/kilocode | kilo.ai/docs | npm 元数据 Apache-2.0 vs README MIT（UNRESOLVED） | npm `@kilocode/cli` | 7.5.6（npm registry） | B |
| zcode | ZCode（桌面 ADE） | Z.ai（Zhipu AI） | 无公开 repo | zcode.z.ai/docs | unknown | 桌面安装包 v3.10.2 | — | C |

身份陷阱（对 Agent-Box Registry 直接有影响）：

1. **opencode**：`opencode-ai/opencode` 已 ARCHIVED（原 Go 代码库，现名 Crush，Charm 团队维护）；
   现行 OpenCode 是 `sst/opencode`（TS core + TS TUI）。"Go core + TS TUI" 是过期线索。
2. **pi**：npm `@mariozechner/pi` 已是无关产品（pi-pods vLLM pods CLI）；
   正确包名 `@earendil-works/pi-coding-agent`；`badlogic/pi-mono` 只是重定向。
3. **hermes**：Nous Hermes 模型家族 ≠ Hermes Agent 工具；其它同名 `hermes` 包存在。
4. **claude**：npm 全局 bin 目录中可能出现第三方 ACP 适配器（`@agentclientprotocol/claude-agent-acp`），
   不是官方产物，发现逻辑不得混淆。
5. **zcode**：官方文档仅描述桌面 ADE，未发现官方独立 CLI/无头入口（Tier C 的决定性事实）。

## 2. 可执行发现总表

| harness | binary | 版本探测 | 探测副作用 | 布局要点 | companion / 伴生 |
| --- | --- | --- | --- | --- | --- |
| codex | `codex` | `--version` → `codex-cli <semver>`，exit 0 | 缺 CODEX_HOME 时 stderr 出 PATH-alias 警告（无害）；temp HOME 下拒绝建 alias | npm wrapper → native Rust binary；单二进制按 argv[0] 多路分发（`codex-linux-sandbox`） | helper alias 在 CODEX_HOME 下创建（warn-only）；`codex doctor` 可做预检（--json 脱敏） |
| claude-code | `claude` | `--version` → `<semver> (Claude Code)`，exit 0 | **无**（temp-HOME/CLAUDE_CONFIG_DIR 下零文件增量，实测） | npm 包内 ~250MB ELF native binary（平台 optionalDeps + postinstall copy + `cli-wrapper.cjs` 回退）；native install 在 `~/.local/bin/claude` → `~/.local/share/claude/versions/` | ripgrep 内置；`claude doctor` 预检（无需模型） |
| opencode | `opencode` | `--version` → 裸 semver | `--help` 离线可用（静态）；启动即 auto-init XDG 目录并 seed 全局 opencode.json | npm 包内 Bun 编译 standalone ELF；自升级副本在 `$XDG_CACHE_HOME/opencode/bin` | 无 |
| hermes | `hermes`（另有 `hermes-acp`、`hermes-agent` 入口） | `--version` → 多行（版本+日期、upstream/local commit、安装目录、安装方式、python、openai sdk） | 安全 | Python console script：**必须连同其 site-packages 可导入**（仅搬 binary 会 ModuleNotFoundError）；`%LOCALAPPDATA%\hermes`（Win） | `.env`、`state.db`、`skills/`、`plugins/` 均在 `$HERMES_HOME` |
| pi | `pi` | `--version` → 裸 semver，exit 0 | `--version` 零副作用；**`--help` 会 bootstrap `<home>/.pi/agent/{auth.json,models-store.json}`（空 `{}`）** | npm bin symlink → dist/bundle/cli.js；Node ≥22.19（legacy-node20 dist-tag=0.74.2）；`PI_PACKAGE_DIR` 覆盖 | 未知 flag 被静默吞为 extension flags（args.ts unknownFlags）——argv 契约必须显式验证 |
| grok-build | `grok` | 未本机探测（NOT_LOCALLY_OBSERVED） | — | Rust native（x64/arm64；mac/linux/win） | `~/.grok/{config.toml,sessions}` |
| kilo-code | `kilo` | 未本机探测 | — | Node ≥20；OpenCode 分支（legacy opencode.json 兼容） | `kilo upgrade` 自管 |
| zcode | （无官方独立 CLI） | — | — | Electron/Node 桌面 | `<user-home>/.zcode/{cli,server,v2}`（CLI_OBSERVED 布局） |

## 3. 安全可用性探测（不触发模型）结论

- 全部 8 个：`--version` 探测安全；claude 的 `--version` 明确零 HOME 写入（实测）。
- codex `doctor --json`、claude `doctor`、`codex app-server daemon version` 可作更深的可用性预检。
- pi 的 `--help`、opencode 的任意启动、hermes 的 bare 启动（无 TTY 时进入 first-run fallback）、
  codex 的 PATH-alias 创建都有副作用 → **探测命令必须是 `--version`**，
  或使用隔离 HOME（Agent-Box 现行 `version_probe` 字段没有实现，见 gap map F-04）。
- grok-build / kilo-code 需一次沙箱安装探测关闭 UNRESOLVED（Tier A/B 遗留项）。

## 4. 对 Agent-Box 声明的逐项纠错（executable 维度）

| 现声明 | 官方事实 | 影响 |
| --- | --- | --- |
| codex `bundle_members=["codex","codex-app-server"]` | companion 是 CODEX_HOME 下按需创建的 argv[0] alias，不是两个独立 binary；程序化入口是 `codex app-server`（同一 binary） | bundle 声明与实际布局不符 |
| claude `resolver_kind="PATH"` | 实际可能是 npm native binary 或 native install；两者都经 PATH 可达，但 musl/Alpine 有额外依赖 | 可保留，需 install hints |
| opencode `identity="opencode"` | 名称正确；但自升级副本与 npm 副本可能并存 → PATH 上可能有多个 | 发现逻辑需去重/版本比较 |
| hermes `identity="hermes"` | console script 依赖 site-packages；不能作为单文件 bundle 成员搬运 | bundle 声明不可行 |
| pi `version_probe=["--version"]` | 正确；但 `--agent-dir` flag 不存在（静默吞掉） | argv 模板必须修正（见 launch 矩阵） |
