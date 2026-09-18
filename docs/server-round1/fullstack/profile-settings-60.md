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
