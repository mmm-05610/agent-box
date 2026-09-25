# APPROVED（预备）— C-RUNTIME@v1 公共区动词加性编辑：指定单写者 E

批准者：中央 C（`contracts/C-RUNTIME-v1.md` §6 第二步）。这是**在 E-INC2 阶段执行**的 standing 授权，非现在开工；发此以解 E-INC2 前置，不代表 INC1 已完。
- 单写者：**execution（E）**（拥有 `extensions/runtime_composition/` 接线）。一次编辑、逐路径、公共区仅此文件。
- 绑定：契约 `C-RUNTIME@v1` · 基线 候选 `4917f56` · 方案 E-D2 v1.2 · 门：**E-INC1a/1b 经 C 集成验证之后**方可执行；与 INC1 不并行抢写。

## 允许改动（仅此，加性、破坏性为零）
1. `src/agent_box/extensions/runtime_composition/protocol.py`：为 `RuntimeHost`/`Sandbox`/`TerminalSession` **加性声明**可选能力 `composition.compensation@1` 与方法 `terminate`/`release`/`cleanup`（经 `HostTransportOperation(transport_kind="terminate@1")` 表达终止）。要求：
   - **不改**任何既有方法签名/`wrap/observe/resolve` 形状；声明为**可选能力**（未声明者按「可产生副作用」保守处理，向后兼容）。
   - **不加** `runtime_checkable`（E 已核实三 Protocol 零处鸭子 `isinstance`，避免新成员破坏既有 fake）。
   - `IsolatedProcessSpec`（protocol.py:394 跨端口投影）**名与形状不动**。
2. `sandbox_port.py`：`IsolatedProcessSpec`→**局部改名 `RoomProcessSpec`**（P-4），更新其内部引用；不外泄 provider 私有 env 到公共类型。

## 硬约束
- 公共出口其余（`extensions/api.py`、`capability_declarations`、`wire/**`、`resource_contracts/**`、`work_core/**`、`bootstrap/**`）**不得触碰**。
- 无 schema/迁移；不改公开 Wire/REST（M-1）。
- 语义须与 P 的 `C-RUNTIME@v1` §1/§2 一致（动词、回执形状、护栏不放宽）。

## 验收（E-INC2 CHECKPOINT 必交，C 亲跑差量）
- **受影响全套 baseline↔candidate 差量 0 新增失败**：`extensions/runtime_composition/tests` + 六插件全套（git/sandbox-bwrap/terminal-session/runtime-local/skills；artifacts collection err 为环境项单列）+ `tests/server` 相关（release/cancel/secret 消费面）。
- 反例：未声明能力的既有 provider 仍向后兼容（不强制实现新动词即不破坏）；改名不泄漏私有 env；containment/裸跑/重放三守卫不放宽。
- 逐路径 diff + 命令/结果 + 已知缺陷 + 交 P/H 消费者说明。通过后 C 集成、更新候选。

## 次序（不变）
C-RUNTIME 发（已）→ **本单写者批（E，INC2 时执行）** → E-INC2 生产链上端口 → H 增量3 用执行面。E 现仍应先完成 INC1a（未提交）→ CHECKPOINT → 集成 → 预留#2 验收；勿在本授权下提前抢 INC2。
