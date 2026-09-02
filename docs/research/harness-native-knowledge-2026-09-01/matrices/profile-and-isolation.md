# 矩阵：Profile、凭据与状态隔离（profile-and-isolation）

来源：各 harness FACTS.md D/E/F 节 + candidate.toml `[profile]/[credentials]/[isolation]`。
观察 2026-09-01/02。凭据只记录形状/位置/机制，无任何值。

## 1. Home 与可重定位性（Agent-Box 隔离的前提）

| harness | native home | 重定位 env | 重定位完整性 | 副作用陷阱 |
| --- | --- | --- | --- | --- |
| codex | `~/.codex` | `CODEX_HOME` | **完整**，但目标目录**必须预先存在**（缺失=硬错误，不自动创建） | 启动时尝试在 CODEX_HOME 建 PATH alias（失败仅警告）；启动载入 `$CODEX_HOME/.env` |
| claude-code | `~/.claude` | `CLAUDE_CONFIG_DIR` | **近乎完整**：settings/.claude.json(+lock+backups)/plugins/skills/credentials 全随迁 | **例外**：MCP 日志与机器缓存在 `$HOME/.cache/claude-cli-nodejs/`（不随迁）；macOS Keychain 条目会随 CLAUDE_CONFIG_DIR 重新键控 |
| opencode | XDG 四目录（config/data/cache/state） | `XDG_*` 全套 + `OPENCODE_CONFIG_DIR`/`OPENCODE_CONFIG_CONTENT`/`OPENCODE_DB`/`OPENCODE_TEST_HOME`/`OPENCODE_AUTH_CONTENT` | 完整（全部 HOME fallback → CoW 整 HOME 可行） | **每次启动 auto-mkdir 全部 XDG 根 + seed 全局 opencode.json**；未知顶层键硬失败；配置不热加载 |
| hermes | `~/.hermes`（Win: `%LOCALAPPDATA%\hermes`） | `HERMES_HOME` | home 内完整（config.yaml/.env/auth.json/state.db/skills/plugins/memories/profiles） | **HOME 本身不可单独搬**：console script 依赖从 HOME 解析 user site-packages（探测实证 ModuleNotFoundError）；原生命中机制是 profile（`HERMES_HOME=<root>/profiles/<name>` + active_profile），spawner 必须显式传 HERMES_HOME（上游 issue #18594） |
| pi | `<home>/.pi/agent` | `PI_CODING_AGENT_DIR`（config root）+ `PI_CODING_AGENT_SESSION_DIR` | 完整（settings/auth/models/skills/extensions/sessions/npm/git 整体迁移） | **无 `--agent-dir` CLI flag**（被静默吞掉）；`--help` 会 bootstrap auth.json/models-store.json；`PI_OFFLINE=1` 关闭联网检查；包名可重命名 APP_NAME/CONFIG_DIR（VERSION_SENSITIVE） |

## 2. 配置文件与优先级

| harness | 格式 | 作用域（低→高） | 显著特征 |
| --- | --- | --- | --- |
| codex | TOML | packaged(-10) < MDM(0) < /etc(10) < enterprise(15) < user(20) < user+profile(21) < project(25, 需 trust) < `-c` 会话(30) < managed_config.toml(40) < MDM(50) | profile 已改为 **file-per-profile**（`$CODEX_HOME/<name>.config.toml`）；`-c key=value` 点路径覆盖；`--strict-config` |
| claude-code | 严格 JSON（注释=语法错误） | managed > `--settings` > project local > project > user（列表键合并；managed 不合并） | `-p` 模式下**非法 settings 被静默忽略**；`.claude.json` 项目键=git repo root |
| opencode | json/jsonc（legacy toml 自动迁移） | remote .well-known → global → OPENCODE_CONFIG → project(向上走 cwd→worktree) → .opencode 目录 → OPENCODE_CONFIG_CONTENT → managed(/etc…) → MDM | 最深者胜；未知键拒绝；`{env:VAR}`/`{file:path}` 插值 |
| hermes | **YAML**（JSON 字节亦可解析——JSON 是 YAML 1.2 子集；Agent-Box 现依赖此点） | argv flags > env > config.yaml > defaults；另有 native profile 层 | `hermes profile create/use/export/import` 原生多实例 |
| pi | JSON（settings.json + models.json 自定义 provider） | global settings < project `.pi/settings.json`（深合并；项目资源需 trust） | models.json 的 apiKey 支持 `$VAR`/`${VAR}`/`!command` 间接引用（可安全持久化形态） |

## 3. 凭据机制分类

| harness | env keys | 文件（名字/形状，非内容） | OAuth/订阅 | keychain | login/logout | 隔离可行性 |
| --- | --- | --- | --- | --- | --- | --- |
| codex | OPENAI_API_KEY、CODEX_API_KEY、CODEX_ACCESS_TOKEN；provider `env_key` | `auth.json`；`.env`（启动载入） | ChatGPT 登录（localhost:1455 回调，自动刷新）；`login --with-api-key/--with-access-token/--device-auth` | keyring store（`cli_auth_credentials_store=file\|keyring\|auto`，keyring 优先） | `codex login/logout/status` | ✅ 空 CODEX_HOME + env keys 即 credential-free；或复制 CODEX_HOME（必须先剥离 auth.json） |
| claude-code | ANTHROPIC_API_KEY、ANTHROPIC_AUTH_TOKEN、CLAUDE_CODE_OAUTH_TOKEN、CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY；apiKeyHelper 脚本 | `.credentials.json`（0600；Linux/Win）；macOS Keychain 优先 | Claude 订阅 OAuth；`claude auth login/logout/status`（status 安全）；`/logout` 连带重置 onboarding 状态 | macOS Keychain（CLAUDE_CONFIG_DIR 换址会重新键控） | 同左 | ✅ 临时 HOME+CLAUDE_CONFIG_DIR 已实证完全隔离（零真实 home 读取）；`--bare` 模式只认 env/helper，绝不读 OAuth/keychain |
| opencode | provider 专属 env（如 ANTHROPIC_API_KEY）；config 内 `{env:VAR}` 插值 | `<xdg-data>/opencode/auth.json`（0600；形状：`{type:'api',key}` 或 `{type:'oauth',refresh,access,expires,…}` 或 `{type:'wellknown'}`） | provider OAuth（`providers login`，交互式）；MCP OAuth | 无 | `opencode providers login/logout` | ✅ XDG_DATA_HOME 重定向 / `OPENCODE_AUTH_CONTENT` 内联注入；**沙箱内禁止交互式 login** |
| hermes | OPENROUTER/OPENAI/ANTHROPIC/GOOGLE 等；env_loader 按 `*_API_KEY/*_TOKEN/*_SECRET` 分类 | `.env`（KEY=VALUE）；`auth.json`（per-provider OAuth 状态，跨进程文件锁） | Nous Portal OAuth；`hermes login/logout`（per provider） | unknown（Bitwarden/1Password 有集成） | 同左 | ✅ per-execution HERMES_HOME 即原生多实例 |
| pi | 30+ 家 env（ANTHROPIC/OPENAI/DEEPSEEK/GEMINI/…） | `<agent-dir>/auth.json`（token；`--help` 会创建空 `{}`） | `/login`（Claude Pro/Max、ChatGPT、Copilot 订阅）；`pi auth print-api-key/--provider`（**stdout 取钥**） | 经 `!command` 间接引用外部 secret 工具 | `/login`、`/logout` | ✅ PI_CODING_AGENT_DIR 整体迁移；models.json 用 `$VAR` 间接引用即可安全持久化 |
| grok-build | XAI_API_KEY | `~/.grok/config.toml` | 未验证 | 未验证 | 未验证 | 未验证 |

**禁止进入 Profile/Binding/Evidence**（全部 harness 一致）：credential 文件内容、
token/cookie、keychain 条目、OAuth refresh 值；claude 的 `machineID/userID`、
codex 的 `installation_id` 亦属账号态。

## 4. 状态隔离分类（multi-cli 五类法的落点）

| harness | account（绝不共享/投影） | normal（可只读共享） | session（执行本地可写/CoW） | cache | unsafe |
| --- | --- | --- | --- | --- | --- |
| codex | auth.json、keyring、.env、installation_id | config 层、AGENTS.md、skills、rules、memories 内容 | sessions/、history.jsonl、sqlite 组（WAL + per-thread lock）、shell_snapshots/ | models_cache、skills/.system（自愈）、plugins/cache、log、tmp | auth.json/.env/keyring（同 account）；CODEX_HOME 缺失即硬错误 |
| claude-code | .credentials.json | settings 模板、CLAUDE.md、skills/commands/agents | projects/<proj>/<id>.jsonl、todos、file-history、shell-snapshots | `$HOME/.cache/claude-cli-nodejs`（local-overlay！）、statsig | **.claude.json（多写者风险，有 lock+backups）**、daemon.lock |
| opencode | auth.json | config/、agent/、command/、skill/、plugin/（**须防 auto-seed 写入**：预置或用 CONFIG_DIR/CONTENT） | opencode.db(+wal/shm)（per-sandbox，绝不 live 共享） | cache/opencode（models.dev、bin/） | `/tmp/opencode`（硬编码共享 scratch）、跨主机共享 sqlite wal |
| hermes | .env、auth.json、nous 账号态 | config.yaml、skills/、plugins/、memories 内容 | state.db（WAL；per-profile）、sessions/、checkpoints/ | audio_cache、image_cache、logs | 裸 HOME（site-packages 解析依赖）；共享 home 的 WAL 争用 |
| pi | auth.json、trust.json | settings.json、models.json（用 $VAR 间接）、skills/extensions/prompts/themes | sessions/（JSONL v3）、npm/git 安装区 | models-store.json、pi-debug.log | `--help` 的 bootstrap 副作用；项目 `.pi/` 资源需 trust |

## 5. 并发语义

| harness | 并发级别 | 机制 |
| --- | --- | --- |
| codex | 多会话并发安全；app-server daemon **per-user 单例** | sqlite WAL + thread-writer-locks；config 无锁（last-writer-wins） |
| claude-code | 单 profile 多进程有风险（.claude.json）但有 .claude.json.lock + backups | 官方市场刷新竞态有记载 → 需串行化或 CoW |
| opencode | 多实例安全（TUI/run/serve 并存） | state/locks flock 心跳；server 多客户端（attach 并发） |
| hermes | per-profile 并发安全；共享 home 有锁防护 | active-session 租约 + max_concurrent_sessions |
| pi | 单进程为主；RPC 模式单会话多命令 | sessions 文件树；无跨进程锁记载 |

## 6. 对 Agent-Box 的直接映射结论

1. **Guest home 语义必须从"拷贝一个目录"升级为"重定位 env + 前置存在 + 副作用清单"**：
   - codex：guest home 目录必须由 Sandbox 先创建（`--dir /runtime/home` 恰好满足）+ 注入 CODEX_HOME；
   - claude：CLAUDE_CONFIG_DIR 可行，但要处理 `$HOME/.cache/claude-cli-nodejs` 漏网；
   - opencode：整 XDG 五件套重定向，且要防 auto-seed（OPENCODE_CONFIG_CONTENT 最干净）；
   - hermes：HERMES_HOME + **保留 python 导入环境**（不能只搬 binary）；
   - pi：PI_CODING_AGENT_DIR（不是 --agent-dir）。
   现声明 `guest_home="/runtime/home"` + `skill_env` 单一变量不足以表达上述差异 →
   归属 harness-native-adapter（每家 env 组合不同），Registry 只声明 native_home 与
   override env 名。
2. **native payload 进入 Adapter 的断链**（gap map F-06）有了具体修复形态：
   resolve 应返回携带 native_payload 的 envelope（ProfileEnvelope 已存在但未接），Adapter
   依 native payload 决定 settings.json/config.toml/opencode.json/settings.json/models.json
   的生成 —— 这是 Profile-native 行为，不是通用 projector。
3. **credential materializer**：五家都能实现"locator-only + 执行时材料化"（env 注入或
   guest 只读 secret 文件），与 `PreparedSecretMount`（access=ro，secret 必须嵌于可写
   /runtime/home 之下）兼容；codex/claude 已有旧实现可迁移。
