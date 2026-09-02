# PHASE A — Native Profile Home + Central Skill Closure：只读审计与迁移清单（2026-09-02）

本文件是该轮改造的 Phase A 产出：当前链路审计、冻结语义落点、实现计划与迁移清单。
不包含任何 Work Core/schema/migrations 修改计划（禁止项）；不包含 git 写操作（禁止项）。

## 1. 当前链路（审计结论）

```
Registry facts (harnesses.toml → HarnessDefinition)
→ typed HarnessStartContext（adapters/start_context.py；显式抽取 agent-box.skill@1 0..32）
→ per-Harness Native Adapter plan()（纯 planner；context_skill_requests() 生成 SkillCopyRequest）
→ private immutable LaunchPlan（含 plan_home_logical_digest = rendered+skills 声明的 home 逻辑摘要）
→ Composer 语义组合（profile payload → native config 片段）
→ staging：ExecutionStagingArea.materialize(rendered, skills=…) ← 从零全重建 guest home
→ lowering（lower 校验 StagedHome.logical_digest == plan 声明 digest）→ Root assembler（content_digest 实读校验）
→ coordinator → Sandbox/Terminal → spawn
```

Profile 存储现状：`profiles/<harness>/<profile>/revisions/<rev>/envelope.json`
（envelope-only；native_payload 为配置 dict；每个修订不可变）。

关键缺口（对应任务书）：
1. **无持久化 Native Home**：每次执行从零重建 home；native_payload 是唯一配置载体（RD-1 语义）。
2. **普通 Execution 与 SkillRef 强耦合**：`agent-box.skill@1` 输入 + Quick Launch 多 Skill selector + 执行期投影。
3. **无 install-to-profile 语义**：中央 SkillStore 只做 import/discover，与 Profile 无安装关系。
4. **无 NativeHomePolicy**：路径事实散落在 adapters 类属性与 harnesses.toml。
5. **执行期 home 无 reconcile/lease/recovery 语义**；staging cleanup 无回写治理。
6. Web：Skill Library 只有 import；Profile 页面只做 config CRUD；Quick Launch 发送 SkillRefs。

## 2. 冻结语义 → 实现落点

| 任务书章节 | 落点（agent-box-harnesses 内新增/改造） |
| --- | --- |
| 2.1 Profile | `native_home/` 目录成为唯一活动 Native Home；`native_payload` 只用于 patch 已知配置/迁移 |
| 3 存储模型 | `profiles/<h>/<p>/{native-home/,profile.json,installed-skills.json,revisions/,transactions/,recovery/}` |
| 4 NativeHomePolicy | `native_home/policy.py`：五家 policy，evidence 注释引用两份知识基 |
| 5 Execution Native Home View | `native_home/view.py`：prepare（安全复制+声明 overlay）→ reconcile（typed）→ recovery |
| 6 revision 语义 | envelope revision 覆盖 config edit + skill mutation（envelope 增加 skill_receipts_digest）；native state generation 独立演化 |
| 7 迁移 | `native_home/migrations.py`：1.x 目录 import（preview→confirm）；envelope-only seed（MIGRATED_FROM_ENVELOPE） |
| 9/10/11 receipts+事务 | `native_home/receipts.py` + `native_home/installer.py` + `transactions/` journal |
| 13 Project Skills | `native_home/inventory.py`（ProjectSkillIdentity：worktree/git commit/dirty/ignored） |
| 14 Execution SkillRef 移除 | start_context 删除 skills 抽取；harnesses.toml 删除 skill input slots 与 skill_target/skill_env；generic_cli 删除 context_skill_requests 调用；staging 删除 SkillCopyRequest 路径 |
| 15 EffectiveSkillInventory | `native_home/inventory.py`（central-installed / profile-local / project；只声称 AVAILABLE/DISCOVERABLE/PROJECTED） |
| 18 Catalog | 新 generic contribution kind `agent-box.harness.skill-installer@1`（不新增 PluginRegistration 字段，API v2 不变） |
| 19 失败分类 | `native_home/failures.py`：PROFILE_*/SKILL_INSTALL_*/PROJECT_SKILL_*/NATIVE_HOME_VIEW_* typed codes |
| 20 并发 | mutation lease + active-execution 标记；默认 fail closed；单 writer 语义 |

## 3. 五家 Native Home / Skill target / credential / ephemeral / session 事实基线

（evidence 见 `docs/research/harness-native-knowledge-2026-09-01/harnesses/<id>/FACTS.md` 与
`docs/research/central-skill-repository-patterns-2026-09-02/harnesses/<id>.md`，policy 源码逐条注释）

| harness | native-home 内容（guest HOME 布局） | Skill target（guest-relative） | credential（绝不快照/复制/读取） | ephemeral（copy/snapshot 跳过） | session/checkpoint（允许持久化） |
| --- | --- | --- | --- | --- | --- |
| codex | `.codex/` | `.agents/skills/{id}`（user 层官方根；`$CODEX_HOME/skills` 已弃用） | `.codex/auth.json` | `.codex/cache/` `.codex/log/` `.codex/tmp/` `.codex/models_cache.json` `.codex/skills/.system/` | `.codex/sessions/` `.codex/archived_sessions/` `.codex/state_*.sqlite` 等 |
| claude-code | `.claude/` | `.claude/skills/{id}` | `.claude/.credentials.json` | `.cache/claude-cli-nodejs/`（machine cache 跟 HOME） | `.claude/projects/` `.claude/sessions/` `.claude/history.jsonl` `.claude/file-history/` `.claude/session-env/` |
| opencode | `.config/opencode/` `.data/opencode/` `.cache/opencode/` `.state/opencode/` | `.config/opencode/skills/{id}`（G2: 官方扫 `skill(s)` 双写；延续 Registry 现有 `skills` 根） | `.data/opencode/auth.json` | `.cache/opencode/` `.state/opencode/locks/` | `.data/opencode/opencode.db*` 等 |
| hermes | `.hermes/` | `.hermes/skills/{id}`（primary root） | `.hermes/.env` `.hermes/auth.json` | `.hermes/cache/` `.hermes/logs/` `.hermes/.update_check` | `.hermes/state.db*` `.hermes/sessions/` `.hermes/checkpoints/` `.hermes/memories/` |
| pi | agent dir（PI_CODING_AGENT_DIR=/runtime/home → guest HOME 根） | `skills/{id}`（agent-dir skills） | `auth.json`（agent dir 根） | `pi-debug.log` | `sessions/` |

配置 patch authorities（适配器渲染目标）：codex `.codex/config.toml`；claude `.claude/settings.json`；opencode `.config/opencode/opencode.json`；hermes `.hermes/config.yaml`；pi `settings.json`。

## 4. 迁移清单（最终文档引用）

- [ ] `native_home/policy.py`（五家 policy + 分类）
- [ ] `native_home/tree.py`（policy-aware walk/copy/digest；typed 特殊文件处理）
- [ ] `native_home/view.py`（NativeHomeView + ProfileMutationLease + recovery）
- [ ] `native_home/receipts.py`（ProfileSkillInstallation + installed-skills.json）
- [ ] `native_home/installer.py`（install/update/remove/rollback/drift + transaction journal）
- [ ] `native_home/inventory.py`（Profile-local / Project / EffectiveSkillInventory）
- [ ] `native_home/failures.py`（typed codes）
- [ ] `native_home/migrations.py`（1.x import preview/confirm；envelope-only seed）
- [ ] `generic/profile_store.py` 改造（native-home 管理、profile.json、generation、receipts digest、lease 检查）
- [ ] `generic/profile_envelope.py`（plugin-local 字段）
- [ ] `generic/profile_manager.py`（native_home 摘要、installations、inventory、imports 接线）
- [ ] `generic/factory.py`（wire policies/patchers/installer contribution）
- [ ] `adapters/staging.py`（NativeHomeView 物化路径；删除 SkillCopyRequest 重建语义）
- [ ] `adapters/lowering.py`（native view digest 声明）
- [ ] `adapters/start_context.py`（移除 skills + context_skill_requests）
- [ ] `adapters/generic_cli.py` + 五家（移除 skill 投影）
- [ ] `registry/schema.py` + `harnesses.toml`（移除 skill input slots / skill_target / skill_env）
- [ ] Web facade + host routes（skills install preview/confirm/update/remove/inventory；profile native-home 视图）
- [ ] 前端 SkillLibrary / QuickLaunch / Profile 页
- [ ] 测试迁移与新增（Phase B–H）
- [ ] `docs/architecture/NATIVE_PROFILE_HOME_AND_CENTRAL_SKILL_ARCHITECTURE.md`
- [ ] `docs/validation/current/NATIVE_PROFILE_HOME_AND_CENTRAL_SKILL_CLOSURE.md`

## 5. 明确不做（本轮禁止）

MCP Resource、远程 Marketplace、对象级 CAS/GC、dependency resolver、publisher/signature、
Skill script 执行、自动双边同步、自动项目导入、自动全局安装、自动升级、one-shot Execution Skill
override、logical Session、跨 Harness continuation、第二套 runtime-state native home、其他 Harness ACP、
Work Core/schema/migrations 修改、PLUGIN_API_VERSION 升级、credential 读取、真实模型请求、git 写操作。