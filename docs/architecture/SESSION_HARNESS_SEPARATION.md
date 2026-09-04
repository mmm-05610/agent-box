# Session × Harness 语义分离设计

> 状态：设计稿，待批准。位置：`docs/architecture/SESSION_HARNESS_SEPARATION.md`
> 依据：用户裁决——"Session 高于 harness type；后续在一个 session 里切换 harness"。
> 本设计取代 Codeg 的"conversation ↔ agent_type 固定绑定"（审计泄漏 L1 的最终处置）。

---

## 1. 语义重定义

| 概念 | 旧（Codeg） | 新（Agent-Box Studio） |
|---|---|---|
| **Session** | 绑定一个 agent_type 的会话 | **容器**：项目内的一段工作历史（turns 序列）+ 偏好。不知道自己"是"哪个 harness |
| **Harness 选择** | 创建会话时定死 | **逐轮选择**：每次发送指定本次由谁执行；session 只存"默认值/上次使用" |
| **Turn** | 隐式（一轮对话） | **一次执行**：明确记录执行者 `{harnessId, profileRef?, nativeRef?, startedAt}` |
| **Tab 身份** | `conv-{folder}-{agent}-{conv}` 三元组 | `session-{id}`（只有会话 id） |

一句话：**Session 回答"我们在做什么"，Harness 回答"这一步谁来干"。**

## 2. 领域模型变更（core/domain）

```ts
// session.ts（新）
interface Session {
  id: ID
  projectId: ID
  title: string
  defaultHarnessId?: HarnessId          // 新轮的默认执行者（UI 可随手切）
  harnessState: Record<HarnessId, NativeContinuationRef>
  // ↑ 每个 harness 在本 session 内的最后 native 会话游标（续接用）
  createdAt: ISOString
}

// message.ts：Turn 增加执行者溯源
interface Turn {
  id: TurnId
  role: "user" | "assistant"
  execution?: {                          // assistant 轮必有
    harnessId: HarnessId
    startedAt: ISOString
    nativeRef?: string                   // 该轮对应的 native 会话游标
  }
  parts: MessagePart[]
  usage?: TurnUsage
}

// ports/session-runtime.ts：spec 拆分
interface SessionSpec {                  // 容器级：不含 harness
  sessionId: ID
  projectId: ID
}
interface TurnRequest {                  // 逐轮：harness 是发送参数
  input: ComposerInput
  harnessId: HarnessId
  profileRef?: string
}
```

`SessionRuntime` 接口调整：

```ts
interface SessionRuntime {
  open(spec: SessionSpec): Promise<void>       // 原 connect，不再带 agentType
  send(request: TurnRequest): Promise<void>    // ← harness 成为发送参数
  cancel(): Promise<void>
  events: Subscribable<SessionEvent>           // 事件带 harnessId 溯源
  permissions: Subscribable<PermissionRequest[]>
  respondPermission(id, answer): Promise<void>
  // restore 并入 open（harnessState 里的游标按需续接）
}
```

## 3. Runtime 实现：从"单连接"到"连接池"

`CodegRustSessionRuntime` 内部改为**按 harnessId 的懒连接池**：

```text
send({input, harnessId})
  → pool[harnessId] 不存在？→ ensureConnection(harnessId)
       · harnessState 有游标 → connect(continue=nativeRef)   // 续接旧上下文
       · 无游标        → connect(fresh)
  → acp_prompt(connection, input)
  → 事件流照旧归一化，SessionEvent 附 harnessId 溯源 → reducer
```

- 连接仍按现有空闲清扫回收（Idle sweep 不变，只是池里有 N 个）。
- **后端无需改动**：Rust 本就支持同 cwd 任意 agent 起连接；conversation 行的 agent_type 列降级为"最后使用的 harness"（仅记录）。未来 agent-box 后端原生实现"session 多 harness"时，runtime 换实现即可——插槽语义不变。

## 4. 上下文连续性策略（关键决策，见 §7）

切换 harness 后，"新执行者知不知道之前聊了什么"分三种情形：

| 情形 | 行为 | 上下文 |
|---|---|---|
| **A. 用回旧 harness** | 按 harnessState 游标续接其 native session | ✅ 完整（该 harness 视角的） |
| **B. 首次启用新 harness** | 全新连接 | 空（干净开始） |
| **C. 显式交接（Handoff）** | 用户点"交给 X 并带上上下文"：把最近 N 轮摘要/精选 turn 注入首条 prompt | ⚠ 按需、有损、用户主导 |

推荐 **A+B 内建、C 作为显式动作**（不做自动静默注入——成本与噪音都不可控，且用户对"给谁看什么"应有控制权）。

## 5. UI 变更

1. **Composer harness 选择器语义升级**：从"本会话的 agent"变为"**下一条消息由谁执行**"。切换只影响下一次发送；选择器旁提示（首次）"切换仅影响后续消息，已完成的轮次不变"。
2. **Transcript 轮次徽标**：每个 assistant 轮头部显示执行者 harness 图标+名（来自 `Turn.execution`）——一眼看清"这段是谁写的"。
3. **会话身份净化**：面包屑/标题不再含 harness；tab id 简化为 `session-{id}`；侧栏会话行显示 defaultHarness 图标（最后使用）。
4. **交接动作**：轮次菜单/命令面板提供"把上下文交给 {harness}"（情形 C），生成注入 prompt 供确认后发送。
5. **权限流不变**：来自当前执行 harness，卡片样式通用（已注册表化）。

## 6. 迁移与兼容

- 旧 conversation（有 agent_type + external_id）导入为：`defaultHarnessId = agent_type`、`harnessState = { [agent_type]: external_id }`——旧会话无缝变新会话。
- tab id 变更是一次性断裂（旧持久化 tab 快照作废，恢复走 `session:restore-last`——D-005 已裁决的路径，正好启用）。
- Rust 后端：零改动（§3）；`list_all_conversations` 的 agent_type 字段前端仅作 lastUsed 展示。

## 7. 需要用户裁决

**上下文连续性采用 §4 的"A+B 内建 + C 显式交接"推荐方案吗？**
- 备选：C' 自动交接（切 harness 时自动注入摘要）——便利但黑箱、token 成本不可见，不推荐做默认。
- 备选：仅 A+B（无交接动作）——最小实现，可后补 C。

## 8. 实施切片

| 片 | 内容 | 预估 |
|---|---|---|
| SH-1 | domain/ports 改形（§2）+ normalize/归约器带 harnessId 溯源 | 半天 |
| SH-2 | runtime 连接池改造（§3）+ 测试 | 一天 |
| SH-3 | UI：composer 逐轮选择器语义、turn 徽标、tab id 简化、侧栏行图标 | 一天 |
| SH-4 | 迁移（旧会话导入）+ 交接动作 C（若批准） | 半天 |

## 9. Session Orchestrator 插件（跨 harness 连续性引擎，v3 增补）

> 一个大 Session 包含多个小 Execution（不同 profile/harness/model/sandbox），
> 每个 execution 都能"接着上面的任务继续"——如同在一个 harness 内部一样。
> 这是 Session Orchestrator 的核心职责，也是本设计最复杂的部分。

### 9.1 诚实的边界声明

各 harness 的对话上下文是**私有格式**（codex rollout / claude 会话文件），
跨 harness 的"无缝继续"在协议层不可能无损。工程上能做到的是三层连续性：

| 层 | 连续性 | 机制 | 保真度 |
|---|---|---|---|
| L1 native | 同 harness 回切 | continuation 游标（thread/resume、--resume） | **无损** |
| L2 文件世界 | 任意执行之间 | workspace 本身（代码/文档是共享事实） | **无损**（工作产物的主体） |
| L3 Session Memory | 跨 harness 切换 | Orchestrator 维护的记忆层自动注入 | **有损、可控**（摘要级） |

大多数"继续干活"的实际依赖是 L2（文件世界）+ L3（目标与决策记忆），
对话原文的逐 token 连续只在 L1 存在——这个边界对用户诚实呈现（绑定条标注 handoff 状态）。

### 9.2 SessionMemory（Orchestrator 维护的记忆层）

```python
class SessionMemory:
    objective: str                    # 会话目标（创建时定，可改）
    turn_digests: list[TurnDigest]    # 每轮摘要链（追加）
    open_threads: list[str]           # 未完成事项（最近轮提取）
    file_timeline: list[FileChange]   # 文件变更时间线（finalization capture）
```

- **TurnDigest 生成**（每轮完成时自动，规则式优先）：从事件流归约提取
  `{harness, 用户意图, 结果摘要, 文件变更, profile/model}`，无 LLM 也可生成；
  可选升级为小模型摘要（设置项，默认关）。
- **注入策略**（跨 harness 切换时自动 + 绑定条标注 `handoff:auto`）：
  前置上下文块 = Objective + 最近 3-5 轮 digest + open threads + 文件时间线近 N 项；
  同 harness 回切不注入（L1 native 续接）。
- **成本控制**：注入体上限（如 4KB）；摘要分级压缩（digest 链 > 总括）。

### 9.3 Orchestrator 职责汇总

1. Session/StageIndex 聚合与持久化
2. Turn 生命周期：绑定解析（BindingResolver 九维）→ 谈判 → 冻结派发 → 执行观测 → 落账
3. SessionMemory 维护：digest 提取/注入/容量管理
4. harnessState 游标：native 续接（同 harness 回切）
5. 事件归一 → WS 广播；失败与中断处理

### 9.4 落点

实现为 `plugins/agent-box-studio` 的核心模块（orchestrator + memory），
不是 core 插件（依赖 Studio 领域模型）；未来若 core 演进出统一 session 存储，
memory 层可上移——接口已按此预留。

## 10. 决策记录（v3 增补，2026-09-03）

- 上下文策略：**L1+L2 内建 + L3 SessionMemory 自动注入**（绑定条标注 handoff:auto，
  设置可关）——用户裁决，取代早前"仅显式 handoff"的保守案。
- Skills：**默认全部可用**（统一目录树工件 + 声明式 mount；格式转换器为
  format 元数据扩展点；设置页管理启用/禁用/导入）。
- Sandbox：**必选维度**——默认 direct（显式指定，非缺席）；指定 bwrap 而环境
  不可用 → turn 拒绝（不静默降级）。
