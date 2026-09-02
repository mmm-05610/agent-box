# NATIVE PROFILE HOME + CENTRAL SKILL CLOSURE — 最终验证报告（2026-09-02）

实施范围：任务书「Native Profile Home + Central Skill Installation Closure」
全部阶段。全部修改可追溯至冻结语义、两份研究知识基
（`docs/research/harness-native-knowledge-2026-09-01/`、
`docs/research/central-skill-repository-patterns-2026-09-02/`、
`docs/research/harness-acp-viability-2026-09-02/`）与既有协议不变量。
未执行 git add/commit/push；未读取任何 credential 值；未执行真实模型请求；
未修改 Work Core/schema/migrations；`PLUGIN_API_VERSION` 保持 2。

## 1. Verdict

**COMPLETE**（Phase A–H 全部落地；Hermes 沙箱内完整 venv 运行能力如实标注为
不可用，见 §25 限制；不伪造 Skill Closure 解决）。

> 2026-09-02 追加：事务边界修复轮（`NATIVE_PROFILE_TRANSACTION_BOUNDARY_
> REPAIR.md`）在既有模型上补齐 A–H 审计缺口——pointer authority、
> 统一 journaled mutation、prepare freeze、reconcile 单事务、
> finish terminal guard、receipt rollback/recovery、legacy import 事务与
> 路径脱敏、inventory 硬边界。测试基线更新为：root 144、harnesses 355+4
> skip、skills 8、acp 40、runtime-local 6、sandbox-bwrap 12、
> terminal-session 3、git 4、artifacts 2、web 17。
>
> 2026-09-02 再追加（crash-window closure）：`NATIVE_PROFILE_TRANSACTION_
> CRASH_WINDOW_CLOSURE.md` 闭合 pointer replace/journal-step 崩溃窗口、
> corrupt pointer 放行、exact freeze、reconcile verify、legacy staged
> snapshot、skill inventory delta 与严格状态机。journal intent schema v2；
> 恢复 = intent + ACTUAL observations truth table；运行时失败路径与 crash
> recovery 共用同一决策。测试基线更新为：root 144、harnesses 389+4 skip、
> skills 8、acp 40、runtime-local 6、sandbox-bwrap 12、terminal-session 3、
> git 4、artifacts 2、web 17。>
> 2026-09-02 三追加（final durability closure）：`NATIVE_PROFILE_TRANSACTION_
> FINAL_DURABILITY_CLOSURE.md` 闭合 terminal 严格 authority、物理 home
> 冻结、committed API outcome 与 fsync durability。测试基线：harnesses
> 420+4 skip、root 144、skills 8、acp 40、runtime-local 6、sandbox-bwrap
> 12、terminal-session 3、git 4、artifacts 2、web 17。

## 2. 最终 Profile storage tree

```
profiles/<harness_type>/<profile_id>/
├── native-home/                 唯一活动原生环境（guest HOME 内容；0o700）
├── profile.json                 当前指针：revision/digest/skill_receipts_digest/
│                                 native_state_generation/native_tree_digest/
│                                 recovery_generation/updated_at
├── installed-skills.json        ProfileSkillInstallation receipts 索引
├── revisions/<revision>/envelope.json   不可变 identity+managed config 证据
├── transactions/<txid>.json     安装 journal；mutation.lease.json；
│                                 active/<execution_id>.json
└── recovery/<execution_id>/     失败/歧义 execution view（人工处置）
```

## 3. Native Home authority

`native-home/` 是唯一活动 authority；`native_payload` 只用于 patch 已知
managed config（CONFIG_AUTHORITY）或迁移 envelope-only Profile；未知安全
文件默认保留；symlink 拒绝（typed），socket/device/fifo/lock 跳过；credential
path 从不进入快照/digest/日志且从不读取内容；路径分类全部来自五家
`NativeHomePolicy`（`native_home/policy.py`，evidence 注释）。

## 4. revision / native-state 语义

显式 config 编辑 → 新 revision（managed config 落盘）；skill install/update/
rollback/uninstall → 新 revision（envelope 绑定 `skill_receipts_digest`）；
session/cache/checkpoint → 不产生 Profile revision，仅推进 plugin-local
`native_state_generation`。old revision 显式回滚；configuration 与
runtime/session 回滚明确区分（`record_skill_mutation` / `bump_native_generation`）。

## 5. Execution Native Home View / reconciliation

`native_home/view.py::NativeHomeView`：policy-aware 安全复制 + 声明 overlay →
挂载 `/runtime/home`(rw) → 运行 → reconcile（decision-then-commit；仅
SESSION/UNKNOWN 写回；credential/ephemeral/skill-managed/config-managed
永不写回；双向变更 → `NATIVE_HOME_RECONCILE_AMBIGUOUS` → recovery view）。
`ProfileMutationLease` + `ActiveExecutionRegistry`：单 writer、执行中阻止
mutation（fail closed）。cleanup 幂等、永不删除 Profile home。
`ExecutionStagingArea` 的 full-reconstruction 语义被替换（无 Profile 的
profile-less 启动保留空 home）。

## 6. Central SkillStore authority

未改动 authority：SkillRef/不可变 revision/digest/CAS/有界 import/supporting
files/disable/exact resolve/Resource Library/preview-confirm 全部保留；
agent-box-skills 不 import harnesses/Profile/web/runtime（边界未破）。

## 7. ProfileSkillInstallation receipt

`native_home/receipts.py`：profile identity、profile revision、harness type、
central SkillRef、installed revision、installed tree digest、native target、
managed file inventory、state、installed timestamp、provenance。
状态：`INSTALLED`（持久化）+ `UPDATE_AVAILABLE`/`DRIFTED`/`DISABLED`/
`CONFLICTED`（计算/typed）。

## 8. install / update / rollback / uninstall

`native_home/installer.py`：默认 copy；校验中央 digest；preview conflicts；
expected revision/CAS；stage→verify→atomic replace→receipt→revision bump→
cleanup；journal 恢复；不执行 Skill scripts；不覆盖 unmanaged/Profile-local
同名；同一 Profile 单 mutation writer；同一 native target 单 managed
installation；install 失败回滚（files+receipt+revision）。

## 9. drift / conflict / recovery

drift（managed Skill 被人工修改）→ `DRIFTED`，禁止自动 update/uninstall，
后端提供 typed disposition（restore/promote/keep-local）；冲突 →
`SKILL_INSTALL_TARGET_CONFLICT` / `SKILL_INSTALL_UNMANAGED_TARGET`；
不完整 journal → `SKILL_INSTALL_RECOVERY_REQUIRED`，`recover_pending()`
重入（complete 或 rollback，幂等）。

## 10. Profile-local Skills

Native Home 中存在、无 receipt 的 Skill：原样保留、不自动导入/删除/重命名，
inventory 中标记 `profile-local`/`UNMANAGED`（DISCOVERABLE），与中央目标
冲突时 fail closed。

## 11. Project Skills

`native_home/inventory.py::project_skill_inventory`：worktree authority；
每 Harness 官方 project roots（codex `.codex/skills`+`.agents/skills`、
claude `.claude/skills`、opencode `.opencode/skill(s)`、pi `.pi/skills`+
`.agents/skills`；hermes 无原生项目根 → 如实 skip）；git commit/dirty/
ignored/tree digest/trust（默认 untrusted）如实；不自动复制/安装/修改项目。

## 12. Ordinary Execution SkillRef removal

`HarnessStartContext.skills`/`context_skill_requests`/`SkillCopyRequest`/
skill input slots/`skill_target`/`skill_env` 全部移除；Registry 不再声明
`agent-box.skill@1`；ExecutionProvider/LaunchPlan/lowering 不再投影 Skill；
Quick Launch 不再发送 SkillRefs；`agent-box.skill@1` 契约仅保留给
Library/management resolution（web install API + selector）。

## 13. EffectiveSkillInventory

`native_home/inventory.py`：Profile（central-installed + profile-local）+
Workspace（project）有界派生；只声称 AVAILABLE/DISCOVERABLE/PROJECTED；
不带宿主绝对私有路径（project public 移除 repository_identity）、不带
credential、不暴露无限 native payload；可进入 Web 只读展示与 diagnostics。

## 14. five Harness native targets

policy 证据根：codex `.agents/skills`、claude `.claude/skills`、opencode
`.config/opencode/skills`、hermes `.hermes/skills`、pi `skills`。五家 vertical
测试（fake/offline）证明：完整 Native Home、未知文件保留、credential 不进
view、中央 Skill 装到正确 target 且 fake 进程真实读到 SKILL.md、无 Execution
SkillRef、project Skill 留 workspace、session 状态在 install/reconcile 后
保留、install/update 不触活动 execution 冻结视图、diagnostics 如实。

## 15. legacy 1.x migration

`native_home/migrations.py`：preview（exclude credential/special、
preserve unknown、forbidden 清单）→ confirm（copy，不覆盖已存在；原目录不
删除；preview drift fail-closed）；guest 映射表 evidence 注释。

## 16. envelope-only migration

put() 时 native-home 缺失 → seed 最小正确 native config（Harness owner 渲染）
+ `MIGRATED_FROM_ENVELOPE` provenance；不声称恢复不存在的未知文件；不伪造
历史。

## 17. Web Library / Profile / Quick Launch

Skill Library 主操作改为 Import to Central / Install to Profile / View
Installations / Update / Rollback / Remove / Inspect Drift；
Profile 页面新增 Native Home panel（identity/revision/generation/tree
digest、managed installations、profile-local skills、drift 诊断，不暴露
credential/host path）；Quick Launch 移除多 Skill selector、不再发送
SkillRefs、选中 Profile 后只读展示 EffectiveSkillInventory；不静默安装/
升级 Skill。全部经 Catalog/Resource Library 发现（`agent-box.harness.
skill-installer@1` generic contribution）。

## 18. OpenCode ACP regression

`test_opencode_acp_vertical`/`test_native_acp_parity`/`test_opencode_acp_probe`/
`test_opencode_mode_selection` 共 29 项通过；native/ACP 双模式、SessionDriver、
ObservationHub、PermissionPolicy 未重写；Profile/Skill 改造未破坏 ACP
vertical（新增仅 XDG 四件套+argv+协议 prompt 的语义保持）。

## 19. Catalog / API v2

新增 generic contribution kind `agent-box.harness.skill-installer@1`
（`native_home/kinds.py`）；Catalog 只按 kind/id 查询、不理解 Skill/Profile/
Harness；`PluginRegistration` 未加 Skill 专用字段；`PLUGIN_API_VERSION=2` 不变；
无 import side effect、无静默 first-match。

## 20. Work Core / schema / migrations diff

零修改。Root 侧唯一改动：`protocols/runtime/__init__.py` 导出 `ByteDuplexTransport`
（ACP 既有成果，非本轮）与 `protocols/runtime/assembler.py` docstring 净化
（既有成果）。Work Core ontology/Binding/Freeze/Dispatch/Finalization/schema/
migrations 未触碰。

## 21. full tests

- root `tests`：144 passed
- agent-box-harnesses：318 passed, 4 skipped（真 native-only/bwrap/pi 探测）
- agent-box-skills：8 passed；agent-box-acp：40 passed
- runtime-local 6 / sandbox-bwrap 12 / terminal-session 3 / git 4 / artifacts 2
- agent-box-web：17 passed（含 Playwright browser vertical + 新安装到 Profile 端到端）
- fake/protocol/storage/transaction 测试全部执行，无 native 缺失导致 skip
  （4 个 skip 均为真实 bwrap/native binary 依赖，已按规则明确 skip）。

## 22. frontend / browser

Vitest 6 passed；oxlint 0 errors（5 warnings）；`vite build` 成功并更新
`_static`（与提交产物同步）；`node_modules`/`dist` 已清理，`test_static.py`
锁定“vite 为同步 owner”。

## 23. wheel / clean venv / discovery / doctor

Root+8 插件共 9 wheels 构建成功（`dist-closure/`）。Root-only clean venv：
root import ✓、PLUGIN_API_VERSION=2 ✓、`agent_box.plugins` entry points 空 ✓、
`doctor --json` 降级 JSON 无 traceback ✓。Preview clean venv：12 个 entry
points READY ✓、`doctor --json` 全绿 ✓、静态产物定位 ✓。

## 24. secret / path scan

`agent-box.skill@1` 仅剩 Root 契约定义 + web 管理解析（§14.8 语义）；无普通
Execution 消费。新 public 面（receipt/inventory/native-home summary/installer）
无宿主绝对私有路径（project repository_identity 仅在插件内部）、无
credential 值/路径内容；`git diff --check` 干净；`compileall` 通过；
Root 业务词汇扫描测试通过。

## 25. Git status / intended ledger

未 commit；dirty worktree 全保留。本轮回新增/修改文件清单位于本目录
`NATIVE_PROFILE_PHASE_A_AUDIT.md` §4 迁移清单 + `git status`（全部未提交）。

## 26. credential / model requests

未读取任何 credential 值（仅按 path 分类排除）；未执行真实模型请求（全部
offline/fake/synthetic）。

## 27. remaining limitations

- Hermes 沙箱内完整 site-packages/venv 投影仍不可用（RD-5）；native execution
  availability 如实标注，未用 Skill Closure 假装解决；其推荐 bundle vertical
  可在后续独立完成（不在本任务范围）。
- `stream` 能力仍 `unavailable`（RD-4：Runtime 侧 live pump 缺口，诊断如实）。
- Project Skill 的 promote/import 高级 UI 未实现（仅 typed backend
  disposition；范围允许）。
- 并发协议为文件级协作式 lease/active-marker；跨进程正确性依赖原子 rename
  与 O_EXCL，已在 typed 层面 fail closed（文档说明）。
- Managed payload 键策略仍为“容忍+诊断只映射 documented keys”（RD-3 过渡）。
- credential 多账号 merge 语义（RD-6）、launch mode 选择面（RD-7）未实现。

## 28. READY FOR MANUAL CHECKPOINT

**READY**。代码未提交，工作树保留全部变更；等待人工 checkpoint 后另行下令。

## 29. READY TO BEGIN CODEG INTEGRATION

**READY**（以人工 checkpoint 批准为前提）。
