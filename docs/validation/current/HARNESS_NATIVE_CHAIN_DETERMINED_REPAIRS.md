# HARNESS_NATIVE_CHAIN_DETERMINED_REPAIRS — 确定项修复最终报告（2026-09-02）

实施范围：任务书"本轮必须完成的确定项 A–F"。全部修改可追溯至
`docs/research/harness-native-knowledge-2026-09-01/`（下称"知识库"）、
现有协议不变量或任务书已定裁决。未执行 git add/commit/push；未读取任何
credential；未执行真实模型请求；未修改 Work Core/schema/migrations。

---

## 1. Verdict

**COMPLETE**（A–F 全部落地；7 项局部决策记入 `REQUIRED_DECISIONS.md`，均不阻塞）。

## 2. Baseline 与工作树状态

- 起始基线：branch `feat/resource-routing-phase2`，HEAD `1a3c3083…`，
  仅知识库目录未跟踪——与预期完全一致。
- 结束状态：同一 HEAD（无 commit）；变更集中在
  `plugins/agent-box-harnesses/**`（16 改、1 删、22 新增）、
  `tests/test_protocol_business_vocabulary.py`（新增）、
  `src/agent_box/protocols/runtime/assembler.py`（仅 docstring 去业务词汇）、
  `docs/validation/current/REQUIRED_DECISIONS.md`（新增）、本报告（新增）。
  知识库目录保持未跟踪原样。`git diff --check` 干净。

## 3. 最终正式调用链

```
Registry facts (harnesses.toml → HarnessDefinition)
→ typed HarnessStartContext（adapters/start_context.py，frozen，精确类型化抽取）
→ per-Harness Native Adapter plan()（纯 planner/codec）
→ private immutable LaunchPlan（adapters/launch_plan.py，canonical digest，无 secret）
→ Composer 语义组合/冲突检测（adapters/composer.py）
→ staging：插件内唯一 execution-scoped 写入者（adapters/staging.py）
→ lowering：唯一 LaunchPlan→Runtime 转换（adapters/lowering.py → HarnessCommandSpec）
→ 现有 Root assembler（assemble_runtime_composition：结构/路径/digest/overlap 校验）
→ 现有 RuntimeCompositionCoordinator（preflight/attempt ledger/single-use token）
→ 现有 Sandbox(bwrap)/TerminalSession/Materializer 链 → spawn
```

失败阶段映射：上下文/计划失败→`PLAN_REJECTED`；staging/lowering 失败→
`MATERIALIZATION_FAILED`；assembler 拒绝与 coordinator 预检拒绝→`START_REJECTED`；
coordinator 歧义→`START_AMBIGUOUS`（`adapters/failures.py`）。dispatch 重放守卫：
同 dispatch_id 同 inputs 返回原 handle，异 inputs fail-closed 拒绝。

## 4. HarnessStartContext 字段

`adapters/start_context.py::HarnessStartContext`（frozen；Harnesses 插件私有，
不进入 Work Core ontology）：

`harness_type, execution_id, dispatch_id, launch_mode(LaunchMode), workspace(WorkspaceV1),
prompt(str，由 0..32 个 PromptFragmentV1 渲染), profile(ProfileEnvelope|None),
skills(tuple[ResolvedAgentSkill]), executable(ResolvedExecutable),
runtime_host/sandbox/terminal(RuntimeHostV1/SandboxV1/TerminalSessionV1),
continuation(typed value|None，按 definition.continuation.contract_id 精确抽取),
credential_ref(CredentialRefV1|None), launch_selection(Mapping，记录模式选择依据),
skill_target_template(str，来自 Registry)`。

构造器删除了 raw request 扫描 / 契约字符串散查 / dict 鸭子判断 / Any 形状输入；
`build_start_context()` 是唯一构造入口（cardinality 违规→`PLAN_REJECTED`）。

## 5. private LaunchPlan 字段、owner 与 digest

Owner：**agent-box-harnesses 插件**（`adapters/launch_plan.py`）。不进入
`agent_box.protocols.runtime`，不进入 Work Core，Runtime/第三方 provider 无需理解
Codex/Claude/Profile/Skill。仅描述执行意图，无副作用；无 secret value，仅 opaque
locator（`SecretBinding(guest_target, locator, materializer_id)`，只读、限
`/runtime/home/` 之下）。

字段：`harness_type, launch_mode_name, argv, cwd_token, environment（受限大写键，
凭据形状键禁令）, io_mode, requires_control_plane_network, tool_network_requirement,
guest_directories（如 CODEX_HOME 前置存在）, mounts(tuple[MountIntent]：
kind/source_key/content digest/guest_target/access/provenance，**不含宿主路径**）,
rendered(RenderedNativeTarget digest 视图) + rendered_content（与 digest 交叉校验的
内容，供唯一 staging 写入者物化）, executable(ExecutablePlan：staging 策略/成员/
版本/warnings), continuation(ContinuationPlan：kind/locator/argv，argv 必须是
plan.argv 的连续子序列), secret_bindings, observation(ObservationContract),
warnings`。

`LaunchPlan.canonical()`（host-path-free）→ `digest`（sha256）。两级 digest 因果链：
**plan.digest →（lowering 内嵌）command_digest →（coordinator attempt_key 与
projection receipt）RuntimeBundle/MountPlan digest**；Runtime 只认证 lowering 后的
Runtime 输入。

## 6. ProfileEnvelope 接线结果

- `generic/profile_envelope.py`：`ProfileEnvelope` 现为 **`AgentBoxProfileV1` 的
  frozen 子类**（契约 isinstance 检查通过），额外携带 `native_payload`、
  `capability_refs`、`credential_source_ref`（locator-only）、
  `session_overlay_policy`。
- `ProfileStore.resolve()` 返回该 typed envelope，且 **resolve 时对 payload 重跑
  secret-scan + adapter validator**（防"改文件+重算 digest"绕过）。
- exact Ref / revision / digest / 不可变 revision 历史 / disabled 语义不变。
- 删除了"profile 是 dict 才生效"的分支；payload 由对应 Harness Adapter 验证
  （`validate_native_payload`），并确实影响渲染片段（测试 B 组）。
- Credential value 禁令保持：put/resolve 双重扫描（`native_guard.py`）。

## 7. Executable resolution / bundle staging 结果

- `resources/executable.py` 重写：typed `ResolvedExecutable`（identity、resolved
  path、version、content digest、bundle members、platform metadata、warnings）；
  PATH 解析**规范化解 symlink 到真实常规文件**（官方 npm/native installer 布局
  均为 symlink）；`--version` 安全探测（bounded、10s 超时、不触发模型）；
  `bundle_members`/`version_probe` 由此**正式消费**（原死声明复活）。
- Codex 专属：官方 `@openai/codex` npm 布局展开到平台原生 Rust binary
  （`_official_codex_npm_native`，metadata layoutVersion/target/entrypoint +
  ELF x86_64 校验；证据：codex FACTS A3/B2 与旧 codex/executable.py）。
- Staging：executable 成员以 **ro** 声明进 `/runtime/bin/<name>`；渲染 home 以
  **rw** 声明为 `/runtime/home`；workspace **rw** `/workspace`。digest 校验四重：
  plan 声明 digest → staging 逐文件校验（skill inventory）→ lowering 实读校验
  （drift→`MATERIALIZATION_FAILED`）→ assembler/wrap read-back 校验（Root 不变）。
- 离线 synthetic executable/bundle fixture 全覆盖；真实 bwrap vertical 在
  capability probe 通过时运行，否则明确 skip。

## 8. 五家 Adapter 实际实现矩阵

| 能力 | codex | claude | opencode | hermes | pi |
| --- | --- | --- | --- | --- | --- |
| native payload validation | ✓（secret 禁令+边界；未知键→诊断） | ✓ | ✓ | ✓ | ✓ |
| LaunchPlan construction | ✓ | ✓ | ✓ | ✓ | ✓ |
| executable/bundle usage | ✓（npm→native 展开） | ✓ | ✓ | ✓（+site-packages warning） | ✓ |
| native home/config isolation | CODEX_HOME=/runtime/home/.codex（前置存在） | HOME+CLAUDE_CONFIG_DIR 双置 | XDG 四件套+预渲染防 auto-seed | HERMES_HOME=/runtime/home/.hermes | PI_CODING_AGENT_DIR=/runtime/home + PI_OFFLINE=1 |
| argv/env/cwd/io/network planning | ✓ | ✓ | ✓ | ✓（+--usage-file） | ✓ |
| Skill target planning | `/runtime/home/.agents/skills/` | `…/.claude/skills/` | `…/.config/opencode/skills/` | `…/.hermes/skills/` | `/runtime/home/skills/` |
| structured observation decoder | exec --json 封闭事件集 | stream-json（init/assistant/user/result/control） | run --format json（SDK v2 事件） | usage-file document | --mode json v3 流 |
| session locator extraction | thread.started.thread_id | init/result.session_id | 事件 sessionID | usage-report.session_id | session header.id |
| continuation（argv 级） | `exec resume <id>` | `--resume <id>` | `-s <id>` | `--resume <id>` | `--session <id>` |
| permission/control transport | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| attach/steer | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED | NOT_IMPLEMENTED |
| telemetry/usage 解码 | turn.completed.usage | result.usage+cost | 事件 usage | usage-file（含失败） | message usage+cost |
| live stream | NOT_IMPLEMENTED→UNAVAILABLE | 同 | 同 | 不适用（无 stdout 流，Registry 不声明） | 同 |

共享纯逻辑在 `GenericCliAdapter` 基类；五家真实差异全部保留（env 组合、config
格式 toml/json/yaml、skill 根、argv 形态、decoder 均互不相同）。

## 9. Capability truth 结果

`GenericExecutionProvider.capability_truth()`：
Effective = Registry declared ∩ Adapter implemented ∩ Runtime available。
四态：`IMPLEMENTED`（实现但 Registry 未声明）/`AVAILABLE`（→对外 "supported"）/
`UNAVAILABLE`（实现存在但 executable 缺失或 live pump 未接线，**附明确
diagnostics**）/`NOT_IMPLEMENTED`（Registry 宣称而 Adapter 无实现）。Registry
capabilities 已修正为与实现一致（删除全部 attach/permissions 宣称）；truth table
测试覆盖四态。`capabilities()` 不再回显 `{key:"supported"}`。clean-wheel preview
实测：本机已装四家 start=supported、pi（未装）start=unavailable、五家
stream=unavailable（live pump 缺口，见 RD-4），全部带 diagnostics。

## 10. Observation / Finish 边界

- Harness-owned canonical `Observation`（`adapters/observation.py`）：kind ∈
  lifecycle/message/tool_request/tool_result/permission_request/permission_result/
  usage/session/terminal/unknown；含 session locator、model、usage、terminal
  condition、bounded schema-tagged `NativePayload`（opaque native 事件受控旁路，
  尺寸/深度/键数受限）。
- 五家 decoder fixture 测试覆盖：正常流、terminal 条件、permission 帧（claude/
  opencode）、unknown 事件容忍、malformed 行容忍、超大行有界拒绝。
- Adapter 只产生 terminal Observation 与 `FinishProposal`（`decision_owner="host"`，
  空 output/resource refs）；Host 决定是否调用 Work Core Finish。
- **process exit ≠ Finish**：退出且无 native terminal 事件→`PROCESS_EXIT` 条件
  （exit 0 也不标 COMPLETED）；provider finish 只返回 proposal（回归测试
  `test_finish_boundary.py`）。

## 11. Composer / collision 边界

`adapters/composer.py`：canonical fragment（资源侧拥有：profile payload、skill
contract）→ native target rendering/merge（Harnesses 拥有：本模块+各 adapter 的
`_candidate_files`）。规则：同 semantic key+同 value→去重；同 key 异 value→
`SEMANTIC_KEY_CONFLICT`（typed）；同 guest target 异 key→
`GUEST_TARGET_AUTHORITY_COLLISION`；**无 priority 覆盖**（字段不存在），唯一
放宽是同 owner 显式 `same-owner-replace`；每个最终 guest target 单一 artifact
authority。Root assembler 保持只验证结构/路径/digest/overlap，不理解 Profile/
Skill（业务词汇扫描测试锁定）。

## 12. 删除的 dead/decorative SPI

- `declare_runtime_sources`（base.py + generic_cli）：**删除**，由 LaunchPlan/
  lowering 正式链替代。
- `decode_observation`（原死 SPI）：**接通**为 `decode_native_events` /
  `decode_native_document`（canonical decoder 正式链）。
- `launch_modes 永远取 [0]`：替换为显式 `select_launch_mode`（首选 exec、选择
  依据入 context；多模式声明保留为 Registry facts）。
- `capabilities` 装饰性回显：替换为 capability truth（§9）。
- `GenericProfileManager.disable` 重复定义：**去重**。
- Registry 装饰字段（TOML+schema）：删除 `profile.codec/overlay_policy/slots`、
  `launch_modes[].resume_contract`、`runtime.io/host_capabilities/
  sandbox_capabilities/terminal`、`inputs[].selectors/transformer`；`runtime.network`
  正式消费（lowering→`requires_control_plane_network`）。
- `resources/profile_codec.py`（零消费者）：删除。
- 保留且已接线：`executable.bundle_members/version_probe`（§7）、
  `[harness.continuation]`（context 抽取+argv 级 resume）、`[harness.credential]`
  （typed materializer boundary）。旧 per-harness 子包维持"仅测试可达"状态并在
  RD 记录（本轮确定项 E 的范围是 SPI/装饰字段，非整体迁移）。

## 13. 未实施能力及 NOT_IMPLEMENTED 状态

五家统一 NOT_IMPLEMENTED：permission request/response transport、attach、steer/
interrupt 全功能、live streaming pump（→`stream` UNAVAILABLE+diagnostics）、MCP
Resource（禁入）、app-server 双向控制面、session store 正式接口、CC Switch 式
长期配置覆盖、Profile import/backfill、hooks/extensions 统一抽象。全部不伪造：
Registry 不再宣称，truth table 显式呈现，或按裁决整体 DEFER。

## 14. Tests

新增/更新（`plugins/agent-box-harnesses/tests/` + root）：

1. 五家 registry fact/argv golden：`test_registry_launch_facts.py`（8 项）
2. native payload→LaunchPlan：`test_native_payload_to_plan.py`（7 项，含五家
   native config 片段渲染、env facts、secret 拒绝、store 重扫描）
3. Adapter conformance：`test_adapter_conformance.py`（14 项，空壳消亡、NOT_
   IMPLEMENTED 诚实、native facts 不抹平、continuation 规划）
4. synthetic executable→sandbox projection：`test_executable_staging.py` +
   `test_provider_vertical_bwrap.py`（真 bwrap 探测通过时运行，否则 skip）
5. executable drift/digest fail-closed：`test_executable_staging.py`
   （SOURCE_DIGEST_DRIFT / STAGED_HOME_DIGEST_DRIFT / SOURCE_UNRESOLVED）
6. capability truth table：`test_capability_truth.py`（7 项，四态+diagnostics）
7. LaunchPlan canonical digest：`test_launch_plan_digest.py`（host-path-free、
   稳定性、语义变更敏感）
8. LaunchPlan→RuntimeBundle digest linkage：`test_launch_plan_digest.py`
   （command digest 绑定 plan digest；projection receipt 两级来源记录）
9. Composer dedupe/conflict/collision：`test_composer.py`（7 项）
10. canonical Observation decoder fixtures：`test_observation_decoders.py`
    （五家×正常/terminal/permission/unknown/malformed/超大）
11. Adapter purity/source scan：`test_adapter_purity.py`（禁 token 扫描、唯一
    staging writer、唯一 lowering 路径、无 Work Core finish 引用）
12. process exit ≠ Finish 回归：`test_finish_boundary.py`（5 项）
13. replay/START_AMBIGUOUS/single-spawn 回归：`test_start_stages.py`（7 项）+
    Root 既有 coordinator 回归保持全绿
14. Root protocol pack 业务词汇边界扫描：`tests/test_protocol_business_vocabulary.py`
15. synthetic secret fixture：`test_credential_synthetic.py`（locator-only、
    sandbox 注册、值不入 plan/env/argv、真 bwrap `<secret-source>` 脱敏）

更新：`test_skill_projection.py`（五家 native skill target 无损 staging+LOADED
证据，经新链路）。

**运行结果**：root 144✓；integration/native 54✓；harnesses 166✓+3 skip（真
native 探测未过的历史 native 测试，按规则明确 skip）；skills 8✓；runtime-local
6✓；sandbox-bwrap 12✓；terminal-session 3✓；git 4✓；artifacts 2✓；web 16✓
（含 Playwright browser vertical）；frontend Vitest 6✓；lint 0 错误；production
build ✓（与已提交 _static 产物一致）；`compileall` ✓；`git diff --check` ✓。
fake/protocol 测试未因 native 缺失 skip。

## 15. Clean-wheel / install / discovery / doctor

- 构建 Root+8 官方插件 wheels（9 个）成功。
- **Root-only clean venv**：root import ✓；`PLUGIN_API_VERSION=2` ✓；装载插件
  0 个（无具体 Harness/Profile provider）✓；`agent-box plugins list` 空 ✓；
  `doctor --json` 输出降级 JSON（execution_providers=false 等）、无 traceback ✓。
- **Preview clean venv**：12 entry points 全部 READY（artifacts/claude/codex/git/
  harness-profile-store/hermes/opencode/pi/runtime-local/sandbox_bwrap/skills/
  terminal_session）；五家独立 provider id + 独立 host_control + 独立 diagnostics；
  Profile/Skill Resource Library discovery（harness-profile、agent-skills…）✓；
  executable resolver/bundle 路径可用（本机实测 claude 2.1.247、codex-cli 0.152.0
  native、hermes v0.19.0、opencode 1.18.21；pi 未装→unavailable）；effective
  capability 状态如实（§9）；`doctor --json` 全绿 ✓；无旧 canonical import
  （agent_box.launch / work_core.providers.resources / agent_box.resources /
  agent_box.application 均不可导入）✓。

## 16. Boundary / secret / path scans

- 业务词汇：Root runtime+credentials 协议包零 codex/claude/opencode/hermes/pi/
  profile/skill/mcp（assembler docstring 已同步净化；扫描测试锁定）。
- Secret：payload put/resolve 双重扫描；LaunchPlan 构造期拒绝凭据形状 env 键；
  synthetic secret 端到端证明值不出现在 plan.canonical()/environment/argv，
  bwrap 公共 argv 以 `<secret-source>` 脱敏。
- Path：LaunchPlan canonical 不含宿主路径（测试断言）；staging 写入限定
  execution-scoped root（containment 校验）；workspace/home/executable 挂载
  overlap 由 Root assembler 与 bwrap 双重拒绝（既有语义，未动）。
- Adapter purity：静态扫描禁 subprocess/os.environ/shutil/write_text/Popen 等
  （§14-11）。

## 17. Work Core / schema / migrations 是否变化

**无**。Work Core ontology、Binding、Freeze、Dispatch、Finalization 语义零修改；
无 schema/migrations 变更；Root 侧唯一改动是 `protocols/runtime/assembler.py`
docstring 去业务词汇（行为不变）。`PLUGIN_API_VERSION` 保持 2；
`agent_box.extensions` 已删除 shim 未恢复。

## 18. REQUIRED DECISIONS 清单

见 `docs/validation/current/REQUIRED_DECISIONS.md`：RD-1 RenderedArtifact
materialization 正式端口；RD-2 Pi 项目 trust 策略；RD-3 managed payload 键策略；
RD-4 live streaming pump（stream=UNAVAILABLE 的缺口）；RD-5 Hermes 完整 Python
运行时投影；RD-6 credential 多账号/merge 语义；RD-7 launch mode 选择面。
均不阻塞本轮 vertical。

## 19. 真实模型请求 / credential 读取

- 真实模型请求：**未执行**（全部测试为 offline/fake/synthetic；真 bwrap vertical
  使用 synthetic 脚本二进制）。
- Credential：**未读取任何 credential 值**；未扫描用户真实 auth/config 文件内容
  （codex materializer 维持 locator-only + 元数据存在性检查，synthetic fixture
  覆盖 typed boundary）；无 secret 进入 Profile/LaunchPlan/Binding/Evidence/
  argv/普通 env。

## 20. READY FOR HUMAN DECISION REVIEW

**READY**。代码未提交，工作树保留全部变更与知识库目录；`REQUIRED_DECISIONS.md`
的 7 项决策等待人工裁决后另行下令。
