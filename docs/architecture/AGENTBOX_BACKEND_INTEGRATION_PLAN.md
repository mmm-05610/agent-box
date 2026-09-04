# Agent-Box 后端接入评估与计划 v2（目标模式筹备稿）

> 状态：v2——按用户纠偏调整：**充分利用 core 治理能力，Studio 是 harness 治理的会话级呈现层，不是"多 harness 并用"的简单拼接**。协作与 sandbox 作为一等设计维度预留。
> 前端：agent-box-studio `studio-shell`（ports/registry 架构）。后端：`~/projects/agent-box` v2.0.0a1。**不修改 core，不用 agent-box-web。**

---

## 1. 侦察结论：core 的治理资产清单（Studio 逐项呈现，绝不绕行）

| core 治理原语 | 位置 | Studio 呈现 |
|---|---|---|
| **HarnessDefinition 声明式注册表** | `harnesses.toml`：executable(PATH_OR_BUNDLE+version_probe)、profile(native_home/slots/overlay_policy)、launch_modes(resume_contract)、inputs(**契约化**：contract_id/min/max/selectors/target/transformer)、credential(contract/locator/materializer)、**continuation(native_session)**、runtime(**sandbox_capabilities/network**) | 设置页的 harness 卡片（安装探测=version_probe、能力徽标、profile 绑定）；发送时的能力门控 |
| **契约化 Inputs 解析** | InputSpec：如 `agent-box.skill@1` 经 selectors/target/transformer 解析成 Ref | 每轮发送的"绑定集"由 registry 解析产生，不是前端拼字符串 |
| **Profile 版本化工件** | ProfileStore：profile_id/**revision/digest**、digest-drift 检测、materialize 到 execution 工作区（settings/skills/mcp）+ manifest | 设置页 profile 管理（历史版本可见）；发送绑定条显示确切 `profile@rev(digest)` |
| **Credential 契约** | credential_v1 + locator（codex-login）+ materializer（secret-mount） | 凭据状态显示与"未登录"门控，绝不在 Studio 层私存密钥 |
| **Execution 治理流水线** | registry：preflight→**StartReceipt**→resolution→projection→finalization | 每轮 = 走完整流水线的一次 Execution；回执/失败原因可查 |
| **Continuation 契约** | 每 harness 的 ContinuationResourceProvider（Claude/Codex 已有）+ harnessState 游标 | 跨 harness continue 的取游标端（零新造） |
| **Runtime 组合** | RuntimeSpec(sandbox_capabilities/network) + runtime-local + sandbox-bwrap 插件 | 绑定维度之四：sandbox 选择（先 none/bwrap，扩展=注册表数据+provider，API 不变） |
| **Binding review 理念** | agent-box-web quick-launch："never dispatches without explicit user action" | Studio 的发送=显式绑定确认（见 §3） |
| **Work（objective+lifecycle）** | work_core | 协作单元的历史形态预留：一个 Session 映射一个 Work，objective=会话目标 |

**定位句**：Codeg 是"多个 harness 各自为战共用一个 UI"；Agent-Box Studio 是"**每一轮执行都经过声明式治理：配置是版本化工件、输入是契约解析结果、凭据是物化注入、续接是契约引用、沙箱是运行时组合**"。

## 2. 缺口 = 上层封装（core 之外，新包 `plugins/agent-box-studio/`）

1. **统一 Session 领域模型**（上层自有）：
   ```python
   StudioSession{id, project_path, title, default_profile_id, created_at}
   StageIndex{seq, harness_type, profile_ref, execution_ids[1..N],
              continuation_ref|None, binding_digest, started_at, ended_at}
   BindingDraft{harness_type, profile_ref, model_overlay|None,
                sandbox: SandboxBinding, continuation_ref|None}
   SandboxBinding{ref: Ref|None,        # SANDBOX_CONTRACT_ID（none=direct 亦记录）
                  provider_id: "none"|"bwrap-sandbox",
                  negotiated_digest|None, network: "none"|"inherit"}
   ```
   - **sandbox 是契约化绑定维度**（v3 修正）：解析期经 registry resolve(SANDBOX_CONTRACT_ID, ref) → SandboxV1 → `negotiate(harness.runtime.sandbox_capabilities)` → 谈判 digest 进绑定条/StageIndex；不满足 → preflight 拒绝。`none`(direct) 同样入账——每轮如实记录"跑在沙箱外"。执行双路径：negotiated → coordinator→wrap(mount_plan)；none → transport.submit 原样。
   StageIndex 是治理索引：每个阶段指向其 execution(s) 与该阶段的确切绑定（profile 版本、continuation 契约、sandbox、model overlay）。
2. **SessionStore**（上层 SQLite：session/stage/profile_meta；Execution 归 work_core 库）。
2.4.5 **五家 native resume 官方支持确认（G0.5 复查结论，2026-09-04）**：
   hermes 官方 `--resume SESSION`（by ID/title）+ SQLite 会话库（sessions export
   可出 JSONL）；opencode 官方 `run --session <id>` + `opencode session` 管理 +
   serve GET /session。**五家全部原生支持会话恢复**——R1 native resume 全通，
   损耗矩阵中 opencode/hermes 的"摘要级"两行作废。R2 渲染仅用于跨 harness
   首次启用（可选手 handoff）。
   行动项：hermes provider 从 transcript_handoff 升级为 --resume 实现（toml
   continuation.kind → native_session，转换器对接其 sessions export JSONL）；
   opencode toml 标签修正（插件已在传 --session）。

2.5 **权威统一转写格式（v3 定稿）与五 harness 损耗矩阵**：
   以 pi 会话文件形态为基底（header + 顺序行，极简无链无加密）+ Turn/parts 内容
   + `x-{harness}` 扩展槽（不可归一的原始字段降级保留，不丢弃）。接续策略按
   `continuation.kind` 声明自动路由：native_session → R1 游标 resume（codex/
   claude/pi）；transcript_handoff → R2 统一转写渲染注入（opencode/hermes，
   官方定位即如此）。损耗矩阵（真实文件解剖 2026-09-03）：pi ≈0；codex 仅
   encrypted reasoning；claude 仅 uuid 链重建；opencode/hermes 摘要级（官方
   本不支持 native resume）。

3. **BindingResolver 与静默化三层模型**（中间层的核心组件）：
   契约全集 9+1 维全部纳入绑定解析（治理完整），默认策略让用户只碰 2 个控件（使用简洁）：

   | 维度 | Ref 语义 | 默认策略（L1 隐式自动） | 用户触点（L3 显式） |
   |---|---|---|---|
   | WorkspaceV1 | 冻结 commit/tree 工作区 | 发送时锚定 HEAD；完成后 capture 产出新 Ref（世界线链）；非 git 降级普通目录 | 高级：选分支/commit/上阶段产出 |
   | PromptFragmentV1 | 提示片段 | 输入+handoff 自动哈希为 Ref | — |
   | AgentBoxProfileV1 | 版本化 harness 配置 | 会话 default_profile | composer 下拉 + 设置页管理 |
   | continuation | native 游标 | harnessState 自动维护（回切续接/fresh） | handoff 动作 |
   | AgentSkillV1 | 统一目录树工件（SKILL.md 标准+附属文件），声明式 mount 到各 harness skill_target | **默认全部可用**：未禁用者全量解析注入；非标准格式的转换器= format 字段扩展点 | 设置页管理（启用/禁用/导入） |
   | CredentialRefV1 | 凭据 locator | 从 harness 原生登录态定位，永不落盘 | 状态显示+登录引导 |
   | SandboxV1 | 谈判后隔离组合 | **必选维度**：默认 direct（显式指定，非缺席）；指定 bwrap 而环境不可用 → turn 拒绝（不降级） | 设置默认 + 绑定条选择 |
   | RuntimeHostV1 | 执行宿主 | 会话 origin 推断 | — |
   | TerminalSessionV1 | 终端会话 | 随会话开关 | 终端面板 |
   | model overlay | 逐轮模型 | 继承会话 | composer 选择器 |

   - **L2 可见可审计**：绑定条单行展示解析结果（harness·profile@v3(digest)·model·sandbox·workspace@commit·continue:xyz），点击展开九维 Ref 明细+谈判 digest+对账状态——静默决策全部可回看可覆盖。
   - **失败降级**：凭据未登录/profile 缺失/指定的 sandbox 不可用=**阻断式**内联提示（必然失败，不静默降级）；workspace 非 git=普通目录降级（非阻断）。
   - **实现**：BindingResolver 为唯一翻译器；G3 的自建 worktree 简化版替换为正规 git-workspace 链（make_ref(HEAD)→detached worktree→finalization capture 世界线）。
3. **Profile 门面**：统一各 harness ProfileStore 的 CRUD + revision/digest 历史透出（设置页数据源）。
4. **治理式 Turn 编排器**（用户点名的 continue 插件职责的完整形态）：
   `send_turn(session, harness, binding) ` →
   ① **解析**：registry 按 harness inputs 契约解析本轮 Ref 集（profile ref、continuation ref（harnessState 游标或 fresh）、model/provider overlay、skills、sandbox）
   ② **绑定审查**：产出 BindingDraft（全部 Ref 显式化）→ WS 推前端绑定条（§3）
   ③ **冻结派发**：用户确认（或 auto-confirm 策略）→ Work Core 正规流水线 preflight→start receipt
   ④ **观测**：harness 驱动流式事件（codex=AppServer 通道）→ 归一化 → WS
   ⑤ **落账**：finalization → 新 continuation ref 写 harnessState + StageIndex 追加
5. **Studio API 服务**：FastAPI+WS（独立进程，`agent-box-studio serve`）。
6. **前端**：`createAgentBoxBackend` 绑定（新 transport + SessionRuntime/ProjectsPort 的 AgentBox 实现）。

## 3. 绑定审查（governance 的 UX 落点）

- composer 常驻一条**绑定条**（紧凑单行）：`Codex · profile:work(v3) · model:gpt-5.4-mini · sandbox:none · continue:codex-abc123`——内容变化即时反映；
- **完全确认模式**（设置可选）：绑定变化的首轮弹审查卡（同权限卡形态），确认后按 (harness,profile,sandbox,model) 组合记住选择；
- 这与权限流同构：权限管"agent 能做什么"，绑定审查管"这一轮用什么打"——协作场景（未来多人/委托）里它就是审批门的雏形。

## 4. 关键决策（默认值，可否决）

| 决策 | 默认 | 治理理由 |
|---|---|---|
| 新包位置 | agent-box 仓内 `plugins/agent-box-studio/` | 直接依赖 work_core+harnesses 公共 API；core 零改动 |
| 服务框架 | FastAPI+uvicorn | WS 一等公民 |
| API 形状 | 干净 REST+WS，前端 `createAgentBoxBackend` 换绑 | 不背 Codeg 方言 |
| model/provider | 会话内 overlay，作为 **inputs 契约解析**的一部分（provider slot），非裸字符串 | 治理正交：profile 管"环境 isolation"，model overlay 管"这轮用什么脑"，平行可审计 |
| sandbox | 绑定维度之一，首版 none/bwrap（经 sandbox-bwrap provider） | RuntimeSpec 已声明能力位；扩展=数据+provider |
| 首发 | codex（AppServer 通道现成）→ claude 第二 | 风险最低 |
| 协作预留 | TurnRequest 带 idempotency_key（Operation 语义）；Work objective=会话目标；WS 多客户端扇出 | 多人/委托/审批的未来插槽，本期不实现 |

## 5. 实施切片

- **G0** 补侦察：claude 流式通道、registry preflight/start receipt 调用姿势、inputs 解析器（selectors/transformer）实例、sandbox-bwrap 接口（半天）
- **G1** `plugins/agent-box-studio` 骨架：pyproject、`serve` 入口、FastAPI+WS、配置（半天）
- **G2** Session/StageIndex 模型 + SessionStore + Profile 门面（1 天）
- **G3** 治理式 Turn 编排：解析→绑定草稿→冻结→preflight/start→codex 通道流式→finalization→continuation 记账（1.5 天，最大片）
- **G3.5** sandbox 绑定维度（none/bwrap 经 provider）+ 绑定条 WS 推送（半天）
- **G4** 跨 harness continue：harnessState 游标、回切续接、fresh、显式 handoff（注入摘要）（1 天）
- **G5** API 面 + 前端 `createAgentBoxBackend` 换绑（transport/SessionRuntime/ProjectsPort）（1 天）
- **G6** 设置页 Profiles 分区（版本历史可见）+ model/provider/sandbox 平行配置 + composer 绑定条（1 天）
- **G7** 端到端验收（1 天）

## 6. 验收标准（goal 模式完成定义）

1. 前端连 `agent-box-studio serve`：项目/会话/转写/发送全通；
2. **治理可见**：绑定条显示每轮确切绑定（profile@rev+digest、model、sandbox、continuation 游标）；Execution 在 work_core 库中可查、provenance 完整；
3. 同一 session：codex 3 轮 → claude 继续 → 切回 codex（native 续接）→ 转写完整、StageIndex 正确；
4. 设置页多 profile 管理（两 harness 各 ≥2）；会话内切 profile/model/sandbox 生效；
5. core 零改动、agent-box-web 零引用；sandbox 关闭/开启两态可跑。