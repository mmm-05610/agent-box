# Backend Server — status

> **本文件是 B 树（后端 runtime 线）的账。** 下面"计数口径"及之后的所有条目是**分支点 `a4f82566` 继承来的历史账**
> （含 A 树的条目）：历史原文不改写，但**自本树建立之后的条目才算本树的账**；A 树（`server/wire/**` 与探针语义那条线）
> 的账在 `agent-box-env-provider`。本树切片与批次见 `worktree-charter.md`（`c1 = 106 → 088 → 090 → 091`）。
> （调度者建树时写的种子；此后由本树执行者维护。）

## 待拍 / 阻塞（runtime 线执行者 → 调度者）· 2026-09-19

- **工单 111 — 已裁定并落地**（R-0032 ① / write_paths 增补 `src/agent_box/server/profiles/**` @`015c91c`）：真正的修复点
  在 `posture_translation.py:translate_claude`（`ask` 被塞进 `allowedTools`＝自动放行＝"不问"）。已改为三桶
  （`allow→allowedTools`、`deny→disallowedTools`、`ask→translated["ask"]`＝claude `permissions.ask` 提问语义），
  60 翻译测试按 §52 改新映射并写明理由、不放宽（`Bash in ask` 且 `Bash not in allowedTools`）。终态 `CLAUDE_ASK_MAPPING_DONE`，
  **先于 093 落地**（093 阶段 1 落盘前须核到本提交 `2f46db5`）。见下方 c2/c3 表 111 行。
- **工单 108 — 已裁定并落地（PARTIAL）**（R-0021/R-0032 / write_paths 增补 `scripts/server-round1/**` @`234fa08`，公告第 103 轮批准三点）：
  三家生产模板输出上限从写死 64 解耦为宽松缺省 `8192`（`DEFAULT_OUTPUT_TOKEN_LIMIT`）；`OUTPUT_TOKEN_LIMIT=64` 重定义为**门的显式上限**，
  门投影 fixture 显式钉 64（`gate_models_document`/`gate_settings_document`/`gate_projected_config_document`），loopback "只换 baseUrl" 性质保持。
  42-D prepared 三家同步、字节钉死测试同步不放宽、三家各加反例门。**剩余**：三家链门真实端到端本环境不可跑（缺 Worker/sidecar/预置工件）；
  "部署文档字段可声明"这条取值来源未做（工单"取一，另一个如实登记"）。见下方 c2/c3 表 108 行与证据。

- **工单 107 — 阶段 1 完成、阶段 2+ 一手阻塞（交回）**：把 pi/dsh 思考"打开"的**合法值**在本环境**无一手出处**
  （pi 未安装；装的是全局 dsh、非 pin 的 `0.1.5-rc.1`，其启动器 `--help` 不暴露 `llm-deepseek.thinking`/`reasoningEffort` 值域；
  `pi/config.py thinking="high"` 是另一条 `--thinking` CLI 路、非模板 `samplingParams.thinking.type` 形状）。
  工单硬约束"**不发明**、合法值以实测/官方 schema 为准"⇒ **不猜值、不落模板**。请供其一：① pin 版 pi/dsh 的"开"合法 schema（含是否需 `reasoning:true` 才产 thought）；② 授权在预置 pin 工件上跑 `--help` 取值；③ 调度者按官方文档定值。
  另注：107 文里"maxTokens 仍为 64"已被 108 取代（现为宽松缺省 8192，本单口径＝"107 不碰 maxTokens"）。真机 `thought.delta` 链门段本环境亦不可跑。详见 [阶段 1 观测](../server-round1/107-thinking-on-stage1-observation.md)。

- **工单 110 — 已裁定并收口**（R-0032 ⑤ / `d67781d`）：67 的 stop/fail⇒pause 保留；本单改"暂停可见+类型化原因+可继续"，已交付
  （`pause_reason` 落库 18→19、`queue.updated` 事件仅在有原因时带 `pauseReason`，非暂停事件逐字段不变）。
  **遗留待裁（非我可自决）**：`queue.withdraw` 只接受 `pending`，对 `paused` 返 `too_late` ⇒ 裁定设想的"withdraw+重发"清不掉 paused 项；
  "改 paused 可撤"是队列语义改动（G2 禁改），"一键恢复"是新 wire 方法（§41 要求交回）。

- （历史，已由上条裁定处置）**工单 110 的原始语义冲突**：110 曾写"任何终态都触发队列采纳"，与 order 67 的
  `finish_cancelled`/`fail_turn ⇒ pause_pending`（在册测试 `test_stop_or_failure_pauses_queued_turn` 钉着）对立——已交回并由调度者裁定保留 67。

## runtime 线 c2/c3 分账（进行中）· 2026-09-19

| 单 | 终态 | 门/证据 | 精确剩余 / §Spend |
| --- | --- | --- | --- |
| [109](work-orders/109-second-delay-failure-hangs-http.md) | **HTTP_HANG_AFTER_SECOND_FAILURE_DONE** | `_complete` finally 保证释放（新增 `_retire_run`，逐步各自守护）；门=确定性触发"清理记录二次抛"⇒ run 仍退役、退回旧 finally 必红；错误码逐字不变。回归 harness+本单 94 passed。[证据](../server-round1/109-http-hang-after-second-failure.md) | 端到端"真 uvicorn 单循环被打死"受多线程真传输限制（本环境不可控复现），在**源头不变量**门住。§Spend：0 真调用 |
| [110](work-orders/110-queue-not-adopted-after-stop.md) | **QUEUE_ADOPTION_AFTER_STOP_DONE（v2 口径）** | 67 pause 保留；`pause_reason` 落库(schema 18→19)、`queue.updated` 事件**仅在有原因时**带 `pauseReason`、queue 视图带之；门=stop 后 paused+reason==cancelled+不自动采纳，退回 `del reason` 必红。wire_v1+pause+本单门 40 passed、boundaries 21。[证据](../server-round1/110-queue-pause-visibility.md) | **合同变更（新字段，非新方法）→ 重锁链**：settings 线把 `pauseReason` 编进 `wire-v1.ts`+重生成工件+登记新摘要对；A 线 `113` 以 110 现状发布含 `pauseReason` 的工件。遗留待裁：`withdraw` 仅 pending，paused 项撤不掉（改它=队列语义，交回）。§Spend：0 真调用 |
| [102](work-orders/102-contract-drift-two-faces.md) | **CONTRACT_DRIFT_TWO_FACES_DONE** | AUD-B-002：`v1.schema.json` op.enum 补齐 5 落后 op + golden 5 正例 + 三元门（受审常量==schema、每项在 main.rs、新 op 有 golden、golden⊆枚举，两向内建反例）。AUD-B-003：陈旧 33 方法快照改名（防假绿）+ wire-review 7 引用同步 + "门必须显式 AGENT_BOX_WIRE_SCHEMA"提示。相邻协议测试 10 passed。[证据](../server-round1/102-contract-drift-two-faces.md) | 工单"24"数字与 22+5=27 不自洽，已按分发实际为权威记账。§Spend：0 |
| [111](work-orders/111-claude-ask-mapping-fix.md) | **CLAUDE_ASK_MAPPING_DONE** | `translate_claude` 改三桶：`ask` 不再进 `allowedTools`（＝自动放行），单独产出 `translated["ask"]`＝claude `permissions.ask` 提问语义；allow/deny 与其它家零改动。门 G1 反例＝退回"塞 allowedTools"则 `Bash not in allowedTools` 断言红。60 翻译测试按 §52 改新映射并写明理由、不放宽。`test_posture_translation`+`test_posture_config_write` 36 passed（85 落盘未受影响，独立路径）。`git diff --stat` 仅 2 文件。提交 `2f46db5`，**先于 093**。[证据](../server-round1/111-claude-ask-mapping.md) | 无剩余。§Spend：0 真调用 |
| [108](work-orders/108-output-cap-deployment-parameter.md) | **OUTPUT_CAP_PARAMETERIZED_PARTIAL** | 三家生产模板输出上限从写死 64 解耦为宽松缺省 `8192`（`DEFAULT_OUTPUT_TOKEN_LIMIT`，进模板+42-D prepared 同步）；`OUTPUT_TOKEN_LIMIT=64` 重定义为门的显式上限，链门投影 fixture 显式钉 64（`gate_models_document`/`gate_settings_document`/`gate_projected_config_document`），loopback "只换 baseUrl" 性质与 `documented_differences` 审计保持。字节钉死测试同步、不放宽；三家各加"端点覆盖继承 8192 vs 门钉 64"反例门。`test_{pi,dsh,hermes}_production_template`+`test_hermes_production_chain`+capability 124 passed；扩面 358 passed/2 既有无关失败。[证据](../server-round1/108-output-cap-parameterized.md) | 真实链门端到端本环境不可跑（缺 Worker/sidecar/预置工件）＝只读源码改+in-process 反例门覆盖；**部署文档字段可声明**这条取值来源未做（工单"取一，另一个如实登记"），真实使用暂走宽松缺省。§Spend：0 真调用 |
| [114](work-orders/114-qoder-family-integration.md) | **QODER_FAMILY_PARTIAL（#6 落地、打包可行性已证；#1/#3/#4/#5 有依赖阻塞）** | 阶段 1 一手观测（`093d36c`）+ **item #6 未知键登记已落代码+测试**（`9cfb9c6`：`qoder/native_config.py` `QODER_NATIVE_KEYS` 逐条一手出处 + `unregistered_keys` 不静默丢弃门；6 passed；unknown⇒meaning=None 不发明；`.auth` 不作配置键触碰）。**阶段 2 打包可行性一手解除**：qodercli 是自包含单 ELF（~185MB/版，curl-bash 装、非 npm）⇒ 可离线 pin。`qoder/` 包**暂不注册进 harnesses.toml**（无 production.py/记录），防"能登记≠能跑"的 G1 假绿。[证据](../server-round1/114-qoder-family-stage1-observation.md) | 家族**注册**（#1 模板+#3 登录）留待 **094/095 账号模型**（A 线 105 之后、尚未并入本树）就绪后一并落，届时 G1/G2/G3 门齐；#4 放置、#5 真机腿同 090/091/108 先例不可跑。§Spend：0 真调用 |
| [093](work-orders/093-native-config-materialization.md) | **NATIVE_CONFIG_MATERIALIZATION_PARTIAL（阶段 1+2 落地；3/4/5 接线与真轮等 092）** | 公告第 106 轮点名"111 先于 093 前置满足 ⇒ 093 可开工"。**阶段 1**＝逐家一手观测表（写点/键位层级/协议方言/限额字段；钉不死⇒拒：dsh 无独立协议字段、qwen env 逐槽名未一手、hermes `context_length` 层级待真机核）+ 三条复用通道定位。**阶段 2**（更正"全阻塞于 092"）＝`native_materialization.py` 协议方言翻译表 + 类型化拒绝 + 已钉家渲染器：canonical 词汇由 092 合同固定（非发明）、方言值一手自模板、纯 harness 侧不碰 `model_configs/**`。`test_native_materialization_093.py` **25 passed**：六家可钉渲染器齐（codex/pi/claude + opencode/kilo/hermes）、G1 codex base_url/wire_api 在 `[model_providers.<id>]` 表内、opencode `npm`/`options.baseURL`/`models.<id>.limit` 各在其层、G2 claude-chat/pi-responses/dsh/qwen 全协议拒、**G8 无 limit 事实不写键（不回填）**、G5 幂等、G4 无凭据值（env/`{env:}` 引用）。111 前置核对 ✓。[证据](../server-round1/093-native-config-stage1-observation.md) | **剩在 092 的是阶段 3/4/5**：`freeze_execution_configuration`（`service.py:162-169`）目前未把已存的 `base_url`/`wire_api` 透进冻结执行；连同 092 的 `protocols[]`/`endpoints{}`/描述符 `wireProtocols` 落到冻结投影＝逐家接线 + 端到端第二上游真轮的输入。已钉家 `render_*` 骨架就位，092 到即接线 + status 逐行终态（G6）。092 阻塞于 A-105 公告点名。§Spend：0 真调用（合成输入） |

**待裁 / 一手阻塞（本树前沿；均未越界猜值/不半拉子）**：
- `107` 阶段 2+ 一手阻塞于 **pin 版 pi/dsh "思考开"的合法 schema**（见上「待拍/阻塞」节与 [107 观测](../server-round1/107-thinking-on-stage1-observation.md)）——不猜值。
- `114` 阶段 3/4 依赖 **094/095 账号模型**（A 线之后）；阶段 2 依赖可 pin 的 qodercli 工件。
- `114` 阶段 3/4 与家族注册一手阻塞：账号**登录态文件须由一次真登录跑钉出**（`codex/production.py:328` 判据 + manifest#894"不 faked"）；Qoder `.auth/` 多文件且机器绑定（`dynamic-*.json` 非确定名）⇒ 无 094/095 登录引擎 + 真 Qoder 登录前不可诚实声明。
  **更正**先前"094/095 infra 未并入本树"的措辞：账号资产底座（`server/accounts/`+`subscriptionCredential` 投影）**已在本树**（Order 56），缺的是 **094/095 登录引擎**（其自身阻塞于 092←A-105 公告点名）。
- `092–096` / `100` 串行等于 A 线 105/089 的**公告点名**（`worktree-charter §… "按公告的点名串行"`；公告第 103 轮（最新）尚未点名放 092）——非本执行者可自决。

**下一位（R-0036/R-0038 序）· 前沿已一手核验**：`111`（DONE）、`108`（PARTIAL）、`114` item #6 + 打包可行性、`093` 阶段 1 一手观测（公告第 106 轮点名放行、已落）均已推进。**本树在编单的可诚实推进面已做尽**——剩余全部经代码/公告一手确认为外部依赖阻塞：
- `092–096` / `100`：`092` 经 R-0051（charter `a33688f`）解除串行等待、`depends_on:[]` ⇒ **可开工**，但其 wire 那半（`server/wire/handlers.py` providerModels 白名单 + wireApi 枚举 + 生成工件）越本执行者「不碰 `server/wire/**`」边界 ⇒ **阶段 1 已完成、阶段 2+ 写权边界交回路由**（见 [092 阶段 1](../server-round1/092-provider-registry-stage1-observation.md) §4：拆分执行 or 一次性写权例外）。`093` 阶段 3/4/5 接线与真轮随 092；`100` 等 A 线 089。
- `107` 阶段 2+：缺 pin 版 pi/dsh "思考开"的合法原生 schema（不猜值）。
- `114` #1/#3/#4/#5：家族注册 + 登录声明阻塞于 **094/095 登录引擎** 与 **一次真 Qoder 登录钉 `.auth` 文件**（`codex:328`/manifest#894"不可 faked"）；账号底座（Order 56）已在本树。
**解锁我的输入**：调度者点名放 092（A-105 收口并入本树后）→ 即接 092→093 阶段 2→094/095/096；或给 107 的 pin 版原生 schema 定值；或供 114 的真 Qoder 登录一手。空闲期即等新点名窗口，不自造可假绿的半成品。
> **批末动作新规（公告第 106 轮 R-0040⑥ / QA-007）**：跑完全量**不在本树宣告"全量通过"**——写 sha＋命令＋计数 + **"Worker 工件在/不在"一行**，标 `待 QA 复算`；本树缺 git-ignore 的 Worker 工件 ⇒ 同码天然 ~18 红属环境类，交 QA 归因。

---

## CHECKPOINT c1 — 后端 runtime 线第一批（106 / 088 / 090 / 091）[DONE，含 091 PARTIAL] · 2026-09-19

**1 现在能试什么**
- **106**：忙时入队一条 → 上一轮结束后该条**跑完**（不再 1 秒 `SIDECAR_CLOSED`）。`tests/server/test_harness_sidecar.py -k "queue or drain"`：正例两轮 completed、退回旧实现必红复现 `SIDECAR_CLOSED`、sidecar 每次退 ⇒ 有界重建后 `SIDECAR_REBUILD_FAILED`。
- **088**：`_decode_windows_output` 现全函数——任何 `wsl.exe` 缓冲（0xd2 code-page、奇数长像 UTF-16LE、截断 BOM）不再崩读者线程；真 UTF-16 `--list` 仍正确解析。`plugins/agent-box-runtime-wsl/tests/test_windows_wsl_decode.py`。
- **090**：WSL/SSH 工作区的沙箱默认**随放置**（Linux guest=bwrap，与控制面宿主无关），Windows 宿主驱动的 WSL 轮不再回退 `sandbox-windows`；不可解析的放置＝**派发前类型化拒绝**（`SANDBOX_PROVIDER_UNRESOLVED`/`*_CONNECTOR_UNAVAILABLE`/`PLACEMENT_UNKNOWN`），**不再** `DispatchAmbiguous`。`tests/server/test_placement.py` + `test_control_plane_sync`/`test_an_unresolvable_placement...`。
- **091**：传输无关的同步引擎（首部署清单/逐项摘要、按 `(kind,id,version,digest)` 幂等增量、执行侧本地改 → `CONTROL_PLANE_AUTHORITY`、凭据内容结构上不可入集合）。`tests/server/test_control_plane_sync_091.py`。

**2 要你拍的（交回调度者的架构裁决）**
- **091 执行侧持久记录传输**：现对执行侧唯一的**持久**可写通道是 `home.put`（落原生 home＝本单明确不同步），`view.put/secret.put` 是 attempt 级用完即清；要在执行侧持久留存同步记录只能 ①走 home.put（与"不同步 home"冲突）或 ②**新增一个 Worker 控制协议 op（如 `records.put`）**。工单禁"改 wire 方法数/形状⇒停下交回"——**新增 Worker op 是否算所禁的"新 wire"？** 请裁定（选项 A/B/C 见 `docs/server-round1/fullstack/091-control-plane-sync.md §5`）。建议 B：把"首部署"定为逐执行幂等重建的有界投影（无跨机持久库），与"执行侧非权威"一致，我可据此把引擎接进 `port_factory`。

**3 花了什么**：真实模型调用 0；`wsl.exe`/真 Worker/真机门 0（全 monkeypatch/内存假端点）。§Spend 全部为源码取证 + 定向/全量 pytest。清理：三个 runtime `finally: stop()`，tmp_path 自动回收，无残留。

**4 恢复点**：本批四单已提交（106/088/090/091 各按阶段提交）。**基线**＝tag `checkpoint/c1`。工作树 clean。**下一位**＝调度者已新投 **107（=R-0020 的 096a，思考打开）/108（输出上限参数化）**，两者按公告串行（108 涉 model_configs/runtime 描述符＝与 A 的 104/105 串行；107 涉 plugins/agent-box-harnesses 模板）。c2 的 092 仍待 A 的 105 收口。无未提交在制品。

**5 不含糊（回归计数）**：根套件 `tests/` = **951 passed / 18 failed / 21 skipped**（255s）。**18 全为本环境既有失败，非本批引入**（逐一核验）：`test_chain_gate_without_worker_fails_typed` 断言磁盘上存在 `.acceptance-bundle-*`（全新工作树无）；`test_pi/opencode_gate_cleanup`（16 条）跑真链需预置 runtime 产物/node/bwrap ⇒ `FileNotFoundError`；`test_the_production_default_lease_is_five_seconds` 读 manifest 文件缺失 `FileNotFoundError`；`test_first_run_lock::test_without_the_gate...` 为时序 flake（**隔离跑 5 passed**）。本批四单定向全绿（106:90 / 088:21 / 091:19 / 090:15 passed）+ 新增门全过 ⇒ **本批引入回归 = 0**。091 终态 **PARTIAL**（引擎+G1–G4 绿；精确剩余＝跨机持久传输待 §5 裁决、无版本 kind（binding/hook/grant/account）增量含删除需 schema 18→19、Windows↔WSL 真机部署本环境不可用）。

---

## 计数口径（工单 49 G3；2026-09-17）

**最近一次有记录的全量计数（068 轮刷新；源头=e39959f 提交信息，068 按单内约束未复跑）**：

- 范围 `tests/`（根套件）：`PYTHONPATH=src:plugins/agent-box-harnesses/src:plugins/agent-box-runtime-wsl/src:plugins/agent-box-runtime-local/src:plugins/agent-box-sandbox-bwrap/src:plugins/agent-box-skills/src:plugins/agent-box-terminal-session/src python3 -m pytest tests/ -q` → **879 passed**（e39959f：orders 60–65 后全量，八家全链门 exit 0）。
- 范围 `plugins/agent-box-harnesses/tests/`（插件套件）：`python3 -m pytest plugins/agent-box-harnesses/tests/ -q` → 最近有记录值 **331 passed / 3 skipped / 0 failed**（50 轮）；此后未再逐轮记录，待下次全量回归刷新。
- 范围 `workers/agent-box-worker`（Rust）：`cargo test --locked --release` → 最近有记录值 **42 passed**（56 轮 Worker 侧）；待下次全量回归刷新。

**本文件各单行的套件数字以该行标注的提交为准；除此之外的其余计数一律视为历史（已被取代）**——包括 601 / 577 / 605 / 608 /
820 / 843 / 886 / 890 / 915 / 1107 等根套件数字与各阶段增量；历史条目的原文保留不改写，
仅以本节声明统一其效力。命令口径变更记录：46 之前的"全量"数字不含
`plugins/agent-box-runtime-local`、`plugins/agent-box-skills`、`plugins/agent-box-terminal-session`
三个 PYTHONPATH 条目，46 起补齐（补齐后收集面更宽，计数不可与旧口径直接比较）。

更新：2026-09-17（执行者：env-provider 工单会话）。42 及以前的记录未被本会话改动。
37 的独立验收仍为 PARTIAL；历史证据保留。
当前授权39→40→41→42。执行进度：39 完成；40 A/B/C/D 完成（四家组件门通过，
无真实模型）；41 的 28 方法与队列终态已按前端 `3aba5c5c` 新摘要严格 29/29 重锁，Windows r4 平台门
已于本阶段通过，当前为 **BACKEND_WINDOWS_R4_READY**：真实 Windows Server→wsl.exe→release Worker
ABW1 interactive→bwrap 链路上，两个显式 no-model fixture（广覆盖 + 有状态）走通，Server 以
`stop_mode=tree_terminate`（`taskkill /T /F` 有界进程树强制终止，**不是**正常/graceful 关闭）停止后
以同一 DataRoot 重启，以同一 native id 经 ACP `session/resume` 恢复、终止前 delta 先于 completed、
checkpoint 由 Windows ObjectStore 校验、退出后按 marker 清理并独立 `-PostCheck` 复核。整体
`BACKEND_IMPLEMENTATION_READY` **未登记**（正常 Desktop/Server 生命周期退出与最终清理留作后续全栈
最终验收项）。r4 检查点分三层见下表。
42 的独立模型任务可并行继续；前端实现交接已收口（2026-09-15 02:51 只读复测：HEAD `8e7c138c`、worktree/index clean、`writer_lease=RELEASED`，见 frontend_handoff 字段），但双门未齐，仍未进入跨仓联调、未取得前端写权。
42-D 已完成 provider-neutral 的不可变运行时工件投影底座（**RUNTIME_ARTIFACT_PROJECTION_READY**），
并在其上完成 **Pi、Hermes、OpenCode 三家生产封装（PI/HERMES/OPENCODE_PRODUCTION_CHAIN_PREPARED）**：
真实 adapter/agent（Pi 依赖闭包、Hermes 隔离 Python 闭包、OpenCode 摘要固定单文件二进制）经 c4
Worker+bwrap 连接本机 loopback 假 DeepSeek 端点，两轮同一 Server Session、上下文与重放/重开证据齐备。
**三家因此只是封装就绪，仍是 MODEL_NOT_VERIFIED（假端点与固定 nonce，不是付费模型验收）。**
**Codex 生产封装也已完成**（见下行），**四家封装全部就绪**；
最终门始终是 **Codex/Pi/Hermes/OpenCode 四家真实模型门**——与封装就绪不是同一件事，
不得混写。**该最终门已于 2026-09-15 全部取得证据**：四家 `--live`（官方 base URL、授权 locator
只读注入、不覆盖配置、不装载 loopback guard）——Pi `PI_PRODUCTION_CHAIN_GATE_OK`、
Hermes `HERMES_PRODUCTION_CHAIN_GATE_OK`、OpenCode `OPENCODE_PRODUCTION_CHAIN_PREPARED`、
Codex `CODEX_PRODUCTION_CHAIN_GATE_OK`，均 exit 0：两轮真实 DeepSeek 答复、同 native id 续接、
凭据零泄漏、清理干净、授权 locator 未被删，累计费用 **< ¥0.05**（上限 ¥10），
见 [live-model-preflight.md](../server-round1/fullstack/live-model-preflight.md) §6；
**机制（假端点/守卫）证据与真实模型证据分别记账、不得互相替代**。
`BACKEND_IMPLEMENTATION_READY` **仍未登记**——差固定 Reviewer 的 §4.2 阶段闭环。**state capture 类型化错误边界返修已完成并经 Reviewer 复审修复**（现行检查点 c8：
fd 锚定 no-follow 读取、确定性拒绝立即失败并保留准确码、`VIEW_CHANGED` 仅表示
"fd 读取中身份改变"、`VIEW_MISSING`/首次越界为确定性码并由 capture 层按上下文转换；
证据见
[state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)）。
**已修复两条通用缺陷**：Worker 默认 5 秒租约会取消"客户端静默"的运行中 attempt
（**WORKER_LEASE_KEEPALIVE_FIXED**，含 Windows 真机 8 秒静默证据，见
[原生 driver 接缝](../server-round1/fullstack/native-driver-seam.md) §5）；Hermes 会把产品模型
`deepseek-flash` 静态折叠成 `deepseek-chat`（已按其官方自定义 provider 路径修复，两轮线上值精确为
产品 id）。另有 **HARNESS_CAPABILITY_CONTRACT_READY**：四家向上能力合同收敛为单一版本化词汇（见
[能力矩阵](../server-round1/fullstack/harness-capability-matrix.md)）。
**四家原生 HOME 双重收敛隔离已实施**（`PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED` /
`DONE_FOR_FOUR_FAMILIES`，guest `HOME=/runtime/home`，见
[profile-home-isolation.md](../server-round1/fullstack/profile-home-isolation.md) §8b），
**Codex 生产封装已完成**（`CODEX_PRODUCTION_CHAIN_PREPARED`，工件/官方配置/隔离 `CODEX_HOME`/全链门齐备，
见 [codex-production-packaging.md](../server-round1/fullstack/codex-production-packaging.md)），
四家（Codex/Pi/Hermes/OpenCode）现在都有生产封装（封装轮的 `MODEL_NOT_VERIFIED` 已于 2026-09-15 被四家 `--live` 真实模型门取代，见上段）。
DeepSeek 官方 API 授权见42 §D；累计发生 1 次 API 可达性调用（12 tokens，费用 <¥0.01），
Codex 旧 chat 配置尝试在模型请求前失败；新 Responses 配置已通过无模型读取门，二者都不能记作模型调用
或 Harness 验收。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [39](work-orders/39-server-boundaries.md) | **READY_FOR_HARNESS** | [阶段证据](../server-round1/server-boundary/stage-a-b-c.md)：幂等并发双派发缺陷先复现后修复、能力声明改为注册派生、双中立provider测试、legacy codex 退出生产装配 | wire反馈通道 [wire-review.md](../server-round1/wire-review.md) 已建立并写入首轮 |
| [40](work-orders/40-four-harness-integration.md) | **FOUR_HARNESS_COMPONENTS_READY** | [40-A 底座](../server-round1/harness-integration/stage-a.md) / [40-B 通道](../server-round1/harness-integration/stage-b.md) / [40-C 矩阵](../server-round1/harness-integration/stage-c.md) / [40-D 汇总](../server-round1/harness-integration/stage-d.md) + [握手证据JSON](../server-round1/harness-integration/handshake-40c.json)：四家组件门 25/25；全量 227 passed/4 skipped/0 failed；Rust 4 passed；真实二进制零凭据握手 pi/hermes INITIALIZED、opencode HEALTH_OK、codex 诚实要求凭据 | 本单终态；Server 侧编排与 wire 锁定进入 41；真实模型门留待 42 §D |
| [41](work-orders/41-core-service-acceptance.md) | **BACKEND_WINDOWS_R4_READY** | [后端验收](../server-round1/backend-acceptance.md)：28 方法+队列终态严格 schema 回归 29/29；Windows r4 exit 0（保守旧门 + `tree_terminate` 强制树终止后的有状态崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/marker 清理/独立 `-PostCheck`）；反例含 5 种不可用 checkpoint 与 4 种拒绝清理；全量 348 passed/4 skipped，Node 25/25+4/4，Rust 4/4 | 42 双门未满足，整体 READY 仍受约束 |
| [42](work-orders/42-fullstack-delivery.md) | **PRE_GATE_CLOSURE_PENDING**（后端门=四家真实模型门已执行；前端实现门自述已满足但未接管，未联调） | [进度与费用账](../server-round1/fullstack/progress.md) + [运行时工件投影底座](../server-round1/fullstack/runtime-artifact-projection.md) + [Pi 生产封装](../server-round1/fullstack/pi-production-packaging.md) + [Hermes 生产封装](../server-round1/fullstack/hermes-production-packaging.md) + [OpenCode 生产封装](../server-round1/fullstack/opencode-production-packaging.md) + [通用 driver 接缝](../server-round1/fullstack/native-driver-seam.md)：工件投影 **RUNTIME_ARTIFACT_PROJECTION_READY**；Pi/Hermes/OpenCode 三家 **\*_PRODUCTION_CHAIN_PREPARED**（真实 adapter/agent + c4 Worker + bwrap + 本机假端点，两轮同一 native id / 两轮上下文 / 真实重开方法，两条门本会话串行复跑 exit 0；无模型证据标明 `MODEL_NOT_VERIFIED`，2026-09-15 已由四家 `--live` 真实模型门补上）；**Worker 5s 租约取消静默 attempt** 已第一手复现并**已修复**（`WORKER_LEASE_KEEPALIVE_FIXED`，含 Windows 真机 8 秒静默证据）；能力合同已统一为 canonical 词汇（`HARNESS_CAPABILITY_CONTRACT_READY`）；**四家原生 HOME 隔离已实施**（`PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED`）、**Codex 生产封装已完成**（`CODEX_PRODUCTION_CHAIN_PREPARED`），四家都有生产封装；**四家真实模型门已全部取得证据（2026-09-15 `--live`，四门 exit 0，累计 <¥0.05）——机制证据与真实模型证据分账、不得互替**；**state 错误边界返修完成，现行 bundle c8（2026-09-15）**：runtime-artifact/Pi/Hermes/OpenCode + Windows r4/PostCheck 用 c8 exit 0，Codex 门【历史：曾为未解决的红绿间歇；用户已裁决 A，`.tmp` 与 `shell_snapshots` 已遮蔽、最终全绿】见 [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md) §4.2–4.4）；前端复测（2026-09-15 02:51 +08:00）：`DESKTOP_IMPLEMENTATION_READY` 自述成立、HEAD `8e7c138c`、worktree/index clean、`writer_lease=RELEASED`、r3 28 PASS/0 FAIL、wire 两摘要一致；28 方法 wire 摘要未变；DeepSeek 官方 API 可达（12 tokens） | 固定 Reviewer 的 §4.2 阶段闭环（**额度限制，2026-09-20 12:11 后可重试**）→ 登记 `BACKEND_IMPLEMENTATION_READY` → 双门接管与全栈联调 |
| [45](work-orders/45-native-home-storage.md) | **NATIVE_HOME_STORAGE_DONE**（082 收口：唯一未过的 G3 已由 67 裁决落地并于基线 `4c32992` 复跑 pass） | [原生目录证据](../server-round1/fullstack/native-home-storage.md) + [G门报告](../server-round1/fullstack/native-home-gate.json)：阶段A/B/C/D(部分)完成——Worker home操作族 + 协议3→4双向拒绝 + bundle c9（sha256:c7fcab3a…，Rust 38 passed）；native-home直挂/审计manifest schema 3/`server_sessions`+2列（schema 6）；wire零改动。**G1/G2/G6/G8第一手通过**（含续接真召回、取消后召回不断、审计漂移可见）；四家假端点门c9上全部exit 0；全量**890 passed/5 skipped/0 failed**。**G5的Windows r4(c9)全套+PostCheck已于2026-09-17补齐**（A/B/C/D/E+PostCheck全exit 0，3次真实Codex请求，崩溃重启后同native id续接；顺带修正验收栈6处过期假设——accept脚本部署合同/UTF-8请求体/delta拼接/schema 3断言/PYTHONUTF8解码崩溃；证据[windows-r4c9/](../server-round1/fullstack/windows-r4c9/)）；G7记部分覆盖（真实应用二轮上下文由46-G3八家8/8覆盖，续接能力由r4 C/D+E双层覆盖）。**捕获三根因修复已收口（提交 67085b4，2026-09-17）**：真实迁移场景六轮capture失败（5×审计响应超64KiB帧→EXECUTION_FAILED、1×VIEW_IO元数据竞态）→ 审计帧上限1MiB（协议版本仍4、旧二进制超限帧类型化拒绝）+ 审计RPC 120s窗口 + 元数据NotFound记截断；修复经 Rust 38/根套件 601/wire 37/pi门c8 exit0/Windows accept-b exit0 验证，**迁移最终验证 MIGRATION_FINAL_OK**（codex-main与hermes-main各一真实轮 completed/captured/cleaned，checkpoint落库 native_platform=wsl、home_locator=codex-main/.codex 与 hermes-main/.hermes、原生会话id齐备；用户直接委托的1.x迁移任务，2次真实调用另账，六轮失败轮模型均已真实答复）。未过项已清零：**G3 并行双轮**其时为产品语义裁决项（类型化拒绝满足「不静默换地」底线，但「两轮都完成」未达成），67 把唯一性单位改为会话后，082 在基线 `4c32992` 复跑整座门得 `NATIVE_HOME_GATE_OK`——两轮均 completed、native id 各自独立、同会话第二条入队、运行中切换 rejected/execution_running，证据 [native-home-45-082-rerun.json](../server-round1/fullstack/native-home-45-082-rerun.json)，真实模型 0 次；**§1b/落地设计§14（session库独立于profile home）已实现并逐家定性**（提交 717a643/20d66d6，证据 [stage A](../server-round1/fullstack/session-store-14-stage-a.md) + [45报告§9](../server-round1/fullstack/native-home-storage.md)：机制=Worker session-store 模式+房间库绑定+审计走库根；**codex/pi 声明 split 且门在 c10（sha256:d92c6716…）全绿**，hermes 更正为共享DB式、opencode/kilo 同；claude/dsh/qwen 声明撤回（其43代门自45起未在Linux复跑，本轮修复三层接口漂移后仍卡 HOME_MARKER_CONFLICT，根因未定位，记录为维护债） | 下一步：~~G3产品裁决~~（已由 67 裁决、082 复跑闭合）；43代门 marker 冲突根因（claude/dsh/qwen）；G8 取消/召回间歇 → 087；其余收口 |
| [46](work-orders/46-all-harnesses-fullstack.md) | **ALL_HARNESSES_FULLSTACK_DONE**（证据边界见报告 §0b，2026-09-17 收口复核补记：G4反例为两家fixture双向+launcher正控制、非8×8矩阵；UI门第二轮nonce断言语义见F46-4；请求精确计数19次、排障重跑未逐笔粗估另<10次） | [46证据（§8终版）](../server-round1/fullstack/all-harnesses-install-set.md) + [并存JSON](../server-round1/fullstack/all-harnesses-coexistence.json) + [隔离JSON](../server-round1/fullstack/all-harnesses-isolation.json) + [8家UI门](../server-round1/fullstack/ui-gates-46/)：扩展分支合并（c1a7ea9，3冲突按接缝解决，195/3）；8家安装集（幂等，digest逐家固定，deployment sha `5dce588b…`）；并存8/8；**D隔离完成**（ISOLATION_GATE_OK——home互不覆盖、B家零字节、launcher边界正控制；覆盖面边界见 §0b）；**C逐家真实DeepSeek UI门完成（2026-09-17）**：真实Electron+真实Windows Server+真实WSL Worker，8家各8/8步骤PASS exit 0，凭据经界面录入，精确计数19次<¥0.05逐家记账（排障重跑未逐笔、见§0b）——F46-1的「外部资源缺席」判断被用户纠正（WSL互操作可直驱Windows），同路径顺带补齐45的G5 Windows腿（r4全套+PostCheck全绿）。不退化：44两门、45 G门、r4全套、插件195/3、全量608/1全exit 0；wire零改动。§6缺口F46-2三方案记录待裁决（非DoD项）。清理：沙箱/数据根/home/进程全清，`git diff --check`净 | 下一步：§6缺口方案交用户裁决（F46-2）；45-G3产品裁决 |
| [37](work-orders/37-http-codex.md) |
| [37](work-orders/37-http-codex.md) |
| [49](work-orders/49-evidence-hygiene.md) | **EVIDENCE_HYGIENE_DONE** | [49报告](../server-round1/fullstack/evidence-hygiene-49.md)：G1 九门缺参类型化失败（GATE_WORKER_REQUIRED，反例测试 2 passed）；G2 pi门+Windows accept-b 显式c8 exit 0（c8现行摘要 ce7fdeb2…，工单所写 514f48a9 为历史值——c8已在45/46期间重建，如实记账）；G3 status计数口径节（现行唯一+历史声明）；G5 prune两残留清零、未删任何bundle（c2/c3/c5/c6/c7 在49开工前即缺失，不入git不可追溯，记账）；legacy_codex.py连两个测试删除（47 §2.E 收口项提前完成并在47文档登记）；G4 根套件 601/0、插件 195/3、Rust 38，零真实模型调用 | 无未做项（Windows r4 C/D真实模型段按49零调用约束不复跑，记账） |
| [50](work-orders/50-absorb-capability-layer.md) | **CAPABILITY_LAYER_ABSORBED** | [50报告](../server-round1/fullstack/capability-layer-absorbed-50.md)：按内容吸收 `feature/capability-entry-v1 @ 1c74d15`（不合并历史/调度）——capability 库七模块 + `declarations.py` + 八组测试 + gate 测试移植；Server 三文件（runtime/sidecar/sidecar_backend）逐段重放到当前签名；唯一强制门在 `open_execution` 前（fail-closed，零 spawn），反例：未批准 provider / 伪造声明 / 空授权集（≠不限制）全部类型化拒绝；`network.none@1` 收敛为逐执行声明 unavailable（argv 缺失锚点，第一手观测），`_CAPS` 写明跨模板并集；新增 `slots.py` 登记槽位↔具体能力关系 + 守卫测试（拼造 id 无槽位、`_CAPS`==isolation 组）。修正源分支一处缺陷（helper 插错位置解除 skip 守卫）。回归：根套件 **748/0**、插件套件 **331/3**、四家全链门（pi/hermes/opencode/codex）显式 c8 全部 exit 0。零真实模型调用 | 无未做项；terminal 短名词汇版本化与 47 的房间网络参数按工单边界留后续 |
| [47](work-orders/47-sandbox-plan-seam.md) | **SANDBOX_PLAN_SEAM_DONE**（Windows r4 本轮未复跑，记账） | [47报告](../server-round1/fullstack/sandbox-plan-seam-47.md)：中性沙箱端口（`extensions/runtime_composition/sandbox_port.py`，三级名字解析、不猜、fail-closed）——通道（sidecar/local_channel）与装配（runtime.py）都按名字拿 provider，**生产代码 grep agent_box_sandbox_bwrap 零命中（G2）**；文法上移 （home_projection/runtime_artifacts → `resource_contracts/`，部署文档格式零改动）；bwrap 真的声明 `isolation.wrap@1`，协调器 preflight 未声明即 `CAPABILITY_UNDECLARED` 拒绝（G3）；新一致性门 [sandbox-conformance.json](../server-round1/fullstack/sandbox-conformance.json) **OK/exit 0**（home 真目录、宿主 /home 不可见、RO EROFS、ephemeral 无痕、凭据不进 argv、树杀含正控制、清理有界、none 姿态诚实拒绝），反例 fake-redirect-home **FAILED/exit 1**（G4/G5）；`host-substitution` 门 **OK**（roomDiffersOnlyInBindings=true）+ 四家全链门显式 c8 全 exit 0（G1）；全量 **754 passed/0 failed**（G6）。零真实模型调用 | 未做项：Windows r4 复跑（48 时一并）；runtime-*/tests 3 处 bwrap fixture 引用保留（测试语义） |
| [48](work-orders/48-windows-placement.md) | **WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE**（spike 授权的降级形态；读写隔离声明 false；**AppContainer 已结案，072**） | [48报告](../server-round1/fullstack/windows-placement-48.md)（§七 结案 + §八 声明核对）+ [spike](../server-round1/fullstack/windows-spike.md) + [提权轮证据](../server-round1/fullstack/windows-spike-elevated-raw.json)：**新插件 agent-box-sandbox-windows**（47 接缝：Job 生命+物化+环境块凭据；隔离半边声明 unavailable）；宿主栈（local_channel Windows Job 分支、runtime-local windows realm、tmux 全表面 Windows unsupported、装配按平台选默认 provider id）；**一致性门平台声明驱动**：Linux bwrap OK（回归）+ **Windows 真机 OK exit 0**（[报告](../server-round1/fullstack/sandbox-conformance-windows.json)）+ **Windows 反例 FAILED exit 1**（[反例](../server-round1/fullstack/sandbox-conformance-windows-counterexample.json)，两文件已入本树）；逐家声明不可用（八家均无 Windows 工件）；全量 **1103 passed/3 skipped**。零模型调用 | 未做项：逐家真 harness 轮（等 Windows 工件）、45 G8 Windows 重跑；**AppContainer 容器承载已结案不再追测**（判据见 §七：失败与提权无关 + 写隔离降 IL 需管理员） |
| [51](work-orders/51-usage-context-fact.md) | **USAGE_FACT_PARTIAL（pi 与 codex 端到端含 wire；六家解析器齐；hermes/claude 的门级观测轮已由 084 在当前基线一手复现，opencode/kilo blob 解析核实为 `eb0c307` 即已落地）** | [51 阶段 A 观察](../server-round1/fullstack/usage-context-observation-51.md)：逐家用量/上下文来源的第一手清单（codex rollout 的 total_token_usage、hermes state.db 的完整细分、claude projects 的 token 键、opencode/kilo 无专用列、pi/dsh/qwen 待验证；ACP 协议无 usage/contextWindow——neutral fact 必须走 native 回读）；B/C 已落地（a2143c3）：schema 7（turns 的 usage_* 列 + sessions.latest_usage）、usageProbe 部署声明（format 注册表，未知即部署拒绝）、解析器 （usage.py；ACP 的 usage 在 row.message.usage——阶段 A 文档已按工单 §1 更正 ACP 结论）、完成边界在 channel 存活期读取（迟到即如实 unknown）。端到端：pi 门 c10 exit 0 且 turns 记 11/7/18 source=pi-acp-journal、session latest_usage 落库、failed 轮 NULL。零模型调用 | D 已落地（eefa148/8e41e73：usage.updated 事件 + latestUsage 投影 + FRAME_COVERAGE + 严格校验 37 passed 带工件；两仓摘要见 wire-review.md；E 交接文档已入前端仓 evidence 35258dac） | codex 观测轮已绿（c10，turns 记 11/7/18→22/14/36 累计 source=codex-rollout，解析器经真实 rollout 行验证 payload.info 嵌套；hermes 解析器经真实 state.db 验证）；**观测轮补齐与 blob 解析两项由 084 结案**（[084 证据](../server-round1/fullstack/usage-parsers-remaining-084.md)：hermes 门 `--keep` 后账本记 `(11,7)`→`(22,14)` `source=hermes-state-db`、claude 门记 `(11,7)` `source=claude-projects-line` 且其**失败轮**整行 NULL＝本行"失败轮 NULL"的真实行实例；opencode/kilo 的 blob/列解析核实自 `eb0c307` 起已在树内，本轮只补反例）。51 的**精确剩余**只有一条：`kilo`/`opencode`/`dsh`/`qwen` 的**部署模板仍未声明 `usageProbe`**（模板在 `plugins/**`，不在 084 的 `write_paths`）⇒ 需要一张有插件写权的单。 |
| [52](work-orders/52-session-process-facts.md) | **B/D+E 完成（thought/plan/mode 三新 wire kind + 四类映射入账本；严格校验 37 passed 带工件）；真 harness 观测轮已跑并记否定结果** | [52 阶段 A 观察](../server-round1/fullstack/session-process-facts-observation-52.md)：ACP sessionUpdate 词汇覆盖全部四类事实（thoughts/tool/plan/mode）——缺口在桥与 Server 的 `_forward()` 只转发 agent_message_chunk；native 层佐证（hermes messages 表的 reasoning/tool 列、codex rollout 的 response_item/event_msg、claude 的 assistant/output_style 行）。B/D 已落地（b0c124f）：_forward() 映射四类 ACP 通知、_native_event 落账本、wire 加 thought.delta/plan.updated/mode.updated（前端合同 b1f44a23、工件 0cdc459c，13 kind）、严格校验 37 passed 带工件。**观测轮（3e945b3，真 pi + 假端点一圈）：四类过程事实零出现——否定观测，不写成通过**；同圈 54 三轮 change_set 全 NULL、55 探针产出真事实 | 剩余：需能发四类负载的真流（真 harness 自己播发 thought/tool/plan/mode）才能端到端取证；夹具已单独验证播发路径 |
| [55](work-orders/55-provider-model-record-and-probe.md) | **G1–G4 完成 + 真实端点探测完成（070 执行，R-0011）** | 记录扩展（534535e/52659ad/f4214a7）：server_provider_models 增 base_url/auth_style/wire_api/fields_source 四列（可选，旧记录 NULL=未知不阻塞）；wire 的 providerModels.create/update 增可选 provenance 对象、providerModel 投影带 provenance（全空投影 null）；枚举校验（authStyle/wireApi/fieldsSource），未知值类型化拒绝。G2 探测（6b1abe6/23bd0dd/60a4ea1/1511e03，`model_configs/probe.py`）：`probeModels`/`probeConnection`（方法集 28→30，纯新增）、https-only（loopback http 例外）、非 loopback 私网拒绝 `PROBE_ENDPOINT_BLOCKED`、凭据仅内存注入（零 argv/日志/事件）、`PROBE_RESPONSE_TOO_LARGE`/`PROBE_FORMAT_INVALID`/`PROBE_AUTH_FAILED`/`PROBE_TIMEOUT`/`PROBE_UNREACHABLE`、**探测结果不写任何记录/配置**；十三项定向测试。**070 真机轮**：[报告](../server-round1/fullstack/provider-model-55.md) + [证据 JSON](../server-round1/fullstack/provider-model-55-real-probe.json)（真实 `GET api.deepseek.com/models` 2 次：ok `[deepseek-flash, deepseek-v4-pro]` 0.218s / reachable 0.176s；配置零写入；凭据零命中；五类反例演练各一次；R-0011 零 token 计费）；**先失败后修**：`probeConnection` 接线 ImportError、运行时把 `credentialId` 误当必填、总时限未生效（均已修 + 测试锁住） | 交回项：`providerModels.update` 与 `providerArtifacts.install` 的运行时/发布 schema 不齐（需更新语义决定）；窗口/能力无记录面（要展示须新字段）；P17 前端同步与两仓重锁仍待（strict 工件 5 项既有失败=待重锁状态） |
| [57](work-orders/57-harness-artifact-management.md) | **阶段 A 完成（逐家来源观察）；安装/更新/回滚实现待做** | [57 阶段 A](../server-round1/fullstack/artifact-sources-57-stage-a.md)：npm 系三家（pi/codex/opencode）来源与证明充分（registry dist.signatures+attestations 公开、dist.shasum 钉住、版本映射即目录源）；本仓钉住版本有意落后上游 latest（0.5.0/0.147.0/1.18.21 vs 0.9.1/0.154.0/1.18.31）——更新检测输入；hermes/dsh 内部闭包仅摘要固定；codeg 参照未取得如实记录。B 已落地（2052743：ArtifactStore——版本目录 <root>/<family>/<version>/、安装时重推导 tree digest v1、不匹配零落地、引用 .current 与回滚为指针移动、重复安装与未安装版本类型化拒绝；五项测试）。零模型调用 | 下一步：C wire 面（安装/更新/回滚/清单方法）→ D 真机证据（发布物取得 + 本地构建各一）|
| [54](work-orders/54-turn-file-change-set.md) | **本机通道切片完成（change_set 模块 + 账本，schema 9）；WSL 通道观测轮已跑（069，否定 + 根因）：账本全 NULL，原因=`sidecar.py:631-632` 把空快照 `{}` 真值折叠成 None（**非协议缺口**，Worker op 直探可用）** | 模块（change_set.py：O_NOFOLLOW 有界走查+内容副本 256KiB/8MiB/1024 条目上限+截断事实；diff added/modified/removed+文本行数；二进制/超大只报变更并注明）；本机通道 attempt 前快照、审计边界后走查、diff 发布为记录对象入 turn（schema 9）；十项定向测试（行数、symlink/特殊文件事实、二进制、副本目录独立性、凭据不进 fact）。全量 1107+ 通过（含本切片十项与严格 wire 校验）；零模型调用。**WSL 通道**（d825512）：Rust Worker `workspace.list`（本单直探 OK：path/size/digest）→ 启动器 before-snapshot → `workspace_change_set()` diff；[069 观测报告](../server-round1/fullstack/wsl-change-set-observation-069.md) + [证据 JSON](../server-round1/fullstack/wsl-change-set-observation-069.json)：pi 门 c11 一轮 3 turn（2 completed/1 failed）digest 全 NULL，插桩 + 同进程三态探针钉出根因（空快照折叠 ⇒ 连 after-listing 都不发）。观测轮（3e945b3，本机通道一圈）：三轮 `change_set_object_digest` 全 NULL——该圈工作区零编辑，与"空改动不发布变更集"一致 | 交回（069 §4）：`sidecar.py:631-632` 改 `is not None` + 空快照测试 + 复跑观测轮（正例=审计文件即非空变更集）；kilo marker 维护债已随 e394f09 解除 |
| [53](work-orders/53-usage-aggregation.md) | **USAGE_AGGREGATION_DONE（B/C/D 完成：聚合模块 + wire 方法 + 导出；所列"解析器与观测轮待续"两项已由 084 结案）** | UsageAggregator.aggregate_by_session（3deae3a 前身，现位于 usage_aggregate.py）：按会话聚合已上报 tokens，无数据会话返回 unknown（非 0）；跨会话零泄漏反例；未知轮次计数可见。定向测试 4 项 + 解析器测试 10 项全绿 | wire 面 usage.aggregate/usage.export 已接线（79e8d4e）；**hermes/claude 门级观测轮与 opencode/kilo 解析由 084 收口**（观测轮在当前基线一手复现；解析器核实自 `eb0c307` 已在树内，084 补 NULL⇒缺席、读取失败⇒unknown+原因两条反例，并把凭据面从 grep 升级成运行期守卫）：见 [084 证据](../server-round1/fullstack/usage-parsers-remaining-084.md) §2/§3/§7。聚合面**没有新增**：它消费账本里的 usage 列，各家事实齐了才完整 |
| [43](work-orders/43-harness-expansion.md) | **HARNESS_EXPANSION_ROUND1_DONE + kilo 追加（过门 4 家：dsh、claude-code、qwen、kilo——假端点门与真实模型门均 exit 0；Goose 已调研未实现；Aider 调查后不接；Crush/OpenHands 未碰）** | [dsh 封装](../server-round1/fullstack/dsh-production-packaging.md) + [claude-code 封装](../server-round1/fullstack/claude-production-packaging.md) + [qwen 封装](../server-round1/fullstack/qwen-production-packaging.md) + [kilo 封装](../server-round1/fullstack/kilo-production-packaging.md)（用户追加；OpenCode fork，原生二进制 `kilo acp`，KILO_CONFIG_CONTENT env 配置通道，费用 +4 次请求 <¥0.01）：三家六件套齐——注册表/生产模块/部署模板/双构建一致工件/假端点全链门 exit 0/**`--live` 真实模型门 exit 0**（mode=live，官方端点、授权 locator 只读注入、两轮真实答复、次轮真召回、同 native id 续接、未知模型发包前拒绝、凭据零泄漏、清理干净）；能力 observed 逐项以门证据回填；桥接补丁 1 个（ACP 分组配置选项展平，PATCHES.md §3，无品牌分支）；费用：确认真实请求 28 次（dsh 8 + claude 12 + qwen 4 + kilo 4）+ 少量后台 title 调用，估计 < ¥0.06（上限 ¥10） | Goose 接入卡已备（v1.50.1、`goose acp`、env 三件套、GOOSE_PATH_ROOT；注意 musl 静态二进制 LD_PRELOAD 不可用）——后续工单实现；Crush/OpenHands 按工单顺序未开始；检查点 d9d36b0 / 2c0735c / e63a03e / 8adebe2 + 收尾提交 |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed；同键并发双accept已由39复现并修复；能力不诚实已由39结构性修复 | abandon 断言经探针定性为**测试侧竞态**（终止状态持久化后约50ms才 abandon；负载高时10/10失败），已改为有界等待、断言强度不变，修后10/10通过；原生语义迁移由40执行 |
| [44](work-orders/44-environment-providers.md) | **ENV_PROVIDERS_DONE** | [环境 provider 证据](../server-round1/fullstack/local-ssh-env-providers.md) + 两份门报告（[local](../server-round1/fullstack/env-provider-gate-local.json) / [ssh](../server-round1/fullstack/env-provider-gate-ssh.json)，同一部署文档 sha256 `6026b9…`）：Worker 以 musl 静态构建上实验机（`SSH_WORKER_HELLO_OK`，控制协议 3 全握手）；第一手发现实验机 bwrap 0.4.0 缺 `--clearenv` 跑不了房间，已在实验机源码构建 0.11.0 并带备份切换（回滚见证据 §1b）；`local-env-gate` 与 `ssh-env-gate` 均 exit 0（no-model fixture，真实模型 0 次、¥0）；四家假端点门 exit 0；全量 **915 passed / 5 skipped / 0 failed**（基线 886/6，无退化，另修复两条被 skip 掩盖的既有用例与本机通道零凭据崩溃、connector 分派 kwargs 丢失两个真实缺陷） | 未做项（工单明示范围外）：前端选择器接线、Windows 原生沙箱、远端多用户/跳板机/密钥托管 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | 两轮 A/B/C 完成：[最终建议与边界](../server-round1/harness-selection/boundary.md)。保留有条件首选 `harness-remote v3.0.2`；零模型/凭据 | 首选已由40消费进入有门禁接入；不再等待决定 |
| [60](work-orders/60-profile-settings.md) | **PROFILE_SETTINGS_PARTIAL**（A–F 落地 + 两项补记；姿态逐家翻译 claude/codex 已落地，只收紧或拒绝；**翻译产物写入配置由 085 落地**） | [60 报告](../server-round1/fullstack/profile-settings-60.md)：逐工具权限求解（键/动作闭集、last-match-wins、预设回落，绝不默认 allow）+ **schema 16** 冻结进轮；归属纠正测试（会话属工作区、跨家族切换拒绝 `PROFILE_HARNESS_MISMATCH`）；克隆与逐家迁移表 + `profiles.clone`；资产重绑（`reboundAssets` 与迁移报告同源，测试断言一致）与 `profiles.setPermissions` wire；`posture_translation.py`（claude 工具名表、codex 最严格 sandbox+审批；不可表达即 `PERMISSION_POSTURE_UNEXPRESSIBLE`，laxer 永不静默）；提交 f8ed9d2（840）→03c210d（844）→8b73c7d→27dfa26（845）→e39959f（879，八家全链门 exit 0）。**[085 写入证据](../server-round1/fullstack/posture-config-keys-085.md)**：一手钉住 claude `settings.json›permissions.ask/deny` 与 codex 顶层 `sandbox_mode`/`approval_policy`（含版本漂移事实：宿主 codex 0.154.0 已拒 `untrusted`，本部署 0.147.0 接受），`posture_config.py` 只收紧 + 真实工件快照对比（`claude doctor` / `codex debug prompt-input`）；其余六家 `POSTURE_CONFIG_UNPINNED_HARNESS` 类型化拒绝，名单从注册表派生 | 60 的遗留**由 085 收窄为三条**（逐条给入口）：① **生产接线**——085 Scope 明写"不碰 wire"，`posture_config.py` 目前无调用方 ⇒ 归 **093**；② **`ask→allowedTools` 分歧**——`posture_translation.py` 仍把 `ask` 译进 allow 列表，相对中立姿态是**放宽**，与 085 G2 相冲 ⇒ **交回调度者**（一处映射修正，非扩协议；085 不代改别人的契约）；③ claude `permissions.ask` 的**运行时效果**需一次真实工具调用才可见（模型轮）。另：`ask`↔审批往返端到端；P17 前端同步与两仓重锁 |
| [61](work-orders/61-pacthold-rebrand.md) | **PACTHOLD_REBRAND_DONE**（基础设施侧；合同 ID/环境变量/import 路径零变化） | [改名报告](../branding/REBRANDING_REPORT.md)：审计计数与四类处理表、新旧映射（分发名 `pacthold`、六条 CLI 新旧同源一 main）、兼容保留清单（entry-point group/`agent-box.*@1`/`AGENTBOX_*`/数据目录）、本地 wheel `Name: pacthold` + 新名真实启动冒烟；提交 ff0c578（848）+ 30adedf（docs 拼写修正） | 插件分发名改名留后续单；发布/远端改名/数据迁移明示不做；P18 桌面侧一致性归桌面工作树 |
| [62](work-orders/62-workspace-git-status.md) | **WORKSPACE_GIT_STATUS_DONE**（DoD 的"本机与 WSL 各一次"两条腿**均已真跑**：本机 62 报告 §3，WSL 由 **083** 补跑。契约偏差澄清：WSL 路径**结构性永不报** `additions`/`deletions`（无字段级 reason 概念，62 的 `reason` 是答案级），已按 083 记录交回，不改 wire/实现，故不影响本行终态） | [62 报告](../server-round1/fullstack/workspace-git-status-62.md)：`workspaces.gitStatus` 六字段 + reason（null=拿不到不是 0；二进制在场 ⇒ 增删行 null + `GIT_BINARY_DIFF`）；porcelain v2 + numstat；流式上限超限即杀；只读性逐字节证明（index mtime 未变）；提交 76e7c35（854）。**[083 WSL 真腿](../server-round1/fullstack/wsl-legs-62-64-083.md)**：真 `wsl.exe` + 真仓 ⇒ `main`/2 改/`ahead=2`/`behind=0`；非 git 目录 ⇒ `GIT_NOT_A_REPOSITORY` 全 null；无连接器 ⇒ `GIT_UNAVAILABLE` 不编数；答案零宿主路径 | WSL 侧增删行是否补 numstat（**交回调度者拍**：多一次命令 vs 维持两字段恒空，是产品决定不是缺陷修复）；P20 前端同步与两仓重锁（新增 1 个只读方法） |
| [63](work-orders/63-profile-memory-read.md) | **PROFILE_MEMORY_READ_DONE**（本机侧完整；WSL 侧未接，如实记账） | [63 报告](../server-round1/fullstack/profile-memory-63.md)：注册表 `memory_paths`（claude/codex 一手钉住；未声明不画假分区）；`profiles.memory` 只读有界 + 扫描（`MEMORY_CONTAINS_SECRET` 拒绝项无 content）；声明了但缺失=缺席不报错；提交 4d7b0e0（858） | WSL 侧读（按 62 同族设计）；P17 前端同步与两仓重锁（新增 1 个只读方法） |
| [64](work-orders/64-execution-inventory.md) | **EXECUTION_INVENTORY_PARTIAL**（本机 pid 已接；**083 已在真 WSL 组合上跑通清单面**（空列表反例 + `placement="wsl"` + `pid=null`/`PID_NOT_REPORTED`），但 DoD 要的是"WSL 真机轮**含飞行中取样**"，那一条仍未见——组合路径阻塞见 083 证据 §3.1） | [64 报告](../server-round1/fullstack/execution-inventory-64.md)：账本同源（完成后行即刻消失）、本机 `pid` 三态（无端口/报值/报 null）、上限 200 类型化失败、零宿主路径；`executions.list` wire；提交 faaeedf（862）。**[083 WSL 腿](../server-round1/fullstack/wsl-legs-62-64-083.md)**：`build_runtime(connector=真 WslConnector)` + 真 wire 读取；通道本身另有第一手活证（真 c11 `probe()` 握手，`worker_digest` `sha256:c1e353c8…`） | **精确剩余**：真 Worker 飞行中的取样（本侧组合不出：`_builtin_connector` 仅 `os.name=='nt'`、`build_runtime_from_sidecar_deployment` 不收 `connector=`、门脚本 `--placement` 只有 `local\|ssh`；路由缺陷已另拍 **090**）；`adapterPid` 不做；P20 前端同步与两仓重锁 |
| [65](work-orders/65-profile-as-subagent.md) | **SUBAGENT_DELEGATION_PARTIAL**（A/B + C 三块：授权边与两工具契约、委派服务、真桥端到端与并发） | [65 报告](../server-round1/fullstack/profile-as-subagent-65.md)：**schema 17/18**；授予即拒环（`SUBAGENT_CYCLE`）、未授权名零泄露（只内联被授权名）、可选参数只收紧（`SUBAGENT_PERMISSION_WIDENED`/`SUBAGENT_MODEL_WIDENED`）、扇出 ≤4、10 分钟有界；真桥进程→按次令牌→真本机通道子轮→有界摘要（≤4096 字符）+ 用量同源；父 deny 继承（`inheritedFrom`）与审批镜像（同 id 到父轮）；授权 CRUD wire；提交 75253fa（865）→701ae20（872）→6854e4c（875）→07b43fa（877）→e39959f（879） | 真 harness（非夹具）父轮自己发起 `tools/call` 的一圈；P17/P20 前端（授权分区 UI 与"智能体"卡） |
| [66](work-orders/66-shared-session-store.md) | **SHARED_SESSION_STORE_DONE**（A–C 落地、G1–G5 齐；G5 的首跑竞态由 **080** 的按库首跑锁补齐） | [66 报告 §15](../server-round1/fullstack/shared-session-store-66.md) + [并发证据](../server-round1/fullstack/shared-session-store-66-concurrency.json) + [080 报告](../server-round1/fullstack/first-run-lock-80.md)：whole-db 声明与收窄共享集、叠加绑定与播种、切换前置四查、守卫（读穿 WAL、fail-closed）、凭据处置改写（共享库命中不删）；43 代门 marker 债解除（e394f09）；无锁门 `scripts/server-round1/shared-store-concurrency-gate.py` 保留为反例（真 opencode 1.18.21，零模型）；提交 3fcb2df/15b8620/dc65731/e394f09/7398e66 + 080（本轮） | G5 复验：**真 harness 7/7 全绿（有锁）/ 2/3 失败（无锁，同形状）**；远端守卫（Worker 读库）仍 fail-closed；`project` 非单例的事实更正已入报告；首跑锁的就绪=首轮终态（每库一次等待，见 080 §2 取舍） |
| [67](work-orders/67-per-session-admission.md) | **PER_SESSION_ADMISSION_DONE**（45-G3 转 pass，并在当前基线复现） | [67 报告 §9](../server-round1/fullstack/per-session-admission-67.md) + [复跑门报告](../server-round1/fullstack/per-session-admission-67-native-home-gate.json)：`_migrate_9_to_10` 去 per-profile 索引（幂等、只前向，"下次启动不建回来"）、两处 409 文案收窄到会话、`run_state`=任一活跃轮/`native_generation` 完成即 +1、`homeConcurrency` 逐家显式声明（claude/dsh/qwen 收窄锁）；提交 59fe1bb（+e8d0db8 状态）；**当前基线复跑**：native-home 门 OK（复跑 2，G3 两次都 pass：两轮都 completed、`nativeIdsDiffer`、同会话入队、运行中切换 rejected）、定向 38 passed、根套件 879 | 新增维护债（非本单门）：G8 取消竞态"空流"间歇（2 次复跑 1 败；建议召回轮加空流重试）；dsh/qwen 待其本地门首跑后可从 exclusive 收紧回 shared |
| [68](work-orders/068-ledger-catchup.md) | **LEDGER_CATCHUP_DONE** | 本行即本单产物：主表补 60–65 六行（22dc823）+ 刷新 52/54/55（cfa9eba）+ 计数口径节刷新 + G3 下调 62/64（本轮提交）；自查与反例演练见文末 §068 | 068 范围内无剩余；两个发现已如实记录（48 行两处断链证据在主树分支；62/64 的 WSL 真机腿待搭 WSL 轮） |
| [70](work-orders/070-real-endpoint-probes.md) | **REAL_ENDPOINT_PROBES_DONE** | [070 报告](../server-round1/fullstack/provider-model-55.md) + [证据 JSON](../server-round1/fullstack/provider-model-55-real-probe.json)：真实端点一轮（2×GET，0 token，¥0）；G1–G5 五类反例演练各一次（上限/总时限承重、扫描器正控命中、四码互异、无内置默认、配置摘要不变）；先失败后修三处（probeConnection ImportError、credentialId 误必填、总时限未生效）+ 新增 wire 面端到端测试 | 交回项（§6）：`providerModels.update`/`providerArtifacts.install` 运行时与发布 schema 对齐（需语义决定）；窗口/能力字段缺失；P17/P20 重锁 |
| [69](work-orders/069-wsl-observation-54.md) | **WSL_OBSERVATION_DONE**（否定观测 + 根因钉到文件:行） | [069 报告](../server-round1/fullstack/wsl-change-set-observation-069.md) + [证据 JSON](../server-round1/fullstack/wsl-change-set-observation-069.json)：pi 门 c11 真跑一轮（exit 0）+ 账本直查（3 turn 的 `change_set_object_digest` 全 NULL）；插桩复跑 + 同进程三态探针钉出根因 `sidecar.py:631-632`（空快照 `{}` 被真值折叠 ⇒ `workspace_change_set()` 提前返回、不发 after-listing）；Worker `workspace.list` 直探 OK ⇒ **非协议缺口**；G3 `git diff --stat -- src plugins` 为空 | 交回：`is not None` 一行修 + 空快照测试 + 复跑（见 069 §4）；54 行已同步修正表述 |
| [72](work-orders/072-windows-48-closeout.md) | **WINDOWS_48_CLOSEOUT_DONE** | [48 报告 §七/§八](../server-round1/fullstack/windows-placement-48.md)：两轮退出码 `-1073741502`/`0xC0000142`、H1 排除、两条结案判据、"容器承载不再追测"与"低于 Linux 侧"明示；声明核对逐处第一手（read/write isolation 仍 false、`isolation: none`、`filesystem.readonly@1` unavailable）；四份原始 JSON 入本树（含修掉 48 行两处断链）；提交 54127eb/24bc31e/本轮；G3 `git diff --stat -- src plugins tests` 为空 | 无剩余（本单只写证据）；**自查发现**：48 行此前写"报告显式写低于 Linux 侧"而文档实际缺失（已由 §七 补齐并如实记录） |
| [80](work-orders/080-first-run-lock.md) | **FIRST_RUN_LOCK_DONE** | [080 报告](../server-round1/fullstack/first-run-lock-80.md)：按库首跑锁（键=（放置,家族）；首轮独占至终态、并发首跑有界等待 `FIRST_RUN_LOCK_TIMEOUT`、终态后 ready 放行）；落点 `first_run_lock.py` + `sidecar_backend._start_run/_complete_then_retire/stop` + `sidecar.whole_db_store`（仅 whole-db）；门：**真 harness 7/7 全绿（36 s）/ 无锁同形状 2/3 失败**、接线轮两首跑窗口不相交 + 去门即相交（反例）、超时类型化；套件 **887 passed**（+5）；提交本轮 | 设计取舍与已知边界见 080 §2（就绪=首轮终态：每库一次等待；同键新库不再锁）；未做：真 opencode 经 WSL worker 打进 Server 的全栈并发轮（组合论证替代，如实记账） |
| [81](work-orders/081-relock-register-frontend.md) | **RELOCK_REGISTERED_PARTIAL**（差异已登记；**两端仍未锁定**） | [wire-review Order 81 节](../server-round1/wire-review.md)：逐字复核（**前端 P21 交回的是阶段 2 对**：TS `6e8ae84a`/工件 `f5d27269`，59 方法——订正工单前提里的 `b284f70c`；后端最后登记 `64dc9961`/`42a164a4`；本树副本 `a1bd52a4`，33 方法）；方法集 59 ⊂ 代码 64（缺 5 个=前端"刻意不编入"）；反例演练=旧值冒充已一致即与现物矛盾；G2 `git diff --stat -- src plugins tests` 为空；提交 2866457/e5fd5f1/本轮 | 交回 4 项：①换工件**本体**（摘要在两工具链间不可复现）②替换本树旧副本（strict 5 项失败之因）③定生成/比较口径 ④补 Order 57/58/59/65 小节（wire-review 0 命中） |

## 当前长期goal状态字段（执行者每阶段维护）

- backend_implementation: **BACKEND_IMPLEMENTATION_READY**（2026-09-15，用户显式授权开始联调后登记）（39/40组件门完成；41的28方法+队列终态已按
  锁定摘要29/29；Windows r4 平台门通过，**BACKEND_WINDOWS_R4_READY**。42-D 已补
  **RUNTIME_ARTIFACT_PROJECTION_READY**（工件投影底座）与 **四家生产封装全部完成**
  （Pi/Hermes/OpenCode/Codex \*_PRODUCTION_CHAIN_PREPARED，真实 adapter/agent + c5/c6/c7/c8 Worker +
  bwrap + 本机假端点两轮，同一 native id、上下文与真实重开方法）。
  **2026-09-15：四家真实模型门全部执行并通过（`--live`，官方 base URL、不覆盖配置、不装载 guard、
  授权 locator 只读注入）**——Pi/Hermes/OpenCode/Codex 四门 exit 0，各两轮真实 DeepSeek 答复、
  同 native id 续接、凭据零泄漏、清理干净、授权 locator 未被删，累计费用 <¥0.05；
  证据见 [live-model-preflight.md](../server-round1/fullstack/live-model-preflight.md) §6。
  2026-09-15 完成 **state capture 类型化错误边界返修（c7 起步，经 Reviewer 复审修复后现行 c8）**：
  runtime-artifact/Pi/Hermes/OpenCode 四门 + Windows r4/PostCheck 用 c8 串行 exit 0；Codex 门：用户已裁决 A、`.tmp` 与 `shell_snapshots` 已遮蔽、最终 4 轮全绿
  （10 绿→5 红→最近 3 绿，见 codex_native_state_findings）；详见
  [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)。
  四家真实模型门（Worker 5s 租约缺陷已修：`WORKER_LEASE_KEEPALIVE_FIXED`）已按上一行执行完毕；
  要登记 **BACKEND_IMPLEMENTATION_READY** 还差固定 Reviewer 的阶段闭环，
  任一封装就绪或单家通过都不折算为整门通过）。
- backend_ready_closure_source: **用户授权（2026-09-15）**——用户确认"前端已经完成、后端收尾完成后即可开始联调"，
  据此登记 `BACKEND_IMPLEMENTATION_READY` 并进入双门接管。**closure 来源如实标注为「用户授权 + 执行者自审」**：
  固定 Reviewer 因额度硬限制（`try again at Sep 20th, 2026 12:11 PM`，三次投递阶段包均无 verdict）未提供本阶段
  `ACCEPT`；阶段包与全部证据已固化为
  [stage-closure-dossier.md](../server-round1/fullstack/stage-closure-dossier.md)，额度恢复后补一次只读复审。
- fullstack_integration_owner: **后端执行者（Zcode 后端 goal 会话）**，接管时间 2026-09-15 20:4x +08:00。
  接管时只读复核：前端 HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`、分支
  `feature/agentbox-desktop-product`、`git status --porcelain` 0 行、`writer_lease=RELEASED`、
  `DESKTOP_IMPLEMENTATION_READY`、r3 `28 PASS / 0 FAIL / 0 SKIP / 0 PENDING`（`allOk=true`）、
  wire 两摘要就地重算一致（TS `11e3b3e7…` / 工件 `5d4fa3bf…`）、无 electron/node/tsc 写入者。
  后端侧对应证据：四家 `--live` 门、Windows r4 + `-PostCheck`、`tests` 576/3/0。**发布源 main 仍只读**；
  接管范围限 42 `conditional_cross_repo_write.write_paths`。
- frontend_handoff: **DESKTOP_HANDOFF_CONSISTENT（按其自述成立；后端仍未接管）**——最新只读复测
  2026-09-15 19:00 +08:00（本轮，未写前端任何文件）：HEAD 仍 `8e7c138c96337fc20ed61d3c21100e6449c8ec95`、
  `git status --porcelain` 0 行、分支 `feature/agentbox-desktop-product`、lease 行仍为
  `writer_lease=RELEASED`、`DESKTOP_IMPLEMENTATION_READY`、`REAL_FLOW_VERIFIED=否`；
  就地重算 TS 摘要 `11e3b3e7…` 与 schema 摘要 `5d4fa3bf…` 仍与锁定值一致；
  `evidence/P06-assets-r3/results.json` = `{PASS:28, FAIL:0, SKIP:0, PENDING:0}`、`allOk=true`、`executed=28`；
  进程表无 electron/node/tsc 写入者。上一轮 2026-09-15 02:51 +08:00 复测：HEAD `8e7c138c96337fc20ed61d3c21100e6449c8ec95`
  （00:51:21 release 提交），`git status --porcelain` **0 行**（含 untracked），
  `writer_lease=RELEASED`、`DESKTOP_IMPLEMENTATION_READY`、`REAL_FLOW_VERIFIED=否`、
  r3 证据 `executed 28 → allOk=true，counts={"PASS":28,"FAIL":0,"SKIP":0,"PENDING":0}`，
  `evidence/DESKTOP_IMPLEMENTATION_HANDOFF.md` 在场且与 status 终态一致；
  wire 两摘要就地重算仍与锁定值一致（`11e3b3e7…` / `5d4fa3bf…`）。
  上一轮 00:50 观察到的 `DESKTOP_HANDOFF_INCONSISTENT`（lease 释放被自己暂停、工作树 6 改 + 1 未跟踪）
  已被该 release 提交收口，属历史观察。工作树内仅 2 个长闲置进程（zcode-cli/bash，均始于 09-14），
  无 electron/node 写入者、release 后无文件更新；按纪律**未终止任何进程**、**未取得写权**、
  未记录 `FULLSTACK_INTEGRATION_OWNER`、未写前端任何文件。接管仍以双门成立为前提。
- frontend_observed_state: **DESKTOP_IMPLEMENTATION_READY（前端自述；本轮复测与其 status/handoff
  一致）**（只读观察，2026-09-15 02:51 +08:00）。
- frontend_worktree: /home/maoqh/projects/agent-box-desktop-next-wsl-round1 @ feature/agentbox-desktop-product。
- frontend_checked_at: 2026-09-15 02:51 +08:00；observed_head:
  `8e7c138c96337fc20ed61d3c21100e6449c8ec95`；`git status --porcelain` 本次 **0 行**。
- 42 双门判定（后端门证据更新于 2026-09-15，四家 `--live` 门通过；前端观察仍为 02:51 +08:00）：
  BACKEND_IMPLEMENTATION_READY=**否（暂时：四家真实模型门已执行并通过，四家生产封装、HOME 隔离与
  state 错误边界（现行 c8）均已完成；只差固定 Reviewer 的阶段闭环）**；
  DESKTOP_IMPLEMENTATION_READY=**前端自述是，本轮复测一致（clean、lease released、r3 28 PASS、
  同 wire）**。**仍未进入全栈联调**、未写前端文件。
- wire_version / schema_digest: 当前28方法提交 `3aba5c5c` 为 **WIRE_LOCKED_FOR_IMPLEMENTATION**，TS
  `11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035`、生成工件
  `5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed`。15:48 在前端工作树**就地
  重算**二者摘要仍与上值一致，故锁未变：未重锁、未改合同。
- code_checkpoint_pair: 后端 r4 相关检查点分三层、不可互相替代——native-state 实现基础=`3e4282b`、
  r4 验收脚本/测试代码=`713b2e3`、已提交脚本上的 r4 复跑证据=`87b17a3`（`3e4282b` 不是 r4 检查点）；
  42-D 工件投影检查点=`dba9c0f`+`f846f09`；Pi 生产封装检查点=`0f499b7`+`9f3dd9c`（封装实现 + 证据），
  Pi gate 清理返修=`828bc5b`+`f6f7411`；
  **能力合同轮检查点**（全部在当前 HEAD 的祖先链上）：canonical 合同=`6453d58`、四家视图派生=`9e9da63`、
  跨传输收窄测试=`b2f73dc`（含 `accept-e.ps1` 的 canonical 声明与有状态 harness 的 `native_continuation`）、
  矩阵/状态收口=`1f09647`；**能力诚实性返修检查点见本轮提交**（真值表修正 + 命名空间边界 + 账目修订）；
  Hermes 封装检查点=`19f945a`、OpenCode 封装检查点=`d3a543a`、通用原生 driver 接缝检查点=`fc62037`、
  两家证据/status 收口检查点=`625cc2b`；提交态假绿返修 + driver status 合同检查点=`407c379`
  （其后的 docs 提交只记录本轮复跑证据，不另立检查点）；
  前端合同检查点=`3aba5c5c`；（历史）前端观察 HEAD=`bd1b28b4`（09-14），已于 09-15 02:51 复测取代：前端最终交接观察 HEAD=`8e7c138c96337fc20ed61d3c21100e6449c8ec95`（release 提交、clean、`writer_lease=RELEASED`）；本阶段检查点=`63e3bf0`（错误边界修复）+`eefe652`（docs/c7 证据），其后为本轮返修提交。
- pi_production_chain: **PI_PRODUCTION_CHAIN_PREPARED**（真实 `@automatalabs/pi-acp@0.5.0` + 真实 Pi
  依赖闭包 → c4 release Worker + bwrap → 本机 loopback 假 DeepSeek 端点；Pi 运行时工件 317 包 /
  15458 条目 / 64.9 MiB / tree digest `sha256:afe238d3…`，双构建一致、只读、非仓库内输出；
  两轮同一 Server Session 与同一 native id，provider 请求恰 2 次、`model="deepseek-flash"`、
  `max_tokens=64`、thinking 禁用、第二轮上下文含第一轮 user+assistant、重开为重放语义的
  `session/load`（**不是** `session/resume`）；未知模型在发 HTTP 前拒绝；缺凭据 Server 以
  `CREDENTIAL_REQUIRED` 拒绝。（封装轮结论为 `MODEL_NOT_VERIFIED`，`workbench_model_verified_count=0`；**已由 2026-09-15 `--live` 真实模型门 `PI_PRODUCTION_CHAIN_GATE_OK` 取代**）。
- pi_gate_cleanup_fixed: Pi 全链 gate 首次提交存在**清理假绿**——`shutil.rmtree(..., ignore_errors=True)`
  删不掉临时根内由 Pi 构建器发布的 0555/0444 工件，命令仍 exit 0 并留下 `/tmp/agentbox-pi-gate-*/`，
  证据文档却写成 `run.removed=true`（取自更早一次使用外部 `--artifact` 的运行）。已返修：禁用
  `ignore_errors`、显式处理只读工件、只在身份校验通过后删除、任何残留非零退出、`--keep`／外部
  `--artifact` 语义保持；补 12 项定向测试（含注入删除失败、主失败与清理失败并存）。修复后默认与
  外部 `--artifact` 运行均 exit 0 + `run.removed=true` 且无残留。
- pi_production_defect_fixed: 真实 Pi 暴露既有公共缺陷——ACP 以空对象播发 session 能力
  （`sessionCapabilities.resume = {}`），Server 侧 `bool({})` 判为不可续接，导致第二轮以
  `SIDECAR_CHECKPOINT_INVALID` 失败；已改为"存在且非 False 即视为已播发"（中立、无品牌分支），
  参数化 7 例回归 + 端到端复核。
- hermes_production_chain: **HERMES_PRODUCTION_CHAIN_PREPARED**（真实 `hermes acp`
  （hermes-agent 0.19.0）+ **隔离 Python 运行闭包** → c4 release Worker + bwrap → 本机 loopback 假
  DeepSeek 端点；闭包 60 包 / 4765 条目 / 108 441 979 字节 / tree digest `sha256:b3fb1e4b…`，
  只读、非仓库内输出、双构建一致、`python3 -S` 自足性导入通过，**未挂用户 site-packages**；
  两轮同一 Server Session 与同一 native id，每轮恰 1 次 provider 请求（合计 2、超预算 0、未授权 0）、
  第二轮含第一轮 user+assistant、重开为直接观测到的 ACP `new_session → resume_session`；
  注入 5xx 实测不重试（声明上界 2）；未知模型与产品模型都在发包前被拒；缺凭据
  `CREDENTIAL_REQUIRED`；state 10 文件零 token 命中。**产品模型即线上值**：Hermes 会静态折叠非
  一等公民 id，故按用户裁决改用其官方支持的**用户自定义 provider 声明**（块键与 `model.provider` 都用
  Hermes 实际持久化的裸 `custom`——`custom:<key>` 在 resume 轮解析不到块会退化为默认端点+占位密钥，
  第一版实现正是这样丢过凭据，现由 `HERMES_GATE_CREDENTIAL_NOT_DELIVERED` 硬断言守住）；两轮请求体
  `model` 精确为 `deepseek-flash`，`observedModels` 三相位均为 `deepseek-flash`，历史
  `EFFECTIVE_MODEL_ID="deepseek-chat"` 接受逻辑已删除。代价：native 选择 `custom:deepseek-flash`、
  provider 身份 `custom`、上下文元数据回退 128K（内建表 1M）。（封装轮为 `MODEL_NOT_VERIFIED`；**已由 2026-09-15 `--live` 门 `HERMES_PRODUCTION_CHAIN_GATE_OK` 取代**）。
- opencode_production_chain: **OPENCODE_PRODUCTION_CHAIN_PREPARED**（真实 OpenCode 1.18.21
  **单文件二进制** 184 498 304 字节 / digest `sha256:c9485f62…`，经既有 `executableMounts`
  摘要固定只读挂进 bwrap 到 `/runtime/bin/opencode`（guest 内复核 `--version=1.18.21`、写 `/runtime/bin`
  得 EROFS）；**不伪装 ACP**：新增中立 driver 接缝 + 上游 `ManagedOpenCodeHost` 托管 `opencode serve`；
  两轮 delta 4,5,6<9 与 13,14,15<18、第二轮含第一轮上下文、checkpoint 4 文件（SQLite）`resumable=true`、
  重开相位 `createsInsideReopenPhase=[]` 且 `hostStarts≥2`；provider 恰 2 次、`requestsBeyondBudget=0`；
  受控重试实测上界 **6**（取代 42d 无证据的 12）；未知模型/缺凭据/坏 checkpoint/漂移二进制全部拒绝；
  token 在事件/状态/报告/Git 零命中；清理 `removed=true`。（封装轮为 `MODEL_NOT_VERIFIED`；**已由 2026-09-15 `--live` 门 `OPENCODE_PRODUCTION_CHAIN_PREPARED` 取代**）。
- opencode_gate_token_false_green_fixed: **提交态假绿已复现并返修**——OpenCode 全链门把固定假 token
  （`opencode-gate-fake-token-…`）写进自身 tracked 源码，同时 cleanup 断言"tracked Git 零命中"，
  于是源码未提交时能绿、提交后必然命中自己：在最终提交态复现为
  `tests/server/test_opencode_gate_cleanup.py` 4 项失败（均被 `OPENCODE_GATE_TOKEN_IN_GIT` 顶替）。
  返修：token 改为**每次运行现生成**（`agentbox-opencode-gate-fake-token-` 前缀 + `secrets.token_hex(16)`），
  生命周期收在 `main()` 的一次运行窗口内（进入时创建、清理核验后清空；窗口外取用即
  `OPENCODE_GATE_NO_ACTIVE_RUN`）；扫描改为检查**本次实际注入的完整值**（`token_appears_in_tracked_content`），
  不打印、不进 argv、不读真实 locator。补 5 项提交态回归：动态值不在 tracked 内容、两次运行 token 不同、
  扫描入口在测试独占仓库上的真/假两性、index 写入守卫，以及**阳性反证在 `tmp_path` 内的测试独占 Git
  仓库执行**（真 `git add`/`git commit` 后由生产扫描入口命中，门以 `OPENCODE_GATE_TOKEN_IN_GIT` 非零
  失败）；**AgentBox 主仓 index 与工作树从未被写入**，该文件每个测试前后比对 porcelain 与 cached diff
  必须逐字节相同（早先"主仓 `git add -N` 后再 `git reset`"的写法已按此返修，历史说明保留在 progress）。
  隔离返修后复跑：五文件定向 **80 passed**、OpenCode gate cleanup + native driver 定向 **39 passed**、
  `build-opencode-authorization.test.mjs` 9/9、OpenCode 与 Hermes 两条全链门 **exit 0**
  （`cleanup.tokenInTrackedGitContent=false`）、`git diff --check` 干净、tracked 内容与门输出都没有
  生成值、主仓 porcelain/cached diff 在测试前后逐字节相同。
- native_driver_contract_tightened: driver 必需方法集合加入 **`status`**（envelope 暴露的操作；
  缺它时注册即以 `DRIVER_METHOD_MISSING` 拒绝，不再等到轮次中途失败）；测试**从接缝模块读取
  方法表**并对测试 fixture 与真实 OpenCode driver 各构造一次实例核对齐备。
- native_driver_seam: 新增**中立原生 driver 接缝**（`runtime/native-driver.mjs` + `worker-entry.mjs`
  op 路由 + `adapter.driver` 打包 + `message_delta`/`driver_exit` 映射；只从同一 bundle 的
  `deployment/` 加载、凭据只经 `spawnProcess` 进子进程、事件深红删），Server/Core/Worker/bwrap
  仍然只见通用 deployment 字段、无任何 Harness 品牌分支；通用测试 17 项，ACP 路径回归 91 passed、
  Node 25/25。证据见 [native-driver-seam.md](../server-round1/fullstack/native-driver-seam.md)。
  driver 路径已用一次性探针在真实 Worker+bwrap 上验证（模块投递、凭据到孙进程、state 回投）。
- worker_view_contract_hardened: **Worker view 列表合同收紧**——普通目录递归、普通文件列出，**符号链接不跟随
  不读取不捕获**（允许跳过 Codex 运行期的 argv0 别名），但**每一个访问到的条目（目录/文件/符号链接/特殊
  文件）都计入统一 traversal 上限**（`MAX_VIEW_TRAVERSAL_ENTRIES = 4096`，超过即类型化失败）；FIFO/socket/
  设备等**特殊文件类型化拒绝整个 listing**（原先被静默跳过，等于报告一个并不存在的目录）；`view.get`
  继续拒绝 symlink 与一切非普通文件；被跳过的符号链接不被删除，cleanup 仍然可用。Rust 测试 15 passed。
- state_capture_content_stable: **state 捕获改为内容稳定性门**——不再只比较 `(path, size)`（同长度改写会
  被误判稳定），改为完整 snapshot `relative path + size + digest`、连续两次身份相同才算稳定，且**返回的
  字节就是与稳定 snapshot 相符的那一份**；任一文件在分块读取中 digest 改变则继续等待（有界）；deadline
  到期抛 **`SIDECAR_STATE_NOT_SETTLED`**，**绝不静默生成 checkpoint**；空 state 连续两次空 snapshot 即
  稳定；256 文件/8 MiB/受保护路径/凭据扫描规则全部保持。定向测试 7 项。
- worker_bundle_c6: 因 Worker 合同收紧重建 **`.acceptance-bundle-c6`**
  （`sha256:96256b2ea76218448183fc0b1063aba92c15fca3fb22fa8a00f7e0f7efc2466e`）；**c4/c5 未覆盖**、仍为
  历史有效证据。版本口径：ABW1 frame 与 manifest **`wireVersion = 1`**，Worker control
  **`PROTOCOL_VERSION = 3`**（本轮未改响应形状，故 control protocol 不升版）。
- windows_r4_c6: Windows r4 用 **c6** 通过（exit 0、`worker_digest=sha256:96256b2e…`、
  `state_projection=/runtime/home/sessions`、`session/new→session/resume`、delta 10 < completed 12、
  8 秒静默在默认 5 秒租约下 `elapsed_ms=8857` 完成）+ 独立 `-PostCheck …CLEAN`。
- state_capture_error_boundary: **确定性 view 失败不再被 settle 循环吞掉**（2026-09-15）。Worker 把
  特殊文件/`VIEW_SPECIAL_FILE`、traversal 上限/`VIEW_TRAVERSAL_LIMIT`、文件数上限/`VIEW_FILE_LIMIT`
  改为各自的准确码并立即失败；Worker 侧唯一重试码 **`VIEW_CHANGED`** 只表示"fd 打开后
  读取中身份（dev/ino/size）改变"；不存在的路径=确定性 `VIEW_MISSING`、首次越界
  offset=`VIEW_INVALID`，二者由 capture 层在"刚列出过/已持有分块"的上下文转换为
  `SIDECAR_STATE_IDENTITY_CONFLICT` 重试（Reviewer 复审后语义，取代本条初版描述）；sidecar `_STATE_TRANSIENT_CODES` 收窄为
  `{SIDECAR_STATE_IDENTITY_CONFLICT, VIEW_CHANGED}`——`VIEW_INVALID`/`VIEW_IO`/`VIEW_INCOMPLETE`
  不再被无条件当作瞬态，拒绝类失败**不再被改写成 `SIDECAR_STATE_NOT_SETTLED`**；分类只读 code
  不读英文 message；4096/1024/256/8 MiB 上限、symlink 与特殊文件语义、凭据/受保护路径规则全部保持。
  先失败后修：Rust 8 failed→pass、Python 13 failed→pass（跨层测试从 Worker 源的被审计位置提取真实码
  驱动真实循环；另有两个测试驱动**真实 Worker 进程**端到端验证）。响应形状未变、
  ABW1 `wireVersion=1` 与 control `PROTOCOL_VERSION=3` 均不升版（envelope 逐帧测试锁定）。
  如实记录：Codex 门曾出现 2 次"capture 时 view 超 1024 文件"的间歇失败（c6/c7 两个 Worker 都出现，
  非本修复引入；修复只让失败从 10s 后的 NOT_SETTLED 变为立即准确码），随后 10 轮复跑未再现、
  view 峰值稳定 114 文件；gate 现常驻采样并报告 `stateProjectionObservation`。
  详见 [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md)。
- worker_bundle_c7: 【历史检查点，现行 bundle 由 worker_bundle_c8 取代】因错误码边界重建 **`.acceptance-bundle-c7`**
  （`sha256:6408fbc7da63e9b85c52ab1902ab12e3faa5160021187328b03b5fa9dc9848d4`）；**c4/c5/c6 未覆盖**、
  均为历史有效证据（复跑前后摘要逐一核对未变）。版本口径不变：ABW1 frame 与 manifest
  **`wireVersion = 1`**，Worker control **`PROTOCOL_VERSION = 3`**（只新增错误码值，响应形状未变）。
- windows_r4_c7: 【历史检查点，现行由 windows_r4_c8 记录取代（见 worker_bundle_c8 条）】Windows r4 用 **c7** 通过（exit 0、`worker_digest=sha256:6408fbc7…`、
  `stop_mode=tree_terminate`、`state_projection=/runtime/home/sessions`、
  `session/new→session/resume`、delta 10 < completed 12、8 秒静默在默认 5 秒租约下
  `elapsed_ms=8840` 完成）+ 独立 `-PostCheck …CLEAN`。
- worker_bundle_c8: Reviewer 复审修复（fd 锚定 no-follow + `VIEW_MISSING` 合同 + gate 诊断因果化）后重建
  **`.acceptance-bundle-c8`**（`sha256:514f48a9c24c8a13edefa4eb3aa5473b0f3a25d88a94aea1a19bb16ea2707975`；
  Worker 源在 c8 构建后未再变——`git diff <fix-commit> -- workers/ 为空`，故 c8 摘要仍为现行 bundle；
  **c4–c7 未覆盖**，摘要逐一核对未变）。c8 上串行复跑：runtime-artifact/Pi/Hermes/OpenCode exit 0、
  Windows r4 exit 0 + 独立 `-PostCheck…CLEAN`（实例核对）；Python 全量【历史值】
  **820 passed/4 skipped**（现行 845/6）；Rust **27 passed**。Codex 门【历史快照：当时为
  未解决的红绿间歇（10 绿→5 红→最近 3 绿）；现行结论见顶部与 codex_decision_a_implemented】。
- codex_native_state_findings: 两个第一手发现【历史条目：用户已裁决方案 A，`.tmp` 与
  `shell_snapshots` 均已按 attempt-ephemeral 遮蔽；现行结论见 codex_decision_a_implemented】（证据见
  [state-error-boundary.md](../server-round1/fullstack/state-error-boundary.md) §4.3）：
  ①Codex 0.147.0 运行时把内置 plugin/skill 语料解包进 `$CODEX_HOME/.tmp/plugins/`（实测峰值
  **5529 文件**，瞬态；绿跑峰值 114），与列表上限 1024 相撞即确定性 `VIEW_FILE_LIMIT`；
  ②约 1/15 轮 sidecar 凭据扫描在原生 state 命中假 token（`SIDECAR_STATE_CONTAINS_SECRET`，
  扫描正确拒绝；该路径后由门内观察器第一手捕获为 `shell_snapshots/*.sh`，已遮蔽）。①在 2026-09-15 晚间连续 5 轮与捕获重叠（每轮峰值恰 5529，均以 `VIEW_FILE_LIMIT` 失败）
  【历史快照，现行结论见本文件顶部的红绿间歇】，未掩盖。二者直接影响 Codex 付费真实模型门的前置条件；Reviewer 复审亦以 HARNESS_QUESTION
  给出方案 A（部署层 attempt-ephemeral 投影 `.tmp` + fail-closed 扫描；不提高通用上限、
  无品牌分支）/B（官方配置关闭解包与凭据持久化）/C（Codex 暂 MODEL_NOT_VERIFIED），
  推荐 A——**用户已裁决 A 并已实施**。
- codex_decision_a_implemented: **用户已裁决 A（2026-09-15）并已实施、已验证**——`stateProjection`
  新增可选 `ephemeralPaths`（部署声明、沙箱语法验证），bwrap 在全部 bind 之后对该子路径
  追加 `--tmpfs`：Harness 可写，但**不进 view/state/checkpoint，尝试结束即消失**；
  1024 列表上限与 fail-closed 凭据扫描不变。Codex 生产模板声明 `ephemeralPaths: [".tmp"]`。
  反例与证明：真实 bwrap 遮蔽测试（burst 文件不落宿主 state、普通兄弟文件正常落盘）、
  argv 顺序断言（tmpfs 在 state bind 之后）、越界/RO 冲突拒绝、deployment 解析缺省兼容。
  **泄漏路径第一手捕获**：`native-state/shell_snapshots/*.sh`（Codex 环境快照含注入的
  凭据环境变量原文）→ 方案 A 扩展为 `ephemeralPaths: [".tmp", "shell_snapshots"]`。
  **c8 最终复跑（4 轮，含快照遮蔽）**：全部 exit 0、view 峰值 **112**、`tokenInState=false`、
  credentialPathHits=0、state 78 文件。Python 计数【现行 2026-09-15 20:48，HEAD fdecb55：`tests` **577 passed/3 skipped/0 failed**，插件 artifacts 2 / git 4 / harnesses 127+3 skipped / runtime-local 6 / runtime-wsl 36 / sandbox-bwrap 112 / skills 8 / terminal-session 3 / web 14，另 web 的 2 个 Playwright 浏览器用例因本机缺 chromium headless shell 二进制而环境不可用；历史计数 820/833/838/840/843/845/849/852/854 均为更早 HEAD 且已被取代】；Rust 计数沿用 27 passed（本轮未改 Worker/Rust 源，`git diff -- workers/` 为空，故未重跑）；**现行（2026-09-15）：Codex 已按官方 feature flags 从源头修复；`shell_snapshot` 的因果已由逐变量差分证明。Harness 工件 = Codex 0.147.0（生产固定）；Reviewer CLI = codex-cli 0.154.0（两者不同层）。**：`features.plugins=false` 与 `features.shell_snapshot=false` 已入受审配置，无遮蔽对照轮实测 `.tmp/` 与 `shell_snapshots/` 目录均不存在、零凭据命中、门 exit 0（Python 全量 **843 passed/6 skipped/0 failed**）。**差分（同 0.147.0、同 HEAD、无 tmpfs 遮蔽）**：控制腿（去掉官方 `[features]`）第一轮即在 `native-state/shell_snapshots/*.sh` 命中注入假 token（门 exit 1），处理腿（部门原样配置）2 轮全绿零命中 → `CODEX_FEATURE_FLAG_DIFFERENTIAL_OK`；**逐变量差分**（`--strip shell_snapshot`：`plugins` 保持 false 不变，仅 `shell_snapshot` 回到官方默认开启）：控制腿 2 处凭据命中、处理腿零命中 → **`features.shell_snapshot` 单独即凭据写入原生 state 的成因**；`plugins` 的 `.tmp/plugins` 突发本轮控制腿未复现，**其因果本轮未被复现**（历史第一手观测与 tmpfs 纵深防御保留）。settled 判据现为**两阶段（turn 链 + reopen）合并**、Harness 退出后由独立扫描器同步完成。此前的“口径”说明如下（历史）：**Codex 门口径已按用户裁决 A 收口（判据=“全树走完且与上一轮字节身份完全一致”的稳定轮次至少被观测一次；活动写入竞态只入报告），真机 3 轮 2 绿 1 红，红的 1 轮是另一条既存间歇（capture 报 VIEW_INCOMPLETE，与凭据扫描无关，待定位）。原“当前红（口径待裁决）”说明如下（历史）：凭据观察器按 Reviewer 要求把“读取中变化的 state 文件”记为持久事实，而活动 Codex 的 `state_*.sqlite-wal` 运行期持续写入，故判 `CODEX_GATE_STATE_SCAN_INCOMPLETE`（files 83、cycles>200、零凭据命中、零 hit）；capture 期 sidecar 扫描仍是权威且 fail-closed；
  Worker 源未变（c8 摘要不变）；四门 + Windows r4/PostCheck 已在最终 HEAD 复跑全绿。
  **另在改动事件路径后的 HEAD（c81fdcd/3a33e68）重跑 Windows 门**：`accept-e.ps1 … -Port 18748 -Cleanup`
  exit 0 → `BACKEND_41_E_WINDOWS_WSL_WIRE_OK`（c8 `worker_digest=sha256:514f48a9…` 未重建、
  有状态 fixture `session/new→session/resume` 同 native id `stateful-13`、delta 10 < completed 12、
  `stop_mode=tree_terminate`、8s 静默 `elapsed_ms=8799`、7 项清理守卫全部按预期）+ 独立
  `-PostCheck -InstanceId <两实例>` exit 0 → `BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN`。
- codex_decision_pending: **已由用户裁决 A（历史条目）**——
  Codex `.tmp/plugins` 突发（VIEW_FILE_LIMIT）与凭据瞬时入 state（SIDECAR_STATE_CONTAINS_SECRET）
  的处置方案 A（部署层 attempt-ephemeral 投影 `.tmp`，Reviewer 推荐）/B（官方配置关闭，未找到
  已验证开关）/C（Codex 暂 MODEL_NOT_VERIFIED）；**用户已裁决 A**，原挂起项关闭。ex 付费门与 preflight、
  `REVIEWER_AUTOMATION_READY` 登记、真实 locator 读取全部挂起；其他三家不受影响。
  Reviewer 第十轮结论：本阶段除该 P0 外无任何 FINDING/矛盾（REVIEWED_HEAD=47d6b64）。
  裁决 A 已实施并经多轮复审修复（壳快照泄漏路径已捕获并遮蔽）。**Pi 已取得真实模型门证据（2026-09-15）：`PI_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——两轮真实 DeepSeek 答复、次轮带上下文、重开重放观测、未知模型发包前拒绝、凭据零泄漏、授权文件未被删；**Hermes 同轮通过：`HERMES_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——两轮真实答复、同 native id 续接、凭据零泄漏、清理干净、授权文件未删；guard/假端点专有观测在 live 下显式记为未观测（不静默通过）。**OpenCode 同轮通过：`OPENCODE_PRODUCTION_CHAIN_PREPARED`（mode=live）**——两轮真实答复、checkpoint resumable、缺凭据派发前拒绝、凭据零泄漏、清理干净。**Codex 同轮接入 `--live` 并通过：`CODEX_PRODUCTION_CHAIN_GATE_OK`（mode=live）**——首轮 14 deltas、次轮 15 deltas 且回忆首轮 nonce、同 native id 续接、真实 `session/load` 重开（该相位 provider 流量标注为 loopback 机制审计）、真实流式答复中途取消 `202 → cancelled`（0.08 s）、未知模型派发前拒绝、`tokenIn*` 全 false、78 文件 state 零命中、`authorizedLocatorDeleted=false`、清理全 true；**四家真实模型门至此全部取得证据**，累计 <¥0.05。接入时修掉三个真实缺陷：live 下 4 处假端点专有断言、失败相位报告无法序列化（只剩 traceback）、凭据事实只记录不断言。
- stage_closure_dossier: **等待 closure 裁决的卷宗（2026-09-15）**——
  [stage-closure-dossier.md](../server-round1/fullstack/stage-closure-dossier.md)：同一份文件既是额度恢复后
  可直接投递的阶段包，也是用户裁决"以自审代替本轮 closure"的依据；含声称项与逐项命令/退出码/计数、
  本阶段自查发现并修复的 10 处缺陷（非橡皮图章证据）、明确未运行项与三个需前端裁决的合同项。
- ui_model_gate_blocker: **四家真实 UI 模型门本轮被产品面缺口阻断（非执行者放弃、非 Harness 问题）**——
  两端逐点核对：wire 28 方法**无凭据面**、Server 凭据记录靠带外写入（CLI / `CredentialRecords.register`）、
  REST 无凭据端点、**Desktop 的 Provider/Model 设置页恒发 `credentialId: null` 且无凭据控件**
  （`features/settings/agentbox-model-settings.tsx:126/285`）。因此从 UI 发不出需要凭据的真实模型轮。
  方案 A（Desktop 拥有凭据记录 + 一处只读列举面，推荐）/ B（wire 增 `credentials.*`，需重锁合同）/
  C（仅联调期绕过 UI，不得记作 UI 门）见
  [ui-model-gate-blocker.md](../server-round1/fullstack/ui-model-gate-blocker.md)。**待用户裁决**。
- ui_model_gates_2026-09-15: **逐家结果（真实 UI 模型门）**——驱动
  前端 `apps/desktop/e2e/p42-ui-model-gate.mjs`，证据 `apps/desktop/evidence/p42-ui-model-gate/`。
  **Pi 8/8、Hermes 8/8、Codex 8/8 全绿**（凭据均经界面自己的录入路径加入；两轮真实 DeepSeek 答复、
  首轮回忆 nonce、次轮带上下文）；**OpenCode 8/8（修复后通过）**：长答复诊断显示**流式 delta 与持久 final 丢失同一段尾部且逐字相同**（"数到 40"只到 31），而链路 completed、次轮语义正确 → 丢失在两者共同的上游，即 **OpenCode 读取路径**（中立 driver 接缝 / 托管 `opencode serve`），不是模型、不是 Server 投影、不是组装；截断点随答复长度变化且总在尾部，符合"回合结束事件与最后分片竞态"。**原表述为**（链路跑通但首轮助手文本是片段，未验证完整回忆
  **与 harness 自身 parts 比对已定因（同一回合原生状态）**：harness 存 87 字符（结尾 `…31\n32\n`）、我们的帧 83 字符（结尾 `…31`）——停在 32 而非 40 是部署输出上限 64 tokens（不是缺陷）；**我们少最后一片 `"32\n"` 是我们的缺陷**，位于 OpenCode 读取路径（`third_party/harness_remote/bridge/src/` 的 parts 累积/完成判定），回合结束时丢最后一批 part 更新，也解释了此前 nonce 案例总少最后一个字符。**已修（`5a8b6fc`）**：驱动此前只在"零增量"时才用权威 parts 兜底，现以 prompt 返回值为权威，只补流未送达的后缀（规则提取为 `tailSuffix`，驱动契约探针覆盖三种情形）；复跑 OpenCode UI 门 **8/8 PASS**。**四家 UI 真实模型门至此全部通过。**
  → **不记通过**）。**Hermes 的缺口已修并两端重锁**：`profiles.create` 增加可选 `credentialId`
  （缺省/null = 角色不携带凭据；给值校验存在性与 kind），工件新摘要 TS `7746404984…` /
  `14f7f736…`（取代 `11e3b3e7…`/`5d4fa3bf…`），后端对新工件 32 passed，Hermes UI 门复跑通过。
  过程中修掉两个真实缺陷（preload 把凭据 API 错嵌进 `wire`、导入请求缺 `Idempotency-Key`）。
  费用：本轮 ≈20 次真实请求、增量 **< ¥0.01**，四家累计 **< ¥0.08**（上限 ¥10）。
- integration_results_2026-09-15: **无模型全栈 22 步 + 四家真实 UI 模型门 + 重启门全部通过**——
  集成驱动 22 PASS/0 FAIL（§10 方法补齐：browse/archive、provider/role 维护、session 元数据与角色切换、
  `sendOutcome.query`、附件、审批往返、事件流 resync）；四家 UI 门各 8 PASS；Pi 带"两轮之间停并重启
  Server"9 PASS。**自审一轮见** [self-review-2026-09-15.md](../server-round1/fullstack/self-review-2026-09-15.md)
  （用户指示以自审替代 Reviewer 终审）。**最大未覆盖：真实 UI 控件路径**（发送走产品 renderer 传输，
  未驱动输入框/发送按钮/审批弹窗）。
- final_state: **FULLSTACK_CORE_PARTIAL**——双门成立、两边分别提交、无模型全栈联调在真实 Windows
  Electron 上 15/15 通过、后端四家真实模型门全绿、Windows r4/PostCheck 干净；**未完成**：四家真实
  UI 模型门（上条产品面缺口）、Windows 真实用户路径的模型段、以及固定 Reviewer 的最终只读审查
  （额度 2026-09-20 12:11 恢复后补）。不用核心 PARTIAL 冒充 GREEN，也不用后端门冒充 UI 门。
- fullstack_no_model_integration: **无模型全栈联调通过（2026-09-15，本执行者为 42 的
  `FULLSTACK_INTEGRATION_OWNER`）**——真实 Windows Electron（构建树，wire 摘要就地核对一致）经
  `workcore` slot 安装的 lifecycle connection（`{endpoint, sessionToken}` 由主进程从 Server 数据根的
  `secrets/http-token` 读入，未配置即"无服务"且给稳定原因）→ 本机 Server → `wsl.exe` c8 release
  Worker → bwrap → 显式 no-model ACP fixture：**15/15 PASS、exit 0**
  （`server.hello`、Workspace 开/列、Profile/Provider-Model 创建与版本、config describe/resolve、
  真实一轮且 delta 先于 completed、同 requestId 幂等回放只产生一个执行、排队项可见且可撤回、
  停止发布 `queued→running→stopping→stopped`、双游标域混用被拒、归档保留历史、干净关闭）。
  前端检查点 `ed1ccd85`（连接安装）+`b1136759`（驱动与证据）+`957211df`（status）；
  证据 `apps/desktop/evidence/p42-integration/integration-results.json`。
  **未读任何凭据、未调任何模型**；四家真实 UI 模型门仍待单独授权的凭据与预算（与后端侧四家门分账）。
- integration_coverage_map: **§10 联调覆盖对照（2026-09-15）**——
  [integration-coverage-map.md](../server-round1/fullstack/integration-coverage-map.md)：把 §10 每一项标注为
  **B**（后端侧已有可复跑证据）/ **U**（只能由真实 Electron 在环产生）/ **B+U**（两侧分别记账），
  并点明四项真正 UI-only 的项（生命周期连接、事件流在屏幕上的表现、正常退出、零 legacy REST 回落）。
- wire_frame_contract_check: **事件帧层跨仓合同门（2026-09-15）**——`tests/server/test_wire_v1.py`
  新增 `test_every_projected_frame_matches_the_strict_frontend_event_schema`：驱动真实生产者
  （排队发送、审批请求/决定、sidecar 桥写入、角色切换），把 `history.snapshot`（沿 `olderCursor`
  向旧翻页）与实时批量两条路径的每一帧交给前端 `EventFrame`（`additionalProperties:false`、闭枚举）
  校验；**带工件与不带工件两种跑法各 30 passed**，且帧键集与 kind 为不带工件时的常驻断言。
  同轮机械核对：错误码 12 家族集合与后端 `FAMILIES` **逐项相等**。
  同轮按合同**语义**（不止形状）核对，另修一处：停止相位——`record_cancel_request` 的事件 `state`
  是请求到达时的原状态，投影照搬，于是取消 running 执行时客户端收到 `running`，而前端 stop phase
  正由 `stopping` 帧驱动；现在投影对 `cancel_requested` 发 `stopping`（终态 `stopped` 仍是唯一确认）。
  由此发现两处「合同已声明、后端无生产者」，已按权威层处理并登记到
  [wire 反馈](../server-round1/wire-review.md)：`config.changed` **已补生产者**（`sessions.switchProfile`
  确认后同事务发 `next_send`，重放在写前返回不重发；`profiles.updateConfig` 路径仍未发、已登记待前端反馈）；
  `workspace.connection` **仍无生产者**——后端无异步准备阶段，且事件帧按构造必属某个 Session
  （`server_session_events.session_id NOT NULL` + `EventFrame.sessionId` 必填），浏览阶段没有 Session
  也就没有可承载该帧的流，需前端在合同层裁决（同步结果 or 第二条会话无关通道），后端不猜语义。
  另有一项**待集成阶段判定**：`tool.update` 目前只有 harness 失败时的一条 `state="failed"`，端口事件
  词汇里没有工具进度映射，而既有门内审计只记录 client→agent 方向，无法判定四家是否真的播发工具
  调用；需一次强制工具调用的提示再定论（不臆断）。
- self_review_round: **执行者自审（2026-09-15，Codex 额度用尽后按用户指示）**——自审第一遍
  发现并修复真实缺陷：`turn_chain_phase()` 二次归一化会丢弃链路阶段的 settled 凭据命中
  （已改幂等归一化 + 附加 capture，加两条端到端回归）；其余对照项（capture 命中按码升格、
  两阶段失败有序保留、进程树归属、ledger 唯一）均已在第 23 轮完成。自审结论：Codex 门的
  凭据证据链自洽且 fail-closed；`REVIEWER_AUTOMATION_READY` 待固定 Reviewer 额度恢复后补审登记。
- reviewer_automation: §4.1 通道门**已通过**（2026-09-15）：固定 session 机械比对一致、真实
  `codex exec resume`（read-only sandbox、flock、无 bypass）exit 0、verdict `VERDICT: ACCEPT`
  含 `REVIEWER_CHANNEL_OK`、`REVIEWED_HEAD` 与调用前 HEAD 一致、调用前后 `git status --porcelain`
  零变化。**§4.2 阶段闭环当前被固定 Reviewer 的额度阻断（2026-09-15 18:2x）**：提交
  `a7b8917..2c0ee16` 的阶段包投递成功、审阅进行中，但 session 返回
  `ERROR: You've hit your usage limit. ... try again at Sep 20th, 2026 12:11 PM.`（退出码 1），
  故**未取得本阶段 ACCEPT**。按用户指示（额度用尽时自审）执行**自审轮 2**：
  修掉 Pi 报告的 `refusedBeforeProviderRequest` 反向取值、Pi live 未知模型相位无正向断言、
  四家 gate 丢失 `turn.capture` 内层 `error_code`；`pi-live5` 的 capture 间歇按未解决记录
  （其后 3 次 Pi live 全绿）。**`REVIEWER_AUTOMATION_READY` 与 `BACKEND_IMPLEMENTATION_READY`
  均未登记**，双门未判定。
- codex_config_boundary: Codex 生产配置边界**只读复核**（未改产品值）：`model=deepseek-flash`、
  `base_url=https://api.deepseek.com/`、`wire_api=responses`、`CODEX_HOME=/runtime/home/.codex`、
  `env_key=CODEX_API_KEY`、`cli_auth_credentials_store=ephemeral`。`CODEX_API_KEY` 只是 deployment 声明的
  **临时环境变量名**；用工件内 0.147.0 二进制**只读**探测确认 `ephemeral` 是受支持值（非法值报
  `expected one of file, keyring, auto, ephemeral`），且 Codex 运行后的 checkpoint 里**没有 `auth.json`**
  （未落盘认证），token 不入 deployment/事件/argv/workspace/Git——**state 例外须更正：2026-09-15 门内实测约 1/15 轮凭据扫描在原生 state 命中假 token（正确拦截，见 state-error-boundary.md §4.3），『token 绝不入 state』的旧绝对结论已被该观测取代，付费门前必须先解决**；**未执行**签入的官方 setup 脚本、
  **未读**用户 `~/.codex`。
- native_home_isolation: **PROFILE_NATIVE_HOME_ISOLATION_IMPLEMENTED** /
  `DONE_FOR_FOUR_FAMILIES`（guest `HOME=/runtime/home`；Codex `/runtime/home/.codex` + `CODEX_HOME`、
  Pi `.pi/agent` + `PI_CODING_AGENT_DIR`、Hermes `.hermes` + `HERMES_HOME`、OpenCode `.config/opencode` +
  `.local/share/opencode` + `OPENCODE_CONFIG`；双重收敛、配置 RO、state 有界 RW、受保护只读配置**不进
  checkpoint** 且恢复时类型化拒绝）。通用合同在 `home_projection.py`（target 语法、深度升序 bind 顺序、
  protected 关系），有 argv 下标与真实写入反证（旧顺序会静默丢配置）。三家 gate 在新布局重跑 exit 0；
  Windows 复验用新 bundle c5 并按 `/runtime/home/sessions` 通过 + 独立 `-PostCheck` clean。
- codex_production_chain: **CODEX_PRODUCTION_CHAIN_PREPARED**（真实 `codex-acp` 1.1.14 + Codex app-server
  0.147.0 经工件进入 c5 Worker+bwrap → 本机 loopback **Responses** 假端点）。官方脚本 1.3.0
  （SHA `0a3a3370…`，只读不执行）与完整 models.json（76107B，与既有资产逐字节相同）；工件 20 包/529 条目/
  320.8MB/tree digest `sha256:9051b844…`（双构建一致）；门默认与外部工件两种模式都 **exit 0**（两轮
  completed、delta 4<7 与 10,12<15、`/responses`、model 精确 `deepseek-flash`、**实测重开 `session/load`**、
  host-home sentinel 不可见、RO 写入 EROFS、state 100 文件可续接、未知模型发包前拒绝、清理无残留）。
  `HAS_PRODUCTION_DEPLOYMENT=True` 仅在门通过后翻转；能力观测只含真实发生的五项，`attach`/`permissions`
  保持未观测。**Codex 仍 MODEL_NOT_VERIFIED**。
- worker_view_listing_fixed: 通用缺陷修复——Worker `list_view_files` 原本"遇符号链接即整份失败"，而
  Codex 运行期必写 `$CODEX_HOME/tmp/arg0/*` 别名符号链接，state 捕获因此必然 `VIEW_INVALID`。现改为
  **跳过非普通条目**（`view.get` 仍拒绝任何非普通文件；被跳过的条目不进 manifest，目标不可解析），并在
  `capture_execution` 增加**有界 settle 窗口**（两次相同 listing 即稳定，至多 5s）等待原生进程写完。
  bundle 因此 **c4→c5**（`sha256:92eac03a…`，协议仍 1）；c4 未覆盖、仍为历史有效证据。另修四个 gate 的
  假端点"从未 start 时 stop() 永久阻塞"（实测 40 分钟挂起）与 Codex gate 对外部工件缺失的
  **类型化快速失败**（不静默重建）。
- harness_capability_contract: **HARNESS_CAPABILITY_CONTRACT_READY**（统一后的 canonical 能力词汇 8 项：
  `start/observe/finish/attach/steer/stream/permissions/native_continuation`，版本化在
  `src/agent_box/resource_contracts/harness_capabilities.py`，scope 与"实现级/语义级"分类一并固定）。
  五处声明收敛为受校验的单一来源：`harnesses.toml` == `runtime/capability_declarations.json`（JS 只读投影）
  == 四家 production 模板的 `capabilityClaims`（逐项等值测试），且 JS 原生映射 ⊆ 该上限（Node 断言）。
  `deployment.capabilityClaims` 由自由字典改为严格校验（canonical id + 真 bool；未知键/漂移别名
  `streaming|approvals|attachments|sessions|resume|prompt|abort`/字符串真值/null/数组全部类型化拒绝）。
  有效能力 = 静态声明 ∩ 运行时观测（`declared/observed/supported/reason/nativeEvidence`，`observed` 三态），
  合并规则 6 行逐条参数化；`supported ⇒ declared`，runtime 不得抬高产品能力。checkpoint `resumable`、
  附件门与审批行为一律改读有效能力：`attach` 未生效时在派发前 `ATTACHMENT_UNSUPPORTED` 类型化拒绝且不留
  孤儿会话；未声明 `permissions` 时原生 permission 请求不变成虚假支持。向上投影三个边界分离：
  `hello.capabilities`（仅 wire 方法，未改）、Profile 视图（canonical 静态声明，不读 DB 快照）、
  Session/execution 有效能力。**Wire 未改**：仍 `wire/1`、28 方法，TS/生成工件摘要与锁定值一致。
  四家矩阵与逐项证据见
  [harness-capability-matrix.md](../server-round1/fullstack/harness-capability-matrix.md)：
  （历史快照，当时 Codex 无生产封装；该点已被 c5 轮取代：Codex 生产封装完成后，其能力矩阵以[harness-capability-matrix.md](../server-round1/fullstack/harness-capability-matrix.md) 与 Codex 门实际观测为准）Pi/Hermes/OpenCode 的 start/observe/finish/stream/native_continuation
  已观测（Pi 的 `attach` 只有一半证据 → 有效 false）；`steer` 无人声明。**四家仍 MODEL_NOT_VERIFIED**。
- capability_honesty_repair: **能力诚实性返修**——首版合并规则把"声明了但**未观测**"的实现级能力
  （start/observe/finish/stream）直接算成 `supported=true`，造成三类假阳性：Codex 无生产封装、零观测时
  `capability_view("codex")` 报这些能力为支持；sidecar 执行中首条 delta 之前 `stream.supported` 可能已为
  true；任何 `declared=true, observed=null` 组合都给出虚假支持结论。已按**唯一规则
  `supported == (declared is true and observed is true)`** 修正（实现级/语义级仅用于规定观测来源与证据
  强度），补真值表与六项 surface 回归（`tests/server/test_capability_truth_table.py`，含"不得预填观测"），
  并把 Work Core operation 命名空间与 Harness canonical 命名空间的边界写成代码注释 + 测试
  （`tests/server/test_capability_namespace_boundary.py`；`require_capability` 是该 SPI 的真实消费方，
  此前"无消费方"的说法**已更正**）。`HARNESS_CAPABILITY_CONTRACT_READY` 现在基于返修后的复跑结论。
  同轮修掉一个真实崩溃：`SidecarExecutionBackend` 的持久化完成线程（`_complete`）在 prompt worker
  结束后仍在通过**共享的** Work Core 连接写账，而 `stop()` 只等 prompt worker 就返回——后续
  shutdown/test 重置该连接时会在 SQLite 里段错误（本会话两次实测 core dump，栈为
  `work_core/repository.py:143 get_work ← update_work ← services.py:70 complete_work ←
  sidecar_backend._complete`）。已让 `stop()` 追踪并**有界等待**所有存活完成线程（独立于会被回收的
  `_active` 表），等待超时则**如实返回 False**（不静默成功），并补 3 项定向测试（等待语义、诚实
  False、停止后无线程残留；去掉 join 即失败，已双向验证）。
- capability_contract_side_repairs: 顺带修掉的真实缺陷——(a) `SidecarHarnessPort.profile` 的品牌默认值
  `"codex"` 改为中立空值（16/16 调用点显式传值）；(b) `_ProcessChannels.write_line` 在通道已关闭时抛裸
  `ValueError`，会在 Server 停机取消时逃逸并连带出一次 flaky 段错误，现改为类型化
  `SIDECAR_CLOSED`（`cancel` 按契约返回 False）；(c) 三家 gate 与 Windows 验收部署的漂移别名迁到
  canonical 拼写，有状态 harness 补声明 `native_continuation`（否则其 checkpoint 会诚实地变成不可续接，
  R4 恢复链断裂）；(d) capability JSON 投影进入 sidecar bundle，供 JS 侧校验静态上限。
- worker_lease_keepalive_fixed: **WORKER_LEASE_KEEPALIVE_FIXED**——Worker 默认 5 秒租约会取消
  "客户端静默"的运行中 attempt（只有客户端帧刷新 `lease_deadline`，而一轮 prompt 期间 Server 阻塞在
  prompt 响应、channel 线程阻塞在队列上，唯一发送方 `wait_terminal` 从不进入）。已修：`WorkerClient`
  新增**保活 owner**（间隔 = `max(lease_ms/3000, 0.05)`，attempt spawn 前启动，terminal/cleanup/
  disconnect/异常时停止并 join），`request()` 全程串行化（帧号、写入、响应路由同锁，heartbeat 不与
  cancel/stdin 交错），失败类型化 `WORKER_LEASE_HEARTBEAT_FAILED` 并由 `_WorkerChannels.iter_chunks()`
  有界轮询上浮（code 经 `SidecarEnvelope` 交给等待方，prompt 不再无限等待）。**默认租约仍 5000、
  Worker 过期取消未关**（停止保活后孤儿 attempt 仍在租约边界内被回收）。证据：客户端层 13 条 +
  sidecar 层 5 条反例（8s 静默完成且实测 5 次 heartbeat、terminal 后冻结、stop/close 无线程残留、
  disconnect 读写两侧类型化、静默中 cancel <3s、heartbeat 出错类型化、停止保活后 2.1s 内 Worker 仍写
  `cancelled=true`、并发不串 requestId/sequence、`wait_terminal` 不退化）；**Windows 真机**（c4 release
  Worker `sha256:31e92959…`，未重建）：`lease_ms=5000`、`lease_override=false`、`elapsed_ms=8839`、
  `turn_state=completed`、整轮 exit 0、`-PostCheck` = `…_POSTCHECK_CLEAN`。残余：保活 fail-closed
  （单请求长时间独占串行化锁会把该轮判失败），留待真实模型门观察。
- runtime_artifact_projection: **RUNTIME_ARTIFACT_PROJECTION_READY**（`runtimeArtifactMounts`
  Server仅形状校验透传 / Worker WSL 内权威验树摘要 / bwrap 只读 `/runtime/artifacts/<name>`；
  跨 Python-Rust tree digest v1 + golden fixture；上限 32768 条目 / 1 GiB / 4096 字节路径；
  Worker control protocol **2→3** 双向拒绝（含真实 c3 旧二进制）；c4 bundle
  `sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`（c2/c3 未覆盖）。
  **（历史阶段 r4-era 记录）当时 c4 尚未在 Windows 复跑**：c3 的 r4 是那一阶段的历史有效证据。
  此后 Windows r4 已分别用 bundle c5 与 **c6** 通过（见本文件 worker_view_contract_hardened /
  state_capture_content_stable 两条）；c4/c5 保留为历史证据，未被覆盖）。
- runtime_artifact_projection_gate: 真实 release Worker(c4)+bwrap 本地 fixture，无网络无模型，
  `scripts/server-round1/runtime-artifact-gate.py` exit 0（fixture 从 `/runtime/artifacts/fixture-dep`
  加载依赖并返回固定值、guest 写入被拒、宿主树未变、摘要不符时 turn 失败且无伪造 session、无残留
  view/secret）。该门**只登记工件投影**，不等于任何 Harness/model 通过。
- wire_status: **WIRE_LOCKED_FOR_IMPLEMENTATION**（28方法+队列终态严格schema 29/29通过）。
- backend_implementation_ready: **否（暂时）**（Windows r4 平台门通过：真实 Windows Server→wsl.exe→
  release Worker ABW1 interactive→bwrap 上保留旧门并新增有状态 fixture，`stop_mode=tree_terminate`
  有界强制树终止后的崩溃式重启/同 native id `session/resume`/终止前 delta/ObjectStore checkpoint/
  marker 清理与独立 `-PostCheck`；该停止路径不是正常/graceful 退出，正常 Desktop/Server 生命周期退出
  与最终清理仍留作全栈最终验收项；
  正式 WS 事件流、附件、审批、取消/断连、队列续派/暂停、Profile/Provider-Model 维护均有证据；
  Codex 模型选择与凭据生产投影已接线并经**无模型全链门**验证（`CODEX_PRODUCTION_CHAIN_PREPARED`，
  见本文件 codex_config_boundary / codex_production_chain 两条）；**四家生产封装全部完成**
  （见本文件 hermes_production_chain / opencode_production_chain / pi_production_chain /
  codex_production_chain 与 windows_r4_c7 各条）；（历史括注已过时的表述保留于下，仅作当时快照：
  ~~Codex 封装仍未完成；c4 亦未取得 Windows 平台证据~~——Codex 封装已在 c5 轮完成，
  Windows 平台证据已先后用 c4/c5/c6/c7 取得）。唯一剩余后端门是**四家真实模型门**）。
- integration_owner: NONE；workbench_model_verified_count: **0**（指本轮；组件门与工件投影门通过
  不等于真实模型可用）。
- model_authorization: DEEPSEEK_OFFICIAL_AUTHORIZED_MAX_CNY_10；凭据locator见42 §D，不写内容。
- 本轮调用数1（DeepSeek官方API可达性检查，12 tokens，<¥0.01；上限¥10），
  预留0；Codex真实模型尝试在 session/new 阶段即失败、未发起模型请求。
  后续执行者统一记账，所有Harness/重试累计计算。r4 阶段模型调用 0、费用增量 ¥0；
  42-D 工件投影阶段模型调用 0、费用增量 ¥0（只读本地 fixture，无凭据、无网络请求）；
  Pi 生产封装阶段模型调用 0、费用增量 ¥0（本机 loopback 假端点、临时假 token、用后即删，
  未读任何真实凭据）；文档修订模型调用 0、费用增量 ¥0；
  Hermes/OpenCode 生产封装阶段（含两条全链门与 Pi/工件投影门回归）模型调用 0、费用增量 ¥0
  （三家门的假 token 各自自建 0600、用后删除；未访问任何非 loopback 目的地；未读任何真实凭据）。
  workbench_model_verified_count 仍为 0。
- 41 既有门实绩：python 266 passed/4 skipped/0 failed；node 25/25；cargo 4/4；
  Windows r3 真机 WSL 全链路 exit 0。r4 增量后：python 348 passed/4 skipped/0 failed、
  Node 25/25 与 42d 4/4、Rust 4/4、Windows r4 exit 0 与独立 `-PostCheck` exit 0。
  42-D 工件投影增量后（同一条 41 记录命令）：python **424 passed/4 skipped/0 failed**（收集 352→428，
  +76 项）、Node 25/25 与 42d 4/4、Rust 10/10（基线 4）。
  Pi 生产封装增量后（同一命令）：python **444 passed/4 skipped/0 failed**（本轮 +20：Pi 模板 12、
  ACP 能力回归 7、缺凭据拒绝 1；4 项既有平台/环境条件 skip 未扩大）；Pi 构建器 `node --test` 11/11；
  Server sidecar 单套 91 passed；既有 runtime-artifact gate 仍 exit 0（底座未退化）；
  Pi 全链 gate exit 0。Windows r4 **本阶段未重跑**。
  Hermes/OpenCode 生产封装增量后（主会话串行复跑同一命令）：python **529 passed/4 skipped/0 failed**
  （该轮 +85：Hermes 36、OpenCode 25、driver 接缝 17、Pi 别名/翻译断言加强等；4 项既有 skip 未扩大）；
  state 捕获/Worker 合同收紧轮（本阶段）复跑：python **793 passed/4 skipped/0 failed**（较上一条 +7：
  content-stable settle 7；Rust **15 passed**）；四家 gate + runtime-artifact gate 用 **c6** 串行 exit 0
  （Codex 默认与外部工件两种模式都 exit 0）；**Windows r4 用 c6 通过 + `-PostCheck…CLEAN`**。
  state 错误边界/Reviewer 复审修复（c7→c8）轮（2026-09-15）复跑：python **820 passed/4 skipped/0 failed**
  （相对 793 的增量含边界新测、真实 Worker 端到端、gate 诊断（现为 3 例）等；4 项既有 skip 未扩大）；
  Rust fmt 干净 + `cargo test --locked --release` **27 passed**；
  runtime-artifact/Pi/Hermes/OpenCode 四门 + Windows r4/PostCheck 用 **c8** 串行 exit 0；
  **Windows r4 用 c8 通过 + 独立 `-PostCheck…CLEAN`**（8 秒静默 `elapsed_ms=8821`，实例核对）；`git diff --check` 通过。
  （此前轮次计数 812/22 与中间 820/27、822 均已被本条取代。）
  【历史快照：该行写于用户裁决之前；现行结论见 codex_decision_a_implemented】
  当时状态为 USER_DECISION_REQUIRED／未解决的红绿间歇（10 绿→5 红→最近 3 绿），
  根因 `.tmp/plugins` 技能物化突发（见 codex_native_state_findings）；决前不掩盖、不假绿。
  错误边界 c7 轮（2026-09-15）复跑：python **812 passed/4 skipped/0 failed**（较上一条 +19：
  错误边界 19 项，其中含 2 项真实 Worker 进程端到端；4 项既有 skip 未扩大）；
  Rust fmt 干净 + `cargo test --locked --release` **22 passed**；
  runtime-artifact/Codex（默认 10 轮 + 外部工件 1 轮）/Pi/Hermes/OpenCode 五门用 **c7** 串行 exit 0；
  **Windows r4 用 c7 通过 + 独立 `-PostCheck…CLEAN`**（8 秒静默 `elapsed_ms=8840`）；`git diff --check` 通过。
  HOME 隔离 + Codex 封装轮（上一轮）复跑：python **786 passed/4 skipped/0 failed**（较上一条 +103）：
  四家 gate（Pi/Hermes/OpenCode/Codex）串行 exit 0、Codex 外部工件模式 exit 0、runtime-artifact gate(c5)
  exit 0；node 25/25、13/13、42d 4/4、构建器 11/20/9/9；Rust fmt 干净 + 11 passed；
  **Windows r4 用 c5 bundle 通过**（`sha256:92eac03a…`、`state_projection=/runtime/home/sessions`、
  `session/new→session/resume`、delta 9 < completed 12、8 秒静默默认租约完成）+ `-PostCheck…CLEAN`。
  能力诚实性返修轮（上一轮）复跑：python **683 passed/4 skipped/0 failed**（较上一条 +19：能力真值表 11、
  命名空间边界 5、完成线程生命周期 3；受影响子集连续 3 次 237 passed，无段错误）；node 25/25 与 13/13；
  `git diff --check` 干净。**未重跑 Windows/gate/工件构建**（本轮未改 Windows 脚本、Worker、协议与生产部署，
  按工单要求不重复）。能力合同轮（上一轮）复跑：python **664 passed/4 skipped/0 failed**（较上一条 +108：能力合同 63、
  插件能力声明 37、跨层集成/投影 8 等；4 项既有 skip 未扩大）；插件套件 112 passed/3 skipped；
  node：harness_remote 25/25、能力声明 13/13、42d 4/4、三家构建器 11/20/9；Rust fmt 干净 + 10 passed；
  Pi/Hermes/OpenCode 三条全链门与 runtime-artifact gate 串行复跑全部 exit 0；
  Windows c4 r4（`sha256:31e92959…` 未重建）exit 0 + `-PostCheck…CLEAN`（8 秒静默在默认 5 秒租约下
  `elapsed_ms=8831` 完成；有状态 harness 声明 `native_continuation` 后仍 `session/new→session/resume`、
  delta 9 < completed 12）。**诚实留痕**：本阶段一次全量侧载运行中
  `test_server_core_real_worker_persists_stream_before_terminal` 出现过一次失败（真实 Worker + bwrap 的
  10 秒有界等待在负载下超时），随后 3 次单跑 + 2 次同子集复跑均通过（178 passed），未复现、未改动断言。
  租约 + Hermes 精确模型轮（上一轮）复跑：python **556 passed/4 skipped/0 failed**（较上一条 +22：
  租约保活客户端 13 + sidecar 5 + Hermes 链路 2 等；4 项既有 skip 未扩大）；node：harness_remote 25/25、
  42d 4/4、三家构建器 11/20/9；Rust `cargo fmt --check` 干净、`cargo test --locked --release` 10 passed；
  Hermes/Pi/OpenCode 三条全链门与 runtime-artifact gate 本会话串行复跑全部 exit 0；
  **最终提交态返修（HEAD `407c379`）复跑**：同一条全量命令 python **534 passed/4 skipped/0 failed**
  （较上一条 +5：OpenCode 提交态 token 回归 3、driver status 合同 2；4 项既有 skip 未扩大）；
  五文件定向 **78 passed**；`build-opencode-authorization.test.mjs` 9/9；OpenCode 全链门 exit 0
  （`cleanup.tokenInTrackedGitContent=false`）、Hermes 全链门 exit 0；`git diff --check` 干净；
  node：harness_remote 25/25、42d 4/4、Pi 构建器 11/11、Hermes 构建器 20/20、OpenCode 授权工具 9/9；
  Server sidecar 单套 91 passed；Hermes 全链 gate exit 0、OpenCode 全链 gate exit 0、
  Pi 全链 gate exit 0（底座未退化）、runtime-artifact gate exit 0。Windows r4 本阶段未重跑。
- r4 工件更正：工作令指定的 `.acceptance-bundle-c2`（`sha256:08e4e057…`）早于 interactive channel
  协议升级，与当前客户端 bootstrap 不兼容；r4 使用从当前源码重建并校验的 `.acceptance-bundle-c3`
  （`sha256:bb90e346…`，与 r3 证据一致）。广覆盖 fixture 现声明其唯一接受的 model，否则 sidecar
  模型门会拒绝配置的模型。`accept-e.ps1` 同时修正了 `test -e --` 恒真断言与清理期覆盖主失败的缺陷。
  42-D 重建 `.acceptance-bundle-c4`（`sha256:31e92959b06b3ee9f30ebfb9ce6b2bee74af847e4a147bba906bff7ecf681fa6`，
  Worker control protocol 3）；c2/c3 **未覆盖、未删除**，c3 的 r4 仍是历史有效证据。
- four_harness_matrix（组件级）：
  - codex：COMPONENT_VERIFIED（快照+fake peer 全门通过；真实二进制握手 TYPED_FAILURE，
    适配器要求 API key，app-server 路径已由工件证据确认，未退回 exec JSONL）；
  - pi：COMPONENT_VERIFIED（真实二进制零凭据 INITIALIZED）；
  - hermes：COMPONENT_VERIFIED（上游无 profile，由 AgentBox 窄注册胶水接入 `hermes acp`；
    真实二进制零凭据 INITIALIZED）；
  - opencode：COMPONENT_VERIFIED（同快照 ManagedOpenCodeHost；真实二进制 HEALTH_OK，
    不伪装为 ACP profile）。
  - 四家均 **MODEL_NOT_VERIFIED**。Codex 0.147.0 先前只证明 `wire_api="chat"` 配置被客户端拒绝；
    DeepSeek 官方 `codex-deepseek-setup.sh` 1.3.0 明确给出 Responses 配置，故已撤回“不兼容/证伪”
    结论并保留原始失败为错误配置证据。`399d78d` 已纳入官方1.3.0完整两模型目录（运行仅允许
    `deepseek-flash`）、Responses非敏感配置、adapter source、摘要固定native binary和`CODEX_API_KEY`
    首选认证接缝；`3e4282b` 固化隔离 TOML 并完成通用 native state 双轮 resume，实际 wheel 同时包含
    完整目录与TOML；真实 codex-acp→app-server 配置读取通过，但尚未发送真实模型请求。
    pi/hermes/opencode 的无模型 Provider 配置准备已在 `bc7d95b` 完成；**四家真实模型门
    （Codex/Pi/Hermes/OpenCode）均仍未执行**，Pi/Hermes/OpenCode 三家的生产封装已完成但不因此计入已通过。
    三家的原生运行时工件进沙箱能力已由 42-D 的 `runtimeArtifactMounts` 底座补齐（中立、摘要固定、
    只读、可审计；真实 Worker+bwrap 无模型门通过）；**Pi 已完成生产封装**（真实 pi-acp 0.5.0 +
    真实依赖闭包 + c4 Worker + bwrap + 本机假端点两轮，`PI_PRODUCTION_CHAIN_PREPARED`，
    仍 MODEL_NOT_VERIFIED），Hermes 与 OpenCode 的封装随后在同一底座上完成
    （本文件 hermes_production_chain / opencode_production_chain 两条）；四家真实模型门均未执行，
    四家真实模型门仍未执行（租约缺陷已修，不再构成前置阻断）。
- 已知待办/风险：内嵌 codex 二进制安装后**必须校验**（本轮发现过一次截断安装，
  已更正40-A证据）；Hermes 启动有 lazy 依赖安装与 PYTHONPATH 要求，42-D 已提供其所需的
  **中立只读运行时工件投影**（隔离 Python 包闭包可声明为 artifact 树，不挂用户 site-packages），
  且 Pi/Hermes/OpenCode 已完成同级生产封装（真实 adapter/agent + 本机假端点两轮）；
  **（历史快照："Codex 的正式插件封装仍未完成"——已被 c5 轮 `codex_production_chain`
  检查点取代，Codex 生产封装已完成并过全链门）**；真实凭据只可经授权
  SecretStore→限时 Worker 投影；该路径已有实现和反例测试，尚待真实受管 Harness。
  native会话目录的有界回读/回投及凭据原文扫描已在 `3e4282b` 收口。工件投影的残余风险：
  摘要在 bootstrap 校验一次（bootstrap→spawn 之间的 TOCTOU 窗口与既有 executable 授权模型一致，
  未新增每 attempt 重验）；bwrap 网络姿态未改（未加 `--unshare-net`）。
- 调度维护：39即参与wire反馈，通道docs/server-round1/wire-review.md（首轮已写入）。
- 42 双门 —— **历史快照（2026-09-14 14:54 只读复核），已被本文件顶部的 18:21 判定取代，不作当前结论**：
  当时后端 READY=否（运行时工件投影底座已完成并通过真实 Worker+bwrap 无模型门；Pi 已完成生产封装，
  当时 Hermes/OpenCode 的封装尚未开始、四家真实模型门未执行；Windows r4 平台门已通过、当阶段未重跑）、
  前端 READY=否（PARTIAL、`writer_lease` ACTIVE；当时工作树 clean）→ 未记录集成人、未写前端、未联调。
- 每阶段与goal结束前检查状态已更新；41READY后进入42等待，不提前报整体完成，不宣称goal完成。

以下是37/38历史说明，不覆盖39–42新授权。
终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。


---

## 会话总结（2026-09-17/18，env-provider 工作树多轮执行）

### 已完成的工单

| 单 | 结论 | 关键提交 |
| --- | --- | --- |
| 44 | ENV_PROVIDERS_DONE | 前期 |
| 46 | DONE | 前期 |
| 47 | SANDBOX_PLAN_SEAM_DONE（A–D） | 8c494a2 |
| 48 | WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE | 前期 + spike 0340f61 |
| 49 | EVIDENCE_HYGIENE_DONE | 3302fb2 |
| 50 | CAPABILITY_LAYER_ABSORBED | 642b1af |
| 55 | USAGE_PROBES_DONE（G1+G2–G4） | 642b1af + a83df9d |
| 57 | SANDBOX_PLAN_SEAM_DONE（A–D） | 8c494a2 + 92e51a8 |
| 67 | PER_SESSION_ADMISSION_DONE（45-G3 转 pass） | 59fe1bb |

### 完成中的工单

| 单 | 已落地 | 剩余 |
| --- | --- | --- |
| 51 | USAGE_FACT_DONE：pi/codex/hermes/claude 门级观测轮全部产出事实（hermes (11,7)/(22,14)、claude (11,7)，source=声明格式）；WAL 侧车根因修复；六家解析器就绪 | kilo/opencode/dsh/qwen 模板未声明 usageProbe（解析器已备，未启用；kilo/opencode 启用时读共享库，走 66 只读规则） |
| 52 | B/D+E 完成：三新 wire kind + 四类映射入账本 + 夹具端到端 | 真 harness 观测轮已跑（pi+假端点一圈**零过程事实**，否定结果记账）；需能发四类负载的真流 |
| 65 | SUBAGENT_DELEGATION_DONE（086 收口）：A/B＋C（授权边、两工具契约、委派服务、`parent_turn_id`、有界摘要、用量同源、续接/环/扇出、取消传播、桥入 bundle、loopback 端点按次令牌、有授权才渲染、父 deny 继承、审批镜像、授权 CRUD wire、**真桥端到端（真进程→真通道子执行→摘要）**、并发扇出）＋ **真 harness 父侧自发起 tools/call 一圈**（claude-code 真 CLI/真 `.claude.json`/真桥进程，`SUBAGENT_HARNESS_ROUND_DONE`）＋ **两条死规则接上真链路**（血统由账本 `parent_turn_id` 走出、调用方不可自报；取消级联接 REST `turns.cancel` 与 wire `runs_stop` 两入口）；**深度上限与"子轮默认不带 run 工具"按 R-0016 撤销**；12 条 + 086 的 18 条测试 | 只剩 P17/P20 前端（后端无剩余；授权层的**任意环**拒绝缺口另计，见 086 未做项） | 75253fa + 701ae20 + 6854e4c + 3d19218 + 本轮 |
| 64 | EXECUTION_INVENTORY_DONE（账本同源、pid 本机可报/远端 null+reason、上限 200 类型化、零宿主路径；4 条测试） | WSL pid（需 Worker 单）；P20 同步与重锁 | 本轮 |
| 63 | PROFILE_MEMORY_READ_DONE（本机侧完整；注册表 memory_paths、只读+有界+扫描、profiles.memory wire；4 条测试） | WSL 侧读；P17 同步与重锁 | 本轮 |
| 62 | WORKSPACE_GIT_STATUS_DONE（本机侧完整 + WSL 接线；6 条测试含只读性证明） | WSL 真机轮；P20 同步与重锁 | 本轮 |
| 61 | PACTHOLD_REBRAND_DONE（基础设施侧）：A 审计/映射/保留清单、B README×2+品牌说明+banner/favicon、C 六条 CLI（新名+旧别名同源）、D wheel 元数据 `Name: pacthold`、E 服务发现未坏（新名起 Server+hello/readiness 冒烟）、合同零变化 | 插件分发名改名为后续单；发布/远端改名/数据迁移不做；P18 一致性归桌面工作树 | 本轮 |
| 60 | PROFILE_SETTINGS_PARTIAL：A/B/C/D/E/F＋资产重绑＋setPermissions wire＋**姿态逐家翻译**（claude/codex，只收紧或拒绝；2 条测试） | 翻译产物写入配置文档~~待逐家钉死设置键~~ ⇒ **已由 085 落地**（claude/codex 按一手钉死的键写入 + 真实工件快照；其余六家类型化拒绝），剩余三条见本文件 60 主行；ask↔审批端到端；P17 同步与重锁 | f8ed9d2…本轮 + 085 |
| 59 | HOOK_MODELS_PARTIAL：A 观测、逐家 schema、账本、物化 G3、触发账本 G5、hooks.* wire（+6）、**代码资产 publishPlugin（+1，逐字存储+有界预览）**；10 条测试 | 触发事实生产端未接、P16 同步与重锁、G4 端到端、OpenCode 插件物化槽位（未钉死）、Windows 差异 | 0babb42 + 5801556 + 3179535 + 本轮 |
| 58 | ASSET_HUBS_PARTIAL：A 槽位观测、skill/MCP 存储、逐家渲染、目录+绑定（schema 13）、物化进执行、**G7 目录式来源**（快照/安装/失败不落地）、**G6 MCP 有界探测**、assets.* wire（+10 方法）；15 条测试 | 凭据注入逐家钉死、P15 前端同步与重锁、commands/hooks 声明 | bddbba5…本轮 |
| 56 | SUBSCRIPTION_CREDENTIALS_PARTIAL：资产存储+锁+乐观摘要、物化/回收本机端到端、schema 12、accounts.* wire 面（+4 方法）、codex 声明、45 补节；8 条测试 | **前端 P12 同步与两仓重锁**、Worker 侧物化（home.put）、其余家登录文件路径（需真机登录轮）、G2/G4 真机登录轮 | 1299275 + 本轮 |
| 66 | SHARED_SESSION_STORE_PARTIAL：A/B/C 落地、G1–G5（G5 夹具级）、43 代门 marker 债解除 | dc65731 + e394f09 |
| 53 | USAGE_AGGREGATION_DONE：聚合模块 + usage.aggregate/export wire 方法 + 未知即未知反例 | hermes/claude 观测轮（opencode/kilo 解析器已落地，聚合面可直接消费其 fact） |
| 54 | USAGE_FACT_PARTIAL：本机+WSL 通道变更集落地、c11 五家四绿（kilo marker 维护债）、schema 9 change_set 列 | WSL 端到端观测轮（c11 已绿 pi 门）；kilo marker 维护债 |
| 55 | USAGE_PROBES_DONE（G1+G2–G4）；本机通道 usage_probe 断口已修复（67, 59fe1bb） | 真端点观测轮待做（无可用凭据端点时受限观测） |

### 未开始的工单（依赖链排后）

56（←45 PARTIAL+50）、58/59（←45 PARTIAL+50）、60（←55+58）、61（←60）、62（←?）、
63（←?）、64（←?）、65（←?）。45 G3 解除后 56/58/59 可开工；55 G2 解除后 60 可开工。

### 已解除的历史阻塞

45-G3（同 profile 两会话并行）由工单 67 解除：native-home-gate 全绿（G3=pass）。

### 全局维护债

1. ~~43 代门（dsh/kilo/qwen/claude）的 HOME_MARKER_CONFLICT~~ **已解除（2026-09-18，
   见 66 报告 §14）**：根因=locator 按名字派生而 marker 身份是 profile ID（同名 profile
   跨运行碰撞于持久 home root）+ 四家门的 scan_state 停留在 45 前模型。两处修复后
   **四家生产链门全 exit 0**。
2. 48 AppContainer 恢复 spike 需管理员权限（Windows 11 限制 IL 标签写入）。
3. terminal 短名能力词汇未版本化（slots.py 已记录，收敛待后续）。

---

## 068 账务补齐自查（2026-09-19，执行者）

**范围**：本树 `status.md` —— 主表补 60–65 六行（提交 22dc823）、刷新 52/54/55 三行（cfa9eba）；另有 1 条偏离与 2 处 G3 下调（见下）。

**G1 行数**：`grep -c '^| \[6[0-5]\]' docs/implementation/status.md` → **6** ✓
反例演练：在副本上删掉一行 60 → 同命令得 **5**（缺行即失败，守卫非零命中）✓

**G2 可追溯**：六行引用的 14 个提交（f8ed9d2 / 03c210d / 8b73c7d / 27dfa26 / e39959f / ff0c578 / 30adedf / 76e7c35 / 4d7b0e0 / faaeedf / 75253fa / 701ae20 / 6854e4c / 07b43fa）逐个 `git cat-file -e` **全部 OK**。
反例演练：对不存在的 `deadbeefcafe` 跑同一检查 → **`MISSING deadbeefcafe`**（守卫能抓到正例）✓
说明：工单 Validation 那条通用 hex 循环会把**非提交型 hex**（工件/合同摘要，如 182e7adb、08e4e057、0cdc459c 等）一并抓出报 MISSING——G2 的实质断言是"六行引用的提交"，已全过；摘要型 hex 在各行已标明其性质（TS/工件/前端提交），不是本树提交。

**G3 不冒充**：逐单按 DoD/门对照证据，**下调两行**（报告自述词与自身 DoD 不符，按证据口径记，行内已注明）：
- **62**：`WORKSPACE_GIT_STATUS_DONE`（报告自述）→ **PARTIAL**：62 §3 DoD 明示"真机证据（至少 WSL 与本机各一次）"，WSL 真机轮未跑（报告 §5 自记"本机无该侧"）。
- **64**：`EXECUTION_INVENTORY_DONE`（报告自述）→ **PARTIAL**：64 §3 DoD 明示"本机与 WSL 各一次，含 pid 有/无两种"，WSL 真机轮未跑（报告只给"协议不传"的结论）。
- 61/63 维持 DONE（各自 DoD 全项有证据；未做项是工单明示范围外/远端受限，行内已标）；60/65 维持 PARTIAL（各自剩余项来自其报告）。
反例演练：对"DONE 行 + 证据文件缺失"的合成副本跑链接核查 → 报 `MISSING EVIDENCE`（假 DONE 会被抓住）✓

**发现的既有缺陷（超出 068 九个行的范围，如实记录、未擅自修）**：主表 48 行的两个证据链接（`sandbox-conformance-windows.json` 与其反例）**在本树分支不存在**——文件实际提交在主树分支（主树 `c1b32fb`，路径 `docs/server-round1/fullstack/`）。全表链接核查：28 行中仅此 2 处断链。处理建议：由调度者决定（把文件带进本树，或把该行指向主树）。

**偏离说明（1 条，理由）**：068 scope 表写"补 6 行 + 刷新 3 行"，实际另刷新了"计数口径"节——不刷新则新行的套件数字会被该节宣布为"历史/已被取代"，账不自洽；改动只把"现行计数"改为"最近一次有记录的全量计数"并标明来源提交（e39959f），未新增未验证数字。

**投递回执**：已纳入 work order 070 投递 @111bf4d（批内排 067 之后、069 之前；章程 §3 顺序已更新）——按新队列继续，不为检查点停下。

**Validation**：`git diff --check` 干净；阶段提交后 `git status --short` 无输出。

---

## CHECKPOINT b1（2026-09-19）

**CHECKPOINT b1 [PARTIAL]**（唯一未收口的是 066 的 G5 首发锁——方案已交付、**未实施**；其余单 DONE，62/64 为 068 按证据下调的 PARTIAL）

**1 现在能试什么**（入口/命令 + 期望）

- 批次结构门：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders/ --batch b1 --strict` → 4 个 b1 单全 **OK、exit 0**（阶段全勾、门三列齐、场景齐）。
- 回归：`PYTHONPATH=src:plugins/... pytest tests/ -q` → **882 passed / 0 failed**（258 s，本批末实测；批内基线 879，+本批新增 3 测试）。
- 66 并发门（**红=缺陷仍在**，预期）：`python3 scripts/server-round1/shared-store-concurrency-gate.py --attempts 3` → 冷启动 6/7 失败（5×`database is locked`、1×外键竞态）、初始化后 3/3 双绿；证据 [JSON](../server-round1/fullstack/shared-session-store-66-concurrency.json)。
- 67 门（绿；注意 G8 有 1/2 间歇）：`AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap PYTHONPATH=… python3 scripts/server-round1/native-home-gate.py` → `NATIVE_HOME_GATE_OK`（G3 = 45-G3 复现：两轮都 completed、`nativeIdsDiffer`、同会话入队、运行中切换 rejected）；复现报告 [JSON](../server-round1/fullstack/per-session-admission-67-native-home-gate.json)。
- 070 探测面（绿）：经 wire 调 `providerModels.probeModels` / `probeConnection`（真实端点一轮 2×GET、0 token）；证据 [JSON](../server-round1/fullstack/provider-model-55-real-probe.json) + [报告](../server-round1/fullstack/provider-model-55.md)。
- 069 观测（否定 + 根因）：[报告](../server-round1/fullstack/wsl-change-set-observation-069.md)（WSL 变更集全 NULL ⇒ `sidecar.py:631-632` 空快照折叠）。
- 072 结案：[48 报告 §七/§八](../server-round1/fullstack/windows-placement-48.md)（两轮退出码 `0xC0000142`、H1 排除、声明仍 false、低于 Linux 侧）。

**2 要你拍的**：见本节末 **「阻塞（待人拍）」** 四条——066 首发锁实施、`providerModels.update` 省略语义、54 的一行修并入 b2、两仓重锁节奏。

**3 花了什么**

- 真实模型调用：**2 次**（070：`GET https://api.deepseek.com/models` ×2；**0 token、¥0**，R-0011 不设上限口径）；其余全部 loopback 假端点/本机，零外网。
- 门与批：全量套件 3 次（879 / 879 / 882）、native-home 2 次、pi 门（c11）3 次、共享库并发门 3 批、五类反例演练 1 批、wire/探针定向多批。
- 清理：本会话临时根已删；**保留 1 个**（069 证据引用的 kept 根 `/tmp/agentbox-pi-gate-mkb9aso9`，110 MB）；更早会话遗留的 pi-gate 根未动（非本会话产物）。

**4 恢复点**

- 下一批 **b2**（章程 §「下一批 b2」9 项：066-G5 首发锁 → 两仓重锁收口 → 45 收口 → 62/64 的 WSL 真腿 → 53 解析器 → 60 配置写入 → 65 最后一圈 → G8 间歇 → 四家真实 UI 模型门）；契约由调度者逐单投递。
- baseline = `checkpoint/b1` 指向的 commit；工作树在检查点提交后 clean。

**5 不含糊**

- **066 = SHARED_SESSION_STORE_PARTIAL**：G5 真并发腿出**确定性缺陷**（6/7 失败），首发锁方案已交付、**未实施**——不得写成 DONE。
- **62/64 = PARTIAL**：DoD 明示的 WSL 真机腿未跑（068 按证据口径下调，行内注明）。
- **67 的 G8**（取消/召回）有 1/2 间歇（复跑 1 败 1 过；失败形态=召回轮 completed 但流为空），已记入 67 报告 §9，**不是** 67 的门。
- **069 是观测轮**：WSL 变更集**否定结果**（全 NULL）+ 根因（空快照折叠），修法与测试已交回，**未实施**。
- **070 交回两项**合同不齐（`providerModels.update`、`providerArtifacts.install`）与"窗口/能力无记录面"。
- **072 自查发现**：48 行此前写"报告显式写低于 Linux 侧"而文档实际缺失——已由 §七 补齐并在行内如实记录。
- 阶段勾选：13 个复选框已勾（仅 `- [ ]`→`- [x]`，契约文本未动；068 的 `forbidden` 按"禁改契约实质"理解，如与调度者口径不符请按差量回退）。

## 阻塞（待人拍，2026-09-19）

| # | 阻塞 | 证据（指针） | 建议 | 不拍的后果 |
| --- | --- | --- | --- | --- |
| ~~B1~~ | ~~066-G5 首发锁实施~~ **已由 080 关闭**（`FIRST_RUN_LOCK_DONE`；真 harness 7/7 有锁绿 / 2/3 无锁败） | [080 报告](../server-round1/fullstack/first-run-lock-80.md) | — | — |
| B2 | `providerModels.update` 合同/实现不齐（合同 `displayName`/`credentialId` 可选；实现必填且 `params[...]` 直接取值） | [070 报告 §6.1](../server-round1/fullstack/provider-model-55.md)；`handlers._provider_model_body` | 定语义：**省略即保留原值**（改实现 + 测试）或收紧合同（改工件 + 重锁） | 合法请求被 400；若只放开校验则变 500 |
| B3 | 54 的 `sidecar.py:631-632` 一行修（空快照折叠） | [069 报告 §3-4](../server-round1/fullstack/wsl-change-set-observation-069.md)（插桩 + 三态探针） | 并入 b2 的 066-G5 收尾单（同文件族）一起改 + 空快照测试 + 复跑观测轮 | WSL 通道变更集**恒 unknown**（首轮必现，且"正例只需审计文件"） |
| B4 | **两仓仍未锁定**（081 已登记差异）：前端交回阶段 2 对 `6e8ae84a`/`f5d27269`（59 方法）≠ 后端登记 `64dc9961`/`42a164a4` ≠ 本树副本 `a1bd52a4`（33 方法）；摘要在两工具链间不可复现 ⇒ 需**换工件本体** | [wire-review Order 81 节](../server-round1/wire-review.md) | 拍四件：①后端发布 64 方法工件（或前端补 5 个后重生成）并**交换本体**；②替换本树旧副本（strict 5 项失败之因）；③定生成/比较口径；④补 Order 57/58/59/65 的 wire-review 小节（当前 0 命中） | 摘要永远对不上；前端按 59 方法实现、后端跑 64 方法，落后 5 个面的差异继续分叉 |
| B5 | **同一个 `ask` 在两处翻译方向相反**（085 阶段 1 一手登记）：60 的 `posture_translation.py::translate_claude()` 把 `ask` 译进 **`allowedTools`**，而 CLI flag 语义与 settings 层 `permissions.allow` 同义 = **预先批准、免提示**；085 的写入器把 `ask` 落进 **`permissions.ask`** = 真的弹提示。前者相对中立姿态是**放宽**，与 60 自己的"只收紧"规则和 085 G2 相冲 | [085 证据 §4](../server-round1/fullstack/posture-config-keys-085.md)（钉死的落点表）+ §7.4 | 二选一：**改 60 的 claude 表**为 `ask→permissions.ask`（一处映射修正，不扩协议，但要重跑 60 的翻译测试），或**另开一单**收口（093 的写入器上线前必须有个答案）。085 不代改别人的契约，故只登记 | 一旦 093 把冻结配置落盘，同一份姿态会同时经两条路径翻译 ⇒ 60 那条把 ask 写成"免提示"，**用户看到的 ask 与实际生效的 ask 不一致**（放宽且不可见） |
| B6 | **086 的 G2 字面与 65 的实现口径相反**（086 阶段 3 一手登记）：工单写"子轮用量**记在父轮**"，实现与 65 的 docstring 是"子轮用量**留在子轮行**、`parent_turn_id` 为链路、用量以事实形态回进父轮的工具结果"。两种都能满足"归属可追溯"，但账上只能有一种写法 | [086 证据 §9/§11](../server-round1/fullstack/subagent-harness-round-086.md) | 拍一句口径：**保持实现口径**⇒ 把 G2 改成"子轮用量归属可经 `parent_turn_id` 追溯、并在父轮工具结果内可见"；或**要"抄到父轮"**⇒ 那是一条汇总行为的新需求（要新单，且要先定"父轮重算/重复计数"怎么办） | 086 已按实现口径出具反例并登记差异；不改字面则下一张读 G2 的单会去实现"抄到父轮"，与 65 的行语义直接冲突并双计用量 |

## 待开单（本树执行者登记，2026-09-19；编号由调度者从 100 起给）

> 纪律：执行者不自行起草工单。以下是**本树跑出来的、超出当前单 `write_paths`/范围**的事实缺口，逐条给"证据已在手"的位置。

| 候选 | 一手事实 | 为什么不并入现有单 | 证据 |
| --- | --- | --- | --- |
| 授权层拒**任意环**（不只一条反向边） | `profiles/repository.py:140`（自授）与 `:157`（直接反向边）之外，A→B、B→C、C→A **三条边全建得出来**；运行期靠 `check_cycle` 拦第 3 跳，但授权表里的图**不是 DAG** | 属 65 的 C 段（授权 CRUD），而 086 的 `write_paths` 不含该面的语义扩展；R-0016 也只允许"接已有规则"，不允许本单顺手加限制 | [086 证据 §10](../server-round1/fullstack/subagent-harness-round-086.md)、用例 `tests/server/test_subagent_rule_liveness_086.py::test_a_three_edge_ring_closes_on_its_third_hop_and_is_refused` |
| Worker 侧 `session/request_permission` **无应答路径** | `grep -rn request_permission workers/agent-box-worker/src/` 只命中 `fs::set_permissions` 两处无关项；`src/agent_box` 亦无 ⇒ ACP 适配器把工具权限交给 `canUseTool` 后无处可答，真父轮只能靠 SDK 侧预批准 | `workers/**` 不在 086/085 的 `write_paths`（099 只被授权修 `home.put` 的分发臂） | [086 证据 §7](../server-round1/fullstack/subagent-harness-round-086.md) |


> 编号说明：上一节 `## CHECKPOINT b2`（080/081 那次）的 §2 写了"新增 B5"，但当时表里没落 B5
> （其内容并入了 B4 的四项交回）。本表 **B5 由 085 新增**，是该编号的实际持有者；批末重写那节时一并更正引用。


---

## CHECKPOINT b2（2026-09-19）

**QUEUE_EMPTY_AT 2026-09-19**（章程"队列不空规则"）：080 与 081 均已收口，`work-orders/` 里
**没有属于 b2 的下一张**（b2 计划其余 7 项：45 收口、62/64 的 WSL 真腿、53 解析器、60 配置写入、
65 最后一圈、G8 间歇、四家真实 UI 模型门——契约待调度者逐单投递）。合法停止，如实报出。

**CHECKPOINT b2 [PARTIAL]**（080 DONE；081 为"差异已登记、两端仍未锁定"的 PARTIAL——见 §5）

**1 现在能试什么**（入口/命令 + 期望）

- 批次结构门：`python3 …/validate_order.py docs/implementation/work-orders/ --batch b2 --strict` → 080/081 **OK、exit 0**。
- 回归：`PYTHONPATH=src:plugins/... pytest tests/ -q` → **887 passed / 0 failed**（233 s，本批末实测；b1 基线 882 + 080 新增 5）。
- 首跑锁（080）：`pytest tests/server/test_first_run_lock.py -q` →
  门语义（独占/有界/类型化超时）+ 接线（两首跑窗口不相交）+ 反例（去门即相交）+ **真 opencode 7 轮冷库双首跑 7/7**；
  无锁反例常备：`python3 scripts/server-round1/shared-store-concurrency-gate.py --attempts 3`（**设计上无锁**，仍会失败——这就是反例）。
- 两仓重锁登记（081）：[wire-review Order 81 节](../server-round1/wire-review.md)（三个摘要、方法集差、四项交回）。
- 66 行已由 080 翻绿：`SHARED_SESSION_STORE_DONE`（G5 补齐）。

**2 要你拍的**（见本节末「阻塞（待人拍）」更新表：B1 已由 080 关闭；B2/B3 仍开；新增 B5）

**3 花了什么**

- 真实模型调用：**0 次**（080 用本地 opencode 1.18.21 + loopback 假端点；081 只读两仓文件）。
- 批：全量套件 1 次（887）、首跑锁测试多批、无锁反例演练 1 批（2/3 失败）、真 harness 7 轮（36 s）。
- 清理：测试用 tmp_path 自清；临时根无新增残留（b1 保留的 069 证据根仍在）。

**4 恢复点**

- 下一批：**b2 剩余 7 项待投递**（契约到即按序执行）；baseline = `checkpoint/b2` 指向的 commit；工作树提交后 clean。

**5 不含糊**

- **081 = RELOCK_REGISTERED_PARTIAL**：差异已登记，**两端仍未锁定**（三个摘要互不相等）；订正工单前提——
  前端 P21 交回的是**阶段 2 对**（`6e8ae84a`/`f5d27269`，59 方法），不是 `b284f70c`。
- **080 = FIRST_RUN_LOCK_DONE**，但两处取舍必须知道：就绪=**首轮终态**（每库一次等待；不是"库就绪探测"）；
  同键的**新库**（数据根重建）不会再被锁——已知边界。
- **QUEUE_EMPTY_AT 已写**（见上）——这是调度者的投递缺口，不是执行者停工理由的托词。

---

## 工单 082 — 45 收口（2026-09-19，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 082 | `LEDGER_45_CLOSEOUT_DONE` | G1 ✅ 45 行含 `NATIVE_HOME_STORAGE_DONE`；G2 ✅ 注记含 `460781c` + 复跑命令 | 无代码改动 ⇒ 不重跑套件；本单实跑 `native-home-gate.py` 于基线 `4c32992` → `NATIVE_HOME_GATE_OK` | **0 次 / ¥0** | 本单 |

- **45 行**：`NATIVE_HOME_STORAGE_PARTIAL` → **`NATIVE_HOME_STORAGE_DONE`**；G7 仍记**部分覆盖**（未改）。
- **报告**：[native-home-storage.md](../server-round1/fullstack/native-home-storage.md) 文末「082 收口注记」
  + 正文 5 处 G3 冲突就地标注（§0 结论、§3 门表 G3 行、§7 未做项 1/4、§8 后"曾未决"），原文不删。
- **本单订正了工单 082 的前提**：单文写"45-G3 在**当前基线**上通过（提交 `460781c`）"，
  但 `460781c` 之后、本单基线 `4c32992` 之前有 `cd03ada`(070) 与 `30012ad`(080) 两次代码改动，
  其中 **080 正改在 G3 走过的 `SidecarExecutionBackend`**。故本单不沿用旧记录，**本人重跑整座门**：
  G1/G2/G3/G4/G6/G8 全 pass，G3 形态与 `460781c` 逐项一致
  （证据 [native-home-45-082-rerun.json](../server-round1/fullstack/native-home-45-082-rerun.json)，
  sha256 `0501467351fe…`，`temporaryRootRemoved: true`）。
- **反例演练（G1）**：把 45 行改回 `PARTIAL` 而不加注记 ⇒ G1 失败；本单以注记 + 实跑证据满足转换，非仅换字。
- **未做项（不属本单，如实移交）**：G8 取消/召回间歇 → **087**；claude/dsh/qwen 43 代门 marker 根因 → 67 §4。

## 工单 083 — 62/64 的 WSL 真腿（2026-09-19，执行者）

- **已纳入投递**：work order `090`/`091` 修订 @`b7ca376` 与章程队列更新 @`a38d2bd`（裁决 R-0012）；
  本单 §3.1 的阻塞正是 090 的管辖面，故不越界代跑。

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 083 | `WSL_LEGS_62_64_PARTIAL` | G1 ✅ 真 `wsl.exe` 真仓取值 + 非 git 目录走 `GIT_NOT_A_REPOSITORY` + 无连接器走 `GIT_UNAVAILABLE`（不编数）；G2 ⚠️ **部分**：空列表反例 ✅、`placement="wsl"`+`pid=null`/`PID_NOT_REPORTED` ✅，但"真 Worker 飞行中取样"未见；G3 ✅ 两处答案零宿主路径 | 本单 6 条绿（2.59s）；Validation `-k "git_status or execution_inventory"` **10 passed / 583 deselected**；全量 **893 passed + 1 error**（= 基线 887 + 本单 6；error 是 `test_opencode_gate_cleanup.py:388` teardown，与 WSL 腿无关，本单未复核是否既有 ⇒ 挂待查） | **0 次 / ¥0** | `0d92aad`（腿 + 反例）+ 本提交（证据 + 账） |

- **62 行** → `WORKSPACE_GIT_STATUS_DONE`（DoD 两条腿齐）；**64 行**保持 `PARTIAL`，理由已从"没跑"换成"组合不出飞行中取样"。
- **证据**：[wsl-legs-62-64-083.md](../server-round1/fullstack/wsl-legs-62-64-083.md)（含一条命令的复跑方式、
  事实分级、以及两处交回项）。
- **精确剩余（本单未做，逐条给入口）**：
  1. **真飞行中的 WSL 执行清单取样**（64 的 DoD 尾项）。本侧第一手阻塞：`runtime.py:140` 的
     `_builtin_connector` 在非 `nt` 恒返回 `None`；`build_runtime_from_sidecar_deployment`（`runtime.py:449`）
     不收 `connector=`；`env-provider-gate.py --placement` 只认 `local|ssh`（且 `scripts/**` 不在本单 `write_paths`）。
     归 **090**（它有 `src/**` 写权，且已实测到路由缺陷 `sandbox-windows` → `SANDBOX_PROVIDER_UNRESOLVED` → `DispatchAmbiguous`）。
  2. **WSL 侧增删行**：`additions`/`deletions` 结构上恒 null 且答案级 `reason` 也为 null。
     补 numstat 还是把它写进 62 的契约文字 ⇒ **要人拍**（产品决定），本单只记录。
  3. **`test_opencode_gate_cleanup.py:388` 的那 1 个 teardown error** ⇒ 交回（本单权限下无法单独复跑取证）。
- **清理**：本单探查 `probe()` 时留下的 `/tmp/agentbox-worker-r1/083-probe` 已删；该根下 16 个 `server_*`
  目录属先前运行，未动；`pgrep -c -x agent-box-worker` → `0`。
- **不改协议**：两条腿都走现成 wire 与现成 `WslConnector` 方法，`src/**`/`plugins/**` 零改动。


## 工单 084 — 51/53 剩余解析器（2026-09-18，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 084 | `USAGE_PARSERS_DONE` | G1 ✅ 两家各跑到**门级一轮**（非单测）：hermes 账本 `(11,7)`→`(22,14)` `source=hermes-state-db`（主文件独读为 null、带 `-wal` 侧车才出值——侧车 1,034,152 B 是第一手对比事实）；claude `(11,7)` `source=claude-projects-line`，且其**失败轮整行 NULL** 是工单"失败轮为 NULL"的真实行实例；G2 ✅ 凭据边界从 grep 升级为**运行期守卫**（`_scratch_sqlite` 逐条 trace 语句，点名 `credential(s)`/`account(s)` ⇒ `USAGE_PROBE_CREDENTIAL_QUERY` 类型化拒绝 + 临时库不残留）；G3 ✅ 列缺失⇒字段缺席、读取抛错⇒fact 保持 unknown 且日志记原因 | 本单新增 5 条；Validation `-k usage` **27 passed / 571 deselected**；`tests/server` **598 passed**（083 时 593）；根套件 **898 passed / 0 failed / 0 error**（= 083 的 893 + 5，零退化）。顺带第一手：083 交回的 `test_opencode_gate_cleanup.py:388` teardown error **本轮两根套件均未复现**（不声称修好，只记录缺席） | **0 次 / ¥0** | `bca5aef`（阶段 1–2 观测轮）+ `873a6d4`（阶段 3 守卫 + 反例）+ 本提交（阶段 4 账） |

- **51 行 / 53 行已按实况更正**：两行的"hermes/claude 观测轮与 opencode/kilo blob 解析待续"是**陈旧断言**。
  第一手核对：`parse_opencode_db`（读 `message.data` JSON 的 `tokens` blob）与 `parse_kilo_db`（读 `session` 专用列，
  按 `PRAGMA table_info` 只取存在的列）**自 51 的 `eb0c307` 起就在树内且各有测试**，`FORMATS` 六家齐。
  ⇒ 本单阶段 3 **没有重复实现**，补的是真缺的反例与守卫；账上如实写成"核实 + 补牙"，不写成"本单实现"。
- **证据**：[usage-parsers-remaining-084.md](../server-round1/fullstack/usage-parsers-remaining-084.md)
  （§1 运行前置事实、§2/§3 两轮账本表与家侧车对比、§4 凭据面、§5 清理、§7 守卫与五条测试 + 反例真会咬的演示、§8 剩余）。
- **精确剩余（本单未做，逐条给入口）**：
  1. `kilo`/`opencode`/`dsh`/`qwen` 的部署模板**未声明 `usageProbe`** ⇒ 这四家的门不会去回读用量，事实长期为 unknown。
     模板在 `plugins/**`，**不在 084 的 `write_paths`**（工单把 `plugins/**` 列为 forbidden）⇒ 需要一张有插件写权的单。
  2. 现场真库（用户自己的 `~/.local/share/opencode`、kilo 库）的**再观测本轮未跑**：读它既不在本单必要面上，
     又会把凭据承载文件读进进程；51 阶段 A 的现场值按 `eb0c307` 证据算**引用**，本轮把其中逐字抄录的行值钉成回归测试。
  3. claude 门里"哪一轮对应哪个 turn"的**归属未验证**（账本三行的轮次归属靠计数推断）；要钉死需在门内加插桩，属门脚本面。
- **账务与清理**：真实模型调用 **0 次**（两轮都用假端点，`--live` 未使用）；凭据只作 locator，未复制/未落盘/未进日志；
  两轮 `--keep` 保留的运行根（含 `<temporary>/server/state/agentbox.sqlite`）取证后已 `chmod -R u+wX` + `rm -rf` 删除并核实缺席；
  `ps -eo comm | grep -c agent-box-worker` → `0`（`pgrep -x` 因 15 字符截断不可靠，故取 `ps`）；演示目录 `/tmp/084ce` 已删。
- **不改协议、不越界**：wire 零改动；`plugins/**` 与 `scripts/**` 零改动（观测轮用现成 `--keep` 旗标，前置 env 走文档化的
  `AGENT_BOX_SANDBOX_MODULE`，未把该前置补进脚本——那要另一张有 `scripts/**` 写权的单）。


## 工单 085 — 60 遗留：先钉键，再把姿态产物写进配置（2026-09-18，执行者）

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 085 | `POSTURE_CONFIG_WRITE_DONE` | G1 ✅ 每个被写入的键都有**一手**依据 + 真实工件快照对比：claude CLI **2.1.270** 的 `doctor › Invalid settings`（渲染件**无话可说** / 把 `permissions.ask` 改成字符串即报**带路径的类型化错误**），codex CLI **0.147.0** 的 `debug prompt-input` 回显（把 `danger-full-access`+`never` 收紧 ⇒ 归一后与"本来就严格"的文件**逐字同一块** 473B `5db7584e377bcef7`）；G2 ✅ **只收紧**有两半反例（照姿态放宽的写入器会产出 3977B `bf9aedaed1d9cb40`，多出整段"Escalation Requests"越权指引；反向：姿态已被满足 ⇒ `changes==[]` 且**字节不变**）；G3 ✅ 类型化拒绝**六半**：未知键、未知动作、坏 base 形状、内联 `[profiles.*]`、未钉死的家、不在注册表的名字 | 本单新增 **34** 条（`-k claude` 11 / `-k codex` 10 为该文件内子集）；Validation `python3 -m pytest -q tests/server -k posture` → **39 passed / 593 deselected**（= 本单 34 + **先前既有**同名姿态测试 5，口径见证据 §7.6b）；根套件 **932 passed / 0 failed / 0 error**（255 s，= 084 的 898 + 本单 34，**零退化**） | **0 次 / ¥0** | `a323441`（阶段 1 钉键证据）+ `813d1d0`（阶段 2+3 写入器与 31 条测试 + §6 快照证据；**两阶段落一个实现提交，登记为偏差**）+ 本提交（阶段 4 类型化拒绝 + §7 证据 + 60 收口 + 本账行） |

- **实现落点**：`src/agent_box/server/profiles/posture_config.py`（`render_posture_config` / `write_posture_config`）。
  claude 只写 `permissions.ask`/`permissions.deny`，**合并进受审文件**（`allow` 与 `defaultMode` 可达但是放宽 ⇒ 不写）；
  codex 只以**文本**改顶层 `sandbox_mode`/`approval_policy`（不重排表与注释、绝不写 `danger-full-access`/`never`/`on-failure`、
  绝不产 `[profiles.*]`）。落盘 `mkstemp` + `os.replace`；返回值即快照对比（每路径一条 `before`/`after`，`before` 是文件原样）。
- **钉键的地基是一条版本事实**：宿主另有 codex **0.154.0** 已**拒绝** `approval_policy="untrusted"`，本部署钉死的 **0.147.0** 接受
  ⇒ 全部钉键观测只用**仓内工件**；写入面不得被"更安全的默认"偷偷扩大，也不得把 0.154.0 的收紧当"本部署未知键"。
- **阶段 4 的拒绝面从注册表派生，不是家名抄本**（一手）：`load_builtin_registry()` 给 8 家 ⇒ 拒绝名单 = 8 − 钉死 2 =
  `dsh, hermes, kilo, opencode, pi, qwen`。反例演练（内存内加第九家 `zz-new`）：派生名单随之变 7，
  **手抄名单会漏**；`write_posture_config(..., harness="zz-new")` 当场 `POSTURE_CONFIG_UNPINNED_HARNESS` 且目标字节未变。
- **一条容易误读的轴**（写给 093 的执行者）：注册表里只有 `codex` 声明 `permissions` 能力、`claude-code` **没有**，
  而该能力说的是"**运行时会不会应答权限请求**"，与"姿态能否物化进受审配置"**不是一条轴**。
  用它推写入面会同时得出两个错结论（claude 被误判不可写、六家被误判可写）⇒ 已由测试钉住区分。
- **60 收口（不改别人的契约）**：60 的"翻译产物写入配置"遗留**收窄为三条**并写进 60 行；**60 维持 `PARTIAL`**。
- **精确剩余（本单未做，逐条给入口）**：
  1. **生产接线**——`posture_config.py` 目前无调用方，本单 Scope 明写"不碰 wire" ⇒ 归 **093**（R-0013 第 1 层执行侧）。
  2. claude `permissions.ask` 的**运行时效果**未验证（需一次真实工具调用才看得见提示）⇒ 模型轮。
  3. **`ask→allowedTools` 分歧** ⇒ **B5（待人拍）**：见下面阻塞表。
  4. `external_directory` 无钉死的 claude 规则名 ⇒ 沿用 60 的 `PERMISSION_POSTURE_UNEXPRESSIBLE` 面，本单不发明。
- **账务与清理**：真实模型调用 **0 次 / ¥0**（三家 oracle 全零成本：`doctor`、`debug prompt-input`、读注册表）；
  两家探针全程走隔离目录，**未读**用户真实 `~/.codex`/`~/.claude`，未装载任何凭据（locator 目录全程未访问）；
  `codex debug prompt-input` 会把 cwd 的 `AGENTS.md` 渲进提示 ⇒ 只在 `/tmp` 下跑、输出经关键词过滤后才进证据文件；
  `/tmp/085*` 十项临时件（`085cx147`/`085claude-config`/`085claude-proj`/`085claude`/`085claude-help.txt`/
  `085codex`/`085cxws`/`085cx-pro.txt`/`085snap`/`085split`）已删除并核实 `ls -d /tmp/085*` 为空。
- **两条环境/账目事实（都不是本单回归）**：
  ① 裸 `python3 -m pytest` 在本机以 **40 个 collection error** 失败（`~/.local/lib/python3.12/site-packages/` 三条
  `__editable__*.pth`，mtime 2026-06-19/08-05/08-20，把 `agent_box` 指向 `/home/maoqh/projects/agent-box/src`，
  该路径**没有** `server` 包）⇒ 本树门必须带本节头「计数口径」那条 `PYTHONPATH`；**三条 pth 未改动**（只读诊断）。
  ② 上一轮挂的"893 vs 898 差 5 条"**是我这边的算术假象**：我把 `-k posture` 的选中面当成了本单文件的条数。
  一手复核后 084 的 898 **逐字成立**（`git diff --stat 873a6d4..HEAD -- tests/ src/` 只含本单两个新文件），
  本单 34 条 ⇒ 932，无悬案。详见证据 §7.6(b)。


## 工单 086 — 65 最后一圈：真 harness 父侧自发起 tools/call（2026-09-18，执行者）

> **已收口**：终态见本节末行（`SUBAGENT_HARNESS_ROUND_DONE`）。阶段 1/2/3 各有一行，G1/G2/G3 与 65 收口在阶段 3。
> 证据：[subagent-harness-round-086.md](../server-round1/fullstack/subagent-harness-round-086.md)
> ＋ 原始事实 [subagent-harness-round-086-pin.json](../server-round1/fullstack/subagent-harness-round-086-pin.json)
> （sha256 `0d2aad5e30a936cf5bd6801c58c2f45fd9fa8d9b4dd85402a0feebb0033de95f`）。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 086 | 1 选家并核对工具播发 | 本阶段的门 = **读路径一手钉死 + 发散即失败**：claude CLI 的 `tools` 数组里，探针工具**只在** `.claude.json` 与 `.mcp.json` 声明时出现，**在 `settings.json`（= 65/58 的渲染落点）声明时缺席**；空白对照三文件皆无 ⇒ 断言空。生产形态组装门：有出向授予 ⇒ 桥条目**真的落进** `.claude.json` 且轮次 `completed`；无授予（反例）⇒ 角色目录里**没有** `.claude.json`；只读投影 `settings.json` 存在且**不含**桥条目 | 本单新增 **9** 条（`-k mcp_config_source` 5 / `-k subagent` 面内新 4）；Validation `python3 -m pytest -q tests/server -k subagent` → **8 passed / 633 deselected**（= 本单 4 ＋ 65 既有 4）；根套件 **941 passed / 0 failed / 0 error**（356 s，= 085 的 932 ＋ 本单 9，**零退化**） | **0 次 / ¥0** | 本提交（阶段 1） |
| 086 | 2 真 harness 父轮一轮 | **首跑未过（真缺陷）→ 099 修好后复跑绿**。首跑：真 Server 起 uvicorn 真监听 → 两个 Profile → **播种轮 completed 且没有任何一次请求播发桥工具**（"条目不是恒在"的反例成立）→ 授予 → 父轮**失败** `EXECUTION_FAILED`，根因 `WorkerError: operation is unsupported`（`sidecar.py:593` 发 `home.put`）。复跑（c12，**全一手**，`SUBAGENT_REAL_ROUND_OK`）：真 CLI 读 `.claude.json` → `tools/list` **带上两个桥工具** → 父**自己**调 `list_subagents` 拿回 `[{"name":"086 beta",...}]` → 父**自己**调 `run_subagent` → Server 派到 beta 的 Profile 跑出**一个真子轮**（`parent_turn_id` 指向父轮、`usage_source: claude-projects-line`）→ 子摘要回到父历史并被父最终文本带出 → 出口守护 loaded、非 loopback 目的地**零**次到达、`unauthorizedProviderRequests = 0`。**G1 反例仍咬得住**：同一份用例里"没有任何一次请求播发桥工具"的缺席判定 + `discovered == ["086 beta"]`（名字只可能来自桥返回的 roster，写死常量的第一版正是被授权检查打回的）| 本阶段新增 1 条真实链路用例（`tests/server/test_subagent_harness_real_round_086.py`；无 Worker 二进制或无 bwrap 时**跳过**）| **0 次 / ¥0**（端点是 loopback 脚本假端点，凭据是 gate 的假令牌；真模型一次未调） | 本提交（复跑绿）＋ 099 |

- **阶段 2 的红已按其本来的用途转绿（同一份代码、同一份用例，一手）**：登记为"已知红"时它正是 099 的门 G5 的对象，
  修好前不许改期望。复跑过程中另修掉**两处夹具自身**的缺陷（都不是放松验收）：
  ① 默认 Worker 从 `c11` 改指 `c12`——把反例留在默认位上等于"根套件故意红"，反例应由 099 的 wire 用例**按名钉住**；
  ② 读 `tool_result` 要取**最新一条消息的最后一个块**：一轮里连发两个工具时两个结果并排落在同一条 user 消息里，
  取第一个就永远先读到 roster，父轮明明已拿到子摘要却被判"没拿到"，脚本于是委派了第二次（`DELEGATION LOOP`）。
  现在把整条 `toolResults`/`historyToolCalls` 链一并记进报告，这类"多工具轮"的观测错位一眼可辨。


- **阶段 1 计数口径已作废并被复核替代**：当时写的"根套件 **941** = 零退化"只覆盖到阶段 1 新增用例，
  阶段 2 那条真实链路用例（当时红）尚未计入。099 阶段 4 修好后的全量复跑：**946 passed / 0 failed / 0 error**
  （284 s）= 941 ＋ 086 真实轮 1 ＋ 099 wire 4。留一个红的用例在阶段 2 的提交里是**有意的**：它就是 099 门 G5 的对象。

| 086 | 3a 四项核对（观测半）| 核对**不是签字，是去跑**。每条都写成"从产品真正走的那个入口进来"的用例（`tests/server/test_subagent_rule_liveness_086.py`，7 条）：**归属 ✅**（子轮用量留在子轮行、`parent_turn_id` 指向父轮、并以事实形态回到父轮请求里；反例在断言内——父轮自己 `complete` 成 3/2/5，任何"把子轮抄到父轮"的汇总会显示成 14/9/23）；**摘要 ✅**（两侧都跑：>4096 被截到 `MAX_SUMMARY_CHARS`＋省略号、界内逐字不变，反例是"用占位符替代正文"的截断器）；**取消 ❌ 红**（`turns.cancel` 真入口把父轮取消后，账上仍在 `running` 的子轮**没有任何人问它要不要停**——`cancel_children` 在 `src/agent_box` 里**零调用方**）；**审批 ✅**（65 已有的镜像用例走的是真方法 `SidecarExecutionBackend._native_event`，本次复核其生产可达性）；**环 ❌ 红**（`DID NOT RAISE`：授权层只拒**直接反向边**，A→B、B→C、C→A 三条边**都能建**，而 `run` 的 `chain` 参数**loopback 端点从不传**⇒ 第 4 跳把环闭上、又开一个子轮，按归纳可无限下去）；外加两条"别拿更绿的调用骗自己"的守卫（端点那段源码里 `service.run(...)` 确实不带 ancestry；`run` 的签名里也不该再有 `chain` 可信）| **本阶段这 7 条里 3 红**（取消 / 环 / 签名守卫），红的原因逐条是上面写死的入口与观测，**不是**"期望还没写对"；其余 4 条绿 | 本提交新增 7 条（3 failed / 4 passed，2.6 s）| **0 次 / ¥0**（全假执行端口） | 本提交（阶段 3 观测半，红为有意） |

- **一条把"死规则"这个判断救回来的更正（一手）**：我原本按 65 的措辞以为"两跳环 A→B→A 在生产上跑飞"，跑出来是
  **授权层当场拒**（`profiles/repository.py:140`，"a Profile cannot call itself" / :157 直接反向边 ⇒ 两跳环**建不出来**）。
  真缺陷是**它只看一条反向边**，三跳环能建、而运行期那一道因为 `chain` 从不传递而看不见 ⇒ 修法不是"再加一层限制"
  （R-0016 明令不许新增限制），而是**把已有的环检查接到真链路上**：祖先链由账本 `parent_turn_id` 走出来，
  调用方无权自报血统。深度上限按 R-0016 **撤销**。
- **顺带钉住的一条次序事实**：`run` 里参数校验**先于**血统检查，所以一次 `description` 只有两个词的委派会以
  `SUBAGENT_ARGUMENT_INVALID` 被打回、根本走不到环检查（第一版用例就是这么"红错了地方"的）。

| 086 | 3b 两条死规则的修法 | 修法**不加新限制**（R-0016 明令），只把已有的规则接上真链路：**血统**——`delegation.run` 的签名里再没有 `chain`，祖先链由 `SessionsRepository.turn_ancestry_profile_ids()` 沿账本 `server_turns.parent_turn_id` 逐跳走出（每跳一跳一读、带 `visited` 自守卫），交给新的 `profiles.subagents.check_cycle()`；调用方**无权自报血统**。**深度**——`DEFAULT_DEPTH_LIMIT` 连同其拒绝分支一并**删除**，留下的界仍是"每父轮 ≤4 次调用"。**取消**——`SessionService.cancel_descendants()` 把取消沿账本子轮递归下发（`live_child_turn_ids()` 只取 `ACTIVE_TURN_STATES`），并接在**两个**入口上：REST `turns.cancel`（`cancel_turn` 里本轮 stop 未确认时也要下发）与 wire `runs_stop`（在 `if not accepted:` 早返回**之前**）。反例各自咬死：环用例第 1、2 跳**必须成功**、第 3 跳（gamma→alpha）才 `SUBAGENT_CYCLE`，且断言第二跳**没留下任何子轮**；取消用例的父轮一旦取消，端口必须收到对那个子轮的 `cancel`，否则红 | 本阶段净增 **1** 条（wire 入口那条同规则用例）⇒ `tests/server/test_subagent_rule_liveness_086.py` **8 passed / 3.97 s**（3a 的 3 红全部转绿）；三份委派用例面 `test_subagent_rule_liveness_086 + test_delegation + test_subagents` **22 passed**；**根套件 954 passed / 0 failed / 0 error（382.19 s）= 099 收口时的 946 ＋ 本单阶段 3 的 8 条**，逐项对上、**零退化**。**门的可证伪性是量出来的、不是声明的**：把 `check_cycle` 与 `cancel_descendants` 在**同一进程内**替成空操作（不改任何文件，经 `pytest.main` 跑）⇒ 恰 **3 failed / 5 passed**，失败的正是 REST 取消 / wire 停止 / 环三条 | **0 次 / ¥0**（全假执行端口；凭据 locator 全程未访问） | 本提交（阶段 3 修法半）|

- **两条规则的死法不同，修法也就不该相同**：环检查**一直是对的**、只是看不见调用（`chain` 从不传递）；取消传播的
  `cancel_children` 则是**从零到有的孤儿**（`src/agent_box` 里零调用方，且它放在 `delegation.py` 里、连层级都不对）。
  故前者是"接线"（血统归账本读）、后者是"删除并换位"（cascade 归 `SessionService`，因为只有它同时握着账本与执行端口）。
- **递归的终止性**（写下来是因为它必须可论证，而不是"跑起来没炸"）：`cancel_descendants` 只在
  `live_child_turn_ids` 上递归，而运行期环检查保证任何父轮的子代里**没有重复角色** ⇒ 血统链不自交、递归自然有界；
  账本里也不存在自指行（授权层拒自授予，`turn_ancestry_profile_ids` 另带 `visited` 兜底）。
- **仍未做的环缺口（如实登记，不在本单偷修）**：授权层要拒的是**任意环**而不仅**一条反向边**——
  A→B、B→C、C→A 三条边**现在仍然建得出来**，只是运行期第 3 跳会被 `check_cycle` 拦住。
  把"图必须是 DAG"这件事做到授权层，属授权 CRUD 的面（65 的 C 段），要新工单。
- **一条契约字面交回调度者（不改契约、不自行放宽验收）**：工单 **G2** 写"子轮用量**记在父轮**"，而实现与 65 的
  docstring 是"子轮用量**留在子轮行**、`parent_turn_id` 是链路、子轮用量以事实形态回进父轮的**工具结果**里——
  没有任何东西抄到父轮"。两种口径都能满足"归属可追溯"，但**账上只有一种写法**。本单按实现口径核对并出具反例
  （断言内已把父轮自己 `complete` 成 3/2/5，任何"抄到父轮"的汇总会显示成 14/9/23），把**这句字面**交回。

- **本阶段跑出来的不是"绿了一圈"，是一条真缺陷**：65 把桥渲染进 claude 的 `mcp_target =
  `/runtime/home/.claude/settings.json`，而**该家根本不从这个文件读 MCP 服务器** ⇒ 条落进没人读的文件；
  生产模板又把同一文件声明为**只读投影**，于是"授予子代理的父 Profile"在真实部署形态下**组装期就
  `ASSET_SLOT_CONFLICT`**（`runtime.py:1020`）。65 的端到端用例之所以绿：其部署 `projectionFiles` 为空、
  且父侧由测试进程**自己写 JSON-RPC 驱动桥**——正是本单要补的那一圈的夹具限制。
- **改了什么（1 行事实，Server 零改动）**：`harnesses.toml` 的 claude-code `mcp_target`
  → `/runtime/home/.claude/.claude.json`（实测可读、落在执行期覆盖层、不是投影目标；`mcp_key` 仍 `mcpServers`）。
  落点选注册表而非 Server，是守 `runtime.py:_registry_profile_spec` 的原则"槽位是这个家自己的事实"。
  不选项目级 `.mcp.json`：那要往**用户的真实工作区**写配置。
- **连带改的三处断言（都是随事实走，不是为凑绿）**：`tests/server/test_asset_hubs.py`（58 的槽位钉值＋读取路径，
  hooks 仍留 `settings.json`）、`tests/server/test_delegation.py`（65 的两处 `.claude/settings.json` → `.claude.json`）。
  改前两处**如实失败**（`KeyError: 'mcpServers'` / "a granted parent must materialise the bridge"），改后转绿。
- **家与排除（注册表派生，非按感觉）**：工单建议"最省的一家例如 pi"这条**前提不成立**——`pi/dsh/hermes/kilo/opencode`
  **未声明 MCP 文档** ⇒ `SUBAGENT_BRIDGE_TARGET_UNSUPPORTED`，结构上不能承载桥；`qwen` 的 CLI 本宿主未安装（无法一手钉死）；
  `codex` 承载但**与自家只读投影相撞**（本单只写成断言，不越界修）。⇒ 本轮选 **claude-code**。
- **两条一手限制（不允许绕过）**：
  ① **版本漂移**：读路径观测用的是宿主 CLI **2.1.274**，本部署钉死 **2.1.270** ⇒ 对钉死版本属**未验证**，
  只能由阶段 2 的**沙箱内真 CLI** 给出最终确认（仓内工件二进制不得手跑，本轮该尝试被拒）；
  ② **`hooks_target` 同一形状**属**推导**（59 的 `settings.json` 走 `runtime.py:1018` 同一道检查）——本单**未**为
  hooks 做读路径观测，故不改、只登记。
- **一条基线既有失败（本单不修，见证据 §8）**：
  `plugins/agent-box-harnesses/tests/test_skill_projection.py::test_all_five_registry_targets_are_lossless_and_read_only`
  在**基线逐字节副本**（`git archive 4c32992 \| tar -x` 后原地复跑）上以**同一断言、同一两个字符串**失败 ⇒
  一手判定为**基线既有**、非本单回归。根因：该用例把一家的技能路径写死成 `/runtime/home/skills/{skill_id}`，
  而注册表（基线如此）里 claude 是 `.claude/skills`、qwen 是 `.qwen/skills`；根套件 `testpaths = tests` 不含
  `plugins/**/tests`，所以它一直没被跑到。**不顺手修**：属 52/58 技能投影事实，且钉正确期望要一次技能读路径的一手观测。
- **阶段 2 的硬前置（本阶段末已核实的三条事实）**：桥拨回的是 `self_url_of()`
  = `http://127.0.0.1:$AGENT_BOX_HTTP_PORT` ⇒ 必须**真监听**（`test_delegation.py:596` 的 uvicorn＋线程写法），
  `TestClient` 不算；出口守护只放 loopback ⇒ 拨回允许、审计里出现 `denied` 即本次运行不干净；
  `scripts/**` 不在本单 `write_paths` ⇒ 评审过的 `claude-production-chain-gate.py` **一个字不改**，
  在 `tests/**` 里以 `importlib` 按路径复用其部件。
- **阶段 2 探到的新约束（登记，留给阶段 3 的"审批"一项）**：ACP 适配器把工具权限检查交给
  `canUseTool` → 发 `session/request_permission`，而**Worker 侧没有该方法的应答路径**
  （`grep -rn request_permission workers/agent-box-worker/src/` 只命中 `fs::set_permissions` 两处无关项、
  `src/agent_box` 亦无）。⇒ 真父轮里的桥工具**必须在 SDK 侧就被预批准**（`permissions.allow`/`defaultMode`），
  否则这圈会卡在权限往返上；这与 085 登记的 **B5** 是相邻的两件事，阶段 2 用实测决定怎么说。
- **账务与清理**：真实模型调用 **0 次 / ¥0**（探针全走 loopback 假端点，CLI 的每次运行都记在 pin JSON 里，
  `authorized` 字段核对本注入令牌）；探针 CLI 运行全程 `HOME`/`CLAUDE_CONFIG_DIR` 指向临时目录，
  **未读也未写**用户真实 `~/.claude`；凭据 locator 全程未访问；临时件 `/tmp/086-pin.json` 已入库为证据副本、
  基线副本 `/tmp/086-baseline` 已删除并核实缺席。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 086 | 终态 `SUBAGENT_HARNESS_ROUND_DONE` | **G1 真 harness ✅**（claude-code 一家：真 CLI 进程 + 真 `.claude.json` 读路径 + `tools/list` 带上桥工具 + 父**自己**发起 `tools/call run_subagent`；**反例是"夹具冒充即失败"这一条本身成立**——同一份用例里"没有任何一次请求播发桥工具"的缺席判定与 roster 名字来源都写死为断言，65 的原端到端用例正是父侧由测试进程自驱桥，才让这一圈显绿）。**G2 归属 ✅ 但契约字面交回**（见上；口径按实现：子轮用量留子轮行、`parent_turn_id` 为链、以事实形态回进父轮工具结果，反例把"抄到父轮"的汇总显示成 14/9/23 而钉死）。**G3 记账 ✅ 0 笔**（**本单真实模型请求 0 笔**，全阶段合计；R-0017 口径：门级真实调用一次未花，端点为 loopback 脚本假端点、凭据 locator 未访问。逐笔记账在本单是"零笔可记"，如实写成零而不是含糊过去）| 本单三个阶段新增用例 **9 + 1 + 8 = 18** 条；Validation `python3 -m pytest -q tests/server -k subagent` → **17 passed / 637 deselected**，且**这一跑里 0 个 skipped ⇒ 阶段 2 那条真实链路用例（真 CLI＋bwrap＋真桥）在本次复跑里又绿了一遍**，不是一次性观测；`tests/server/test_subagent_rule_liveness_086.py` **8 passed**、委派面三份 **22 passed**；根套件 **954 passed / 0 failed / 0 error**（阶段 3 复跑，= 099 收口 946 ＋ 本单阶段 3 的 8 条，**零退化**）。阶段 1 当时写的 941 口径已作废并由 954 替代 | **0 次 / ¥0** | `3d19218`（阶段 3 观测半，3 红为有意）＋ 本提交（阶段 3 修法半 + 账）|

- **摘要（本单做完的一件事，和它顺带钉死的三件事）**：65 缺的那一圈——"父侧由**真 harness** 自己发起
  `tools/call`"——已经在真 CLI、真沙箱、真桥进程上跑通并留下可复跑的用例；顺带一手钉死了 ① claude 的 MCP
  **读路径**（`settings.json` 不读，故 `harnesses.toml` 的 `mcp_target` 改指 `.claude.json`，Server 零改动）、
  ② 两条**写下来却从未被驱动**的规则（血统自报 ⇒ 取消传播孤儿）现已接到真入口上、且**门的失败是被量出来的**、
  ③ 四家里 `pi/dsh/hermes/kilo/opencode` 未声明 MCP 文档 ⇒ 结构上不能承载桥，`qwen` 本宿主未装无法一手钉死，
  `codex` 与自家只读投影相撞（只登记不越界修）。**一家可行即 DONE**，工单的 `PARTIAL` 分支条件是"三家都不可行"，不成立。
- **未做项（不含糊）**：授权层的**任意环**拒绝（现只拒一条反向边，见上）；Worker 侧 `session/request_permission`
  的**应答路径**（缺失，故真父轮依赖 SDK 预批准）；`timeoutMs` 120 s 与子轮等待 600 s 的**张力**；
  真机上的**多子并发**扇出（并发 3/3 只有假端口面）；`hooks_target` 同形状的**读路径观测**（推导、未测）；
  codex `mcp_target` 相撞的修法（`harnesses.toml` 在本单 `write_paths` 内，但修法要一家自己的读路径观测）。
  另外宿主 CLI **2.1.274** 与部署钉死 **2.1.270** 的版本漂移，已由阶段 2 的**沙箱内真 CLI**（2.1.270）给出确认。
- **65 收口**：见下一行与账本 65 行（`PARTIAL → DONE`）。


## 工单 099 — Worker 的 `home.put` 从未接上分发线（2026-09-18，调度者投递）

> 本单是 **086 阶段 2 的硬前置**：086 的 `write_paths` 不含 `workers/**`，故 086 只把缺陷如实跑出来并开单，
> 不在本单范围内偷修。证据：[worker-home-put-dispatch-099.md](../server-round1/fullstack/worker-home-put-dispatch-099.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 099 | 1 观测 | 本阶段的门 = **真二进制上一手复现**：`home.prepare` 成功、`home.put` ⇒ `OP_UNSUPPORTED "operation is unsupported"`（不是夹具里的手写 JSON）。作用域钉死三处行号：实现在 `main.rs:2153` **完整存在**、分发臂 `main.rs:355` **缺 `"home.put"`**、兜底臂 `main.rs:491` 产该码 | 本阶段无新增测试（观测 + 契约）；根套件计数 **941 是 086 阶段 1 时的数，不能当"零退化"**（见 086 §计数口径） | **0 次 / ¥0** | `4443056` |
| 099 | 2 接线 | 一行：`"home.prepare" \| "home.put" \| "home.list" \| "home.get" \| "home.delete" =>`（`main.rs:355`）。**边界一字不动**（超限 `HOME_IO`、逃逸 `PATH_INVALID`、非普通文件拒、错误码逐字保持）。投递到**新** bundle `.acceptance-bundle-c12`（`sha256 9d8df86d214bf2b3e99afa461bd5ca83c62caae847cec507ea20e2518ce97088`），`c11` 原样留作反例（`sha256 c1e353c89609ab2feed0765205feeb3eb4c8db9679f353ba4065302df35a2457`） | `cargo test` **43 passed**；根套件见阶段 4 | **0 次 / ¥0** | `d5b7407` |
| 099 | 3 门 | **G1** 真进程 wire：c12 上 prepare→put→get 读回同一份字节、`home.list` 出现 `state/auth.json`；**反例**＝同一份用例跑 c11 ⇒ 该 op `OP_UNSUPPORTED` 且**同一条流上 `home.list` 仍正常**（反例只咬一个 op，不是一条死通道）。**G2** 空/超限/转义名/目录目标/叶子符号链接各自类型化错误，越界外那个 `outside` 哨兵字节仍 `untouched`，用例尾再发一发 `home.get` 证明流未死。**G3** 发散门 `the_dispatch_arm_and_handle_home_cover_one_home_operation_set` 读**两处真源码**比对集合；**演示**＝手工从臂里删掉 `"home.put"` ⇒ 门红并打印 `left=[4 op] right=[5 op]`（`main.rs:3203`），还原后 sha256 与备份一致 | 新增 `tests/server/test_worker_home_put_wire_099.py` **4 passed**（2 op 用例 × 2 bundle）；`cargo test` 43 passed | **0 次 / ¥0** | `5d70166` |
| 099 | 4 收口 | **G4** 根套件 **946 passed / 0 failed / 0 error**（284.51 s）＝ 941 ＋ 086 真实轮 1 ＋ 本单 wire 4，**零退化**；首轮那次 4 个 `ERROR` 是 `test_state_capture_error_boundary` 的**新鲜度门**（它按 mtime 判定 `target/debug` 二进制落后于 `main.rs`——阶段 3 往 `main.rs` 加了 90 行测试码，字节无关但 mtime 更新了），`cargo build` 后复跑即全绿，**不是产品回归**。**G5** 消费者 = 086 阶段 2 真轮由红转绿（见 086 行） | 946；插件目录不在根 `testpaths` 内（口径不变） | **0 次 / ¥0** | 本提交 |

| 单 | 终态码 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 099 | `WORKER_HOME_PUT_DISPATCH_DONE` | **G1** ✅ c12 真进程上 prepare→put→get 读回同字节、list 出现该文件；**反例真咬**：同一份用例 c11 ⇒ 该 op `OP_UNSUPPORTED` 且同一条流上 `home.list` 仍正常。**G2** ✅ 超限/转义名/目录目标/叶子符号链接各自类型化错误，`outside` 哨兵字节仍 `untouched`，用例尾 `home.get` 证明流未死；**实测与工单 §5 不一致处按实测登记**（空载荷 = `REQUEST_INVALID`，非 `HOME_IO`）。**G3** ✅ 发散门读两处真源码，删一 op 即红并打印两侧集合（演示 + 按 sha256 还原）。**G4** ✅ 946 零退化。**G5** ✅ 消费者 086 真轮红转绿 | `cargo test` **43 passed** ＋ 根套件 **946**（本单新增 wire 用例 4 条） | **0 次 / ¥0** | `4443056`＋`d5b7407`＋`5d70166`＋本提交 |


- **为什么它活得下来**：Worker 侧的 `home` 单测直接调 `handle_home`（绕过分发），Server 侧的资产写入用例走
  `TestClient`/内存实现（不经真 wire），于是"实现了但没接上"这条缝两侧都看不见。这与 58 的账行为何是
  `ASSET_HUBS_PARTIAL` 而非 DONE 是同一件事的两半——58 早就登记了真实链路未通，只是没定位到这一行。
- **影响面（分三级，不混）**：**实测** = 65 的子代理桥（阶段 1 把 `mcp_target` 改到可读物后，父 Profile 的
  资产集第一次真的非空，`sidecar.py:593` 的 `home.put` 才在真实链路上被走到）；**引用** = 58 的资产枢纽与
  56 的订阅文件（同一调用点，只是先前没有用例走到）；**未验证** = 其余通道。
- **顺手的一条契约卫生**：`082-ledger-45-closeout.md` 的三行 Stages 各带一个游离的起始 `^`，
  使 `validate_order.py --strict` 在全目录上失败；已用 `od -c` 逐字核对后删掉，勾选状态与文字一字未动。
- **本单不做**：不改 `home.put` 的边界语义（超限仍 `HOME_IO`、非普通文件仍拒、逃逸仍 `PATH_INVALID`；
  **空载荷实测到不了 `HOME_IO`**——`value_string` 先拒空串 ⇒ `REQUEST_INVALID`，该分支在真实客户端上不可达，见证据 §8 末）、
  不改 wire 形状、不动既有 bundle 目录（`c11` 留作反例样本，重建只写进新目录 `c12`）。


## 工单 097 — `server.hello` 能力表与派发表对齐（2026-09-19，执行者）

> **已收口**：终态行在本节末尾；四个阶段全部提交。
> 证据：[hello-capability-sync-097.md](../server-round1/fullstack/hello-capability-sync-097.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 097 | 1 观测：真 hello vs 派发表 | 观测形态 = **真 Server 真监听**（`build_runtime()` → `create_app` → uvicorn 真 bind `127.0.0.1`，`TestClient` 不算）＋ 真发一次 Validation 里那条 `POST /wire/v1/server.hello`。差集一手：声明 **27**（无重复）vs 派发表 **64**（无重复）⇒ **缺 37 条、逐条与工单 §Current state 同名同数**；**反方向 0**（表里没有派发不出来的方法）。工单没写、但决定后面两道门怎么落的两条一并实测：① 这 27 条里 **11 条是 `supported:false`**（四个 `workspaces.*` ⇒ `LOCAL_SANDBOX_UNAVAILABLE`；六个 `sessions.*` ＋ `sendOutcome.query` ⇒ `EXECUTION_CAPABILITY_UNAVAILABLE`）⇒ 这就是 G3 要比对的**同一部署基线**，且因为 `build_runtime` 的 `execution=None` 是生产默认（其 docstring 明写"好让能力回答诚实"），这 11 条是**真话**不是陈旧表的产物；② `tests/server/test_capability_namespace_boundary.py:72-76` 的能力命名空间隔离断言**读源码正则、不读这张表**，它已覆盖全部 64 条 ⇒ 补声明不会把第三套词汇混进前两套（但它是第二道防线，阶段 3 点名） | 本阶段无新增测试（观测 + 契约）；两个阶段 2 决定已在证据 §4 写明理由：`server.hello` **自身声明**（发现入口对自己隐身＝假话）、派生顺序取**派发表字面插入序**而非字母序（今天常量本就按族分组，字母序会把"表变全"伪装成顺序大改，而 §必须保持不变 点名的正是顺序稳定性） | **0 次 / ¥0**（只发一次本地发现方法，不碰任何 Provider；`auth.required` 用的是 `build_runtime` 自生成的会话令牌，凭据 locator 未访问） | 本提交（阶段 1） |
| 097 | 2 派生 + 自我声明的决定 | `hello()` 的循环改成 `for capability_id in self._handlers:`（`handlers.py:392`），**`CAPABILITY_IDS` 常量整条删除**——不是"留着不用"：删除后全仓 grep 只剩 `CANONICAL_CAPABILITY_IDS`（Harness 声明词汇，另一套命名空间）⇒ 没有任何一侧还在读那张手工表，"悄悄落后"的**载体**没了。`_capability()` 的判定分支**一字未改**，只加 docstring 说清它答哪两个问题、不答第三个（存在性看派发表；写了的规则看这里；**叫不叫得通不在这里**）。工单要求的两个决定按 §4 落：`server.hello` 自我声明、顺序取派发表字面插入序 | 形状与既有事实**逐字不变**（阶段 4 真机复跑核实：顶层四键、`protocolVersion=wire/1`、`auth={"required":true,"schemes":["session_token"]}`、条目 `{id, supported, reason?}`） | **0 次 / ¥0** | `dc2076f` |
| 097 | 3 发散门 + 反例 + 37 条 | 新文件 `tests/server/test_hello_capability_sync_097.py` **7 条**（`7 passed in 3.83s`）。G1 不是"两方相等"而是**三方相等**（hello / `_handlers` / `_PARAM_SHAPES`）＋ 无重复 ＋ hello 顺序==派发表顺序；**37 条按名字断言**（`declared - 27 == 那 37 条`），不比计数；G2 两个探测方法在场且 `supported:true` 且不带 `reason`；G3 **把沙箱探针两个分支都钉**（否则这条测试只在"本宿主跑不起沙箱"时成立——本机恰好如此，绿得没有说服力），比对范围**只钉既有 27 条**，不去断言新行的支持态（断言了新行＝把 §未做 的"新族该不该有 blocker"偷偷做掉）；兜底那条同时钉住"存在性另说"：`_capability("nothing.here")==(True,None)` 而同一部署上真调用它得到 `INVALID_REQUEST`＋消息含方法名。**反例是真跑的**：进程内把 `WireService.hello` 换回"遍历一份 27 条元组"的旧形状（不动任何文件，跑完 `RESTORED True`）⇒ **5 failed / 2 passed**，红的正是 G1、37 条、G1 反例、自我声明和 **G2**（`providerModels.probeModels is not declared at all`——落后一次就把前端两个按钮打死一次），绿的恰是"从来不管同步"的 G3 与兜底 | 7 passed（本阶段定向）；全套件计数见终态行 | **0 次 / ¥0**（缺席跑是进程内 monkeypatch，无模型、无凭据、无临时数据根遗留） | `a8b93f3`（门文件；证据与账随阶段 4） |
| 097 | 4 真机复跑 + 全套件 + 账 | **真 Server 真监听复跑**（与前端 P25 的门同一形态：`build_runtime` → `create_app` → uvicorn 真 bind `127.0.0.1:0` → `POST /wire/v1/server.hello`）⇒ 声明 **64 / 64** 与派发表**对称差 `[]`**；两次独立请求**顺序逐字节相同**（钉住"缓存客户端看到的是稳定列表"这句话，而不是只钉集合）；顶层四键、`protocolVersion=wire/1`、`auth={"required":true,"schemes":["session_token"]}`、条目形状 `{id, supported, reason?}` **逐字未变**（§必须保持不变由此实测而非声称）；`server.hello` 与两个探测方法均 `supported:true`；假行 **12** 条、真行 52 条（12 而非阶段 1 推的 11：`workspaces.gitStatus` 命中 `workspaces.` 前缀分支——**推论被自己的复跑纠正并写回证据 §3**，不是事后找补）。**Windows 侧同一 probe 不可达**（`curl :18770` exit 7 / `http=000`）⇒ 记为"WSL 侧真监听已足，Windows 的 27 行表要等它从本树重建部署才会换掉"（源码改不了在跑的进程），这条**写进交回而不是假装验过** | 定向 `7 passed`（`3.83s`）；**在最终源码 `a8b93f3` 上复跑**：`tests/server -q` **661 passed in 323.31s**、`tests/ -q` **961 passed in 374.66s**，0 失败 0 跳过；与阶段 2 提交前那轮（661/961，331.10s/303.07s）**计数逐位相同** ⇒ docstring 改动行为中性是**两次独立跑出来的同一对数字**，不是我说了算。**961 = 086 收口的 954 ＋ 本单 7**，一条未掉。`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67 的历史格式单，非本单引入）；`git diff --check` 干净 | **0 次 / ¥0**（全程只发本地发现方法；凭据 locator 未访问；三个临时数据根跑后逐一核实缺席） | 本提交（阶段 4，含证据 §8 与账） |
| 097 | **终态 `HELLO_CAPABILITY_SYNC_DONE`** | 门：G1 三方一致（hello==派发表==`_PARAM_SHAPES`，无重复，顺序为表自身顺序）＋ 反例真跑（换回 27 条旧形状 ⇒ **5 failed / 2 passed**，红的正是 G1、37 条、G1 反例、自我声明与 G2）；G2 两探测方法在场且 `supported:true` 无 `reason`；G3 既有 27 条在**沙箱两个分支**上逐行不变（`moved == []`、`stray == []`）；G4 计数 661/961 与基线 954＋7 吻合。摘要：能力表的**唯一真相变成派发表本身**，`CAPABILITY_IDS` 常量整条删除（载体没了才叫对齐），`server.hello` 开始声明自己，`_capability` 一字未改只说清它答哪两问。费用：0 次模型 / ¥0。清理：无源码外产物，临时根全部核实删除。**未做项（不在本单射程）**：① 新声明的 37 条**该不该有 blocker 规则**（本单只保证"存在即声明"，不判定支持态；判定＝改 `_capability` 语义，属 101/103 射程）；② 派生顺带把 101 的五个 500 方法如实声明为 `supported:true`——**方法存在为真、叫得通为假**，已交回 101；③ 105 依赖的 hello 契约再锁（本树无生成物，见交回） | 见上行 | **0 次 / ¥0** | 本提交 |

## 工单 098 — `providerModels.create/update` 带 provenance 直接 500（2026-09-19，执行者）

> **已收口**：终态行在本节末尾；四个阶段全部提交。
> 证据：[provenance-500-fix-098.md](../server-round1/fullstack/provenance-500-fix-098.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 098 | 1 观测 | 穿**真实 wire**（`raise_server_exceptions=False`，500 要以 500 的面目出现）实测：create/update 带 provenance ⇒ **500**；未知字段与枚举外值**也是 500**（工单 G3 期望它俩是类型化拒绝）；不带 ⇒ 200。**工单没点名的第三个方法**：`providerModels.probeModels` 形状同样允许可选 `provenance`（`handlers.py:90-92`）⇒ 同样一发即死；`probeConnection`（`:93-95` 不接受）那个调用点是**永远拿到 None 的死码**。**第二缺陷（本阶段最重要）**：`_provenance()` 返回 **SQL 列名**键（`:1336/:1346`），而服务层按 **wire 驼峰名**取（`service.py:67`、`:89`）⇒ **只修 NameError 会得到 200 ＋ 四列全 NULL ＋ `project()` 里没有 provenance 键**（静默丢数据，比 500 更难发现），工单 G2 是唯一能咬住它的门。覆盖核对一手：`grep -rn provenance tests/` 的 12 个文件命中**全是另一套词汇**（capability grant / sidecar commit / catalog ownership），且 `auth_style\|fields_source` 在 tests/ **零命中** ⇒ 55 的 provenance 面从 handler 到 store **一行测试都没有**（比工单判断更空一档） | 本阶段无新增测试、未改源码。行号核对：常量在 `:1315/:1320`、`_provenance` 在 `:1328`（工单行号整体 +13 漂移，因 097 删了 27 项常量）；类名是 `WireService` 不是 `WireHandlers` | **0 次 / ¥0**（`baseUrl` 全程本机 discard 端口 `127.0.0.1:9`，未出站、未访问凭据） | `8deb41c` |
| 098 | 2 修（三处一起） | ① **作用域**：`@staticmethod` → `@classmethod` ＋ `cls.` 引用（不提到模块级：两个常量是 `WireService` 的私有合同细节，本文件无模块级常量先例，且四处调用点**一字不改**）；② **返回键**：`_PROVENANCE_COLUMNS{field→column}` → **`_PROVENANCE_FIELDS`（四个 wire 字段名）**，列名归属留在 `repository.py`（不改名会留一个说谎的常量：它的值在修完后无人再读，名字却仍承诺做列映射；改前 grep 证明只有 `handlers.py` 与该工单文本命中）；③ **错误族**：`INVALID_PARAMS` 不在 `FAMILIES` 12 项闭集 ⇒ 两条**拒绝路径自己也是 500**（101 的缺陷族，101 §Scope 明写这两处划给 098）⇒ 改 `INVALID_REQUEST`，消息文本逐字未动 | 三个枚举值与四个存储列名**逐字未动**；不带 provenance 的路径逐字未动（`provenance is None` 保持"缺席即未知"）。全仓 90 个字面 `WireError(` 构造点扫完：射程内非法家族清零，剩 `handlers.py:1195`/`:1243` 两处原样带进 101 ⇒ **2 个字面点＝101 点名的 5 个方法** | **0 次 / ¥0** | `7f70440` |
| 098 | 3 门（11 条） | `tests/server/test_provenance_wire_098.py` **11 条全部驱动真实 wire**。G1＋G2：create 四字段读回、**再换一次独立调用（`providerModels.list`）读一遍**（回声骗不过去）、update 只给一个字段 ⇒ 其余三个保持；G4：不带 provenance 仍 `None`；G3：未知字段 / 枚举外值 / 非对象载荷三条都必须 `http=200` ＋ `INVALID_REQUEST`；第三个方法 `probeModels` 带 provenance 必须类型化不是 500；另加一条单独钉第二缺陷（返回键与四个列名**交集为空**）。**反例不止在文件里**：整份门拿去咬两种源码（把 `src/agent_box` 复制到 `/tmp` 只替换副本里的 `handlers.py`，工作树一字未动，跑完核实目录缺席）⇒ 旧代码 **10 failed / 1 passed**（唯一绿的是"不带就保持缺席"，它守的本来就是没坏的那条路）；**"只修作用域"的半修法 8 failed / 3 passed**，红的正是三条接受/读回与三条拒绝族 ⇒ **工单 §Scope 设想的那一行改法会自认"201 做完了"，实际 11 道门里 8 道不过** | 定向 `11 passed in 5.59s`。另与**已锁工件**对一遍（`AGENT_BOX_WIRE_SCHEMA`）⇒ 9 passed / 2 failed，两条失败都是工件漂移不是代码缺陷（`update#params` 与 `probeModels#params` 未声明 `provenance` 而服务端接受）⇒ 交 102；工件反成第三证人：`create#result` 的 provenance 子对象就是驼峰四键＋同三个枚举，`WireError.code` 的 enum 就是那 12 项家族 | **0 次 / ¥0** | `fb31cf5` |
| 098 | 4 真机复跑 + 计数 + 账 | **真监听复跑**（`build_runtime(临时根)` → `create_app` → `uvicorn.Server` 真 bind `127.0.0.1` 随机端口 → `urllib` 真发，`lifespan="on"`）：带四个合法 provenance 的 `create` ⇒ **200 且四字段原样读回**；紧接着**另开一次 `list`** 再读 ⇒ 落库确认（不是同一次响应的回声）；未知字段 / 枚举外值 ⇒ **200 ＋ `INVALID_REQUEST` ＋ 逐字消息**；`update` 只给 `fieldsSource` ⇒ 四字段齐全、其余三个保持；不带 ⇒ `None`；`probeModels` 带 provenance ⇒ `200 {status:failed, code:PROBE_UNREACHABLE}`（本机 discard 端口，未出站）；`server.hello` 顺带 200（097 的成果没被本单碰坏）。跑完 `TEMP_ROOT_ABSENT True`。**工单 §Validation 那条"对试用 Server 发"没做**，两条理由与"要人拍"登记见证据 §9.1/§10 | 全套件（在 `fb31cf5` 上）：`tests/server -q` **672 passed in 444.11s**、`tests/ -q` **972 passed in 358.34s**，0 失败 0 跳过；**672=661＋11、972=961＋11** ⇒ 两条都只长了本单新增的份数。差量（docstring 一段散文）由定向跑覆盖：`098＋097＋test_wire_v1` **55 passed**。`validate_order.py --strict` 30 OK / 31 FAIL（FAIL 恰为 37…67）；`git diff --check` 干净 | **0 次 / ¥0**。全程只有本机回环与 SQLite；`api.deepseek.com` 只是**一次 create 的字段值**，从未被解析、从未被连接；凭据 locator 未访问；三处临时根与两处 `/tmp` 旧码副本全部核实删除 | 本提交（阶段 4） |
| 098 | **终态 `PROVENANCE_500_DONE`** | 门：G1 带合法 provenance 的 create/update 不再 500（真监听复跑＋11 条门）；G2 四列写入且 `project()` 读回一致——**这条是本单真正的门**，它同时否决了"只修作用域"的半修法（8/11 红）；G3 未知字段与枚举外值都**真的被类型化拒绝**（不是 500、不是静默接受），另加非对象载荷一条；G4 不带 provenance 的路径与全套件计数不变（672/972 恰 ＋11）。反例三条真跑：旧代码 10 红 / 半修法 8 红 / 文件内两条进程内 monkeypatch。**摘要**：`_provenance` 的作用域、返回键、错误族三处一起改，provenance 面从"一用就崩"变成"能写能读、拒绝是类型化的"，前端 P28 的来源标注有了能用的上游。**费用**：0 次模型 / ¥0。**清理**：无源码外产物。**未做项（逐条点名）**：① 工单 §Validation 的"对**试用 Server**"那一腿——在跑的实例是本单修复之前构建的，对它复现只会再量一次 500，需要**先从本树重建部署**，且会往用户数据根留一条 Provider 记录 ⇒ 属部署动作＋要人拍，不是代码缺口；② `providerModels.update#params` / `probeModels#params` 在**已锁工件里仍没有 `provenance`**（守合同的客户端至今发不出这条腿）⇒ 交 102 重锁；③ `probeConnection` 里那个永远拿到 `None` 的死调用点未删（删它是改语义）⇒ 交 103 的覆盖面自然照出；④ 097 §9 那句"本树没有生成的 wire 工件"是**我找错目录得出的错结论**，已在 097 证据里就地更正（工件在 `docs/server-round1/fullstack/generated/wire-v1.schema.json`，且只覆盖 33/64 个方法） | 同上行 | **0 次 / ¥0** | 本提交 |

## 工单 104 — 探测出站的 SSRF 两条绕过 ＋ 凭据随行（安全；2026-09-19，执行者）

> **进行中**：本记阶段 1（观测）。终态行在阶段 5 提交时补。
> 证据：[probe-ssrf-hardening-104.md](../server-round1/fullstack/probe-ssrf-hardening-104.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 104 | 1 观测 | 两条绕过都在**公开入口**上实测（不只私有 helper）：① 字面私网被拒（`https://169.254.169.254`、`https://10.255.255.254` ⇒ `PROBE_ENDPOINT_BLOCKED`），**同一地址换成域名就通过**；把 `socket.getaddrinfo` 换 tripwire 数出来：`_validate_endpoint` 期间 **0 次解析**，`pull_models` 全程只有 **1 次且发生在连接层**，返回值没人看 ⇒ 拒绝与否取决于 URL 写法而不是目标是否内网；② 本机起两个回环假端点，A 回 302→B：`出站请求总数 = 2`、**二跳带 `Authorization: Bearer <同一假值>`**（合同说一次）。**工单没写的第三条（撞出来的）**：`getproxies()` 在本机非空 ⇒ 探针走默认 opener 就交给系统代理——`https` 腿代理只见 `CONNECT host:443`（看不到头），`http` 腿代理收到**绝对 URI ＋ 明文凭据**并且 `pull_models` 回 `ok/1 model ids`（Server 以为在探声明端点，实际整次对话由中转方完成）；按本机真实代理环境跑"302→`http://169.254.169.254`"：跳 1 直连被记录、**跳 2 离开本进程由代理代跑**（回 502——是那个外部进程不放行，不是我们的代码拒绝） | 无新增测试。既有面核对：唯一的 SSRF 门 `test_usage_parsing.py:392-404` **只喂字面 IP**（3 个都不是域名），全仓 tests/ 里 **302/redirect 零命中** ⇒ 与 098/099/101 同一形状：实现有门、门只走一条腿。出站清扫表：Python 侧带凭据出站**只有 `probe.py:94`** 一处；`workers/**` 零命中；JS 三处不是同一威胁模型（表在证据 §4） | **0 次 / ¥0**（凭据只用字面假值；目标只有 127.0.0.1 与一个从未被解析的 `.invalid`/`.example` 名字；tripwire 让"解析"这一步也不出本机） | 本提交（阶段 1） |

## 工单 092 — Provider 记录中立化 + 协议词汇 + 兼容派生（R-0013 第 1 层；2026-09-19，执行者·runtime 线）

> **runtime 半落地、wire 半路由 A/settings 重锁** ⇒ 终态 **`PROVIDER_REGISTRY_PARTIAL`**（与 097/098
> 把 wire/schema 项交 102 同型）。§3「今晚队列」判据满足：**092 收口行可在此查到 ⇒ 093 / 094 / 096 开工谓词成立**
> （093 接线输入——记录 `protocols`/`endpoints`、描述符 `wire_protocols`、冻结透传——已在本树内部面具备）。
> 证据：[stages2-5 落地账](../server-round1/092-provider-registry-stages2-5.md) · [wire-review 092 节](../server-round1/wire-review.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 092 | 2 中立化迁移 | schema 19→20：`_migrate_19_to_20` 表重建（显式列名、前向 only、幂等）；service 引用/冻结：NULL＝任意声明兼容家可引用、绑定家跨界仍 422；repository `harness_type:str\|None` | `test_provider_neutralization_092.py` **5 passed**（迁移保真/幂等/全新=20/共享引用+反例/仓储插入 NULL 行）| 0 真调用 | `b192a5f` |
| 092 | 3 词汇+事实 | `provider_protocols.py`：四值 canonical + 方言归一（`chat/chat_completions/openai-completions→openai-chat`；`anthropic/messages/claude→anthropic-messages`；`generateContent/gemini→gemini-generate`）；未知⇒`PROTOCOL_UNKNOWN` 且记录不建；`endpoints` 键⊆protocols + 复用 `probe._validate_endpoint` 私网拒；`capabilities` 严格、缺席保持缺席、错形⇒`PROVIDER_MODEL_INVALID`；service create/update 落 config 对象、update 未带 protocols⇒保留；project 读回 + `protocolsDeclared` | `test_provider_protocols_092.py` **12 passed**；回归 `098+wire_v1+stage_a+092` **80 passed**（wire_api 存储语义未动，守 098 收口） | 0 真调用 | `826d079` |
| 092 | 4 派生+冻结 | 描述符 `wire_protocols`（装配校验：键∈canonical、值非空、≤4）；`execution/protocols.py` canonical 单一真相；runtime 座位解析 `wireProtocols`⇒违规 `SIDECAR_DEPLOYMENT_INVALID`；list 读时派生 `compatibility[{harness,protocol}]`（两侧都声明才成对、稳定序、不落库、改声明即变）；冻结两侧声明且不相交⇒`PROTOCOL_INCOMPATIBLE`、任一侧未声明⇒不拦 | `test_provider_compatibility_092.py` **6 passed**（G4 派生+反例、未声明≠不可用、G5 拒+补协议后同引用通过、描述符非法拒）；回归 `harness_sidecar 92/wire_v1/subagent_086/stage_a` | 0 真调用 | `8e6fa44` |
| 092 | 4b 逐家声明 | 六家可钉 `wireProtocols`（codex `{chat,responses}`、claude `{anthropic}`、pi `{openai-completions}`、hermes `{chat_completions}`、opencode/kilo `{@ai-sdk/openai-compatible}`）——方言值全取自 093 一手观测；dsh/qwen 省略＝未声明（钉死不猜） | 六模板 **79 passed** + harness_sidecar **92** + 092 compat/protocols **18**；装配无 `SIDECAR_DEPLOYMENT_INVALID` | 0 真调用 | `56af017` |
| 092 | 5 门+账 | 全量 `tests/`+`plugins/harnesses/tests`＝**1211 passed / 20 failed / 24 skipped**（修复前）。**本单引入 1 红**（`wire_protocols` 注释品牌字面 `codex` 被 capability-path 中立门咬）⇒ 修（去品牌字面，`harness_capability_integration+server_capability_contract` **70 passed**，`1cc4e8c`）；余 **19 红全环境性/继承**：**Worker 工件不在**（chain_gate/opencode×11/pi×5/production_lease）+ `test_skill_projection`（claude native-home `.claude`，继承非本单）。**修复后本单引入回归 = 0**。`待 QA 复算` | 见左（**待 QA 复算**） | 0 真调用 | 本提交 |

**终态 `PROVIDER_REGISTRY_PARTIAL`**。精确剩余（**都在本执行者「不碰 `server/wire/**`」边界外，路由 A/settings**）：
① `handlers.py` `providerModels.create/update` 参数白名单（harness 可选 + `protocols[]`/`endpoints{}`/`models[].{protocols,capabilities}`）+ `wireApi` 枚举扩 canonical 四值 + 旧两值归一（连带 098 `wireApi="chat_completions"` 回声断言需同步）；
② 生成 wire-v1 schema/工件 + P28 重生成 + 两仓重锁（G7 材料已备：见 wire-review 092 节）；
③ **v2 多槽**（R-0013 追加，G8/G9/G10）：`config.describe` 逐槽 `model_slot` 投影 + profile 槽表引用形状（均在 `handlers.py::config_describe/_controls`＝A 线）＋描述符 `model_controls` 声明（本树可随后半补，不依赖 wire）。
runtime 侧（存储/service/描述符/派生/冻结/逐家声明）已 DONE 且带反例。**§Spend：0 真调用 / ¥0**（全合成输入与本机回环，凭据 locator 未访问，临时根核清）。

## 工单 120 — 缺凭据不许崩成 KeyError／不许只剩 EXECUTION_FAILED（主路径；2026-09-19，执行者·runtime 线）

> 调度者插入「今晚焦点之前」（R-0054 ⑥ + AQ-0009 主路径无已知未修；A 的 T6 一手硬前置）。做完即回 092→093（已完成）。
> 证据：[credential-missing-typed-failure-120.md](../server-round1/fullstack/credential-missing-typed-failure-120.md)

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 120 | 1-4（一处提交收口） | G1 store 缺 locator⇒`SecretLocatorUnavailable`（`code=CREDENTIAL_NOT_AVAILABLE`、点名不敏感 id、**零 key 内容**）非 KeyError；G2/G3 port_factory 在 capability_gate/spawn **之前**把读失败转成 `CREDENTIAL_NOT_AVAILABLE` 并落日志⇒`_safe_code` 出**具名码**非 `EXECUTION_FAILED`；G2 反例见证 `_safe_code(KeyError(..))==EXECUTION_FAILED`（退回即门红） | 定向 `test_credential_missing_typed_120`+`test_deployment_credentials` **15 passed**；`harness_sidecar` **92 passed/6 skipped**；`runtime` import OK；**Worker 工件不在**（QA-007，环境红与本单无关）| 0 真调用 | 本提交 |

**终态 `CREDENTIAL_MISSING_TYPED_FAILURE_DONE`**（runtime 射程）。边界如实：转录 reason 字段＝大写 code（wire `execution.state` 既有形状）⇒ 本单把 `EXECUTION_FAILED` 升到具名 `CREDENTIAL_NOT_AVAILABLE`；更长的自由文本"换哪个 profile"属 wire/schema 消息位（A 树），可行动细节现落服务器日志（只 id、零凭据内容，守 R-0032⑤）。`wire/**` 未动。§Spend：0 真调用 / ¥0。

### 工单 093 — 阶段 3 接线（本次增量，非终态；2026-09-19，执行者·runtime 线）

> 092 收口后开工判据成立。**已落**：freeze 透传 `protocols/endpoints`（`85ac5b8`）+ `native_materialization.materialize_family(harness, frozen)` 派生器
> 把冻结执行喂给各家既有渲染器（codex/pi/claude/opencode/kilo/hermes），**记录 base_url+方言替模板常量**；无 facts⇒`None`（保模板逐字节，G6）；
> 不支持协议⇒渲染器 `translate_protocol` 抛 `PROTOCOL_UNSUPPORTED_BY_HARNESS`（不写、不猜）；dsh/qwen⇒`None`（未钉死不猜方言）。
> 测试 `test_native_materialization_093_stage3.py` 6 条（codex URL/方言/层级/幂等、opencode options.baseURL、claude env、拒、无facts⇒None、dsh/qwen⇒None）；
> 定向 `materialization or native` **27 passed/2 skipped**（含 093 阶段 2 既有 25 条未退化）。
> **剩（终态仍 `NATIVE_CONFIG_MATERIALIZATION_PARTIAL`）**：① 派生器接到**真实 guest 投影写点**（turn 期）＋ 端到端第二上游真轮＝本环境缺 Worker/sidecar
> 工件不可跑（同 108/114 真机腿先例，只读+in-process 覆盖）；② v2 逐槽/限额落盘（`model_controls` 描述符侧 + 各家 limit 字段）尚未接（092 wire 多槽那半未落）。逐家 DONE/PARTIAL 待真轮环境补。

### 工单 094 — 登录引擎（阶段 1+2，假端点；非终态；2026-09-19，执行者·runtime 线）

> 092 收口后判据成立（provider authStyle 可用 + harness 侧声明）。**已落**：`server/accounts/login_engine.py`——
> device-code 登录引擎（会话生命周期 begin/poll/cancel + 流程注册表 **只登记一手钉死的 codex**，端点/auth.json 形状抄自 cc-switch
> `codex_oauth.rs`/`subscription.rs`）；**transport 注入**⇒假端点在进程内跑机械路径（R-0011，0 真调用）；令牌只交 `land_asset`
> 回调（生产里进 secret store），**任何客户端视图零令牌**；取消/过期⇒**再无任何出站**（出站计数器为门证）。
> 类型化拒绝：未钉死的家⇒`LOGIN_FLOW_UNSUPPORTED`（零出站，绝不猜端点）；有流程但未声明 `subscriptionCredential.files`⇒`LOGIN_STATE_FILES_UNDECLARED`。
> 测试 `test_subscription_login_engine_094.py` **5 passed**（G1 cancel/expire 零出站、G2 视图无 token + 落 auth.json、G3 假端点全路径落资产、G4 两类拒）；
> 回归 `tests/server -k "account or credential or subscription"` **60 passed**；engine import OK。**Worker 工件不在**（无关环境红）。
> **剩（终态 `SUBSCRIPTION_LOGIN_PARTIAL`）**：① `accounts.beginLogin/loginStatus/cancelLogin` 三方法在 `wire/handlers.py`＝**A 树**（越界，交 A + relock）；
> ② 生产 transport（真 device-code 出站，复用 probe 边界）与 56 `pack_asset`+`AccountRecords` 的真实组装（本增量证明回调契约，未接生产 compose）；
> ③ **真机一轮登录**要用户在自己浏览器输设备码（本环境无人 + 无真链工件不可跑）＋一轮执行验登录态可用＝真机腿。逐家（codex 端到端 DONE）待真机环境补。§Spend：0 真调用 / ¥0。

## 工单 122 — 截断必须可见（主路径；2026-09-19，执行者·runtime 线）

> **终态 `TRUNCATION_VISIBLE_PARTIAL`**：一手核对判定属"执行段手里**没有**这个事实"侧（非"有而不说"）——
> Worker/ACP 完成事件根本不携带 stop reason（A 的 T6-4 整份快照键扫描 `trunc/stop/finish/max/cap`＝0 佐证），
> `_complete`（`sidecar_backend.py:539-548`）无条件 `Outcome.SUCCEEDED` 且把 `run.result` 整块塞 `nativeResult` 不解析；
> `complete_turn`（`sessions/repository.py:747`）**不写** `terminal_reason`（该文件在本单 write_paths 外）。
> 可见下游通道 `wire/projection.py:173 reason=terminal_reason or error_code` **本就在**，只缺上游字段 + 一处写入。
> ⇒ 补齐需 **Worker 协议字段 `stopReason`（ACP 既有枚举值，但字段在 Worker 契约上不存在＝合同变更，45/A 线写面）**＝
> 122 阶段 5"若必须新增 wire 字段⇒交回 ops，不许自行发明"。本树射程内无可诚实落地的代码改动。
> 字段需求（要什么/给谁/影响哪张单/为何不先做）逐条见 [证据](../server-round1/fullstack/truncation-visible-122-stage1.md) §2；收口剩余（拿到字段后 4 步）§3。§Spend：0 真调用。

## 工单 121 — 唯一覆盖"升级"的那条测试是装饰（AUD-B-006 low；2026-09-19，执行者·runtime 线）

> **产品侧 ①②③④ 已落（本次片：与 092 同文件，092/120 已收口 ⇒ 本执行者为唯一写者）**；终态 **`MIGRATION_TEST_IS_NOT_DECORATIVE_PARTIAL`**，
> 精确剩余＝v2 追加的 **Work Core SQL 文件迁移（migrations/001..009）等价门**（属 Work Core 子系统，`migrations_dir()`/`_run_migrations`
> 在 `work_core/db.py`+`.runtime`，非本单产品 SQLite 链；审阅者 AUD-B-009 已手工跑过 W1–W4，codify 成常设门是独立可跑的一格，留作下一单元）。§Spend：0 真调用。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 121 | 1 观测 | 一手复跑 `git log --all -S"agentbox_product_schema" --diff-filter=A` ⇒ **仅 `5a45303`**，`git show 5a45303:…database.py` ⇒ `PRODUCT_SCHEMA_VERSION = 2` ⇒ **v1 从未发布**（审阅者属实）。旧测试只断 `version==N` + 少数列名 ⇒ 抓不到类型/NOT NULL/主键漂移 | 复算既有 17 条仍绿 | 0 | 本提交 |
| 121 | 2 改定性 | 旧 `test_schema_one_migrates_turn_identity_columns_idempotently` 如实改名/改注释：它是**合成 pre-v2 种子驱动正链**，不谎称"真实 v1 升级"；曾试图断"合成种子⇔greenfield 等价"**合法失败**（正是该发现的活证据：虚构种子不能等同真装），据此收回该谎断 | 定向见下 | 0 | 本提交 |
| 121 | 3 结构断言 | 新增真实结构门 `test_greenfield_schema_holds_load_bearing_invariants`：逐列断 `server_provider_models.harness_type` NOT NULL=**0**（092 可空）+ `server_turns` 含 terminal_reason/error_code/… ；另 `_table_signatures` 指纹比较器 + `test_structural_comparator_is_not_blind_to_a_column_drift` 证门**不是恒真**（改一列 nullability ⇒ 签名不同）| `test_stage_a_server.py` **17 passed** | 0 | 本提交 |
| 121 | 4 死分支有结论 | **选 ②**：保留 `if current==1`/`_migrate_1_to_2` 作为合成种子→全链的驱动（生产根从 v2 起），依据＝删它即自毁这条升级覆盖；种子测试仍跑 1→current、幂等、保行 | 同上 | 0 | 本提交 |

**剩余（PARTIAL 精确项）**：Work Core `migrations/001..009` 的"全新安装⇔升级到 9"结构+ledger 等价常设门（G5：人为改坏一处升级列/迁移⇒红）。独立单元，本单产品侧不动它语义。

## 工单 096 — 思考/推理旋钮（阶段 1 观测；2026-09-19，执行者·runtime 线）

> 092（模型事实 `reasoningOptions`+描述符）+ 093（写入器）判据成立 ⇒ 开工观测。**阶段 1＝纯观测、零代码**。
> 证据：[096 阶段 1](../server-round1/096-native-reasoning-stage1-observation.md)。§Spend：0 真调用。

| 单 | 阶段 | 门/观测 | 冲突/边界 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 096 | 1 观测 | 逐家思考原生键一手实测（codex `model_reasoning_effort`@config.toml:26=high、pi `samplingParams.thinking`+`reasoning:false`@models.json:11/16、dsh `thinking:"disabled"`+`reasoningEffort:"off"`@settings.yaml:21/24、opencode/kilo per-model `options.reasoningEffort`@opencode.json:14/16、hermes `thinking`@config.yaml:16）；两层语义（旋钮=harness 级 / 值域=模型级、翻译后 ∪ 钉死枚举，两边无⇒不声明）；v2 默认翻转写死点一手定位 | **① §4 生效域投影在 `config.describe`＝A 树 wire**（与 092/122 同型：声明+校验+落盘本树做、describe 交 A）；**② §5 v2 改 `deploy/{pi,dsh,opencode}` 与 108 刚落的模板字节钉死测试同文件不同键⇒须同批改 108 期望**（R-0054 串行） | 0 | 本提交 |

**剩**：阶段 2–5（描述符 controlOptions/`modelControls` 声明旋钮 + `CONTROL_VALUE_UNSUPPORTED` 校验 + 写入器键 + v2 模板翻转**与 108 钉死测试同批** + G6/G7 真 thought.delta 门）。**G6 真产生 thought.delta 需真链（本环境缺 Worker/sidecar 工件不可跑）⇒ 096 终态预期 PARTIAL**；qwen 无思考键/dsh·pi 逐模型映射不抄私表 ⇒ 类型化拒绝+逐家 status 登记。

## 批 c2（runtime 线）· 本次会话边界报告 + 队列地图（2026-09-19 13:2x，执行者·runtime 线）

**本次会话新落（一手账，非继承）**：`092` runtime 半**收口 +tag `checkpoint/092-provider-registry`**；`120`**收口 DONE +tag `checkpoint/120-credential-typed`**；
`093` 阶段 3（freeze 透传 + `materialize_family` 派生器）；`094` 登录引擎（阶段 1+2，假端点）；`121` 产品侧（如实改定性 + 真实结构门）；`122` 阶段 1+5（一手核对 + wire 字段需求交回）；`096` 阶段 1（一手观测）。

**全量套件（本边界，`tests/`+`plugins/harnesses/tests`，`-p no:cacheprovider`）**：**1231 passed / 19 failed / 24 skipped / EXIT=1**。
**Worker 工件：不在**（`QA-007`）。对 092 收口那次基线（20 failed / 1211 passed）：**红 −1**（capability-path 中立门，本会话 `1cc4e8c` 修复）、**绿 +20**（本会话新增门）。
**19 红 = 全既有环境性/继承，本会话引入回归 = 0**：`chain_gate_without_worker`(1)、`opencode_gate_cleanup`(11)、`pi_gate_cleanup`(5)、
`production_lease`(1)（均缺 git-ignore 的 Worker/runtime 工件）＋ `test_skill_projection`（claude native-home `.claude`，继承非本会话）。**`待 QA 复算`**（`R-0040 ⑥`，不宣告"全量通过"）。

**为何本边界不打 `checkpoint/c2`**：c2 = 108→110→107→111→092→093→094→095→096，其中 **095/096 未收口**（095 依 094-DONE=真登录/真链；096 的 describe 投影属 A、G6 真 `thought.delta` 需真链）⇒ c2 批次未全闭，
按"每单收口才打检查点"（R-0053）只给已收口的 092/120 打了 tag；c2 批次 tag 留待 095/096 真收口或环境解锁。**非 QUEUE_EMPTY**（队列有未尽项）。

### 队列地图（下一步入口·可判定）

| 单 | 现态 | 卡在哪（精确） | 解卡入口 |
| --- | --- | --- | --- |
| `093` | 阶段 3 接线本树已落；真轮未跑 | 派生器接**真实 guest 写点** + 端到端真轮＝缺 Worker/sidecar 工件（本环境）；v2 逐槽落盘随 092-wire 多槽 | 有工件的树跑 production-chain-gate；092 v2 多槽 wire 那半 |
| `094` | 引擎阶段 1+2 落（假端点） | wire `beginLogin/loginStatus/cancelLogin`＝A 树；生产 transport + 56 `pack_asset` compose；真机设备码登录要人 | A 出 wire 三方法 + 一次真登录（用户浏览器输码） |
| `095` | 未开工 | 依 094-DONE（真链）；provider 型登录（Copilot/xAI/Google）端点**未一手钉** ⇒ 只能类型化拒 | 094 真收口 + 一手 provider OAuth 端点 |
| `096` | 阶段 1 观测落 | `config.describe` 生效域投影＝A 线 wire；v2 模板翻转与 108 模板字节钉死测试同文件⇒须同批改；G6 真 `thought.delta` 缺真链 | describe 交 A/或一次性写权；模板+108 期望同改；真链跑 G6 |
| `100` | 未开工 | A-089 谓词**成立**（R-0055 已入 rulings、runtime CP1 c1 绿），但逐家真实 UI 门＝真机链（本环境不可跑） | 有工件的树跑逐家真门（假端点优先） |
| `107` | 阶段 1 交回（prior） | pi 思考"开"的合法值本环境无一手出处（pi 未装、全局 dsh 非 pin 版）⇒ 不猜值 | 提供 pin 版 pi/dsh 的 `thinking` 合法值一手 |
| `121` | 产品侧 DONE（v1 装饰测试已如实改 + 真实结构门） | Work Core `src/agent_box/migrations/001..009`（`_run_migrations(conn)`+`schema_versions`）的升级⇔全新等价常设门；**注意 legacy-data 升级会多出 4 归档列**（AUD-B-009），非平凡等值 | 独立单元：按 W1–W4 四子实验 codify，含归档列语义反例 |
| `122` | 阶段 1+5 交回 | 需 Worker 协议 `stopReason` 字段（ACP 枚举，字段尚不存在）+ `sessions/repository.py::complete_turn` 写 `terminal_reason`（该文件在 122 write_paths 外） | ops 另开 Worker 协议字段单（A/45）；本单届时补解析+写列+反例 |

### 工单 096 — 阶段 2/3（取值域 + 校验，本树可落切片；2026-09-19）

> 纯函数 `model_configs/reasoning_knobs.py`：旋钮=harness 级、值域=模型级。
> `effective_domain` = 该家钉死 effort 枚举（codex low/med/high、opencode/kilo +xhigh，一手取 cc-switch presets）
> ∪ 当前模型 `reasoning_options`（方言翻译、去重、稳定序）；两边都无⇒`None`＝未声明（**不发明档位**）。
> `default_effort`＝中间档非最高（AQ-0001/G7）；`validate_reasoning_value` 域外或未声明⇒`CONTROL_VALUE_UNSUPPORTED`（指名控件+值）。
> qwen/dsh 枚举未一手钉⇒不声明（钉死不猜）。测试 `test_reasoning_knobs_096.py` **6 passed**；中立门未受影响（model_configs 不在扫描集，6 passed）。
> **096 整体仍 PARTIAL**：`config.describe` 生效域投影＝A 线 wire（本模块只决定"何值合法"，投影界面交 A）；
> 逐家 controlOptions 声明进 production.py + v2 模板翻转＝与 108 模板字节钉死测试同文件⇒须同批改（未做，串行）；G6 真 `thought.delta` 缺真链。

## 工单 126 — 并集语义组合（QA-014 高；合并窗口第一硬前置；2026-09-19，执行者·runtime 线）

> **阶段 1 完成**（一手核两侧 `update` 逐字 + 组合判定=可能 + 可执行蓝图）。终态记 **`UNION_SEMANTICS_RECONCILED_PARTIAL`**
> （阶段 2–4 实际改写未做——理由见下，非回避）。证据：[126 阶段 1](../server-round1/fullstack/union-semantics-reconciliation-126-stage1.md)。§Spend：0 真调用。

- **冲突一手**：A `112`（`89c72b5`）`update`＝`{**project(current),**body}` 打底 + `repository.update` 四列 `KEEP` 哨兵（省略保留 / 显式 null 清空）；
  runtime `092` `update`＝`_validate`→`normalize_protocols/validate_endpoints` + `_config_payload` 落 protocols/endpoints。两段各重写 `update`＋`repository.update` 签名 ⇒ 单边合并按 QA-014 U-A `73 failed`/U-R `48 failed`（EXIT=1），赢侧丢对面守卫。
- **组合蓝图（两边守卫同绿）**：`merged={**project(current),**body,…}` → 过 `self._validate(merged)`（092 归一）→ `config=_config_payload(merged,norm)`、`models=norm["models"]`（092）；四 provenance 列走 A 的 `KEEP` 哨兵（112）。
  需把 `repository.py` 的 `class _Keep`/`KEEP`+按需 SET 移植进本树（本树停在 092 态无 KEEP），并带 A 的 `112` 守卫测试进本树（逐字不改弱，同 `116` 先例）。
- **为何本次不仓促做完阶段 2–4**：动的是两树共享的 `repository.update` 签名（092 也改过它）+ 组合正确性必须**跑全套件**核对（两侧反例同绿、任一侧单退必红、092/120/121 不回退）；在回合预算末尾半拉子改共享段有误弄红当前 **1231/19 干净树**之险 ⇒ 留给专注回合一次做完并全套件核对。**非"组合不可能"**（蓝图已给），故不走裁决交回那条。
- **合同工件那处 docs 冲突**（rename/rename 的 `wire-v1.schema.registered-*.json`，机械收口 ⇒ 8 条 `FileNotFoundError`，测试承重）＝ 归 `113` 重锁，本单只记录不动手。

> **优先级覆盖（ops 第 122 轮 `d3802aa`）**：120/122 主路径须先于队列任何一项——本树 status **120 有 DONE 收口行、122 有 PARTIAL 收口行** ⇒ 前置满足；126 高优先阶段 1 已落，阶段 2–4 待专注回合。

### 工单 126 — 阶段 2/3：model_configs 半区组合完成（2026-09-19，fresh 预算）

> 依 §1 蓝图**在本树做完 model_configs 半区的 092×112 合取**（这半正归本树写面），把合并窗口的 model_configs 冲突预解掉。
- `repository.py`：移植 A `112` 的 `_Keep`/`KEEP` 哨兵 + `PROVENANCE_COLUMNS`，`update` 去 `COALESCE`、按"点名才 SET"生成（**省略＝保留、显式 null＝清空**）。
- `service.py::update`：`merged = {**project(current), **body, harness, provider}`（112 打底）→ 过 `self._validate(merged)`（092 归一/严校）→ `_config_payload(merged,norm)` + `norm["models"]`；四 provenance 列走 `body[...] if ... in body else KEEP`（112）。092 原先手写"缺 protocols 保 prior"已由 project 打底统一，删之（单一真相）。
- 新门 `test_union_semantics_126.py` 5 条（省略保 protocols+provenance、显式 null 清空 provenance 且保 protocols、update 换 protocols 仍归一、update 未知协议⇒`PROTOCOL_UNKNOWN` 且不改记录、repository 层 KEEP 省略保留直证）。
- **回归**：`126 + 092×3 + 098(真 wire update)` **41 passed**；广扫 `-k "model|profile|freeze|provider|provenance|credential|neutral|union"` **163 passed** ⇒ **092 守卫 + 098 真线 + 112 语义在 model_configs 半区同时绿，无回退**。**Worker 工件不在**（无关）。
- **剩余（终态仍 `UNION_SEMANTICS_RECONCILED_PARTIAL`）＝wire 半区**：A `112` 非本分支祖先 ⇒ 本树 `wire/handlers.py::_provenance` 尚无"显式 null 经 wire 透传清空"的 112 修复，而 `wire/**` 是 A 树写面（126 write_paths 外）。合并时 **A 带 handlers `_provenance`(112) 进来即与本作合取拼全**；A 的 `112` 真-wire 守卫测试（`test_provider_update_keeps_omitted_112.py`）届时可跑。**本树已保证 model_configs 半区合并不再二选一丢守卫**（QA-014 的 ≥10 条 092 守卫在此半区与 112 共存）。合同工件 docs 冲突仍归 `113`。

### 工单 121 — 阶段 升级：Work Core SQL 文件迁移等价门落地 ⇒ 终态 **DONE**（2026-09-19，fresh 预算）

> 补完 v2 追加格（前记 PARTIAL 的精确剩余）。`test_work_core_migration_equivalence_121.py` **4 passed**（常设、进程内、`_run_migrations`）：
> ① 全新安装 ledger=[1..9] 且幂等重跑结构不变；② **"004 形状 + legacy 数据"升级到 head ⇒ ledger=[1..9]、live 结构与全新安装逐字等价、
> 006 把 `started→accepted`、无关终态保留、原行入 `core_dispatches_pre_v006_archive`、**`inputs_digest` 保持 NULL（不拿旧摘要冒充）**；
> ③ **保留号 005（注释 no-op）仍入 ledger**（钉死 AUD-B-009 警告的"复用编号⇒runner 静默跳过新 schema"这个真坑）；
> ④ 结构比较器对 NOT NULL 漂移敏感（反例见证，门非恒真）。
> 产品侧（合成种子如实改定性 + 真实结构门）+ Work Core 等价门**两半齐** ⇒ 终态 **`MIGRATION_TEST_IS_NOT_DECORATIVE_DONE`**。§Spend：0 真调用。

## 工单 134 — 截断可见·消费侧（122 交回剩余；2026-09-19，执行者·runtime 线）

> 终态 **`TERMINAL_REASON_CONSUMER_DONE`**。消费侧在本树写面（execution/sessions）做全；**生产侧 `stopReason` 字段属 Worker 合同变更（审批队列），非本单**（134 §明确不做）。
> 一旦生产侧落地，`122` 的"可见"**即刻成立**（下游 `wire/projection.py:173 reason=terminal_reason or error_code` 本就通了）。§Spend：0 真调用。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 134 | 全（消费侧） | G1 合成 `stopReason:"max_tokens"`⇒`complete_turn` 写 `server_turns.terminal_reason`（列已存在）；G2 **缺席/`end_turn`/畸形⇒`None`⇒UPDATE 逐字不含该列**（与今天一致，不凭空造信息 R-0032⑤）；helper `_terminal_reason_from_result` 只认非干净停因（`max_tokens/refusal/max_turn_requests`），既有 ACP 词表不新造；Outcome 不改枚举（截断经 terminal_reason 可区分，wire projection 已透出） | `test_terminal_reason_consumer_134.py` **4 passed**（含 absent-safety 与 max_tokens 两反例）；sessions/turn 广扫 **187 passed**（complete_turn 热路无回退，仅既有 env 红 production_lease）；**Worker 工件不在** | 0 | 本提交 |

**与 122 的关系**：122 判定"执行段手里无此事实"属实（生产侧未出字段）；134 把**消费侧**备妥（读到就用、没有就不写）。生产侧＝`protocols/worker/v1.schema.json`+`workers/**` 出 `stopReason`＝审批合同单（交 I）。二者正交，122 维持其 PARTIAL、由生产侧单收口。

## 工单 135 — 类型化码必须走到真出去的那条腿（120 真机复算仍红·第 4 次同形；2026-09-19，执行者·runtime 线）

> 终态 **`TYPED_CODE_ON_LIVE_LEG_DONE`**。层次接线单：低层（`secrets.py`/`runtime.py`）本就带码，**缺的是腿**——`work_core/services.py` 的 dispatch 包装把上游异常**字符串化**成 `DispatchAmbiguous`，`_safe_code` 只在 `ExecutionStartRejected` 上认 `.code` ⇒ 泛码 `EXECUTION_FAILED` 吞掉 `CREDENTIAL_NOT_AVAILABLE`。§Spend：0 真调用。层次图见 `docs/server-round1/typed-code-live-leg-135.md`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 135 | 全 | 结构保留：三处包装（输入解析 `DispatchFailed`／`ExecutionStartRejected` `DispatchFailed`／`Exception` `DispatchAmbiguous`）在 raise 前用 `_dispatch_error_code(exc)` 沿链取 `.code` 或"整条消息即纯大写码"，命中才 `error.code=code`（构造签名/调用方不变）。G1+G2 真腿：`test_missing_credential_code_reaches_execution_state` 用**真 `dispatch_execution`** 抛出的异常喂 `sidecar_backend:287` 同款 `_safe_code` → 同款 wire `_event_body` → `reason==CREDENTIAL_NOT_AVAILABLE`（120 只把裸类型错误直调 `_safe_code`＝"门只走一条腿"，本单纯在补这条腿）；`RuntimeError("CREDENTIAL_NOT_AVAILABLE")`（A 日志原形）同绿。G3 泛码仍在：`RuntimeError("worker vanished at 03:14 …")` 句子消息 ⇒ 不附码 ⇒ `EXECUTION_FAILED`。G4 零凭据内容：id 在场、无 secret 字节。反例**已在树内实测**：删三处 `error.code=code` 附码 ⇒ 恰 3 条真腿红、2 条泛码/反例仍绿 | `test_typed_code_live_leg_135.py` **5 passed**；work_core/dispatch/credential/boundary/inventory 广扫 **153 passed / 4 skipped**（仅既有 env 红·**Worker 工件不在**）；`test_work_core_input_dispatch.py` 全绿（含 `RuntimeError("lost receipt")` 句子→仍泛码，无新附码） | 0 | 本提交 |

**关系**：与 `120` 同一处语义、不同腿——120 修两 seam 的门、135 补穿过第 3 层（dispatch 包装）到 `execution.state` 的真腿门。**未碰** `wire/**`/`protocols/**`/`bootstrap/**`/Worker 合同；修复全在 `work_core/services.py`（本单写面）＋测试。**第 5 次同形预防**：层次图落进证据文档，"低层绿/高层红"的判据＝门必须穿过第 3 层（直调 `_safe_code` 不算）。

## 工单 136 — 子代理"只能收紧"两条拒止必须走到生产调用点（`AUD-B-018` OF-14 第 5 例；2026-09-19，执行者·runtime 线）

> 终态 **`CHILD_LIMITS_ON_PRODUCTION_CALL_DONE`**。同族于 135（"门只走一条腿"）：`validate_run_arguments` 的 `child_limits` 判定与两条码（`SUBAGENT_PERMISSION_WIDENED`/`SUBAGENT_MODEL_WIDENED`）**都在**，但**唯一的生产调用点 `DelegationService.run` 从不传 `child_limits`** ⇒ 判定分支结构上是死码（超限参数生产形态 `ACCEPTED`，只手工塞才 `REJECTED`）。本单只改调用点派生+传参，判定语义/两码**逐字不变**。§Spend：0 真调用。证据 `docs/server-round1/child-limits-production-path-136.md`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 136 | 全 | 生产调用点 `run` 先按请求的子 profile 派生 `child_limits`：`permissions` 取子 row 的 `permission_preset`（narrow-only：`plan` 子⇒`["plan"]`，余⇒`["default","plan"]`）；`models` 取子冻结配置里 `model_control_id` 槽的 `modelId` 集（无槽/无钉⇒**省略该维＝不检、绝不误拒无模型声明的子**；整段 `try/except→None` 不致命）。名字只在**已授权 roster** 里查以取限（未知/越权⇒None，由 validate 以越权拒、非误判加宽）。G1+G2：`test_child_limits_production_path_136.py` 全走真 `DelegationService.run`——子 `plan` 请求 `default`⇒`SUBAGENT_PERMISSION_WIDENED`；钉 `gpt-5` 请求 `gpt-2`⇒`SUBAGENT_MODEL_WIDENED`。G3 收紧仍收：`default` 子请求 `plan` 完成、请求自身钉的 `gpt-5` 完成、无钉子请求任意 model 不误拒。反例**已树内实测**：把生产调用改回不传 child_limits ⇒ 恰 2 条生产加宽门红（退回 `ACCEPTED`）、3 条收紧/不误拒/低seam见证仍绿。G4 零削弱：`validate_run_arguments`+两码未动。同族自查：`validate_run_arguments` 生产唯一调用点，已接 | `test_child_limits_production_path_136.py` **5 passed**；delegation+subagents+rule_liveness_086+harness_round_086+profile_permissions 广扫 **42 passed**（`run` 热路无回退，`set_permissions`/收紧用例全绿）；**Worker 工件不在** | 0 | 本提交 |

**OF-14 第 5 例收口**：`test_subagents.py` 用手工 `child_limits` 证判定（低 seam 绿）恰是"门只走一条腿"的成因，本单新增 `test_counterexample_the_dead_low_seam_this_order_resurrects` 记录之；真腿门走 `DelegationService.run`。与 135 同批（135=120 真腿、136=子代理约束真腿），均排在 126 之前。

## 工单 127 — 门脚本"两份真相"（`QA-015` 中；`scripts/server-round1/**` owner＝A 树；2026-09-19，执行者·runtime 线）

> 终态 **`GATE_SCRIPT_PARITY_DONE`**（走 **有据分叉交回** 分支 Scope②）。一手复核（OF-02）与 QA-015 计数有出入：对 A **当前** HEAD `b1f6e07`（经共享 git 对象读，跨树 FS 读被拦）——`dsh-production-chain-gate.py` 在 A 侧**根本不存在**（runtime-only，非"共同 15 里分叉"）；`pi-production-chain-gate.py` 两侧都在但**分叉**（runtime 1178L／A 1137L）。**不归一**：runtime 侧的改动是已落地的 43/47/108 + HOME_MARKER 债修（注入 sandbox 端口、按 run 隔离 `--home-root`、`GATE_WORKER_REQUIRED` 发现、`gate_models_document`），归一会丢弃它们＝语义降级（Notes 第 115 行"owner 版本反而更差⇒交回"）。判定**未削、脚本一字未改**。§Spend：0 真调用。证据 `docs/server-round1/gate-script-parity-127.md`。

**可复算指纹行（G1）**：
```
dsh-production-chain-gate.py runtime=bf0efde9ef1f982f9f2870f7c324a894  A(b1f6e07)=ABSENT           conclusion=runtime-only
pi-production-chain-gate.py  runtime=dfdae54be337c45de58e44161b18880f  A(b1f6e07)=2768daa7a61e26f262b5cbbfff3ba087  conclusion=justified-divergence
```
比较命令原文见 127 文档「Reproducible comparison」段（`md5sum …` + `git show b1f6e07:… | md5sum` + `git cat-file -e …`），QA 每轮可复算。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 127 | 全 | G1 指纹可复算（md5+命令+结论）；G2 差异**有据登记**（pi justified-divergence／dsh runtime-only），第三种形态由常设漂移检测门咬；G3 判定语义未削（脚本零改）；G4 只动 status/证据/测试，未碰脚本与 A 树。`test_gate_script_parity_127.py` 断言"文件实算 md5＝记录 md5"（改脚本不改记录⇒红）＋结论须在 {normalized,justified-divergence,runtime-only} | 反例**已树内实测**：给 pi 追加一行（第三种形态、不改记录）⇒ 恰 1 条 md5 匹配门红、3 条仍绿；恢复后 4 passed。**未跑全量**（本单纯 docs/md5/门，无 src 改动） | 0 | 本提交 |

**交回 ops（内容质量 vs ownership 是两件事，未自合并）**：请裁 A owner 是否采纳 runtime 的 pi 改进／接 dsh；在此之前分叉**已登记且有据、非静默**。

## 工单 137 — Worker 契约 `stopReason`（生产侧·R-0064 获批·主路径最后一格；阶段 1 观测已提交，进行中；2026-09-19，执行者·runtime 线）

> **状态：开工（stage 1 观测已落，未收口）**。与 `135` 同档：`134` 消费侧 + 本单生产侧 ⇒ `122` 才能收口。`depends_on 134` 已满足（消费语义在位）。§Spend：0 真调用。观测文档 `docs/server-round1/worker-stop-reason-137-stage1.md`。

**一手结论（stage 1）**：完成结果＝Worker `ProcessRecord`（`main.rs:98/423/509/1160/1264`，`run_process` 产），即 `sidecar_backend._complete` 读的 `run.result`——134 已把它经 `_terminal_reason_from_result` 路由进 `complete_turn(terminal_reason)` ⇒ **下游无需新字段**。今天 Worker 侧 `stopReason/stop_reason/end_turn/max_tokens/PromptResponse` 在 `workers/**/*.rs` **0 命中**（坐实 122"无此事实"）。**两道守卫对"增补·出站·不改版本"的 stopReason 均安全**：两源命名守卫（`test_state_capture_error_boundary.py:252`）只比 `PROTOCOL_VERSION` 常量（不查结果字段），`deny_unknown_fields` 只管**入站** request/bootstrap（`v1.schema.json` 是请求侧，无结果侧 `additionalProperties:false`）⇒ **无守卫级交回**。

**剩余 stage 2–5（未动源码）**：② `ProcessRecord` 增可选 `stop_reason`，**只在 ACP 真观测到时**填（拿不到⇒交回、不填默认值，Notes⑬）——须在真实 ACP 转录上核实可观测性；③ `sidecar`/`_complete` 读的键与 Worker 出的键对齐；④ **真链门** worker→sidecar→`_complete`（`max_tokens`/`end_turn` 双向）+ 反例（去字段必红）——**需已构建 Worker**（本树有 `cargo/rustc` 源与工具链，缺 `target/{release,debug}` 预置工件＝既有 env 红族），真链腿若无法跑则如实报 env-blocked、不静默跳；⑤ **三元门 `102` 随字段复算并入账** + 两守卫逐条绿。硬约束 **G5 只增不改**（不 bump `PROTOCOL_VERSION`、不改名/删字段）。

## 工单 138 — 委派补上"工作区"这一维（`AUD-B-020` high·ops `R-0070 ①` 字面实现；2026-09-19，执行者·runtime 线）

> 终态 **`DELEGATION_WORKSPACE_DIMENSION_DONE`**。插队（high，边界缺陷）：与 135/137 同档、先于 126。缺陷＝fresh 子轮落到"`_shared_workspace_id(child)`＝子 profile 最近动过的会话"的工作区（**可以是另一个项目**），名册不发 `workspace` 字段、授权/选候选都不含工作区维 ⇒ 项目 A 的对话可写进项目 B、落点漂移。§Spend：0 真调用。证据 `docs/server-round1/delegation-workspace-dimension-138.md`。

**ops `R-0070 ①` 定案（不自行再裁产品语义）**：取 `65:83` **字面实现**——落点＝父轮工作区、名册发 `workspace` 字段、按父工作区筛候选；**不取**"跨区类型化拒绝 `SUBAGENT_WORKSPACE_MISMATCH`"那案（把"默认"读成可覆盖＝产品语义 ⇒ `R-0070 ②` 留用户）。本单**不加新拒止码**。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 138 | 全 | 三处同源：`resolve_roster` 经注入 `workspace_of` 发 `workspace` 字段；`run` 取 `get_turn_context(parent_turn_id)["workspace_id"]`→候选 `[e for e in roster if e["workspace"]==parent_ws]`；fresh 放置＝`parent_workspace_id`（不再 `_shared_workspace_id(child)`）。跨区子不作候选⇒请求它走既有 `SUBAGENT_NOT_AUTHORIZED`（显式、非静默落 B）。G1 子 home==父 ws⇒子 session 落父 ws；G2 跨区⇒拒、不在 B 建子会话；G3 名册含 `workspace`；G4 全走真 `run`。反例**已树内实测**：删过滤 + 还原 child-home 放置⇒恰 2 跨区门红、同区/字段门仍绿。同工作区行为逐字不变 | `test_delegation_workspace_dimension_138.py` **4 passed**；delegation(含 `65` e2e，父轮改真实)+subagents+rule_liveness_086+harness_round_086+profile_permissions+shared_session_store+136+127 广扫 **59 passed**（`resolve_roster`/放置改动无回退）；**Worker 工件不在** | 0 | 本提交 |

**同片串行（138/139/140/141 同段 `delegation.run`／`_resolve_child_session`）**：本单单独提交、按 `serialize_with` 逐单串行，未与其它三张混提。`65` e2e 原以 phantom `parent-turn-e2e`（无 `server_turns` 行）掩盖了"放置从不读父轮"——本单改为建真实父 session+turn（生产即如此），非迁就测试的 hack。

## 工单 141 — 子代理超时**必须真停**并带可定位句柄（`AUD-B-023` medium·OF-14 第 6 例；2026-09-19，执行者·runtime 线）

> 终态 **`SUBAGENT_TIMEOUT_STOPS_DONE`**。`_await_terminal` 轮询到 deadline **只 `raise SUBAGENT_TIMEOUT`、无任何取消、异常路径不生成返回体** ⇒ `:81` 的"资源边界"下面子代理继续跑继续花、父侧连 `turnId` 都拿不到（`:90` 静默降级）。取消能力（`sessions.cancel_turn`/`cancel_descendants`/`live_child_turn_ids`，`086` 建）就在旁边、这条路径没接（OF-14 第 6 例同形）。ops `R-0070 ①` 定案＝`:81`+`:90` 字面后果（**非新产品语义**）：先停再报、码不变、句柄+用量进拒绝体；"超时不该取消子轮"那案＝把"默认"读成可覆盖＝产品语义留用户。§Spend：0 真调用。证据 `docs/server-round1/subagent-timeout-stops-141.md`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 141 | 全 | 到期先 `self._usage_of(turn_id)` → `self.sessions.cancel_turn(turn_id, "subagent-timeout:..")`（与两 stop 门同一停法：记录+execution.cancel+级联孙）→ 读子 native 句柄 → raise `DelegationError("SUBAGENT_TIMEOUT", msg含 turnId/task_id/usage)`。端点回 `getattr(refusal,"message")` ⇒ 句柄达调用方，**未碰 wire/端点**。G1 超时后子轮离 active；G2 仍类型化 `SUBAGENT_TIMEOUT`（不降泛码）；G3 拒绝体含 `turnId=`+`usage so far`；G4 全走真 `run`（子不结束）；G5 成功体逐字不变。反例**两处已树内实测**：删 `cancel_turn`⇒G1"离 active"门红（子仍 running）；从 message 拿掉 `turnId=`⇒G3"可定位"门红 | `test_subagent_timeout_stops_141.py` **3 passed**（含 success-unchanged）；rule_liveness_086 **两条真停门测试改直建 running 子轮**（141 后超时自身即停子、不能再用作"取活子"setup；主体两停门级联覆盖不变）＋delegation+138+136+subagents 广扫 **35 passed**（无回退）；**Worker 工件不在** | 0 | 本提交 |

**归批（132 新亚型）**：**『资源边界的声明』与『真的停不停』必须同一份事实**——超时曾只截断等待不截断执行；同族 `136`（约束记两处）、`139`（授权名单 vs 续接归属）。137/139/140 仍待（137 stage1 已落）。

## 工单 139 — `task_id` 续接必须校验会话**归属**（`AUD-B-021` high·ops 复用码裁决；2026-09-19，执行者·runtime 线）

> 终态 **`SUBAGENT_TASK_OWNERSHIP_DONE`**。续接原**全库按 `checkpoint_native_id` 查会话**、**只拒一次跨家族** ⇒ 只被授权调 C 的父可用**同家族**未授权 D 的句柄把子轮续到 D 会话（还可能在别工作区）＝门禁做成"同一家随便接"；且 `checkpoint_native_id` 无唯一约束 ⇒ `fetchone()` 多行命中取行序第一条＝落点不可复现。§Spend：0 真调用。证据 `docs/server-round1/task-continuation-ownership-139.md`。

**ops 裁决（不自行再定）**：**复用既有 `SUBAGENT_NOT_AUTHORIZED`**（审阅者亦倾向）＝**零合同变更**，**不新造** `SUBAGENT_TASK_NOT_CALLABLE`（新码属合同增补须走重锁对表，留用户）；`checkpoint_native_id` **唯一索引＝schema 变更＝不在本单**（本单只做**代码层确定性**，歧义⇒类型化拒）。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 139 | 全 | `_resolve_child_session` 续接分支：`fetchall` 取代 `fetchone`；0 行⇒`SUBAGENT_TASK_UNKNOWN`（不变）、**>1 行⇒确定性 `SUBAGENT_NOT_AUTHORIZED`**（歧义、绝不挑行）；**跨家族检查在前**（G5 保持 `SUBAGENT_TASK_FAMILY_MISMATCH`）；**新归属判据** `session.profile_id==chosen.profileId`（即本次名册选中的子）否则 `SUBAGENT_NOT_AUTHORIZED`（授权名单与续接判定同一份事实）。G1+G2：同家族未授权 D 句柄⇒拒（原静默续 D）；G3 歧义⇒确定性拒；正例（续 C 自己句柄）仍成 | `test_task_continuation_ownership_139.py` **4 passed**；delegation+subagents+rule_liveness_086+138+141+136+harness_round_086 广扫 **43 passed**（既有 family/unknown 续接用例全绿）；**Worker 工件不在**。反例**已树内实测**：中和歧义+归属两判据⇒恰"未授权/歧义"门红、跨家族/正例仍绿 | 0 | 本提交 |

**同片串行**：139 单独提交（未与 138/140/141 混提）。`132` 亚型：授权名单（名册）与续接归属判定**曾是两份事实**，现归一。剩 137（stage1 已落）／140（usage 汇总到父轮）。

## 工单 140 — 委派的用量**并入父轮账**（读侧·`AUD-B-022` medium·ops 取读侧口径；2026-09-19，执行者·runtime 线）

> 终态 **`DELEGATION_USAGE_PARENT_ROLLUP_DONE`**。`aggregate_by_session` 原只按 `session_id=? AND state='completed'` 收——委派子轮跑在**另一条会话**里 ⇒ 父侧账漏掉子（实测父 110 vs 子 9500）。`parent_turn_id` 链接能找子（`live_child_turn_ids`，`086` 为取消建）但**只有 `cancel_descendants` 用**＝归属这一维没人接（OF-14 同族）。§Spend：0 真调用。证据 `docs/server-round1/delegation-usage-rollup-140.md`。

**ops 裁决（不自行再定）**：取**读侧并账**（`65:78`"记到发起它的那一轮"＝记账根问题的字面实现、且是收紧）；**不取**"子轮终态时把用量累加登记到父轮"那案（写侧改写已落库事实、同一事实两处存＝`132` 要治的形状 ⇒ `R-0070 ②` 留用户）。**聚合根＝父轮**（docstring 显式声明）。展示用的 `_usage_of` 返回体（回给模型的工具结果）**不动**（Notes：另一件事）。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 140 | 全 | `aggregate_by_session(S)`：取 S 的**根轮**（`parent_turn_id IS NULL`）→ 沿 `parent_turn_id` 递归收其**委派子树**的 completed 轮用量（`_subtree_usage`）并入 S。无委派⇒每轮皆自根⇒与旧 session-scoped 查询逐字同（G4）；每轮只有一个根⇒跨会话并查不重复计（G3）。门用真 `server_turns`/`server_sessions` 行（父→子→孙，各在别会话）经 `UsageAggregator` 真算：G1+G2 父＝110+9500+100=**9710**、`turnsReported`=3；G3 并查[父,子,孙]⇒父 9710 且三者和**仍 9710**（子/孙对自己被父拥有的轮报 0；双计实装会 >9710）；G4 不委派会话＝50。反例**已树内实测**：关掉后代合并⇒恰两条 rollup 门红（父回落 110）、不委派门仍绿 | `test_delegation_usage_rollup_140.py` **3 passed**；既有 `test_usage_aggregate.py`（无委派）**仍绿**（归因改动对非委派逐字不变）；usage+delegation+subagent 广扫 **64 passed / 1 skipped（env）**；**Worker 工件不在** | 0 | 本提交 |

**OF-14/132 归批**：机制（`parent_turn_id` 链）在场、**归属这一维的接线路径**缺席——与 136/141 同族。**137 剩 stage 2–5**（真 worker emit 需已构建 Worker；本树无预置工件），**主路径 122 的真收口仍待 137**（134 消费侧 + 137 生产侧）。138/139/140/141 四单**逐单串行、逐单提交**已完成。

## 工单 142 — 空快照被折叠成"没有快照"（A 线 `B3` 路由到本树·一行修；2026-09-20，执行者·runtime 线）

> 终态 **`EMPTY_SNAPSHOT_FOLD_DONE`**。`_WorkerChannels.__init__` 用**真值判断**存 before-snapshot ⇒ `{}`（声明过的空工作区，falsy）被折成 `None`（没有快照）⇒ `:893` 的 `is None` 分支把"合法空快照"当"未声明"⇒ WSL 通道变更集**首轮恒 unknown**。§Spend：0 真调用。证据 `docs/server-round1/empty-snapshot-fold-142.md`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 142 | 全 | `sidecar.py:631-632` 真值判断 → `is not None`（`{}` 保留、`None` 才是没快照）。**`:893` 复核**：`if ... is None: return None` 是**正确的**未声明分流、非同类吞事实、无需改（唯一吞点在折叠处）。门走真 `workspace_change_set`（fake `workspace.list` client、非直调私有）：空快照 `{}`＋新增文件⇒"全部新增"（G1，原 `None`）；`None`⇒仍 `None`（G2 保持）；非空快照无变化⇒空变更集。反例**已树内实测**：退回真值判断⇒恰空快照门红（回 `None`）、None/非空仍绿 | `test_empty_snapshot_fold_142.py` **3 passed**；change_set+state-capture+git-status 广扫 **8 / 13 passed**（折叠点改动无回退，既有变更集用例全绿）；**Worker 工件不在** ⇒ 069 **真机 WSL 腿 env-blocked**、折叠点三态在树内确定性复跑并绿（G4 如实记） | 0 | 本提交 |

**`132` 对偶面**：这是"同一事实只允许一处记账"的**反向**——一处记账（折叠点）曾**吞掉两件事**（`{}` vs `None`），供 `132` 通用判据吸收。未碰 54 声明形状/wire/protocols，`None` 路径逐字不变。

## 工单 144 — `bounded` 审批 `environmentId` 定档（`AUD-B-026` needs_validation → **结论 2**；2026-09-20，执行者·runtime 线）

> 终态 **`BOUNDED_APPROVAL_ENVIRONMENT_BINDING_DONE`**（定档完成、非停在"没结论"）。三源对账（一手）：声明=**仅 wire 形状校验**（`wire/handlers.py:1744-1748`，与锁工件符、未碰）；产生=本树非-wire `src/` `grep environmentId` **0 命中**、`records.py` 只把 `scope_json` 当证据存/回读；投递=`SidecarHarnessPort.decide_approval` 把 `scope`（含 environmentId）**逐字** `dict(scope)` 转发 harness ⇒ Server 不绑定也不丢弃，只组合+转发＝AGENTS.md"插件拥有原生 harness 语义"。**结论 2（harness 所有）**；缺的只是边界没写下来 + 逐字转发没断言 ⇒ 本单补两者。§Spend：0 真调用。证据 `docs/server-round1/bounded-approval-environment-binding-144.md`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 144 | 全（定档） | G1 账上写明**结论 2** + 逐条三源判据（非"未发现消费者"）。G2 探针走真 `register_approval`+`decide_approval`（stub 只替 harness 侧 channel、非直调私有/非手工喂 frame）。G3 逐字转发断言 `frame["scope"]==scope`（含 environmentId），**反例内建**：转发路径改/丢任一键⇒门红。G4 `bounded` 形状逐字不变（未碰 wire/形状）。**未改产源码**（Server 本就逐字转发，缺的是边界声明+转发断言，现补上） | `test_bounded_approval_forward_144.py` **2 passed**（含 `SidecarHarnessPort` 无 worker 构造 + environmentId 原样到达）；未动 src ⇒ 无回归面；既有 approval/decide 语义不碰 | 0 | 本提交 |

**132 关系**：需 Server 行动处，"声明的授权范围"须与"实际生效范围"同源；此处 Server 该做的行动**正是逐字转发**，门钉住"到达消费者的即声明的"。**若将来要求 Server 端绑定 environmentId 到具体轮环境**＝需 Server 侧"执行环境 id"概念＝产品/合同决定 ⇒ 不在本树自造，本单按结论 2 落边界（不阻塞）。剩 137（stage2-5）／146（5 AUD 大单）。

## 工单 146 — 委建子轮必须过既有链的门 ＋ 类型化出口 ＋ roster 可用性有据 ＋ 取回按「本轮、最新」读（`AUD-B-031/034/035/032/029`·ops 第 137/139 轮转单；2026-09-20，执行者·runtime 线）

> 终态 **`DELEGATION_RECOVERY_GATE_AND_LATEST_READ_DONE`**。五条 finding 落**同一段代码**（`delegation.run`/`_create_child_turn`/`_await_terminal`/roster）。§Spend：0 真调用、0 凭据内容。证据 `docs/server-round1/delegation-recovery-gate-146.md` ＋ 可复跑探针 `docs/server-round1/probes/sim146_windowed_read.py`。

| 单 | 阶段 | 门 | 回归 | 真实模型 | 提交 |
| --- | --- | --- | --- | --- | --- |
| 146 | 全（六段） | **G1** 子 profile 带 `recovery_pending` ⇒ `run` 在建任何会话/轮**之前**类型化拒 `SUBAGENT_UNAVAILABLE`，且 `server_turns` 行数不变。**G2b** 独占家目录（`home_concurrency={"codex":"exclusive"}`）下既有链已占住 profile ⇒ 委派在**另一条会话**建轮 ⇒ 复用链上同一个 `_refuse_exclusive_home_concurrency` ⇒ `TURN_CONCURRENCY_CONFLICT`，active 仍 1。**G2c** 同会话重试 `task_id` ⇒ `UNIQUE constraint failed` 翻成产品码 `TURN_CONCURRENCY_CONFLICT`、`message` **不含 `server_`**（旧形＝裸 `sqlite3.IntegrityError: … server_turns.session_id` 经 `http/app.py` 兜底把类型名送到线上）。**G3** `list_for` 的 `available=false` ＋ reason 是**类型码**（`PROFILE_ARCHIVED`/`PROFILE_RECOVERY_REQUIRED`/`HARNESS_UNAVAILABLE`，`_availability_map` 真喂＝选了"①真供给"这一支，未删形参）。**G4/G5** 260 条 delta 的子轮 summary **完整 260**；带 `task_id` **第二次续接**取回**本轮自己的** 260（旧＝`''`）；超 `MAX_SUMMARY_CHARS` ⇒ 恰上界＋合同声明的 `…` 标记（不静默截头）。**G6** 机检 `grep get_session delegation.py` 三处**均不读** `events`/`turns`；`get_session` docstring 写死「**oldest** `event_limit` head、**not the whole** session」并有门断言方向（300 条 ⇒ 恰 seq 1..200）。**G7** 全部门经真 `DelegationService.run`/`list_for`（非直调私有） | `test_delegation_recovery_and_read_146.py` **8 passed**；`tests/server` 全套 **786 passed / 21 failed / 21 skipped**（21＝**Worker 工件不在**基线：opencode/pi gate cleanup + lease keepalive，`*_GATE_WORKER_MISSING`，与本单无关） | 0 | 本提交 |

**反例（形状换了、理由记下）**：四条授权/出口门沿用本会话**已树内实测**的关掉门反例（恰对应门红，且出口门显出字面 `IntegrityError: … server_turns.session_id`）。取回这一半改为**运行时前后对照探针**（本会话权限模式**禁止**把已知缺陷原地写回实现文件；探针反而更稳、可复跑）：同一 fixture 下旧读法 `get_session` 只回 200 行 ⇒ **首轮 198 字符（静默截头）/ 续接 0 字符**，新读法 **260 / 260** ⇒ 续接门确实是载荷门。**132 两亚型按单要求登记**：① 同一条不变式在多条路径上必须给同一答案（`031`＋`034`：既有链每个 `raise ServerError` 型门，委派路径须有对应断言或显式豁免）；② 同一行里"哪个窗口/哪份配置"的字段必须同源（`029`＋`028`）。**边界如实**：`recovery_pending` **仍无清除入口**（`117` 已承认）⇒ 本单只做"门生效"这一半，**不自造**清除机制（`R-0070 ②` 留用户）。未碰 `wire/**`/`protocols/**`/`workers/**`；`65` 合同上界（4096/≤4 次/10 分钟）与既有链两处 409 逐字不变。

**收尾复跑（本会话一手，2026-09-20，非沿用上一任计数）**：门 **8 passed**；探针 **OLD 198/0 ⇔ NEW 260/260**、"续接门承重"=True；`tests/server` **786 passed / 21 failed / 21 skipped**（21＝**Worker 工件不在**的环境基线）。**委派面零回归，用干净副本对照钉死**：`git clone` 到本分支开工前 HEAD `3e68608`（不含在飞改动）跑 `tests/server/test_delegation.py` ＝ **同 2 条红、同错误**（`HARNESS_NATIVE_HOME_UNDECLARED: claude-code` ⇒ `DispatchAmbiguous`）⇒ 那 2 条**在 146 之前就是红的**，不记在本单账上、也不当"环境 21 条"混报。**两条如实剩余**：① Scope 第 5 行后半（`http/app.py:225-229` 兜底改产品码白名单）**未做**＝`server/http/**` 越本单 `write_paths` ⇒ 交回 ops；② **G7b 未达本单自己的判据**（"只测内部函数⇒门红"，现证在服务边界）⇒ 待补一条经真 loopback 路由的 `TestClient` 断言（`tests/**` 在本单写面内，可补）。检查点 `checkpoint/b2-146` → `7477816`。

## 工单 150 — sidecar op 失败的**上游原因**必须回传到产品状态（`R-0078 ②`；阶段 1 观测·2026-09-20，执行者·runtime 线）

> 阶段 1 终态 **观测已一手做完**（单内继续，不停）。证据 [150 阶段 1](../server-round1/sidecar-op-failure-upstream-cause-150.md) ＋ 可复跑探针 `docs/server-round1/probes/sim150_upstream_cause_collapse.mjs`（真 `worker-entry.mjs`＋受控假 peer）。§Spend：0 真调用、0 凭据内容、0 真实端点。

| 单 | 阶段 | 门/证据 | 精确剩余 |
| --- | --- | --- | --- |
| `150` | 1 观测 | ops 五处行号引用**逐条复核成立**（`worker-entry.mjs:341-347`／`sidecar.py:1046-1056` **并补 `:1062` 同形状的第二条腿**／`sidecar_backend.py:584-590`／`repository.py:983-1023`／`_safe_code:952-973`）。**真跑 Worker 量出三种互不相同的上游故障 ⇒ 三种互不相同的（坏）结果**：① `launch.command` 不存在 ⇒ 线上 code 竟是裸 **`ENOENT`**（Node errno **冒充产品码**，且**过** `_safe_code` 的 `[A-Z][A-Z0-9_]{2,127}` 形状白名单）；② 适配器起来了但不是 ACP 服务 ⇒ Worker **根本不答**（挂到服务端 `SIDECAR_TIMEOUT` 才收场）；③ harness 侧拒这一轮 ⇒ 塌进 **`SIDECAR_OP_FAILED`**，唯一判别信息在 `message="Harness session not found"` 里、在 `:584` 被丢。**受控对照**：`envelopeError` 造的错误（`NOT_REGISTERED`）原样通过 ⇒ 传输本身没坏。**据此纠正单的前提**：洞不是"只丢 message"，而是 **`:345` 无条件取 `error?.code`** ⇒ 有码的（errno）拿到**非产品码**、有原因的（harness 拒绝）拿到**兜底码**＝**双头错位**。**阶段 2/3 的设计因此落在实测地上**：2＝给 envelope 码打标记、其余按实测形状分类（启动失败／通道已死／会话不可用／凭据不可用），`SIDECAR_OP_FAILED` 降为真兜底；3＝**实测 `_safe_code` 已把 Worker 码直送 `fail_turn`→`server_turns.error_code`＋`turn.state.error_code`** ⇒ "原因到产品状态"这半**零协议变更、不加事件键**即可由阶段 2 兑现；**要文本**才是新字段 ⇒ 按单内边界交回 ops（`151` 同族）。**另记一条纪律**：①的 message 实测含**文件路径**（`spawn /nonexistent/… ENOENT`）⇒ **不得**把自由文本放进码位（G3/G6 的实测依据）。 | 阶段 2/3/4/5 未开工 |

| `150` | 2+3+4 落地（同会话续做） | **阶段 2（Worker）**：出口不再无条件取 `error?.code`，改走 `upstreamCauseCode(error)`——只有**产品码形状**且**不是 OS errno** 才原样通过；实测 errno 分类翻译（`ENOENT/EACCES/EPERM/ENOEXEC/EISDIR/ENOTDIR`⇒`HARNESS_LAUNCH_FAILED`；`EPIPE/ECONN*/ECANCELED/ERR_STREAM_*`⇒`HARNESS_CHANNEL_DEAD`）；按实测文本形状认 op 不支持／凭据不可用／`HARNESS_SESSION_UNAVAILABLE`；`SIDECAR_OP_FAILED` 降为**真兜底**。`envelopeError` 造的码一字未动（`NOT_REGISTERED`/`ALREADY_REGISTERED`/`UNKNOWN_OP`/`PROVENANCE_MISMATCH`/driver 码原样过＝受控对照已跑）。**阶段 3＝零 diff（结论而非漏做）**：实测 `SidecarError.code→_safe_code→fail_turn→server_turns.error_code`＋`turn.state.error_code` 本就忠实，原因在**上游**被毁 ⇒ 服务端半区**无需协议变更、无需新事件键**；要*文本*才是新字段 ⇒ 属 ops 字段单（`151` 同族）。**阶段 4（门）**：`tests/server/test_sidecar_upstream_cause_150.py` **8 passed**（真 Worker＋真 `SidecarEnvelope.request`＋真 `build_runtime`/`TestClient`）。**载荷性不靠在本树重植缺陷**：把该模块复制进开工前 HEAD `3e68608` 的干净 `git clone` 跑 ⇒ **8 条里 5 条红**，含用户现场经 HTTP 读到的终态码 **基线＝`ENOENT`** ⇔ **修后＝`HARNESS_LAUNCH_FAILED`**（`GET /api/v1/sessions/{id}` → `turns[0]["error_code"]`）；另 3 条两侧同绿（码形状／兜底仍类型化／`WORKER_DISCONNECTED`⇒`unknown` 分流），保留正因 G4 要求逐字不变。**给下个读者**：`/sessions/{id}/events` 是 SSE 长轮询（`app.py:302-323` 循环等下一事件），**不能** `.json()` 拉（会挂）；终态事件改从账上读。 | 阶段 5＝本节＋证据 §4 已记；剩 `148`（同改 `runtime/**` ⇒ 串行后开工）·`120`/`122`/`130`。**另上报一条非本单红**：`test_harness_sidecar.py::test_public_post_open_error_with_the_same_code_keeps_ambiguous_semantics` 在**开工前基线同码同断言**失败（期望 `EXECUTION_FAILED`、实得 `CAPABILITY_REQUIREMENT_UNSATISFIED`）⇒ 先于 150 存在、不记本单账、请 ops 归单。**回归**：`tests/server -k "sidecar or harness or capability or delegat or approval"` **278 passed / 3 failed / 13 skipped**（560s），3 条逐一给因（1＝Worker 工件不在；1＝基线同红；1＝隔离跑绿＝选择器排序假象）；node 侧 `sidecar_envelope` 4/4、`four_harness_component` 9/9、`snapshot_seams` 12/12（`node --test <目录>` 在基线亦报 1 条合成失败＝目录模式怪癖，改逐文件跑）。**Worker 工件：不在** ⇒ `待 QA 复算`。§Spend：0 真调用、0 凭据内容。

## 工单 148 — `_dispatch` 吞派发失败：定档单（**一字节 `src` 未改**·2026-09-20，执行者·runtime 线）

> 终态 **`DISPATCH_SWALLOWED_EXCEPTION_PROBED_PARTIAL`**（**不是**"没做完"的 PARTIAL，而是**判据要求的精确结论**：两条注入路径判死、唯一可能命中的窗口从进程外打不进去）。证据 [148 定档](../server-round1/dispatch-swallow-boundary-148.md) ＋ 可复跑探针 `docs/server-round1/probes/sim148_dispatch_swallow_boundary.py`。

| 项 | 一手结果 |
| --- | --- |
| **行号纠正（`OF-02`）** | 单/审阅者的三处行号在本树**全漂**：吞异常＝`handlers.py:1907-1913`（非 2318-2325）· try 起点＝`sidecar_backend.py:267`（非 255）· `except BaseException` 兜底臂 ≈`:283-290`。**静态三事实逐条复核成立**：`try` 之外 `:210-262` 确有 8 类可抛（`get_turn_context`／`objects.read`×2／`resolve_all`／`publish`／`create_work`／`create_execution`／`resources.bind`×3） |
| **注入 B（普通客户端输入）** | `_override_mapping` 在**被吞的 try 之内**求值 ⇒ 缺 `value` 的 override 本可抛 `KeyError` 被丢。实测真 HTTP ⇒ **`INVALID_REQUEST: each override needs controlId and value`** ⇒ **到不了 `accept()`**，挡住层＝wire 参数校验，**同步报错给客户端**＝**产品不可达** |
| **注入 A2（发送前删 config 对象）** | `accept():214` 是该对象读者。实测 ⇒ **`FileNotFoundError` 落在回执之前** ⇒ 客户端拿错误而非 202 ⇒ **不留 `accepted` 孤儿**＝**判死**（挡住层＝发送请求自身要读同一对象） |
| **注入 A（回执后删 input 对象）** | `state_before_injection="running"` ⇒ `_dispatch` 在派发线程**立即**跑 `accept()`，**"回执后、`objects.read` 前"这个窗口从进程外不存在**。**如实记：既非正例亦非反证**，命中它需要存储侧真损坏/并发（运维面），且本单不许改 `src/**` 去开后门 |
| **G4 结论** | 自然可达（用户输入）＝**否**；机制＝**仍真**（审阅者直调实跑已证：异常不传出、DEBUG 零输出、无 `fail_turn`）；**未决只剩一格**＝"对象存储在回执之后被损坏/删除"能否在真实部署发生。**建议 ops**：按「自然输入面 `rejected` ＋ 损坏面留一行 `needs_validation`」收，**别**为它另开修复单；若判定损坏面也要终态事实 ⇒ 那是一条**新单**（方向审阅者已给），不挂 148 名下 |
| **`132` 亚型** | 「先落 durable 事实的**界线位置**」必须与「吞异常的范围」对齐——本单量到的正是界线本身（`accept()` 内 `:210-262` 在 try 之外）；与 `AUD-B-035`/`037` 同族 |
| **卫生** | **G5：`git status --porcelain -- src/` 为空**（硬约束达成）· `validate_order.py 148 --strict` ⇒ `OK` · 探针 0 真调用/0 凭据内容/假 peer · **Worker 工件：不在** ⇒ `待 QA 复算` |

## 批末报告（runtime 线·会话 2026-09-20 上午，R-0080 队列 1-3 已推完）

- **146 收尾** `7477816` ＋ `checkpoint/b2-146`：门 8 passed、探针 OLD 198/0 ⇔ NEW 260/260、`tests/server` 786/21/21；**委派面零回归用开工前 HEAD 干净 clone 对照钉死**（同 2 条同错误）。两条如实剩余（`http/app.py` 越界未做、G7b 未达自判据）已走 `H-023`。
- **150 阶段 1-4** `1ced836` ＋ `checkpoint/b2-150`，终态 **PARTIAL**：用户现场 `GET /api/v1/sessions/{id}` 的 `error_code` 由 **`ENOENT`** 变 **`HARNESS_LAUNCH_FAILED`**；服务端半区**实测零 diff**（原因在上游被毁）；**三支分类未真实复现 ⇒ 不报绿**（剩余与解卡入口见证据 §6）。
- **148 定档** `121b3e7`（**`src/` 一个字节未改**，G5 空）：B/A2 判死、A 窗口从进程外不存在 ⇒ 建议自然输入面 `rejected` ＋ 损坏面留一行 `needs_validation`。
- **队列状态（不是 QUEUE_EMPTY）**：R-0080 ④ 的 `120`/`122`/`130` **本手未开工**（本会话前 3 个目标位刚推完，预算见底）；⑤ 旧表（`091` 等）按 `R-0080 ②` 继续让位。下一位请直接接 ④。
- **纪律自查**：无 merge、无 push、无 reset/stash/clean；提交一律 pathspec；全量套件只跑过 `tests/server`（批内一次）；真实模型调用 **0**、凭据内容 **0**；探针/临时副本全在 `/tmp`（含基线对照 clone），**Worker 工件：不在** ⇒ 全部计数 `待 QA 复算`。
