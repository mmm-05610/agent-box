# 45 §1b / 落地设计 §14 阶段 A —— session 库可切分性逐家定性

执行：2026-09-17，env-provider 工作树。证据来源：用户机器上 1.x 迁移后的真实 native 目录
（**只列目录名与表名，未读任何文件内容或行数据**）。判定依据 = §14.2 的三条收窄。

## 判定表（第一手）

| 家族 | 当前 `STATE_TARGET`（注册表声明） | 真实布局（一级条目） | 定性 | §14 处理 |
| --- | --- | --- | --- | --- |
| codex | 整个 `/runtime/home/.codex`（= `CODEX_HOME`） | `.codex/`：`sessions/` + `cache/ sqlite/ log/ skills/ memories/ plugins/ rules/ shell_snapshots/ thread-writer-locks/ tmp/`；认证走 `ephemeral` 不落盘 | **可切分** | 收窄为 `.codex/sessions`，迁 `sessions/codex/` |
| hermes | 整个 `/runtime/home/.hermes` | `.hermes/`：`sessions/` + `skills/ lsp/ cache/ audio_cache/ image_cache/ sandboxes/ plugins/ memories/ logs/ cron/ hooks/ bin/ hermes-agent/ dispatch/ pairing/ pastes/ desktop-plugins/ scripts/`（迁移实测 ~114k 文件 / 2GB+） | **可切分** | 收窄为 `.hermes/sessions`，迁 `sessions/hermes/` |
| pi | 整个 `/runtime/home/.pi/agent` | `.pi/agent/`：`auth.json`（**登录态**）+ `models-store.json` + `sessions/` | **可切分**（必须收窄） | 收窄为 `.pi/agent/sessions`；`auth.json` 留在 profile home |
| claude-code | `/runtime/home/.claude/projects` | `.claude/`：`projects/`（会话）+ `agents/ skills/ cache/ sessions/ plugins/ session-env/ commands/ …`；凭据在 `~/.claude.json`（home 根） | **已是可切分子树** | 迁 `sessions/claude-code/`（路径形态不变） |
| dsh | `/runtime/home/.dsh/sessions` | `.dsh/`：`sessions/` + `storages/ attachments/ llm-deepseek/ profiles/` | **已是可切分子树** | 迁 `sessions/dsh/` |
| qwen | `/runtime/home/.qwen/projects` | 用户机器上**无实例**（20 个迁移 profile 中无 qwen）——上游布局待验证 | **待验证**（按 qwen-code 的 projects 形态暂归可切分） | 实现按可切分做，验证留给有实例时；门（假端点）覆盖机制 |
| opencode | 整个 `/runtime/home/.local/share/opencode` | `opencode.db`（2.27MB SQLite）+ `auth.json`（同目录）+ `snapshot/ repos/ log/` | **共享 DB 式** | §14.2(a)：库留 profile home，换 profile 原生重启 |
| kilo | 整个 `/runtime/home/.local/share/kilo` | `kilo.db`（307KB SQLite）+ `storage/ repos/ log/ telemetry-id` | **共享 DB 式** | §14.2(a)：同上 |

## §14.2(a)/(b) 的选择与第一手理由（opencode / kilo）

只读查询两库的表集合（`sqlite3 mode=ro&immutable=1`，**只读表名，未读任何行**）：

- `opencode.db` 表：`account, account_state, control_account, credential, data_migration,
  event, event_sequence, message, migration, part, permission, project, project_directory,
  session, session_context_epoch, session_input, session_message, session_share, todo, workspace`
- `kilo.db` 表：与 opencode 同构（多 `kilo_board, kilo_board_message`）

**两库都含 `credential` 与 `account` 表**——即登录态与会话**在同一个库内**。
§14.2 第 1 条（"共享的只能是被声明的 session 子树；整份共享会让 A 的账号对 B 可见"）
因此排除 **(b) 整库进公共库**：那会把 A 的账号对 B 可见，与 56 的账号独立托管冲突。

→ **判定 (a)**：库留在 profile home；换 profile 时该家族的会话**原生重启**（诚实提示，
"不许假装续接"）。该结论写入 60 的 G6 与 45 的报告。

## 由此得到的收窄清单（阶段 B 的实现范围）

1. **注册表声明**（`plugins/agent-box-harnesses/*/production.py` 的 `STATE_TARGET`）：
   codex `.codex` → `.codex/sessions`；hermes `.hermes` → `.hermes/sessions`；
   pi `.pi/agent` → `.pi/agent/sessions`。claude/dsh 不变（已是子路径）。
2. **房间/通道**：会话子树（deployment 声明的 `stateProjection.target`，guest 路径）在宿主侧
   改绑到 `sessions/<harness>/<声明的相对路径>`；其**余下非会话状态**仍绑 profile home 的
   原生 home（RW）。两家共享 DB 家族按 (a)：**整份 home 语义不变**（库在 home 内），
   guest 绑定不动、行为不动，只在文档/G6 里声明"换 profile 原生重启"。
   ——注意：共享 DB 家族今天的 `stateProjection.target` 指向库所在目录；实现时**按家族声明**
   （`sessionStore` 语义）分流，不得对共享 DB 家族做半边切分（那会拆散库）。
3. **审计与凭据扫描按会话归属**：公共 session 库会被多个 profile 的并行轮次同时写——
   审计的事实按该轮/该会话归属（manifest 记 session 相对路径 + 该轮自身的写入），
   并发 churn 按既有"截断记账"处理；凭据扫描不得假设"该目录只被一个 profile 写过"。
4. **迁移**：不做（§11 不变）；已存在的用户 profile home 不变动——会话子树的位置**不迁移**
   （旧会话留在原 home；新会话落公共库）。如实声明，不假装。
