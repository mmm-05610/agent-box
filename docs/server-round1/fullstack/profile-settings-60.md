# 工单 60 进展 —— Profile 设置（阶段 A/B 已落地）

执行：2026-09-18，env-provider 工作树。

## 阶段 B：逐工具权限求解（已落地，5 条测试）

- **模型**（`server/profiles/permissions.py`）：键闭集 `read/edit/bash/task/external_directory/
  webfetch/skill`（未声明的键=类型化拒绝 `PERMISSION_KEY_UNSUPPORTED`——"没规则"与"打错键"
  绝不同形）；动作闭集 `allow/ask/deny`；规则带可选 glob，**最后匹配生效**；未匹配回落
  **预设**（`full-access`/`default`/`plan`），**绝不默认 allow**；预设是显式规则集
  （plan=edit/bash/external_directory→deny），用户规则**追加在预设之后**，因此可被更窄的
  后写规则覆盖。
- **冻结姿态**：`resolve_all()` 产出逐键（可选逐目标）动作集，进入该轮**冻结配置**；
  `ask` 仍走既有审批往返（本模块只求解姿态，不绕过审批）。
- **不放开**：姿态只是"用户要什么"；能力仍由能力门（声明∩观测）决定——规则不能让某工具
  拿到它本来没有的权限（注释与测试位置见模块头）。
- 反例：非法键/动作/模式（控制字符或超长）、非法预设、last-match-wins 边界、
  "模式规则对无目标求解不说话 → 回落预设"。

## 阶段 A：记录（已落地）

- **schema 16**：`server_profiles` 增 `permission_preset`、`permission_rules_json`
  （**按序**存储——顺序即配置）、`origin_profile_id`、`cloned_at`（克隆出处与时间）。
- `ProfileRecords.set_permissions()`：校验后写入并 `bump_config`（改配置即新修订）；
  非法规则**保存前**类型化拒绝。
- **下一轮生效**（G1 的核心纪律）：turn context 透出预设/规则 → 执行接受时把
  `resolve_all(...)` 结果作为 `permissions` 冻进该轮 effective config。
- **投影**：profile 视图增 `permissionPreset`/`permissionRules`/`originProfileId`
  （前端 P17 需要；**wire 形状有变，待 P17 同步与两仓重锁**）。
- 资产绑定清单：**复用** `server_profile_assets`（kind 通用：skill/mcp/plugin/instruction），
  不再为 60 另造一套。

## 60 未做（下腿）

- 阶段 C（归属纠正的文案/查询清点）、D（同/跨家族**克隆**与逐家迁移表）、E（换绑定连续性
  分档：文件式 vs 共享 DB 式——后者已由 66 的 whole-db 共享库覆盖，需按 §7.3 复述结论）、
  F（回归收口）；权限姿态的**逐家翻译**（把中性姿态翻成各家工具名）与 `ask` 与审批往返的
  端到端；`profiles.setPermissions` wire 方法。

## 阶段 C：归属纠正（已落地，测试钉住）

清点结果（第一手）：**查询面已正确**——`profile_id=?` 只出现在 `server_turns`（逐轮归属）与
资产绑定表；session 列表按 **workspace**（`list_sessions(workspace_id=…)`），wire 的
`sessions.list` 参数里**没有 profile 轴**。文案面（src 与 docs）零命中"profile 拥有会话"。

新增边界测试把这个语义钉死：同 workspace 两个 session 绑不同 profile 都列出；每个 session
的 `profileId` 是**当前绑定**；给 `sessions.list` 传 `profileId` 是 `INVALID_REQUEST`
（不是"谁的会话"过滤器）；同家族 switch 只移动绑定、workspace 归属不变；**跨家族 switch
被拒**（`PROFILE_HARNESS_MISMATCH`——换家族是克隆，不是切换）。

## 阶段 D：克隆（已落地，含逐家迁移表）

- **迁移规划**（`server/profiles/clone.py`，纯函数、先算后写——"告知"与"发生"不可能漂移）：
  逐项给出 `{item, migrated, reason}`：
  - 同家族：`configuration`/`credential`/`account` **复用**（引用级，不搬数据）；
  - 跨家族：`configuration`/`credential`/`account` **列出且不迁移**（配置键与凭据/登录态
    都是家族专属）；
  - `permissions`：**中性规则集照序迁移**（last-match-wins 的顺序原样保留）；
  - 资产：`skill`（Agent Skills 形态）与 `plugin`（代码资产）迁移；`mcp` 仅在**目标家族
    声明 mcp 槽位**时迁移，否则列出"目标未声明槽位"；
  - `hook`：**按目标家族的 hook schema 逐条复核**（事件声明 + 处理器类型），不通过则带原因
    列出（例：claude 的 `prompt` 处理器迁去 codex 被拒——codex 只声明 `command`）；
  - `native-sessions`：**永不迁移**（"不假装继承旧的原生会话"）。
- **克隆行**（`ProfileRecords.clone_from`）：记录 `origin_profile_id` + `cloned_at`；跨家族
  不重用配置对象、不发明凭据/账号；权限姿态随行。
- **wire**：`profiles.clone {requestId, profileId, displayName, harness?} → {profile, migration}`
  ——迁移报告是**产品面**（UI 紧挨克隆展示"迁移了什么、没迁移什么、为什么"）。

## 阶段 E：换绑定的连续性（结论，代码见 66）

按 §14/§7.3 分档落地后的**事实陈述**：
- **可切分家族（pi/codex）**：会话子树在每个 harness 的公共 session 库里（§14）⇒ 同家族
  换 profile **原生连续性天然成立**，无拷贝无翻译；
- **共享 DB 式（kilo/opencode）**：66 的 **whole-db 共享库**（`kilo.db`/`opencode.db` ±
  wal/shm + revert 落点）让同一家族的换绑定同样连续；守卫（空凭据只读检查）在切换前置；
- **边界如实**：共享库内的**非会话内容**（project/permission/event 等）对同族其它 profile
  **可见**——写进文档当事实（66 §4 已列），不在 UI 上伪装成隔离。
- 真机跨 profile 续接证据：66 的 G1 夹具级端到端（跨 profile 真召回、同 native id）；
  **真实家族（codex/pi/kilo）的跨 profile 轮未跑**，如实记账。
