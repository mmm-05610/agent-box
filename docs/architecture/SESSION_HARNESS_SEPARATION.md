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

## 9. Session Orchestrator 插件（统一转写存储 + 历史重放，v3 主方案）

> 一个大 Session 包含多个小 Execution（不同 harness/profile/model/sandbox），
> 每个 execution 都能"接着上面的任务继续"。核心机制不是记忆摘要，而是
> **会话格式统一**：权威转写以统一格式持久化，接续 = 把统一历史渲染给执行者。

### 9.1 业界依据（2026-09 调查）

- **同会话切模型的标准做法 = 全量重放**：ChatGPT/Claude.ai 切换模型时没有任何
  隐藏状态迁移——平台把完整消息历史作为输入重放给新模型，由它从头重新解读
  （参考：Chat History & Context 机制分析、MultiChats 模型切换说明）。
- **会话格式统一是业界方向**：Agent Client Protocol 的 `session/update` 流即
  统一会话事件 schema；Pydantic AI ACP harness 把每轮持久化为
  "message history + client-visible transcript" 并在重开时恢复进 agent；
  ecosystem 已有跨 harness 转换器（如 trajectory：任意 harness 会话 →
  统一 trajectory 格式）。
- **各 harness 的 native 会话本就是可解析的消息流**（JSONL），不是黑箱——
  claude ~/.claude/projects、codex rollout 均可解析映射。

### 9.2 主方案：统一转写存储（Unified Transcript）+ 渲染适配

1. **权威转写**：每个 execution 的归一化事件追加写入统一转写
   （Turn/parts 格式，与前端 core/domain/message.ts 同形；studio 侧 Python 镜像）。
   存于 SessionStore（transcript 表）。native 会话文件仍是 harness 侧事实源，
   但**面向 Studio 的权威视图是统一转写**。
2. **接续渲染：全量保真优先，超窗才确定性裁剪**：

   **R2 的默认形态是全量保真重放，不是简报**。transcript.jsonl 里有什么就
   渲染什么——每条 user 消息全文、每条 assistant 消息全文、每次工具调用的
   完整输入与完整输出（原文，仅超大输出做头尾截断并标注）、reasoning 原文、
   文件变更全文。信息保真度：文本级 100%——渲染上下文与原生 resume 提供的
   感知一致，唯二差异是(a)工具不再被真实重执行（改为记录）与(b)脚本包装的
   少量格式开销。

   **预算策略**（与 Claude Code autocompact 同构的窗口管理）：
   - 历史 tokens ≤ 窗口预算（默认 context 的 60%）：全量重放，感知与原生
     几乎一致；
   - 超出：**确定性裁剪**（非 LLM 黑箱摘要）——最旧轮次降级为紧凑形式
     （保留 user 全文 + assistant 最终文本 + 文件变更清单，裁去工具输出
     细节与 reasoning），近端轮次保持全量；被裁内容在绑定条标注
     "history:compacted(N 轮)"。等价于一次显式 /compact，业界接受度成熟。
   - R3（原摘要链）仅作为"裁剪后仍超预算"的最后手段，默认不触发。

### 9.2.1 存储布局：双轨制（native 私有 + 统一权威）

```text
~/.agent-box/studio/sessions/{session_id}/
├── transcript.jsonl            # ★ 统一转写（Studio 权威视图）
│     每行一条归一化记录：
│     {seq, execution_id, harness_type, type, part/turn}
├── codex-home/                 # codex native 会话（投影目录，rollout 存放）
├── claude-home/                # claude native 会话（CLAUDE_CONFIG_DIR 投影）
└── executions/{eid}/           # 每轮治理投影快照（config/manifest/credential）

studio.db                       # session/stage/profile 元数据 + 索引
```

| 存储 | 写入者 | 读取者 | 用途 |
|---|---|---|---|
| native 会话目录 | harness 进程自己（Studio 只提供投影目录） | 同 harness resume（R1） | harness 私有执行状态 |
| transcript.jsonl | orchestrator write-through（事件流经过时归一化追加，与 WS 推送同源） | UI 渲染 / R2·R3 脚本 / 审计 | Studio 权威视图 |
| studio.db | orchestrator | 元数据查询 | 索引/阶段/profile |

要点：
- transcript.jsonl 不是 native 的拷贝，而是同一事件流的归一化投影——写入时刻
  同时产生，无事后同步；
- native 目录角色变更：从散落的 ~/.codex/~/.claude 变为 session 作用域下的托管
  投影目录，唯一存在理由是支撑 R1 native 续接；生命周期归 Studio（会话删除一并清理）；
- 互为灾难恢复：transcript 丢失 → native JSONL 经 parsers 重解析重建；native 丢失
  → transcript 仍在，UI/R2/R3 可用，仅 R1 降级 fresh。双轨互不单点；
- R2/R3 的数据源就是 transcript.jsonl（渲染策略，不产生第三份存储）。

### 9.3 诚实边界

- 工具调用不可跨产品重**执行**，只能重放其**结果文本**——文件世界的实际产出
  仍在 workspace（无损），对话上下文的重放是文本级；
- 跨 harness 的"风格/推理连续"依赖新模型对历史的重新解读（业界共性限制，
  与 ChatGPT 切模型一致）；
- token 成本线性于历史长度：R2 全量 → R3 压缩的分界可配置（默认
  历史超过 context 窗口 1/3 时启用 R3）。

### 9.4 Orchestrator 职责（更新）

1. Session/StageIndex 聚合与持久化（G2）
2. 统一转写写入（每 execution 事件归约追加）+ transcript API
3. 接续渲染器：native resume / R2 脚本重放 / R3 压缩尾部的自动选择
4. Turn 生命周期：BindingResolver 九维 → 谈判 → 冻结派发 → 执行 → 落账
5. harnessState 游标（R1 用）；事件归一 → WS

### 9.5 落点

`plugins/agent-box-studio`（orchestrator + transcript store + 渲染器）；
native JSONL 解析器参考 codeg parsers/（claude/codex 会话文件解析已有实现可移植）。

## 10. 决策记录（v3 增补，2026-09-03）

- 上下文策略：**L1+L2 内建 + L3 SessionMemory 自动注入**（绑定条标注 handoff:auto，
  设置可关）——用户裁决，取代早前"仅显式 handoff"的保守案。
- Skills：**默认全部可用**（统一目录树工件 + 声明式 mount；格式转换器为
  format 元数据扩展点；设置页管理启用/禁用/导入）。
- Sandbox：**必选维度**——默认 direct（显式指定，非缺席）；指定 bwrap 而环境
  不可用 → turn 拒绝（不静默降级）。
