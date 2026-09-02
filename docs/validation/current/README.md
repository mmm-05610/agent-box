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
