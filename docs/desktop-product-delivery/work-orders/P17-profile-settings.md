# P17 — Profile 设置面（角色即绑定点 / 权限规则 / 指令 / 资产 / 克隆 / 会话归属）

基线：P16 之后（串行）。配对后端单：**60**。
**本单要纠正一条最容易被写错的语义**：**session 不属于任何 profile**。

```text
之前
├── 角色编辑        ⚠ 只有名字/harness/凭据；资产无处可绑
├── 权限            ⚠ 只有一个"权限选框"（P08 的 E 项在等这个）
└── 会话列表        ⚠ 很容易被写成"这个 profile 的会话"
之后
├── 角色编辑页      ◀ 指令 / 模型槽 / 凭据或账号 / 技能·MCP·hook 勾选 / **权限规则表** / 高级上限
├── 权限            ◀ 逐工具 ask|allow|deny + glob + 最后匹配生效；预设（完全访问/默认/计划）可被逐项覆盖
└── 会话            ◀ 属于工作区；**按轮**显示用了哪个角色/哪一版；换绑定是会话上的动作
```

## A 角色编辑页

- 分区：**指令**（资产引用+编辑）、**模型槽**（取自 provider/model 记录，P11）、**凭据或账号**
  （P12）、**技能 / MCP / hook 勾选**（P15/P16）、**权限规则表**、**高级**（后端的运行上限）。
- 每一区都要**可编辑**（不摆只读展示）；某家不支持某槽位 → **明说"该家不支持"**，不给死控件。
- 门：**G1** 六区齐全且都能改；**G2** 不支持项明说；**G3** 改完**下一轮生效**有第一手证据。

## B 权限规则表（取代"权限选框"）

- 表头=工具键（read / edit / bash / task / external_directory / webfetch / **skill** / …），
  值=`ask` / `allow` / `deny`，支持 glob→动作；界面上要写清"**最后匹配的规则生效**"。
- **预设**（完全访问 / 默认 / 计划）是一次性的填充动作，**逐项可覆盖**；覆盖后显示"已自定义"。
- **`ask` = 我们的审批往返**：界面上要说明"选了 ask 就会在执行时弹审批"。
- 门：**G4** 规则求值可预期（有反例：两条规则冲突时以最后匹配为准）；**G5** 不允许通过界面放开
  该家本来没有的能力（后端的收紧规则要在界面上如实反映）。

## C 会话归属（必须纠正）

- 会话列表/详情**不得**出现"这个角色的会话"这类表述；会话**属于工作区**。
- 会话上显示**当前绑定**与**按轮归属**（这一轮用了哪个角色、哪一版）。
- 换绑定是**会话上的动作**，且要如实提示后果（见 D）。
- 门：**G6** 文案与查询都不体现"profile 拥有 session"；**G7** 历史里每轮的归属可见。

## D 换绑定与克隆（后果必须说清）

- **同家族换绑定**：允许；按后端 60 的分档提示——
  文件式 journal 的家族"原生会话会跟着搬过去"，**共享 DB 的家族"原生连续性重新开始"**；
  两种提示都要**在操作前**出现，不是事后。
- **换家族**：**不提供就地切换**；只提供**克隆**成另一个家族的新角色。克隆界面要列出
  **可迁移项与不可迁移项**（后端 60 的逐家表），并明确"**session 类资产不迁移**"、
  "**不会继承旧的原生会话**"。
- 门：**G8** 两种换绑定的后果提示在操作前可见；**G9** 克隆后界面**不显示**"已继承旧会话"之类的话。

## 范围与调度

写集：`docs/desktop-product-delivery/**`、`apps/desktop/src/features/profiles/**`、
`apps/desktop/src/features/settings/**`、`apps/desktop/src/features/chat/**`、
`apps/desktop/src/api/**`、`apps/desktop/src/types/**`、`apps/desktop/src/i18n/**`、
`apps/desktop/e2e/**`、`tests-js/**`。
保护路径见 manifest；单 Windows 构建槽；按 `handoff-policy.md` 取放写权。

## 边界

- 后端（60）负责：记录扩展、权限求解、归属纠正、克隆、换绑定连续性；本单只做交互与呈现。
- **不做**子代理（那是 profile 调用 profile，单独一单）；**不做** wire 变更（只消费 60 的面）；
  **不做**就地换家族（产品决定：只能克隆）。

## 修订（2026-09-17，用户要求重新设计 profile 配置）

### 问题：现在是"一堆堆在一起"

`ProfileRoleSettings`（`profile-role-settings.tsx`，66 行）把所有内容塞进一个 `<section>`，
没有导航、没有分页、没有按 harness 区分支持范围。用户要求：**页面不能堆在一起，交互逻辑要清晰**。

### 设计：按注册表声明的槽位驱动，分区导航

**数据源**：注册表 `harnesses.toml` 的 `slots` 字段——每家 harness 声明它支持哪些配置维度：

| harness | slots |
| --- | --- |
| codex | provider, permission, instruction, mcp, skill |
| claude-code | instruction, mcp, skill, permission |
| opencode | provider, instruction, mcp, skill |
| hermes | instruction, mcp, skill |
| pi | instruction, mcp, skill |

**profile 设置页结构**（左侧导航 + 右侧面板，不是单页堆砌）：

```text
Profile: <角色名>
├── 基本信息     名称 / 描述 / 图标
├── Harness      <绑定的家族>（不可换，只能克隆，60 的裁定）
├── 模型         provider/model 槽（P08/55）
├── 凭据/账号    credential 或 account 引用（P12）
├── 指令         instruction 资产引用（60）
├── 技能         已启用的 skill 列表（58）
├── MCP          已启用的 server 列表（58）
├── 权限规则     逐工具 ask/allow/deny（60）
├── Hooks        逐家族 hook 配置（59）
├── 记忆         记忆查看（只读，后端需提供面）
└── 高级         该 harness 独有的选项（Codex: approval_policy/sandbox_mode/reasoning_effort；
                 OpenCode: temperature/top_p/steps；Claude Code: permissionMode/maxTurns）
```

**规则**：
- 每个 section **只在注册表声明该槽位时显示**——hermes 没有 provider 槽 → 模型区不出现，
  显示"该 harness 不支持 provider 配置"；
- **不堆砌**：左侧是 profile 的 section 导航，右侧只渲染当前选中的 section——
  一次只看一个维度，不把所有配置堆在一页里滚动；
- **每个 section 的可见性由注册表驱动**，不是硬编码——新 harness 加入时自动出现。

### 各 harness 配置面清点（需执行者用 `agent-config-inventory` skill 或手动查文档补全）

| 维度 | codex | claude-code | opencode | hermes | pi |
| --- | --- | --- | --- | --- | --- |
| 系统提示词 | AGENTS.md | CLAUDE.md | prompt 文件 | ? | ? |
| 记忆 | AGENTS.md | CLAUDE.md + memory | ? | ? | ? |
| Hooks | 受管 hooks | settings.json hooks | JS 插件 | ? | ? |
| 权限 | approval_policy + sandbox_mode | permissionMode + allow/deny | permission ask/allow/deny | ? | ? |
| MCP | mcp_servers (TOML) | mcpServers (JSON) | mcp (JSON) | ? | ? |
| 技能 | ? | skills | ? | ? | ? |

（`?` = 待执行者用 `agent-config-inventory` skill 或查文档补全；**查不到就显示"该 harness 不支持此项"**，不猜。）

### 额外要求

- **记忆查看**：新面——每个 profile 的记忆文件/目录（CLAUDE.md、AGENTS.md 等）**可查看内容**（只读或可编辑），
  这是用户明确要求的；**数据面**需要后端配合（可从原生 home 读取，属 45 的只读投影范围）。
- **高级选项**：每家 harness 独有的选项（如 Codex 的 `approval_policy`/`sandbox_mode`/`model_reasoning_effort`，
  OpenCode 的 `temperature`/`top_p`/`steps`）放在"高级"里，**只在该家支持时显示**。
