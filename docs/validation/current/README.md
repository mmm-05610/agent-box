# Current release evidence

These reports record validation of the current Core + official plugin tree.
They are evidence, not user instructions. Historical phase reports and
spike-only validation are under `../archive/`.

Current closure: `ROOT_EXTENSION_REPAIR_PHASE_5_ROUTING_CLOSURE.md`.

Five-Harness consolidation closure:
`FIVE_HARNESS_REGISTRY_CONSOLIDATION_CLOSURE.md`.

Native Profile Home + Central Skill installation closure (canonical for the
Phase 2 resource-routing semantics — one Profile/one Native Home, central
Skill authority, SkillRef is a management identity, ordinary Executions carry
no SkillRef):

- `NATIVE_PROFILE_HOME_AND_CENTRAL_SKILL_CLOSURE.md`
- `NATIVE_PROFILE_PHASE_A_AUDIT.md`
- `NATIVE_PROFILE_TRANSACTION_BOUNDARY_REPAIR.md` (A–H 审计修复：pointer
  authority、统一事务、prepare/reconcile 冻结、finish 终态守卫、
  receipt 回滚、legacy import 事务与脱敏、inventory 边界)
- `NATIVE_PROFILE_TRANSACTION_CRASH_WINDOW_CLOSURE.md`
- `NATIVE_PROFILE_TRANSACTION_FINAL_DURABILITY_CLOSURE.md` (最终收口：
  严格 terminal authority、物理 native-home 冻结、committed API outcome、
  fsync durability scope、retention/pruning) (crash-window 闭合：
  pointer intent/recovery truth table、exact freeze、reconcile verify、
  legacy staged snapshot、skill inventory delta、严格状态机)
- `docs/architecture/NATIVE_PROFILE_HOME_AND_CENTRAL_SKILL_ARCHITECTURE.md`

Studio 后端核心替换（Session/Harness separation 实施）：

- `AGENT_BOX_STUDIO_BACKEND_CORE_PHASE1.md` — Phase 1（Session Protocol /
  Store / Live Workspace / fake vertical）。
- `AGENT_BOX_STUDIO_FIVE_HARNESS_BACKEND_PHASE2.md` — Phase 2（Gate A 审计
  闭合 + 五真实 Harness 生产链 + 202 异步 Turn 事务 + 恢复/取消/权限面）。
  该报告对 Phase 1 的 A10（httpx2 依赖）结论做了修正说明。
- `SMOKE_REAL_HARNESS.md` — 人工真实凭据 smoke 指南（未执行，
  REAL-CREDENTIAL SMOKE PENDING）。
