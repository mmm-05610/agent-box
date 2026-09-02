# Multi-Harness Native Knowledge Base（2026-09-01/02）

本知识库是"Multi-Harness Native Knowledge Base and Fill Plan"研究任务的最终交付物：
对每种 Coding Harness/CLI 建立有证据、可复核的可执行知识模型，并给出 Agent-Box 的
字段填充与修改方案。**本轮只研究与建库，不实现任何修改**；未经人工逐项裁决，
不得据此填写正式 `harnesses.toml`、扩展 Adapter SPI 或实现 MCP Resource。

- 基线：branch `feat/resource-routing-phase2`，HEAD `1a3c308`
  （refactor: separate extension kernel from protocol packs）。
- 研究日期：2026-09-01 / 2026-09-02；环境 WSL2 x64 Linux。
- 全程未执行真实模型请求、未读取任何 credential 内容、未修改任何产品文件。

## 目录导读

| 文件 | 内容 |
| --- | --- |
| `SOURCE_POLICY.md` | 证据来源分类、标注要求、实验规则、脱敏与 Tier 定义 |
| `FIELD_GLOSSARY.md` | A–J 十组知识字段的定义 |
| `CANDIDATE_FIELD_SCHEMA.md` | candidate.toml 的结构约定（研究候选，非生产） |
| `AGENT_BOX_CURRENT_GAP_MAP.md` | 当前 Agent-Box 链路审计：正式链路图、15 项审计结论、SPI 能力缺口、应保留 native 的清单 |
| `CROSS_PROJECT_PATTERN_MATRIX.md` | 六个外部参考项目的可借鉴模式与反模式 |
| `FILL_AND_MODIFICATION_PLAN.md` | 逐字段填充/修改方案 + Phase A–F 分阶段建议（**不实施**） |
| `harnesses/<id>/` | 每个Harness 的 FACTS.md / evidence.md / candidate.toml（或 ASSESSMENT.md） |
| `matrices/` | 七份交叉矩阵 |
| `research-notes/` | 六个参考项目的源码级研读笔记 |
| `experiments/` | 全部本地实验的脱敏记录 |

## 研究对象与分级结论

### 五个必选 Harness（全部完整 FACTS/evidence/candidate）

| harness_id | 版本（验证方式） | Tier | 一句话 |
| --- | --- | --- | --- |
| codex | 0.152.0（CLI_OBSERVED + 源码 tag rust-v0.152.0） | A | CODEX_HOME 必须预存在；分层配置 file-per-profile；exec --json 封闭事件集 + app-server JSON-RPC 控制面 |
| claude-code | 2.1.247（CLI_OBSERVED + 官方文档 + SDK 源） | A | npm 即 native binary；CLAUDE_CONFIG_DIR 迁移近乎完整（MCP 缓存除外）；stream-json input mode 双向控制面 |
| opencode | 1.18.21（CLI_OBSERVED + sst/opencode 源 @5341a5e） | A | 真身为 sst/opencode（opencode-ai 已归档改名 Crush）；SQLite 存储；无凭据时静默挂起 |
| hermes | v0.19.0 本机 / v0.21.0 upstream（安装包源码级验证） | A | Nous Research；headless 是 `-z`（**不是 --print**）；HERMES_HOME 原生多 profile；HOME 不可单独搬 |
| pi | 0.84.4（/tmp 隔离安装 CLI_OBSERVED + 源码） | A | Earendil Works；`--mode json`/`--mode rpc` 双协议；**无 --agent-dir**（用 PI_CODING_AGENT_DIR）；设计上无 MCP/subagents |

### 额外候选

| harness_id | Tier | 结论 |
| --- | --- | --- |
| grok-build | **A** | xAI 官方 `grok`；streaming-json 十变体事件枚举（doc+source 双证）；建议正式支持（补一次沙箱安装 smoke test） |
| gemini-cli | **A** | `-o json/stream-json` 完整规格 + 退出码表；GEMINI_CLI_HOME 重定位 |
| qwen-code | **A** | 虽为 gemini fork，`-o json` 已是 Anthropic 风格 messages 帧 + control_request 面——线协议分叉，须独立 adapter |
| kilo-code | B | `kilo run --auto` 退出码契约明确，但无 per-run JSON 流、session/auth 路径未文档化 |
| aider | B | **完全无机器可读输出**——不能成为 Adapter 候选；仅作设计参考（YAML+env 投影、git 快照） |
| zcode | C | Z.ai 桌面 ADE；未发现官方独立 CLI/无头入口；仅登记身份 |

正式支持建议（须人工裁决后执行）：codex、claude-code、opencode、hermes、pi、
grok-build、gemini-cli、qwen-code。Tier B/C 仅入知识库。

## 最重要的 10 个跨 harness 结论（详见矩阵）

1. `harnesses.toml` 约 21 个字段未被正式路径消费；`launch_modes` 永远只取 `[0]`。
2. Profile exact Ref resolve 的产物**不含 native payload**，payload 对启动链零贡献。
3. executable bundle 链路不完整：`/runtime/bin` 只有空目录，`bundle_members`/`version_probe`/`resolve_executable` 均死声明。
4. 五个 Adapter 全是空子类；`declare_runtime_sources`/`decode_observation` 是死 SPI。
5. headless 输出信封五家五样（codex item 事件 / claude stream-json / opencode json 流 /
   hermes usage-file / pi --mode json）——observation envelope 必须是 canonical frame + per-harness transformer。
6. Home 隔离=「重定位 env + 前置存在 + 副作用清单」，不是拷贝目录；
   每家的 env 组合不同（CODEX_HOME / CLAUDE_CONFIG_DIR / XDG 全套 / HERMES_HOME+site-packages / PI_CODING_AGENT_DIR）。
7. SKILL.md 是最大公约数，且 `$HOME/.agents/skills` 成为事实共享根；codex 的
   `$CODEX_HOME/skills` 已弃用（现声明正投影到弃用路径）。
8. opencode 无凭据会静默挂起、pi 无信任决策会静默忽略项目资源——Host 必须有超时与预检。
9. 并发语义：codex config 无锁（last-writer-wins）、claude `.claude.json` 多写者风险、
   opencode flock 心跳安全——Profile Store 的乐观并发（revision 冲突）方向正确。
10. 身份陷阱：opencode 真身 sst、pi 包名迁移、hermes 同名包、claude 的第三方 ACP 适配器——Registry 必须携带 package/repo 元数据防漂移。

## 质量门槛自检

- 五个必选 harness 均有 FACTS.md + evidence.md + candidate.toml（全部 tomllib 解析通过）。
- 全部事实带 source kind / 日期 / 版本 / confidence / stability；unknown 未被写成 false。
- 无第三方实现被写成官方事实（PEER_PROJECT 全部显式标注）。
- 无 credential 值、无真实用户路径/用户名（发现 3 处已修复）、无模型请求记录。
- 变更仅限本目录（`git status` 验证见终端摘要）。
