# FILL_AND_MODIFICATION_PLAN — 填充与修改方案（不实施）

状态：**研究方案，仅供人工架构裁决**。未经逐项批准，不得填写正式
`harnesses.toml`、扩展 Adapter SPI、新增 Harness 或修改产品代码。
证据缩写：`[facts:codex C.2]` = `harnesses/codex/FACTS.md` C.2 条；
`[audit F-xx]` = `AGENT_BOX_CURRENT_GAP_MAP.md`；`[P#]` =
`CROSS_PROJECT_PATTERN_MATRIX.md`。

动作枚举（任务书限定）：
`FILL_EXISTING_FIELD | CORRECT_EXISTING_FACT | ADD_REGISTRY_FIELD |
MOVE_TO_NATIVE_ADAPTER | MOVE_TO_PROFILE | MOVE_TO_RESOURCE_PROJECTOR |
ADD_TYPED_SPI | REMOVE_DECORATIVE_FIELD | KEEP_NATIVE_OPAQUE | DEFER | REJECT`

优先级：P0（启动正确性/安全）> P1（能力闭环）> P2（扩展与整洁）。
测试类别：offline（纯单元）/ fake（fake harness、fake executable）/
native（真实 CLI + bwrap vertical）/ clean-wheel（隔离安装后 entry-point/导入检查）。

## Phase A — 纯事实修正（不改接口语义，只改声明值与文档）

| 字段/项 | 当前状态 | 证据 | 建议 owner | 类型 | 已有 schema | 已消费 | 需 Adapter 方法 | 需新 DTO | 影响 Plugin API | 影响 Work Core | 风险 | 测试 | 优先级 | 动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hermes exec argv `["hermes","--print"]` | flag 不存在，argparse 拒绝 | [facts:hermes C]（`-z` 才是 headless；--print 实测被拒） | registry | declarative | 是（LaunchMode.argv） | 是（[0]） | 否 | 否 | 否 | 否 | 低——现状声明根本无法启动 headless | fake：argv 契约测试；native：`hermes -z` help 级验证 | P0 | CORRECT_EXISTING_FACT |
| pi exec argv `["pi","--agent-dir",…,"--print"]` | `--agent-dir` 被静默吞掉（unknownFlags），隔离失效 | [facts:pi C]（实测 + args.ts unknownFlags） | registry + adapter | declarative+behavioral | 是 | 是 | 是（env 注入见 B-15） | 否 | 否 | 否 | 中——静默失败比报错更危险 | fake：断言 env 存在 `PI_CODING_AGENT_DIR` 且 argv 无未知 flag | P0 | CORRECT_EXISTING_FACT |
| claude exec argv `["claude","--print"]` | 缺 `--output-format stream-json --verbose` 等结构化输出决策 | [facts:claude-code C] | registry | declarative | 是 | 是 | 否 | 否 | 否 | 否 | 低 | fake：argv 快照 | P0 | CORRECT_EXISTING_FACT |
| opencode exec argv `["opencode","run"]` | 缺 `--format json` 决策；无凭据时静默挂起无防护 | [facts:opencode C/H] | registry | declarative | 是 | 是 | 否（超时属 Host） | 否 | 否 | 否 | 中——挂起风险需 Host 超时兜底 | fake：argv 快照；native：timeout 行为 | P0 | CORRECT_EXISTING_FACT |
| codex exec 模板（无 `--json`/`-o` 决策位、非 git 需 `--skip-git-repo-check`） | 现模板不可观测 | [facts:codex C.2] | registry | declarative | 是 | 是 | 否 | 否 | 否 | 否 | 低 | fake：argv 快照 | P0 | CORRECT_EXISTING_FACT |
| codex `skill_target="/runtime/home/skills/{id}"` | 恰为**已弃用路径**（`$CODEX_HOME/skills` deprecated-but-read；现行根是 `$HOME/.agents/skills`、repo `.codex/skills`） | [facts:codex G skills] | registry | declarative | 是 | 是 | 否 | 否 | 否 | 否 | 中——弃用路径随时可能移除 | native：skill LOADED marker | P1 | CORRECT_EXISTING_FACT |
| opencode `skill_env="OPENCODE_CONFIG_DIR"` | env 存在但重定向整个全局配置根；且 opencode 启动会 auto-seed 该目录（覆盖风险） | [facts:opencode D/G] | registry + adapter | declarative | 是 | 是 | 是（预 seed 防护） | 否 | 否 | 否 | 中 | fake：config dir 注入 + seed 防护 | P1 | CORRECT_EXISTING_FACT |
| `profile.native_home` 语义（相对名 vs 绝对 host 路径） | 声明语义与消费语义脱节 | [audit F-03a] | registry | declarative | 是 | 条件 | 否 | 否 | 否 | 否 | 低 | offline：schema 文档化 | P1 | CORRECT_EXISTING_FACT |
| `identity` 增加 package/repo 元数据（防身份漂移） | 无；已发生 opencode/pi/hermes 三起身份陷阱 | [matrices/identity-and-executable.md §1] | registry | declarative | 部分（ExecutableSpec.metadata 已存在但未用） | 否 | 否 | 否 | 否 | 否 | 低 | offline：schema 校验 | P1 | ADD_REGISTRY_FIELD |

## Phase B — 接通已存在但未消费的链路（不改 Plugin API 形状）

| 字段/项 | 当前状态 | 证据 | 建议 owner | 类型 | 已有 schema | 已消费 | 需 Adapter 方法 | 需新 DTO | 影响 Plugin API | 影响 Work Core | 风险 | 测试 | 优先级 | 动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Profile native payload → Adapter | resolve 只回 `AgentBoxProfileV1` 信封，payload 零贡献 | [audit F-06]；`ProfileEnvelope` 已实现未接线 | profile-store + adapter | behavioral | 是（ProfileEnvelope） | 否 | 是（读 payload 生成 home/config） | 否（DTO 已有） | 否 | 否（resolve 在 provider 内） | 中——payload 进入命令面需保持 secret 字段禁令 | fake：payload→home 投影；native：真实 CLI 读到投影配置 | P0 | MOVE_TO_PROFILE |
| `executable.bundle_members` + `resolve_executable` | 双死声明；`/runtime/bin` 空；`PATH_OR_BUNDLE` 无行为 | [audit F-07]；旧实现 `codex/executable.py` 可迁移 | adapter + runtime-host | behavioral | 是 | 否 | 是（build_command 声明 runtime_sources） | 否（RuntimeSourceDeclaration 已有） | 否 | 否 | 高（涉及把 host 二进制投影进沙箱）——需 digest 锁定与只读 bind | fake：fake bundle staging；native：真实 codex/claude binary 经 bwrap 可执行 | P0 | MOVE_TO_NATIVE_ADAPTER |
| `version_probe` | 死声明；无探测实现 | [audit §1]；[P0 预检需求]（pi `--help` 副作用、codex alias 警告） | adapter | behavioral | 是 | 否 | 是（probe() 或独立资源） | 否 | 否 | 否 | 低 | fake：fake exec 探测；native：五家 `--version` | P1 | FILL_EXISTING_FIELD |
| `runtime.network` → `HarnessCommandSpec.requires_control_plane_network` | registry 值不进命令 spec | [audit §1]；协议字段已存在（protocol.py:321-322,335） | adapter | behavioral | 是 | 否 | 是（build_command 内设置） | 否 | 否 | 否 | 低 | offline：spec 字段断言 | P1 | FILL_EXISTING_FIELD |
| `runtime.host_capabilities/sandbox_capabilities/terminal/io` | 死声明 | [audit §1] | registry→runtime 协议 | declarative | 是 | 否 | 否 | 否 | 否 | 否（preflight 能力键已存在） | 中——需与 runtime-local/bwrap/terminal 实际能力对齐 | offline：capability 键对齐测试 | P2 | FILL_EXISTING_FIELD 或 REMOVE_DECORATIVE_FIELD |
| `declare_runtime_sources` 死 SPI | 无人调用 | [audit F-05] | adapter | behavioral | 是 | 否 | 改为 build_command 返回体的一部分（P1 模式） | 否 | 否 | 否 | 低 | fake：sources 声明即命令声明 | P1 | ADD_TYPED_SPI（合并进 build_command 契约后删除旧方法） |
| `decode_observation` 死 SPI | 无人调用；observe/finish 直通 | [audit F-05] | adapter + observation | behavioral | 是 | 否 | 是（EventDecoder，见 C-20） | 是（canonical frame） | 否 | 否 | 中 | fake：五家事件样本解码 | P1 | ADD_TYPED_SPI |
| `[harness.continuation]` | 死声明；ContinuationRoute 协议已存在但 generic factory 不装配 | [audit F-10]；[facts:codex I / pi I]（native resume 普遍存在；hermes 的"transcript handoff"是旧 scoping 选择） | adapter + host | behavioral | 是 | 否 | 是（session locator 提取 + resume argv 模板） | 否（ContinuationRoute 已有） | 否 | 否 | 中 | fake：locator 提取；native：真实 resume 冒烟（免模型可测 `--resume` 参数面） | P1 | FILL_EXISTING_FIELD |
| `[harness.credential]` spec | 死声明；唯一材料化代码在门面硬编码 CodexCredentialSource | [audit F-10]；五家凭据分类见 [matrices/profile-and-isolation.md §3] | credential-materializer | behavioral | 是 | 否 | 是（per-driver materializer 注册表，门面逻辑迁入） | 否（PreparedSecretMount 已有） | 否 | 否 | 高（凭据安全）——保持 locator-only + ro secret mount | fake：locator→mount；native：guest 内可读、host 不可见 | P0 | FILL_EXISTING_FIELD + MOVE_TO_NATIVE_ADAPTER |
| `capabilities` 装饰性回显 | 回显 "supported" 无行为 | [audit F-09]；lite-harness no-op 反例 [P3 反模式] | adapter | behavioral | 是 | 装饰 | 每个能力对应行为方法或移除 | 否 | 否 | 否 | 中（宣称未兑现=信任破坏） | offline：能力↔方法绑定表 | P1 | REMOVE_DECORATIVE_FIELD（回显部分）+ ADD_TYPED_SPI（真实能力） |
| `inputs.selectors/target/transformer` | 死声明（仅 skill target 被校验） | [audit §1] | registry 或删除 | declarative | 是 | 否 | 否 | 否 | 否 | 否 | 低 | offline | P2 | REMOVE_DECORATIVE_FIELD（若不接线）或接线至 catalog selector id |
| `GenericProfileManager.disable` 重复定义 | 后者覆盖前者（dead code） | [audit §4] | profile-store | — | — | — | 否 | 否 | 否 | 否 | 零 | offline | P2 | REMOVE_DECORATIVE_FIELD |
| Web 门面期望的 `validate/projection_preview/import_*` | GenericProfileManager 缺失，调用即 AttributeError | [audit §4] | profile-store | behavioral | 否 | 部分 | 是（或门面降级） | 是（ImportCandidate/Preview 已有于 importers/models.py） | 是（Host 面契约） | 否 | 中 | fake：web 门面全路由冒烟 | P1 | ADD_TYPED_SPI（把 importers 提升为正式 SPI）或 DEFER |
| `Guest home 前置存在/副作用` | 无预检 | [facts:codex D]（CODEX_HOME 必须预存在）、[facts:opencode D]（auto-seed） | sandbox-protocol | behavioral | 否 | 否 | 是 | 否 | 否 | 否 | 中 | native：bwrap --dir 已满足 codex；opencode 用 CONFIG_CONTENT | P1 | ADD_TYPED_SPI（预检清单） |

## Phase C — 补 typed Adapter SPI（新能力面）

| 字段/项 | 当前状态 | 证据 | 建议 owner | 类型 | 已有 schema | 已消费 | 需 Adapter 方法 | 需新 DTO | 影响 Plugin API | 影响 Work Core | 风险 | 测试 | 优先级 | 动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Observation canonical envelope | 无 | 五家信封对照 [matrices/event-and-observation.md §1]；[P6] 词表 | adapter（per-harness transformer）+ observation envelope | behavioral | 否 | 否 | 是（decode_observation 复活） | 是（Frame/Set，未知事件显式类） | 否 | 否（finalize 侧已可挂） | 中——事件格式全部 VERSION_SENSITIVE | fake：录制样本帧（无模型，可用文档/源码导出的样本）；native：真实 -p/--json 单轮（需用户批准密钥时另议） | P1 | ADD_TYPED_SPI |
| Launch mode 参数化（选 mode 而非 [0]） | `[0]` 硬编码 | [audit F-08]；[facts:codex C]（exec/app-server/mcp-server 三真实模式） | registry + adapter | declarative+behavioral | 是（modes 已多值） | 部分 | 是（build_command(mode=…)） | 是（mode 选择入 Binding/Request 或 selector） | 是（请求面新增可选参数） | 否 | 中 | fake：每 mode argv 契约 | P1 | ADD_TYPED_SPI |
| Permission 审批面 | 无（claude control_request、codex app-server approval RPC、opencode HTTP reply、qwen control_response 先例） | [matrices/launch-and-control.md §2]；[P7] | host-control + adapter | behavioral | 否 | 否 | 是（on_permission(request)→response） | 是（PermissionRequest/Response DTO） | 是（HostControl 新端口） | 否 | 高（安全面）——默认 fail-closed（拒绝） | fake：请求→响应环路 | P2 | ADD_TYPED_SPI |
| Steer/interrupt 面单线复用 | 无 | [matrices/launch-and-control.md §4]；[P7] | host-control | behavioral | 否 | 否 | 是 | 是（ControlOp） | 是 | 否 | 中 | fake：中断环路；native：SIGINT/abort 面 | P2 | ADD_TYPED_SPI |
| Executable 预检（doctor 类） | 无 | codex `doctor --json`、claude `doctor`、opencode providers list、pi `--list-models`(PI_OFFLINE) | adapter | behavioral | 否 | 否 | 是 | 是（PreflightReceipt） | 否 | 否 | 低 | fake+native | P2 | ADD_TYPED_SPI |
| Session store 只读遥测（补充面） | 无 | [P3]；各 harness session 布局见 [matrices/profile-and-isolation.md §4] | observation | behavioral | 否 | 否 | 是 | 是 | 否 | 否 | 中（格式漂移）——标注 VERSION_SENSITIVE、只作 stdout 信封的补充 | fake：样本 JSONL/sqlite 解析 | P2 | ADD_TYPED_SPI |

## Phase D — 迁移 native behavior（从旧子目录与旧结论迁移）

| 字段/项 | 当前状态 | 证据 | 建议 owner | 类型 | 需 Adapter 方法 | 需新 DTO | 风险 | 测试 | 优先级 | 动作 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| codex app-server 客户端（622 行） | 旧子目录仅测试可达 | [audit F-11] | harness-native-adapter | behavioral | 是 | 是（JSON-RPC 帧） | 中——[experimental] 面 | fake：握手/回放；native：app-server daemon version | P2 | MOVE_TO_NATIVE_ADAPTER |
| codex executable bundle 解析（182 行） | 同上；Phase B 的实现底座 | [audit F-11] | adapter | behavioral | 是 | 否（复用 RuntimeSourceDeclaration） | 中 | fake+native | P0 | MOVE_TO_NATIVE_ADAPTER |
| codex hooks 注入（/runtime/hooks/session-start 重写） | 仅测试可达 | [audit F-11] | resource-projector | behavioral | 是 | 否 | 中 | fake | P2 | MOVE_TO_RESOURCE_PROJECTOR |
| claude/opencode/hermes/pi 四家 launch/profile/projection 旧实现 | 仅测试可达 | [audit F-11/F-12] | adapter | behavioral | 是 | 否 | 中——先 parity 锁定再迁移 [P4] | fake parity（P4 方法）+ native vertical（现 test_*_real_bwrap.py 扩展） | P1 | MOVE_TO_NATIVE_ADAPTER |
| hermes "transcript handoff" 定位 | 旧 scoping 选择，非原生限制（hermes 有 native resume） | [facts:hermes I] | registry | declarative | 否 | 否 | 低 | offline | P1 | CORRECT_EXISTING_FACT |
| opencode/pi continuation contract 值 | 与官方 resume 机制对齐检查 | [facts:opencode I / pi I] | registry | declarative | 否 | 否 | 低 | offline | P1 | CORRECT_EXISTING_FACT |

## Phase E — 扩展候选 Harness（准入结论）

| 候选 | Tier | 准入结论 | 依赖项 | 测试 | 优先级 | 动作 |
| --- | --- | --- | --- | --- | --- | --- |
| grok-build | A | 建议正式支持（streaming-json 十变体枚举齐全；补一次沙箱安装 smoke test 后转 A+） | 安装脚本沙箱化验证 | fake（argv 快照）+ native smoke | P2 | ADD_REGISTRY_FIELD（新条目）+ MOVE_TO_NATIVE_ADAPTER |
| gemini-cli | A | 建议正式支持（-o json/stream-json + 退出码表 + GEMINI_CLI_HOME） | 无 | fake + native | P2 | ADD_REGISTRY_FIELD + MOVE_TO_NATIVE_ADAPTER |
| qwen-code | A | 建议正式支持，但**线协议已与 gemini 分叉**（messages 帧 + control_response），必须独立 adapter | 无 | fake + native | P2 | ADD_REGISTRY_FIELD + MOVE_TO_NATIVE_ADAPTER |
| kilo-code | B | 暂缓（无 per-run JSON 流；session/auth 未文档化） | 官方补文档或沙箱安装补测 | — | P2 | DEFER（入知识库，不入 Registry） |
| aider | B | 拒绝为 Adapter 候选（零机器可读输出）；保留为设计参考 | — | — | — | REJECT（正式支持）/ 知识库保留 |
| zcode | C | 仅登记身份；无官方 CLI 面 | 若 Z.ai 发布 CLI 重评 | — | — | DEFER |

## Phase F — Resource Routing 后续（本轮不做）

| 项 | 结论 | 动作 |
| --- | --- | --- |
| MCP Resource 实现 | 五家中四家原生支持 MCP（codex/claude/opencode/hermes），pi 明确拒绝；格式/作用域差异大 | **DEFER——需用户另行下令**；设计输入见 [matrices/resource-surfaces.md §4] |
| Prompt/Rules 投影 | 各家落点已查清（commands/prompts/rules 三面） | MOVE_TO_RESOURCE_PROJECTOR（设计阶段），且不得再膨胀 GenericCliAdapter（新投影走 P12 plan/apply + collision 模式） |
| instructions 投影 | 发现语义各家私有（opencode"首个类型胜出"、codex"每目录一份"、claude"@import 4 跳"） | MOVE_TO_RESOURCE_PROJECTOR + per-harness 语义表（**KEEP_NATIVE_OPAQUE** 的发现规则部分） |
| hooks/extensions | 形态完全分裂（settings-hooks/config-hooks/JS plugin/TS extension/YAML hooks） | KEEP_NATIVE_OPAQUE |

## 分阶段建议总览

- **Phase A（纯事实修正）**：上表 9 项，全部只动 harnesses.toml 值与 schema 文档，
  不改接口。P0 五项（hermes/pi/claude/opencode/codex argv）是"现状根本无法正确启动"级别。
- **Phase B（接通既有链路）**：13 项。P0 三项：profile payload 接线、executable staging、
  credential materializer 注册表化。
- **Phase C（typed SPI）**：6 项。建议顺序：launch mode 参数化 → observation envelope →
  permission/control。
- **Phase D（native 迁移）**：6 项，全部以 [P4] golden-parity 方法先行锁定行为再迁移。
- **Phase E（扩展 Harness）**：grok-build/gemini-cli/qwen-code 待人工批准后进入 Registry。
- **Phase F**：MCP 等资源面等待另行下令。

## 明确不建议（REJECT/KEEP_NATIVE_OPAQUE 汇总）

1. 把五家 hooks/extensions 统一成一个声明面——形态互斥，保留 native。
2. 把 codex app-server / claude stream-json input 的双向控制协议降格为 Registry 声明——有状态协议，属 native adapter。
3. credential 机制细节进 Profile payload——保持 locator-only（现有 `_SECRET` 键禁令与
   bwrap credential-shaped env 拒绝继续生效）。
4. 解析各家 session store 作为正式接口——只作 VERSION_SENSITIVE 的补充遥测。
