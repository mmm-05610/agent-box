# 工单 63 收口报告 —— Profile 记忆读取面（只读、有界、零凭据）

执行：2026-09-18，env-provider 工作树。终态：**PROFILE_MEMORY_READ_DONE**（本机侧完整；WSL 侧未接，如实记账）。

## 1. 注册表新增字段与逐家值（阶段 A 一手）

新字段 `[harness.profile] memory_paths`（≤8 条、guest-home 相对、无 `..`/绝对/占位符、去重）：

| 家 | 值 | 证据（钉住工件字符串计数） |
| --- | --- | --- |
| claude-code | `.claude/CLAUDE.md` | `.claude/CLAUDE.md` 17 处、`CLAUDE.md` 280 处 |
| codex | `.codex/memories/MEMORY.md`、`.codex/memories/memory_summary.md` | 二进制内 `memories/MEMORY.md` 与 `memories/memory_summary.md`（后者 36 处）同段出现 |
| opencode / hermes / pi / dsh / qwen / kilo | **未声明** | 观察不足（hermes 仅 1 处 `MEMORY.md`）；未声明 → **不显示记忆分区**（G1：不画假分区） |

## 2. 字段与类型化码表

- **wire**：`profiles.memory {requestId, profileId} → {memory}`；
  `memory = {available, reason, files[], note?}`；`files[]` 项 = `{path, size, digest, content}`
  或**被拒项** `{path, size, reason: "MEMORY_CONTAINS_SECRET", refused: true}`（无 content）。
- **reason**：`MEMORY_HOME_MISSING`（家不存在/未物化）、`MEMORY_FILE_OUTSIDE_BOUNDS`、
  `MEMORY_FILE_UNSAFE`（符号链接/非常规文件/逃逸路径）、`MEMORY_READ_FAILED`、
  `MEMORY_UNAVAILABLE`（无本机根/远端）、单项 `MEMORY_CONTAINS_SECRET`。
- **缺失语义**：声明了但不存在的文件 = **缺席**（不返回空串、不报错）；
  家存在但全缺失 = `available: true` 且 `files` 不含该项（G5）。

## 3. 与指令资产的分界（60 对照）

**记忆** = harness 自己写的文件（本单，从原生 home 读，只读）；
**指令资产** = 我们注入的只读投影（60，从资产库存取）。两者在数据、代码与 UI 分区上分离；
本单不读资产库、60 不读原生 home。

## 4. 验证（第一手）

- **正例**：家内放 `MEMORY.md` → `path/size(19)/digest` 与内容正确；未声明的伴随名不读。
- **反例**：超限文件（64 KiB + 1）→ 拒绝且**无条目**（reason 记 `OUTSIDE_BOUNDS`）；
  符号链接 → 不跟随、无条目；含注入凭据的文件 → 拒绝返回且**无 content**（零内容进日志/答案）；
  `../escape.md` → 路径不安全；家不存在 → 单一类型化原因 + 空列表；
  **wire 端到端**：未物化家 → `MEMORY_HOME_MISSING`；物化后 → 读到内容且**答案中无宿主路径**；
  pi（未声明）→ `available: false` + note。
- **只读**：`O_NOFOLLOW` 打开、从不写入；测试断言无任何写入路径。

## 5. 未做项

- **WSL 侧读**：远端家的记忆读未接（需要 Worker 侧读口；按 62 的同族设计留待），
  当前远端场景返回 `MEMORY_UNAVAILABLE`，**不假装**；
- **P17 前端同步与两仓重锁**：新增 1 个只读方法（P17 的"记忆"分区按其可用性开关渲染）。
