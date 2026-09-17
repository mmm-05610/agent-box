# 45 §1b / 落地设计 §14 阶段 A —— session 库可切分性逐家定性

执行：2026-09-17，env-provider 工作树。证据来源：用户机器上 1.x 迁移后的真实 native 目录
（**只列目录名与表名，未读任何文件内容或行数据**）。判定依据 = §14.2 的三条收窄。

## 判定表（第一手）

| 家族 | 当前 `STATE_TARGET`（注册表声明） | 真实布局（一级条目） | 定性 | §14 处理 |
| --- | --- | --- | --- | --- |
| codex | 整个 `/runtime/home/.codex`（= `CODEX_HOME`） | `.codex/`：`sessions/` + `cache/ sqlite/ log/ skills/ memories/ plugins/ rules/ shell_snapshots/ thread-writer-locks/ tmp/`；认证走 `ephemeral` 不落盘 | **可切分** | 收窄为 `.codex/sessions`，迁 `sessions/codex/` |
| hermes | 整个 `/runtime/home/.hermes` | `.hermes/`：`state.db`（18.6MB SQLite，**权威会话库**）+ `sessions/`（`request_dump_*.json` 调试转储）+ `skills/ lsp/ cache/ …`（迁移实测 ~114k 文件 / 2GB+） | **共享 DB 式**（复查更正，见下） | §14.2(a)：库留 profile home，换 profile 原生重启 |
| pi | 整个 `/runtime/home/.pi/agent` | `.pi/agent/`：`auth.json`（**登录态**）+ `models-store.json` + `sessions/` | **可切分**（必须收窄） | 收窄为 `.pi/agent/sessions`；`auth.json` 留在 profile home |
| claude-code | `/runtime/home/.claude/projects` | `.claude/`：`projects/`（会话）+ `agents/ skills/ cache/ sessions/ plugins/ session-env/ commands/ …`；凭据在 `~/.claude.json`（home 根） | **已是可切分子树** | 迁 `sessions/claude-code/`（路径形态不变） |
| dsh | `/runtime/home/.dsh/sessions` | `.dsh/`：`sessions/` + `storages/ attachments/ llm-deepseek/ profiles/` | **已是可切分子树** | 迁 `sessions/dsh/` |
| qwen | `/runtime/home/.qwen/projects` | 用户机器上**无实例**（20 个迁移 profile 中无 qwen）——上游布局待验证 | **待验证 → 暂按 profile-home** | 声明已撤回（不 split）：本机无实例、且其 43 代门自 45 起未在 Linux 复跑（见下），在门能证明之前不声明；split 留给有实例/门就绪时 |
| opencode | 整个 `/runtime/home/.local/share/opencode` | `opencode.db`（2.27MB SQLite）+ `auth.json`（同目录）+ `snapshot/ repos/ log/` | **共享 DB 式** | §14.2(a)：库留 profile home，换 profile 原生重启 |
| kilo | 整个 `/runtime/home/.local/share/kilo` | `kilo.db`（307KB SQLite）+ `storage/ repos/ log/ telemetry-id` | **共享 DB 式** | §14.2(a)：同上 |

### 更正记录（2026-09-17，实现期复查）

hermes 的初判（"可切分，收窄为 `.hermes/sessions`"）**有误**，实现期由门的第一手失败
（`HERMES_HOME '/runtime/home/.hermes/sessions' is not the harness home`）与源码注释
（"its authoritative session database at `$HERMES_HOME/state.db`"）共同暴露：
`.hermes/sessions/` 只是调试转储，**权威会话在 `state.db`（与其它状态同库）**。
判定改为**共享 DB 式 §14.2(a)**：`STATE_TARGET` 回退为整个 `.hermes`，不声明
`sessionStore`。本表上文对应行已按更正后的结论改写。


### qwen 的待验证细节（2026-09-17）

qwen 门的 reopen 相位还停留在 45 前的接口（`state_bundle_prefix`/`restored_state`），
自 45 起在 Linux 上不可运行（`TypeError`）；本单给出对齐 pi 形状的适配后，门可跑。
但**本机无 qwen 实例**，`sessionStore: sessions-subtree` 的声明在门证明前不落地——
已撤回，按 profile-home 处理。qwen 的 split 验证留给有实例的机器。


### claude-code / dsh 的声明撤回（2026-09-17，实现期复查）

两家的 Linux 假端点门自 45 起未复跑，本轮适配（token 合同、45 接口、§14 store 参数）
后仍卡在 `HOME_MARKER_CONFLICT`（turn-chain 内部的 marker 冲突，根因未定位）——
在门能证明之前不声明 split（与 qwen 同一处理）。它们的 `sessionStore` 声明已撤回，
按 profile-home 处理；**产品路径**（port_factory 的 home 准备/审计）由全量套件覆盖，
不受影响。门的剩余缺口记录在 45 报告并交由维护。

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
