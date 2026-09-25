# BC BE 汇合底稿（定稿随 BC-0006 发出，2026-09-23，接管会话）

base_sha：BE 92a2d2ba（本树实测 clean）。零源码改动、零真实调用、零预算消费。
H 报告（harness-pi-codex-feasibility 三件套）落位后按**修正案**处理（S-0004 §三放行：BC 可即刻发汇合 PROPOSAL）；不阻塞本稿六项裁决请求。

## 1. 汇合面：已收交付与一致性结论

| 来源 | 交付 | 与 BC interface-facts v1 对照 |
|---|---|---|
| S | interface-facts-for-f1.md（gen 2）＋ **S-0004 联署完成凭证** | 一致；**勘误：wire 方法数=64**（`_handlers` 登记实测逐项计数），前记 60 作废；闭环必需域仅 19 方法，其余 45 属 G5/CHARTER 冻结面零触碰 |
| F1 | connect-research.md ＋ F1-0007 联署 | 一致；联署表已被 C-0019 第 2 条验收；OD-1/2/3 移交状态见本稿 §4b |
| E | seam-facts.md ＋ E-0004 补充 ＋ **E-0005 代码级复核** | 一致；收编见 §2.2b |
| H | **未落**（H-0003 新会话研究中，C-0023 已确认聚焦）| Pi/Codex 批精确路径候其 feasibility/seam-facts/reuse 三件套，以修正案并入 §3 |
| F3 | reuse 已落；conversation-research 未落（C-0017）| 属 FC 汇合侧，不影响 BE 批边界 |

结论：S/E/F1/F3(部分) 与 BC 表**无事实冲突**，BE 公开面事实基线可冻结为 wire/1＋WS（C-0016 第 8 条）＋**方法面 64 口径**，无需重研。

## 2. 本会话新增实测与收编

### 2.1 缺口定位精化（更正 be-baseline-audit §3 表述）
前手写"基线 harness 包仅 dsh/qwen/kilo，无 Pi/Codex"。**声明层实为已在册**：
- `plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml` 已声明 **8 家**：codex(L13)、claude-code(L89)、opencode(L146)、hermes(L198)、dsh(L252)、qwen(L293)、kilo(L339)、pi(L385)。
- deploy 资产在册：`deploy/pi/{loopback-guard.cjs,models.json,settings.json}`、`deploy/codex/{config.toml,models.json,official-script.json,codex-deepseek-setup.sh}`（00:56 实测清单；`deepseek-sidecar-config.toml`/`deepseek-models.json` 实际在 `src/agent_box_harnesses/codex/` 模块目录内，非 deploy——批文引用路径以此实测为准）。
- 通用核心注册表驱动：`generic/factory.py:15-27` 按 harness_type 从 builtin registry 建 provider/selector/manager——profile-store 层 Pi/Codex 已可经声明装配。
- 真缺口收窄为：**原生 sidecar/adapter 运行时接线层**（plugins/ 下独立 harness 包仅 dsh/qwen/kilo 含 native.py 方言接线；codex 语义现由 bwrap 模板/旧兼容面承载程度须 H 实测）。
**影响**：两批可能远小于"从零接入包"（声明+deploy 已在，批面或仅接线＋available 判定核对）。精确形状候 H。

### 2.2 承接 E-0004 执行层事实
- 切换闸数据源：`active_runs` 按 execution_key 全量跟踪（lifecycle.py:77-79），非"仅末 run"；`observe_execution` 纯读三值可作服务端 busy 基元（`NOT_KNOWN_TO_E`＝有界知识非缺席证明）；跨 Harness 全局聚合归 S facade 域，E 不加第二状态机。
- 中立 submit 未接线且不建议为抽离而接线（E §7.2）；HD-001 无新 execution 接口需求。

### 2.2b 收编 E-0005 代码级复核（C-0024 已记入汇合面）
- **服务端 active 闸对"待审批"无漏判**：全 src 无 `awaiting*` 状态写入；`ACTIVE_TURN_STATES=("accepted","dispatching","running","capturing")`（repository.py:22），switch_profile 两处拒绝四态 SQL 直查（repository.py:326-331,358-366）；待审批期间 Turn 仍 `running` ∈ 闸内。C-0016 §1.2 的 H/E 复核项**代码级已闭**，进程级夹具复验候 Pi/Codex 批后（CP4）。
- **FE 本地预测层口径（请 F1/S 接缝表采用）**：`execution.state` 不能区分"运行中/待审批"（capturing 并入 running，projection.py:75-84；审批只以 `approval.requested/settled` 事件对呈现）——第一层闸谓词须扫描**未 settled 的 approval 交互事实**（含全部 runs+interactions，不只末 run）。服务端两层不受影响。

## 3. Pi/Codex 两批边界草案（BC 侧形状；精确路径候 H 修正案＋C 逐批签发）

**前置事实核查（承 S-0006 补正，BC 树实证）**：单体内**已有 pi/codex 方言与运行时模块**——`plugins/agent-box-harnesses/src/agent_box_harnesses/{pi,codex}/native.py`（P-A② split，DIALECTS 表＋NATIVE_TARGET）；且 codex 子包远不止方言：`composition.py/continuation.py/control.py/credentials.py/executable.py/hooks.py/launch.py/production.py/remote.py/app_server//interactive/`。**两批形状二择一，以复用为先**：若单体内方言＋装配已可用，批面收缩为**注册核对/available 判定/缺口钉**，**不复制成独立包双份实现**（违复用账与单一实现钉）；`plugins/agent-box-harness-{pi,codex}/` 独立包形仅在 H 可行性证明单体面不足时才申请。dsh 三包是形制参照，非"必须新建"依据。**形状裁决候 H 三件套实测**。
- deploy 资产全路径：`plugins/agent-box-harnesses/deploy/{pi,codex}/`（批文引用须写全路径）。
- **实测路径清单（00:56，`plugins/agent-box-harnesses/src/agent_box_harnesses/` 下，候 H 三件套对照即可即发 BC-0009）**：
  - `pi/`＝8 文件：`__init__.py, config.py, contract.py, native.py, production.py, projection.py, provider.py, sessions.py`
  - `codex/`＝15 项（含两子包）：`__init__.py, composition.py, continuation.py, contracts.py, control.py, credentials.py, deepseek-models.json, deepseek-sidecar-config.toml, executable.py, hooks.py, launch.py, native.py, production.py, remote.py` ＋ `app_server/{__init__,provider}.py` ＋ `interactive/{control,provider}.py`；两族 py 模块合计约 1972 行。
- 组合根装载面：`server/bootstrap/runtime.py` 经 `agent_box_harnesses.registry.load_builtin_registry()` 按 harness_type 取 8 家声明（S-0006 §4；注：该文件实际位置=本树 `src/agent_box/server/bootstrap/runtime.py`，批文时以实测路径为准）。
- **部署面实测（00:59 增补，候 H 核对）**：运行面 harness 可用性＝**文档驱动，非代码驱动**——
  1. `server/__main__.py:13-24`：`--sidecar-deployment <json>`＋`--plugin-root`＋`--mount TOKEN=PATH`（回退 `build_runtime(data_root)`）；部署文档为 machine-local non-secret，**全仓 grep 无任何签入的部署 JSON 模板**。
  2. `runtime.py:480 build_runtime_from_sidecar_deployment` 纯从 `value["harnesses"]` 建 deployments（L520-771 全类型化 `SIDECAR_DEPLOYMENT_INVALID`），port_factory L861 按 harness_type 取用——**注册任何 harness 零代码改动**。
  3. available 判定泛型遍历 registry：`src/agent_box/service/facade.py:51-66`（注：facade 实测位置在此，非 server/service/），available＝execution 装配 AND credential_registered，8 家含 pi/codex 天然覆盖，**零新代码**。
  4. 服务器测试夹具已用 `"id": "pi"` 9 处（test_harness_sidecar.py/test_placement.py）——执行面对 pi id 已有 exercised 路径。
  **推论（候 H 三件套证实/证伪）**：pi/codex 批面或收窄为"**部署文档＋plugin-root 侧 sidecar 源＋凭证登记**三样数据/资产面工作，server 代码零改动或近零"。注意 codex 在 harnesses.toml L6-8 注释自述"无部署模板、未过真实假端点全链门"（其 `codex/production.py` 模块存在≠部署模板存在）——缺口精确形状归 H 实测。
- 禁改面照旧：lifecycle/sidecar_backend 无品牌分支、Work Core 冻结、profiles.*/providerModels.* 零新增。
**真实测试**：pi 原样既有配置、codex 仅 gpt-5.6-luna 显式指定（BUDGET）；夹具先行，真实链候 C grant。
**C-0025 登记**：本 §3 形状获原则批准（pi 先 codex 后）；批文精确路径候 H＋修正案后 C 逐批签发。

## 4. S2c2 处置建议（汇合裁决项）
**建议不引入本任务**：FE 接线只读现公开面（wire 面在 `server/wire/` 即公开契约，物理位置不改契约）；引入＝13 路径重排无闭环收益、且违反"不重做旧拆包路线"（README）。若 Phase 3 联调需改 wire 实现，再按独立批次申请。挂账不销：`work/be-s2c2-1` 分支与旧树保留。

## 4b. 开放项随本 PROPOSAL 提裁
- **OD-2 服务端发现（C-0019 第 2 条点名 BC）**：现需 data-root+port 两输入、无握手文件（S G2）。BC 推荐：不改 wire 语义，Electron spawn 方自选端口并持有两输入（现状 `--port N` 显式传入天然满足），零新契约；仅当联调证明需要再按独立批呈 C。候 F1 连接服务侧确认。
- **方案 A 两开放点收口事实（S-0004 §5）**：wire 仅有 `workspaces.archive`（archivedAt 留痕），**无物理删除方法**；目录根路径＝调用方入参，后端不指定默认。故"根路径归属＋清理责任"均落 FE 侧参数与 C 裁决，服务端既有 archive 语义够用，**零后端缺口**。建议 C 在 Phase 2 批文钉：独立会话专用目录根置于 data-root 之下、FE 持清理责任、archive 即够。
- OD-1（默认 profile 启发式）与 OD-3（轮询自测）C-0019 已裁，无本方追加。

## 5. 既有红 ID 清单（回归配对基线，前手实测＋基线 commit 信息在册）
- 根门既有红＝20F 族（E2b 配对实测 20F/1465P/33S）；HD-001 差量验收须**同形树同环境**与基线 92a2d2ba 配对，不追平历史红。
- 环境性 skip：`test_first_run_lock.py:453`（真实 opencode+bwrap）。
- 边界钉绿册：service(8)+sessions(7)+execution-boundary(11)+lifecycle(11)+b5 pins；lifecycle pins GREEN_NO_SKIPS=11P。
- 串行同环境回归纪律：重任务许可经 C，本组不自跑全量门。

## 6. 状态
定稿已随 **BC-0006（PROPOSAL）**发出（2026-09-23 00:47）。H 三件套落册后以修正案并入 §3 精确路径；届时新增事实不改本稿 §1/§2/§4/§5 结论。

**发后收件登记（00:50）**：S-0005＋E-0006（S↔E 两轮验证闭环，cc BC）与 BC-0006 §2.2b 收编口径**同源同向，零冲突、无需修件**；补一条支持事实入册：`NeutralRunTracker.active_runs/runs` 为**进程内账本**（lifecycle.py:77-79），权威跨会话只读源＝`executions.list`（E-0006 §3）——与 §2.2 结论一致。BE 汇合面 S/E/F1 侧交付全部齐位，本 PROPOSAL 引用面已闭合；仅候 H 修正案与 C 逐条裁决。

**H 落地登记（01:04）**：H feasibility＋seam-facts 已收（reuse.md 候补）。四项独立复核通过（G3 真、八家门脚本在、§4 与 E-0005 并作一行、文档级红确认）；修正案以 **BC-0009** 发出：批面收敛＝1 装配 shell/家＋2×1 行 CLI 修复，独立包例外案关闭，G1 `--worker` 勘误（server 无此旗标），G6 关键路径候 H 补充轮，文档级红归属请 C 裁决（BC 倾向随批附带修注释）。本稿 §3 由 BC-0009 §2/§3 取代其形状裁量部分。

**定稿指针（01:08）**：两批边界与验收分级的**权威据本＝BC-0011**（归并 BC-0009/0010，答复 C-0030）；本稿 §3 及其后增补为过程记录，与 BC-0011 冲突处以后者为准。

**批文落地登记（01:09）**：C-0032 签发 B-HARNESS-PI-001（执行者 H、BC 督导集成；独立包案关闭、G6 候 H 定稿→H-0005 §2 local-process 零 cargo 采纳移出关键路径）。§3/§4 边界以 BC-0011＋C-0032 为准据，督导核账接口＝reports/pi-batch-integration-checklist.md。
