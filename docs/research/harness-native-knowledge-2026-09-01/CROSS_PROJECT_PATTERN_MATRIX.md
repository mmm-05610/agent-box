# CROSS_PROJECT_PATTERN_MATRIX — 六个参考项目的可借鉴模式

六个项目的源码级研读笔记见 `../research-notes/`（twaldin/harness、
LiteLLM-Labs/lite-harness、artificemachine/superharness、Spielewoy/multi-cli、
madebywild/agent-harness、Hortus-Edenensis/cc-switch）。全部主张带 file:line 引用，
且所有第三方行为均标注 PEER_PROJECT——**它们不是官方 CLI 事实**。

## 1. 项目速览

| 项目 | 语言/形态 | 成熟度 | 状态 |
| --- | --- | --- | --- |
| twaldin/harness | Python(+TS port)，13 adapters，~6.4k LOC | 最成熟的多 harness 启动器 | active（2026-07），已发 PyPI/npm |
| LiteLLM-Labs/lite-harness | TS+Python SDK over Node NDJSON server | pre-release | active（2026-06） |
| artificemachine/superharness | Python，1129 文件/537 测试文件 | 大型多 agent CLI，adapter 层较新 | very active（2026-08） |
| Spielewoy/multi-cli | Bash+PowerShell 双语镜像 | v1.0.0 准备中 | active（2026-08） |
| madebywild/agent-harness | TS monorepo | v1.7.0 | very active（2026-08） |
| Hortus-Edenensis/cc-switch | Rust/Tauri2+React（**上游实为 farion1231/cc-switch 的镜像**） | v3.x 桌面工具 | active（镜像 2026-06） |

## 2. 模式 → Agent-Box owner 映射（建议采纳）

| # | 模式 | 来源（file:line 见笔记） | 建议 owner | 对 Agent-Box 的落点 |
| --- | --- | --- | --- | --- |
| P1 | **BuildCommand/RunSpec "build without invoking" 拆分**：命令构造是纯函数，副作用集中在 run | twaldin base.py:44-56 | harness-native-adapter | Agent-Box `build_command` 已是纯构造——保留；把 `declare_runtime_sources` 死 SPI 改为 build_command 的返回体（与 codex 旧 executable bundle 的 runtime_sources 一致） |
| P2 | **InstructionProjection：写-备份-撤销**（投影覆盖 CLAUDE.md/AGENTS.md 前备份，结束恢复） | twaldin _subproc.py:144-206 | resource-projector | instructions 类资源的 execution-local 覆盖策略模板；注意 twaldin 旧版不备份的反例 |
| P3 | **SessionTelemetry + 每家 session-log parser**（JSONL/sqlite 只读解析为统一 telemetry） | twaldin base.py:73-80, claude_code.py:67-115 | observation-envelope-candidate | 与本研究的结论互补：**优先 CLI stdout 信封，session store 解析只作补充证据** |
| P4 | **跨语言 golden parity 测试**（同一 fixture 跨 adapter 断言一致） | twaldin test_session_parity.py；superharness test_harness_registry.py:1-66（"先捕获真实 argv，再硬编码为期望值"） | test-strategy | Phase C/D 的验收方法：Adapter 重构前后 argv/env 必须字节级 parity |
| P5 | **folder-drop provider discovery**（duck-typed {id, createRuntime} + alias + env 额外目录） | lite-harness providers/index.mjs:16-58 | harness-registry-declaration（候选扩展机制） | 若未来支持第三方 harness 包，用该发现法；须修复其"静默吞 import 失败"缺陷（index.mjs:34-37） |
| P6 | **canonical frame 词表 + per-provider 纯 transformer**（system/init、assistant、user、stream_event、result + control_request/response） | lite-harness protocol.mjs:78-113 | observation-envelope-candidate | Agent-Box envelope 的直接词表起点；五家事实（codex item 事件、claude stream-json、opencode json、pi --mode json、grok streaming-json）都能映射 |
| P7 | **单线复用控制信道**（interrupt/set_permission_mode/set_model 带外帧 + session_id 重写） | lite-harness session.mjs:46-63 | runtime-host-protocol / host-control | HostControl 现只有 observe/finish——typed control 帧是其扩展方向（Phase C） |
| P8 | **Invocation(argv,env,cwd) 冻结为唯一 spawn 交接** + YAML Adapter Manifest（tiers/capabilities/auth_compat/launcher） | superharness base.py:16-30 | harness-registry-declaration | 与 Agent-Box Registry 思路互证；但必须吸取其**双 authority 漂移**教训（6 manifest vs 5 Python 对象、validator 与 executor 各查一份清单）——单一 authority 或强校验二选一 |
| P9 | **路径分类为受校验 schema**（sharedPaths/sessionPaths/filePaths/unsafePaths + credentialFiles + 重叠检查 + file-vs-dir link 类型） | multi-cli schema v2 | profile-store + sandbox-protocol | Agent-Box 隔离矩阵（profile-and-isolation.md §4）正是这个分类法；multi-cli 证明它可以做成带校验的声明 |
| P10 | **allowlist-only credential-free 模板导出**（内容 secret-scan + transport manifest + legacy profile 锁定） | multi-cli export | credential-materializer | Profile 导出/分享功能的安全基线 |
| P11 | **PID 检查 mkdir 锁 + 分阶段原子 overlay 交换 + currency manifest + doctor --deep** | multi-cli concurrency | terminal-session-protocol / profile-store | ProfileStore 现有 tmp+os.replace 原子写已达标；跨进程锁可借 PID 检查法 |
| P12 | **plan/apply 两阶段 + OUTPUT_COLLISION_UNMANAGED 拒绝未托管文件** + RenderedArtifact{contentSha256, ownerEntityIds} | madebywild agent-harness | resource-projector | 投影 receipt 的现成 DTO 形态（比现有 projection_receipt 更细：per-artifact digest+owner） |
| P13 | **per-provider capability 表作为数据**（nestable/emits/defaults）+ 单一严格 override schema 双层复用 | madebywild | harness-registry-declaration | Registry 字段数据化的方向；避免其"固定 4 家 zod enum"反例 |
| P14 | **SQLite authority + dry-run 迁移校验 + 迁移前自动备份** | cc-switch（SCHEMA_VERSION=10） | profile-store（若未来引入 DB authority） | ProfileStore 目前 JSON envelope 树足够；若迁 DB 先取此模式 |
| P15 | **skills SSOT 目录（含 `$HOME/.agents/skills`）+ symlink/copy 回退 + 收敛环（含删除禁用投影）+ 内容 hash 更新检测** | cc-switch | resource-projector | 与本研究发现（.agents/skills 事实共享根）互证；symlink-only 在受限 FS 上失败 → 需要 copy 回退 |
| P16 | **backfill-before-overwrite**（人工编辑过的投影文件先回填再覆盖；仅 prompts 有此保护） | cc-switch | resource-projector | 双向同步的正确形态：默认单向 + 人工变更保护，而非 cc-switch 其余面的"覆盖式双向同步" |

## 3. 反模式清单（避免）

| 反模式 | 案例 | Agent-Box 对策 |
| --- | --- | --- |
| 危险 flag 硬编码且无 opt-out | twaldin 每家 build_command 硬编码 `--dangerously-skip-permissions`/`-y`；superharness launcher 脚本无条件 `--dangerously-skip-permissions` | 危险 flag 必须是显式 Profile/Binding 决策，adapter 不得默认注入 |
| createRuntime 改 process.env（跨 provider 凭据泄漏） | lite-harness anthropic/index.mjs:17-24、codex/index.mjs:22 | Adapter 不得改进程级 env；env 只进 `HarnessCommandSpec.environment`（bwrap --clearenv 白名单已强制） |
| 能力接口静默 no-op | lite-harness setPermissionMode 对 codex/pi 空转 | capability 回显必须与行为绑定（现 `GenericExecutionProvider.capabilities()` 正犯此错） |
| 双/三重 authority 漂移 | superharness manifest≠Python 对象；multi-cli Bash/PowerShell 双实现漂移 | 单一 authority（TOML→typed schema）+ parity 测试锁行为 |
| 每新增一家改 N 处代码 | madebywild 固定 4 家 enum（~6 处必改）；cc-switch per-app 枚举爆炸（~10+ match-arm + schema 列） | Registry 数据驱动 + adapter 注册表（现 ADAPTERS dict 方向对，但 driver 值必须是唯一扩展点） |
| 无锁声明 | multi-cli singleWriter/singletonScope 声明未执行 | 声明了的并发字段要么执行要么删除（对应 Agent-Box 未消费字段清理） |
| 覆盖式"双向同步" | cc-switch 多数资源无冲突合并 | 资源投影默认单向 + P16 保护 |
| 解析 session store 当作接口 | twaldin 的 regex/sqlite 刮取随版本漂移 | 只消费 CLI 结构化 stdout；store 解析标注 VERSION_SENSITIVE 并做容错 |

## 4. 综合判断

六项目共同收敛于「subprocess argv 构造 + 原生 session store 遥测」；其中
**superharness 的 parity 方法论、multi-cli 的路径分类 schema、twaldin 的
投影/撤销、lite-harness 的 canonical frame 词表**是对 Agent-Box 直接可用的四个
最高价值输入；**madebywild 的 provider-enum 与 cc-switch 的 per-app 膨胀**则从
反面论证了 Registry 数据驱动 + 单一 Adapter 注册表的必要性。
