# 工单 58 阶段 A —— 逐家资产槽位观测（一手）

执行：2026-09-18，env-provider 工作树。方法：只读钉住工件
（`~/.agentbox-all-harnesses/artifacts/<family>`，与各门同源）。**不读任何用户原生配置**，
只从其二进制/打包代码里取出"它期望在哪儿找什么"的常量与文档串。零模型调用。

## 观测表（第一手）

| 家 | skill 槽位 | MCP 配置位置 + 键名 | commands/提示片段 | 依据（字符串计数） |
| --- | --- | --- | --- | --- |
| codex | **`$CODEX_HOME/skills/<skill-name>`**（每 skill 一个目录） | `$CODEX_HOME/config.toml`，键 **`mcp_servers`**（TOML） | `$CODEX_HOME/prompts/` | skills 4 处路径串（含安装说明"Installs into `$CODEX_HOME/skills/<skill-name>`"）；`mcp_servers` 34；`prompts/` 27 |
| claude | **`.claude/skills/`** | `settings.json` 的 **`mcpServers`**（另有 `.mcp.json` 项目级；`claude.json` 参与） | `commands/` | `.claude/skills` 52；`mcpServers` 100；`settings.json` 212；`.mcp.json` 80；`commands/` 20 |
| qwen | `.qwen/skills` | **`.qwen/settings.json` 的 `mcpServers`** | `.qwen/commands` | `mcpServers` 307；`settings.json` 190；`.qwen/skills` 4；`.qwen/commands` 1 |
| hermes | `.hermes/skills`（弱证据，1 处） | **`.hermes/config.yaml` 的 `mcp_servers`/`mcpServers`**（YAML） | 未观察到 | `mcp…` 18；`config.yaml` 61；`.hermes/skills` 1 |
| pi | 未观察到 | 未观察到 | 未观察到 | — |
| dsh | 未观察到 | 未观察到 | 未观察到 | — |
| kilo | 未观察到（其库内有 skills 面？未证实） | 未观察到 | 未观察到 | — |
| opencode | 未观察到 | 工单提到 `opencode.json`（**未在本轮钉住**） | 未观察到 | — |

## 由观测直接得出的实现决定

1. **可声明支持（本期）**：codex（skills + `mcp_servers` TOML）、claude（skills + `mcpServers`
   JSON）、qwen（skills + `mcpServers` JSON）、hermes（skills 弱证据 ⇒ skills 先**不声明**，
   MCP 的 YAML 键名两拼法并存 ⇒ 先声明为**未支持**，待真机确认）。其余家**如实声明未支持**
   （§3：不产生假的物化）。
2. **物化形态**：全部走**只读投影**（既有机制），落点是"我们自己的投影树"经沙箱绑定到
   各家槽位——**绝不写用户原生配置**（§3 零回写）。
3. **codex 的 MCP 是 TOML**：JSON 与 TOML 两种序列化都要有适配器（逐家规则 + 测试）。
4. **commands 的语义**（§1）：harness 的斜杠命令可当资产存（复用 skill 的存储机制），
   本期只对已钉住目录的家声明（claude/qwen/codex）。

## 阶段 B 首块（已落地）：技能资产的统一存储

`server/assets/skills.py`（新模块，6 条测试全绿）：

- **格式**：Agent Skills——skill 是目录，`SKILL.md` 的 YAML frontmatter **只取两个必填字段**
  （`name` 小写连字符、`description`）；解析**最小且严格**：非标量（flow 集合/块标量）类型化拒绝
  （`SKILL_FRONTMATTER_INVALID`）、缺 frontmatter/缺 name/非法 name/缺 description 各有其码。
- **存储**：`<root>/skill/<asset-id>/<revision>/`，安装**先建暂存再原子改名**（失败不落地半成品），
  摘要用既有的 **tree digest v1**（`runtime_artifact_tree_digest`）——物化投影因此可用既有摘要校验机制；
  `verify()` 重新派生并比对。
- **边界**：只收常规文件（符号链接一律拒绝）、≤512 项 / ≤32 MiB；同名修订已存在 → `SKILL_REVISION_EXISTS`。
- 反例覆盖：非法/缺失 frontmatter、带链接的树、越界树、重复修订、摘要不符、缺 `SKILL.md`。

## 58 未做（下腿）

- MCP 资产的存储与**逐家适配器**（codex 是 TOML `mcp_servers`、claude/qwen 是 JSON `mcpServers`、
  hermes YAML 待真机确认）与"只读投影到槽位"；commands 资产的同机制复用；
- profile **绑定**（id+revision、enabled）与"下一轮生效"；资产记录表（schema 迁移）；
- 外部来源同步（目录式、来源+摘要固定、不静默换源）与 MCP 有界探测（G6）；
- `assets.*` wire 面（与 P15 前端配对、两仓重锁）；hooks **只如实声明**（不统一）。

## 阶段 B 第二块（已落地）：MCP 资产、逐家渲染、资产目录与绑定

- **MCP 资产存储**（`server/assets/mcp.py`）：存**标准形态**（stdio `{command,args,env}` /
  remote `{url,headers}`），规范化后内容寻址（`<root>/mcp/<id>/<rev>/server.json` + 摘要）；
  **凭据只存引用**——`env`/`headers` 的每个值必须是 `{"credentialRef": …}`，裸字符串是
  类型化拒绝（`MCP_CREDENTIAL_REFERENCE_REQUIRED`，"库分不清秘密与常量，猜就是泄"）；
  command 必须绝对路径、remote 必须 https（或 loopback）、名字小写 slug、重复修订拒绝。
- **逐家渲染**（`server/assets/rendering.py`）：目标与键名**全部来自注册表声明**
  （`mcp_target`/`mcp_key`，本腿扩展了 `schema.py` 的 `[harness.profile]` 字段集与校验），
  已声明三家：codex=`/runtime/home/.codex/config.toml` + **TOML** `mcp_servers`、
  claude-code=`/runtime/home/.claude/settings.json` + JSON `mcpServers`、
  qwen=`/runtime/home/.qwen/settings.json` + JSON `mcpServers`（三者皆阶段 A 一手观测）；
  **未声明 mcp 槽位的家（如 pi）→ `ASSET_SLOT_UNSUPPORTED`**，不近似渲染；凭据未解析 →
  `MCP_CREDENTIAL_UNRESOLVED`（**渲染文本里永不出现秘密**）。
- **资产目录与绑定**（`server/assets/records.py` + schema 13）：
  `server_assets`（kind/name/latest_revision/digest/source，**无内容**）与
  `server_profile_assets`（profile × asset，revision + enabled）——绑定可指旧修订、
  可停用而不解绑；未发布修订拒绑（`ASSET_REVISION_UNKNOWN`）；source 只在显式给出时变化
  （不静默换源）；目录视图零内容零 host 路径。
- **测试**：新增 4 条（MCP 反例三则 + 存储/verify、两家渲染与未支持家拒绝、目录/绑定往返），
  全量 **821 passed / 0 failed**；技能存储 6 条不变。

## 58 未做（下腿）

- **物化到沙箱**：把渲染出的 config 片段投成只读投影（需决定"合并进家内配置文件"还是
  "单独文件+绑定"——涉及既有投影语义，未动）；
- **来源同步**（目录式 hub：列表/安装/更新、来源与摘要固定、失败不落地）与 **MCP 有界探测**（G6）；
- `assets.*` wire 面（与 P15 前端配对、两仓重锁）；commands 资产的同机制复用；
  hooks **只如实声明**（不统一）。
