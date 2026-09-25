# H 接缝事实表（HD-001 Phase 0，RESEARCH_ONLY）
owner: H（gen 1，会话更替 H-0003/C-0023）· 基线 BE 92a2d2ba · 2026-09-23T01:00+08:00
方法：只读源码实测（行号可复核），零真实调用、零预算消费、未读密钥。与 BC interface-facts v1（已验收权威，HD-001-C-006）互补：本表覆盖 Harness 域侧（profile→port→事件）与 E-0004(a) 应交项。

## 1. profile→port/adapter 绑定链（E-0004(a) 应交：事件归属隔离的 H 域事实）
- provider：`_CoreSidecarProvider`（provider_id="harness-sidecar"）在 src/agent_box/server/execution/sidecar_backend.py:102-103；start()→_start_run :139。
- 每 turn 一个新 port 实例：sidecar_backend.py:313-315 `port = self.port_factory(context, cb)`；`SidecarHarnessPort` **无类级状态**，"两个 port 同一进程不互串身份"（docstring plugins/agent-box-harnesses/src/agent_box_harnesses/sidecar.py:1204-1209）。
- port_factory 在部署装配期固化身份：bootstrap/runtime.py:1184-1226 以 `profile=context["harness_type"]`、`adapter=deployment["adapter"]` 构造（:1192），注入 subscription/account_plumbing（:1186-1190）。
- 审批回投按 approvalId 键控：`_approval_ports: dict[str, SidecarHarnessPort]` sidecar_backend.py:214；登记 :446、回投 :476-480、退休清杂 :662-664。
- "Order 56"＝旧循环工单号非 composition order：订阅凭据工作副本绑定，注释原文 sidecar.py:1239-1242；装配注册 bootstrap/runtime.py:457-460（account_records/account_assets）；profile→账号命名 server/profiles/repository.py:222。

## 2. 事件帧身份与隔离
- port→backend 回调 (execution_id, kind, data)：sidecar.py:1355,1636,1642,1646-1651,1672-1684；kind 集：message.delta/thought.delta/tool.update/plan.updated/mode.updated/approval.requested/failed。
- 落库帧带 session_id 单调 seq/wire_seq：service/sessions/repository.py:1260-1274。
- 线帧投影 event_frame 键=eventId,sessionId,seq,cursor,emittedAt,event（server/wire/projection.py:213-231）；**帧内无 profile/harness 字段**——harness 为不透明数据（projection.py:14 docstring）。隔离语义＝session 单绑：session 创建绑 profile_id（repository.py:103-123）→ turn 派发读 `profile["harness_type"]`（service/sessions/service.py:86,118,126）→ 跨族切换拒 PROFILE_HARNESS_MISMATCH（repository.py:350-357）。与 BC-0004 §2.2"协议层拒跨 Harness 混排"一致，H 域无第二道品牌闸（按设计：品牌只在 profile 数据里）。
- CursorCodec：server/wire/envelope.py:59-114。payload=`prefix:session_id:seq`，HMAC-SHA256 截 12 字节（:67-68,77-80）；live "w1"/历史 "w1o" 前缀隔离（:24-25,73-75）；decode 先验签再 `session_id != expected_session` 拒（:103-107；调用 handlers.py:2233-2237,2273）。跨 session cursor 必验签失败——断连回放隔离的 H 侧佐证。

## 3. 停止/断连的如实透传（H 域）
- 驱动/适配器退出：sidecar.py:1671-1674 `on_event(execution_id,"failed",{"code":"ADAPTER_EXIT"})` → backend 落 tool.update(state=failed, tool_call_id="harness", summary=code)（sidecar_backend.py:447-451）。
- 启动期拒绝抬为 _fatal：sidecar.py:1194-1200；reader 异常置 _closed :1165-1172。
- SIDECAR_CLOSED 有界重建 ≤2+0.2s backoff（sidecar_backend.py:371-414），仍败 typed SidecarRunRecoveryFailure :411；_retire_run 无条件释放全部 per-run 状态（:650-674，order-109 泄漏修复 docs/server-round1/109-http-hang-after-second-failure.md:21-32）。
- 取消三态在 E 域（run.cancel_lock/cancel_confirmed，MB-E2b 后落 agent_box.execution.lifecycle.cancel_execution）；"stopping" 仅对 _LIVE_EXECUTION_STATES={queued,dispatched,running}（projection.py:73-79,238-244）。切换≠取消：H 域无自动 cancel 路径，切 Harness 由 §2 profile 单绑+switch_profile 闸保证。

## 4. switch_profile active 定义（BC-0004 §2.2 移交复核，H 侧独立证实）
- `ACTIVE_TURN_STATES=("accepted","dispatching","running","capturing")` service/sessions/repository.py:22（guard :326-338,358-362）。
- **awaiting-approval 非 turn 状态**：全仓 src 无 `awaiting_approval`；审批为独立表 server_approvals（OPEN/settled，server/approvals/records.py:37-44）；等待审批期间 turn 仍 `running` ⇒ **在拒绝集合内**。与 E-0005 结论一致（双域独立复核），BC 可并作一行。
- 归档拒 :324-325、版本冲突 :315-318。

## 5. 每 Harness 默认 profile 问题（C-0016/C-0023 开放项）
- 实测**无任何 default-profile seeding/ensure_default 代码**；profiles.create 必带 harness 参数（wire/handlers.py:1283-1295）；ProfileStore 按 `root/<harness_type>/<profile_id>/` 分桶（generic/profile_store.py:30,36-48）；server_profiles.harness_type NOT NULL（storage/database.py:40,44）。
- ⇒ 更权威信号不存在，**OD-1（FE 取首个可发送 profile+diagnostic）与代码事实一致，无需推翻**。今晚产品链需要至少一个显式创建的 pi/codex profile（启动脚本/夹具职责，非新配置功能）。

## 6. harnesses.toml 过期注释（研究中发现的文档级红）
- plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml 头部 codex 注释称"Codex 目前还没有生产封装（无 codex/production.py 对应部署模板）"——**已过期失真**：codex/production.py:266-356 有 harness_deployment/deployment_document（385 行），capability_claims 从 TOML 派生（:139-145）。批文若触碰注释按 BC 汇合面记录，勿当实施依据。

## 7. 对 F1/S 的接缝要点
- F1 连接状态/断连如实显示消费的失败面即 §3 的 ADAPTER_EXIT/SIDECAR_CLOSED/resync_required（envelope 路径 handlers.py:2245-2247）；不伪造能力：capability_claims 静态上限派生自 TOML（registry.capability_claims，pi production.py:125-132 同构），真实观测只来自测试。
- S 消费链不变：本晚 H 域预计**零公共接口改动**（详见 harness-pi-codex-feasibility.md 总判断）。

## 待批预备（只读）：codex 家族 CLI dest 漂移现状直验 @67049283（H gen1 · 2026-09-23T01:39+08:00）

`plugins/agent-box-harnesses/src/agent_box_harnesses/codex/production.py`：`:361 parser.add_argument("--artifact-source", …)`＋`:362 help "canonical WSL path…"` vs `:369 artifact_token=options.artifact_token`——**argparse dest=artifact_source 与消费名不匹配，main() 现形必 AttributeError**（与 pi 批前完全同形；pi 先例修复＝旗标行＋help 两行，HEAD 67049283 已绿）。门侧无依赖：`codex-production-chain-gate.py:1338` 直接以关键字调 `deployment_document(artifact_token="codex-runtime",…)`，不经 CLI——故 codex 门不受该漂移影响，修复面恰两行。候 B-HARNESS-CODEX-001 批文（C-0039 §3 预告：同构＋G5 luna＋文档级红 (a) 两行）再动。

## R2 预备（只读）：budget §4 逐请求计数可观测性事实（H gen1 · 2026-09-23T01:43+08:00 · @67049283 亲读）

**结论先行：pi 门的逐请求实测计数只存在于离线（FakeEndpoint）形；live 形无树内运行时测量面。逐请求预算须按"界形"批，非"实测形"。**

1. 离线测量面（完整）：`pi-production-chain-gate.py:225-254` FakeEndpoint `requests[]`（逐请求 append＋index）＋`over_budget` 计数；:539-541 两轮预算断言（"provider requests exceeded the two-round budget"即 red）；:741 `providerRequests`＝len(requests)；:1088-1091 拒模段核对恰 2 请求。
2. **live 形缺口（门自证）**：`endpoint=None`（:639 条件化）→ 计数断言整段跳过；REPORT 固定 `providerRequestCountAvailable=false`（:1110-1115 注释明言"Live has no endpoint to count on, so this is *unknown*, never false"→ 实形记 None/unknown）；且 **egress guard 亦仅离线装载**（:552-554 `guardExpected: not live`）——live 连旁路计数器都没有。
3. 可批的**界形**（静态可断言）：preflight §3 表 Pi 行＝2 轮×1 请求、输出上限 64 tokens（`OUTPUT_TOKEN_LIMIT`，REPORT["template"].outputTokenLimit :471/:486 活体在册）、**重试关闭**（settings.json retry=false 投影进 artifact）、reopen 不再发包（journal 重放，无模型门已证）⇒ 每次运行上界＝2 请求。official baseUrl 不覆盖由 :445-448 `PI_GATE_TEMPLATE_NOT_OFFICIAL` 钉住。
4. 历史实测先例：2026-09-15 `pi --live` 6 次通过（pi-live4/6-10 各两轮）；初跑 `AttributeError: requests` live 接入缺口致"是否已发包无法判定"之教训在册（pi-live/hermes-live1 两案）——**计数面缺失时报告形状必须可判**已由该修保留结构化码。
5. R2 grant 建议呈 C：额度按界形（每 run ≤2 请求）＋门 exit 0＋REPORT["template"] 逐 run 证据记账；若 C 要绝对实测，需树外 egress 计数设施（现无，扩面须另批文）。usage/费用面：provider 响应 usage 字段形样见 :193（fake），真实 usage 逐 run 只能来自 provider 侧账单，Server 事件流不含请求计数。

## 待批预备（只读）：CODEX 批文档级红 (a) 两靶现状直验 @67049283（2026-09-23T01:44+08:00）

1. `plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml` codex 段注释（批文靶 :5-7）现文＝"**Codex 目前还没有生产封装**（无 `codex/production.py` 对应的部署模板、没有跑过真实假端点全链门）"——**已陈旧**：`codex/production.py` 存在（本会话亲读，含 deployment_document/main），`codex-production-chain-gate.py` 存在且 :1338 以关键字消费 deployment_document。
2. `docs/server-round1/fullstack/harness-capability-matrix.md:165`（§8 残余）现文＝"**Codex 生产封装仍未完成**：其能力只有静态候选，没有任何动态观测"——同陈旧。
3. 修复形状预判＝两文件各一句改写＋证据随指（gate 离线绿记录/server-round1 在册件），**零语义/零声明值改动**；注意与 pi 批禁改面清单中 harnesses.toml 的旧约束区分——CODEX 批文（C-0040 §5 预告）显式含此两行为批准路径，签发后以批文为准。

## 待批预备（只读）：CODEX 批执行形状三事实（2026-09-23T01:45+08:00）

1. **G5 释义核对**：C-0029 §17＝"G5 luna 显式参数入批文"——编队/执行者参数条款（H=Qoder/Qwen3.8-Flash 编队，HD-001-C-007），**非代码面**；批文签发时随件照收即可。
2. **codex 门 sys.path 自插**：`codex-production-chain-gate.py:105-106` 自插 repo 根（pi 门不插）；但 `agent_box_harnesses` 在 plugins/*/src 下，**PYTHONPATH 组装仍不可省**（harness-linux-pi.sh 同款逻辑可复用）。
3. **codex 门失败码同形**：`:1048 fail("GATE_WORKER_REQUIRED")`＝与 pi 同＝R0' 证据形直接适用；完整 R0 走外部同源 bundle 路径已由 **HD-001-C-017 §2 追认成例**（provenance 口径 cmp+sha256 照做即可）。

## 待批预备（只读）：CODEX 装配前置件清点 @67049283（2026-09-23T01:46+08:00）

builder `scripts/server-round1/build-codex-runtime-artifact.mjs` **在**（含 .test.mjs）；`codex/production.py` 缝合面：`ARTIFACT_NAME="codex-runtime"`(:80)＝mount token 与门 :1338 `artifact_token="codex-runtime"` 一致、`ARTIFACT_TARGET=/runtime/artifacts/codex-runtime`(:81)、`CREDENTIAL_ENVIRONMENT="CODEX_API_KEY"`(:74)（**异于 Pi 的 DEEPSEEK_API_KEY**——真实轮凭据面另论，R1 离线形零调用不触）、`PLUGIN_ROOT=parents[3]`(:115)、`MODELS_SOURCE="deploy/codex/models.json"`(:124)。⇒ harness-linux-pi.sh 家族化改造面＝builder 名/token/家族 CLI 模块名/登记文件/禁口段六处，形状全同。**结论：CODEX 批无新缺失件，批文即发即做。**

## 待批预备（只读）：KILO/QWEN/DSH 三族装配形状直验 @60d868ef（H gen1 · 2026-09-23T02:14+08:00 · CODEX 批 VERIFIED 后待命轮）

三族与 pi/codex **形状已分叉**（H-KILO-001 等迁包后）：`agent_box_harnesses/{kilo,qwen,dsh}/production.py`＝6 行兼容别名（`_sys.modules` 同对象重导出），实现已在独立包 `plugins/agent-box-harness-{kilo,qwen,dsh}/src/agent_box_harness_*/production.py`（273/260/313 行）。关键事实：

- **无 G3 缺陷**：三包 CLI 均已是 `--artifact-token`＋`options.artifact_token` 正形（kilo :250/:258、qwen :237/:245、dsh :290/:298）——若发批，**两行修复面不存在**，批面只剩装配脚本＋文档红核查。
- 座位/凭据/token 面：`"id": kilo(:191)/qwen(:191)/dsh(:244)`；`ARTIFACT_NAME`＝`{kilo,qwen,dsh}-runtime`；`CREDENTIAL_ENVIRONMENT`＝kilo/qwen 均 `OPENAI_API_KEY`（**两家同名——真实轮凭据隔离另论，R1 离线零调用不触**）、dsh `DEEPSEEK_API_KEY`。
- 门/构建器全在：`scripts/server-round1/{kilo,qwen,dsh}-production-chain-gate.py`（typed `GATE_WORKER_REQUIRED` 各钉 :426/:415/:424）＋ `build-{kilo,qwen,dsh}-runtime-artifact.mjs`。
- ⇒ 家族化脚本换装点仍≈六处（builder/token/CLI 模块名**须用新包名**/seat grep/requestIds/登记文件名）；CLI 调用模块路径若批文沿旧 `agent_box_harnesses.<fam>.production` 亦可跑（别名同对象），但**证据登记建议按实况用新包名**，届时差量口径先与 BC 对齐免撞核账。
- 结论：三族"批文即发即做"成立且**比 pi/codex 更少一步**（无 CLI 修复）；未验项＝各门 sys.path 自插形状与 codex/pi 谁同（跑批时实测登记，不预断）。

## R2 预备（只读）：CODEX 真实轮界形事实 @60d868ef（H gen1 · 2026-09-23T02:18+08:00 · 待命轮，接 §4 pi 界形）

C-0045 §3 已采"每 run ≤2 请求"界形为 R2 grant 计数依据基础、BC-0022 §2.3 登记 R2＝pi＋codex 各一。codex 侧直验（与 pi §4 同形三事实）：

1. **live 形无树内逐请求计数器（与 pi 同缺陷）**：门 :1078-1086 live 分支 `endpoint = None`——FakeEndpoint 的 `budget/over_budget/requests` 全为离线形专属；离线头注 :35-36"拒答超期望请求数使隐式重试变红门"仅假端点可达。⇒ 真实轮计数依据不能靠门运行时计数器，必须像 pi 一样**钉在配置投影＋观测形**。
2. **观测基线在册（本批完整 R0 实测）**：providerRequestShape＝`/responses`×**2**（两轮各 1，inputCounts [5,7]），FakeEndpoint budget=3 未触顶；真实轮同构即 **≤2 请求/run** 的界形有离线实证锚点。
3. **投影面界形差异（vs pi 64-token 输出帽）**：`deploy/codex/models.json` **无 max_output_tokens 类字段**（grep 实况：仅 context_window 1048576/truncation_policy 10000 tokens/auto_compact null，两 slug）；`config.toml` provider 表无 retry 字段（name/base_url/wire_api/env_key 四键＋`prefer_websockets:false`＋`web_search:"disabled"`＋`features.plugins/shell_snapshot=false`）。⇒ codex 界形可批准状＝**轮数钉 2（单 run 两轮门形）＋零重试靠观测复核（第二轮携带第一轮对话＝providerRequestShape.secondRoundCarries* 同形证据）＋web_search disabled/无 tools 外呼面**；若 C 要求输出帽强形，codex 面不存在现成字段，须另裁（如实报，不造形）。

## BC-0023 §1.3 界形引用核账（H 复核，2026-09-23T08:30+08:00）

BC-0023（真实测试计数 R2＋最小联调批提案，§3 末点请 H 指正形差）对 seam-facts 的引用**逐条忠实、无形差**：
- **pi 界形**（BC §1.3 ↔ 本档 §50）：2 轮×1 请求／64-token `OUTPUT_TOKEN_LIMIT`（REPORT["template"] 活体在册）／retry=false（settings.json 投影 artifact）／reopen journal 重放不再发包／official baseUrl `PI_GATE_TEMPLATE_NOT_OFFICIAL` 钉 ⇒ ≤2/run 静态可断言。全等。
- **codex 界形**（BC §1.3 ↔ 本档 §85-86）：`/responses`×2 离线锚点（inputCounts [5,7]）／web_search disabled／无 tools 外呼面／零重试靠 `secondRoundCarries*` 观测复核／models.json 无 max_output_tokens 现成字段（如实报形差不造形）。全等。
- **live 缺口**（BC §1 ↔ 本档 §49/§84）：pi/codex 两门 live 分支 `endpoint=None`、无树内逐请求计数器。全等。
- **精度注（不改结论）**：`providerRequestCountAvailable` 字段字面值＝`false`（门 :1110-1115 注释语义"unknown, never false"）；BC §1 表述"实形＝unknown"是语义读法，且其 ledger 请求项"计数依据＝界形＋对账，非精确计数"已正确覆盖该非精确性 ⇒ 不构成需回正的形差。
- **处置**：无形差 ⇒ 依 C-0050「待命期不发空转报告／只唤醒有明确任务的组」不发 outbox 件；R2 点名后执行形归 H，届时按此界形＋回放对账跑真实轮。预算继续零消费。
