# LNX-001 · 后端两线（service / runtime）证据清单

- 调查性质：只读证据收集。全部结论可用文末命令在仓库 `/home/maoqh/projects/agent-box`（= `ordessa/repos/backend` symlink）复核；未执行任何写操作 git 命令、未运行测试、未读任何凭证内容。
- service 线：`feature/env-provider-v1` @ `003b52b2b18a86547d2819ea8875095442d2011b`，工作树 `/home/maoqh/projects/agent-box-env-provider`
- runtime 线：`feature/env-provider-runtime` @ `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa`，工作树 `/home/maoqh/projects/agent-box-runtime-round1`
- 共同祖先：`a4f82566f6718c4af0c58062a44c2107e04e6106`（`git merge-base` 实测复核一致）
- 提交规模按主会话口径（service 独有 103 / runtime 独有 138），本文件只按能力归组不重复计数。实测：其中触碰产品代码路径（src/tests/scripts/protocols/plugins）的提交 service 侧 36 个、runtime 侧 45 个，其余全部只触碰 `docs/implementation/**` 或 `docs/server-round1/**`（见 §6）。

内容三分类基线（本报告通篇沿用）：
1. **产品代码**：`src/agent_box/**`、`plugins/*/src/**`、`plugins/*/runtime/**`、`plugins/*/deploy/**`、`scripts/server-round1/**`（门/工具脚本，介于产品与工装之间，按脚本单列）、`protocols/worker/**`（Wire/Worker 合同源）。
2. **测试**：`tests/server/**`、`tests/conftest.py`、`plugins/*/tests/**`。仓库声明入口：`pyproject.toml:63` `testpaths = ["tests"]`（两线同值，`git grep -n testpaths feature/env-provider-v1 -- pyproject.toml`）。各门文件在证据文档中给出定向命令，模式为 `PYTHONPATH=src:<plugins/*/src> python3 -m pytest tests/server/test_<n>_<id>.py -k …`（例：runtime `docs/server-round1/106-sidecar-drain-rebuild.md:60`；service `docs/server-round1/profiles-list-sendability-117.md:107`）。
3. **生成工件/打包物**：两侧对 `docs/server-round1/fullstack/generated/wire-v1.schema.json`（前端锁件副本）各做了一次改名分叉（见 §4）；service 侧另生成 `contract/wire-v1.server-inventory.json`（`wire_artifact.py --write` 产物）；runtime 侧生成 `protocols/worker/golden/*.json` 5 件。Worker Rust 二进制（`workers/agent-box-worker/target/release/…`）两线均不入库（`workers/` 只在树里存源码，二进制 git-ignored，见 service 提交 `beee590`/`9455b0c` 的"工件在/不在"账）。

复现命令模板（全程只读）：
```
git -C /home/maoqh/projects/agent-box log --oneline a4f82566..feature/env-provider-v1
git -C /home/maoqh/projects/agent-box diff a4f82566..feature/env-provider-v1 -- src/agent_box/server/model_configs/repository.py
git -C /home/maoqh/projects/agent-box grep -n '<symbol>' <ref> -- <path>
```

---

## §1 service 侧能力组（feature/env-provider-v1）

按用户可见能力归组。工单号（101 等）是历史调度编号，仅作定位用，不代表任何调度权威。

### S1 wire 错误族收口 / 消灭裸 HTTP 500（工单 101 → 115 → 123 → 147 同族四段）
- 代表提交：`f3dcea7af952`(101)、`bd5d3280e169`(115)、`6344b2f24276`(123)、`222a97cf4488`+`61f5d1b8c8c0`(147)
- 文件：`src/agent_box/server/wire/handlers.py`、`src/agent_box/server/wire/errors.py`、`src/agent_box/server/transport/http/app.py`
- 行为变化：未登记域错误码不再冒成 500/text/plain。四道冗余墙：①`errors.converge_family` 把族位收进合同 12 族、原码进 `details.internalCode`（`feature/env-provider-v1:src/agent_box/server/wire/errors.py:115`）；②dispatch 意外异常出合规错误对象、internalCode 只放异常类型（`bd5d328` 账）；③HTTP 边界第三道墙（`feature/env-provider-v1:src/agent_box/server/transport/http/app.py:111-116,186-190`）；④资产面五处兜底 except 不再说谎/漏路径（147）。`e21ef37` 用真实 uvicorn bind 复跑证实 usage.aggregate/export 为 200+UNAVAILABLE+internalCode。
- 依赖：不依赖 runtime 侧任何组；但它改的 `wire/handlers.py` 与 S2/S4/S6/S8 同文件堆叠。115 账中点名"兄弟树（runtime @`56af017`）无墙、63 个 tests/server 文件 0 个 family 守卫，单侧合并不会有人喊"——合并方向性风险，登记于 §5-R2。
- 测试：`tests/server/test_wire_error_family_101.py`、`test_wire_error_family_closure_115.py`、`test_transport_boundary_wall_123.py`、`test_asset_surface_refusals_147.py`（pytest 默认入口 tests/）。

### S2 providerModels.update 省略/清空语义修正（工单 112，KEEP 哨兵）
- 代表提交：`89c72b58bbdf`（主修）、`d56535fa1d91`（可空性补做）、前提测量 `0f7b865`、工单修订 `6c09534`
- 文件：`src/agent_box/server/model_configs/repository.py`、`model_configs/service.py`、`wire/handlers.py`
- 行为变化：`providerModels.update` 上"省略字段=保留原值、显式 null=真清空"此前两层吞掉（handlers `if value is None: continue` + SQL `COALESCE`）。现在 `_provenance` 不再丢弃显式 null（`feature/env-provider-v1:src/agent_box/server/wire/handlers.py:1740` 附近签名改 `dict[str, str | None]`），service 以 `project(current)` 打底再叠 body（`model_configs/service.py` update()），repository 四列默认换 `KEEP` 哨兵、按需生成 SET、COALESCE 从该写路径消失（`model_configs/repository.py:22` `KEEP = _Keep()`，update() 内 assignments 构造段）。可空性以合同为准逐字段登记。
- 依赖：这是与 runtime 线 092/126 重叠的三个文件之一（§3.1/§3.2）。不依赖 runtime 生成物。
- 测试：`tests/server/test_provider_update_keeps_omitted_112.py`（28 条门）。定向命令模式：`pytest tests/server -k "provider or update or provenance"`（`feature/env-provider-v1:docs/server-round1/fullstack/provider-update-keeps-omitted-112.md:89`）。

### S3 wire 合同发布与覆盖元门（工单 103/113，生成工件+工具）
- 代表提交：`8cdbfcb2da0b`(103)、`df115c7e19e9`(113)
- 文件：`scripts/server-round1/wire_drive_coverage.py`、`scripts/server-round1/wire_artifact.py`、生成物 `docs/server-round1/fullstack/contract/wire-v1.server-inventory.json`、改名副本 `contract/wire-v1.schema.registered-c4255b31.json`
- 行为变化：无运行期行为。交付两个可复跑断言：①每个 wire 方法必须有驱动证据（AST 扫描器+64 行账+豁免册，`--check` 退出码即结论）；②后端从自身源码 AST 生成 64 方法清单与前端锁件 `--compare` 对漂移，具名 2 条 provenance 漂移（`providerModels.update`/`probeModels`：Server 接受、合同未声明）。声明工件身份写进文件名（摘要 c4255b31）。
- 依赖：消费 S2/S4 的合同面（漂移登记）；与 runtime 102（Worker 合同）是不同合同面（wire-v1 vs worker-v1），互不耦合。对前端 settings 树的重锁依赖见 §5-R4。
- 测试：`tests/server/test_wire_drive_coverage_103.py`、`test_wire_artifact_113.py`；命令 `python3 scripts/server-round1/wire_artifact.py --print-digest|--write|--check|--compare`（`feature/env-provider-v1:docs/server-round1/fullstack/wire-artifact-published-113.md:37-40`）。

### S4 server.hello 公布家族目录（工单 105）
- 代表提交：`07c9d419a452`、改判收口 `221a894a35ab`（HELLO_HARNESSES_DONE）
- 文件：`src/agent_box/server/wire/handlers.py`
- 行为变化：hello 响应新增 `harnesses` 数组，取自已有的 harness 注册表（deployment 事实，非记录派生），每项含 `id` + 声明了才发的 `credentialKind`/`modelControlId`（`feature/env-provider-v1:src/agent_box/server/wire/handlers.py:566-587`）。客户端在零记录部署下也能列出可用家族。
- 依赖：注意——service 的 hello 条目**不含** wireProtocols；runtime 092 在 descriptor 层加了 `wire_protocols` 字段（`feature/env-provider-runtime:src/agent_box/server/execution/__init__.py:89`）但两侧都没把它接入 hello。同族能力在两线各做了一半，登记为 §5-R6。
- 测试：`tests/server/test_hello_harnesses_105.py`（其 `:194` 硬引用 S3 的 registered-c4255b31 工件路径）。

### S5 连接探针 SSRF 加固（工单 104）
- 代表提交：`e036d606d1c5`、门 `f3883a1aa5ef`
- 文件：`src/agent_box/server/model_configs/probe.py`
- 行为变化：`_validate_endpoint` 改为解析后校验（`socket.getaddrinfo` 逐条判定，拒私网字面量绕过），探针只走一跳、只走声明端点（禁 redirect 跟随，`redirect_request` 覆写）。
- 依赖：独立；runtime 侧 092 的 `validate_endpoints` 复用"probe 的 URL 纪律"作为文档口径（runtime `model_configs/service.py` _validate 注释），合并时须保住 probe.py 的这版语义。
- 测试：`tests/server/test_probe_egress_104.py`（15 条门全部数请求）。

### S6 profiles.list 可发送性投影（工单 117 + 152）
- 代表提交：`0a8d9de6be1a`(117)、`9b1227246b64`(152)
- 文件：`src/agent_box/server/wire/handlers.py`、`src/agent_box/server/wire/projection.py`
- 行为变化：profiles.list 每行新增 `recoveryPending`（三态，null=unknown：`wire/projection.py` `_tri_state`，v1 diff @@ -107,6 +124）与 `sendability {state,reason,message,actions,checks[]}`（`handlers.py:689,829`）；152 把"本机凭据可解析"算进 ready（身份在≠能解析）。判定链是**复制** freeze 规则而非 import（因 `model_configs/**`、`sessions/**` 当时判归 runtime 写面），并用一条门与真 `freeze_execution_configuration` 对表（漂移即红）。
- 依赖：**强耦合 runtime 的 freeze 语义**——runtime 092 给 freeze 新增 PROTOCOL_INCOMPATIBLE 阻断（`feature/env-provider-runtime:src/agent_box/server/model_configs/service.py:173-193` 区域），而 service 树全仓 `PROTOCOL_INCOMPATIBLE` 只出现在 `docs/implementation/worktree-charter.md:156`。合并后 117 的 cross-check 门（`tests/server/test_profiles_list_sendability_117.py:207` `test_the_projection_names_what_the_freeze_path_would_hit`）是否漂移无法仅从 diff 断言，见 §5-R1。
- 测试：`tests/server/test_profiles_list_sendability_117.py`、`test_sendability_resolvable_credential_152.py`。

### S7 凭据身份注入缝（工单 149）
- 代表提交：`f1644127db44`
- 文件：`src/agent_box/server/credentials.py`
- 行为变化：新增唯一幂等身份入口 `register_if_missing`（`feature/env-provider-v1:src/agent_box/server/credentials.py:23`）：同一事务内查+插 `server_credentials`，已存在则原样返回 `created:False` 且不重读 secret source；为部署声明/试跑注入/151 受控入口共用语义。明确不动 wire 族位（未注入仍 CREDENTIAL_NOT_FOUND）。
- 依赖：与 runtime 120（缺凭据类型化，改的是 `storage/secrets.py:25` `SecretLocatorUnavailable` + `bootstrap/runtime.py:848-855`）是同族不同层：S7 管"身份可绑定"，R1 管"读不到时不塌成 EXECUTION_FAILED"。二者不冲突但须同时在场才闭合缺凭据场景；151（受控凭据 wire 入口）在 service 树只做了勘察（`8a83df2`，未写代码、等两仓重锁窗口）。
- 测试：`tests/server/test_credential_identity_seam_149.py`。

### S8 wire 面零散正确性组（128/129/125/145）
- 代表提交：`baca61927ad8`(128)、`9a3ba3e13c2f`(129)、`18eb41ce1263`(125)、`7fea0c16361f`(145)
- 文件与行为：
  - `src/agent_box/server/sessions/repository.py`：`WIRE_VISIBLE_EVENT_KINDS` 补 `usage.updated/thought.delta/plan.updated/mode.updated` 四 kind（`feature/env-provider-v1:src/agent_box/server/sessions/repository.py:35-44`），使 wire_seq 编号空间与 `wire/projection.py:_EVENT_KIND_MAP`（`feature/env-provider-v1:src/agent_box/server/wire/projection.py:53`）严格同集，消除双流编号（AUD-B-010）。
  - `wire/handlers.py`：`accounts.importAsset` 真读 requestId（129，幂等重放可判别）；`config.describe` 逐槽投影（125，一个控件多张槽表逐张可见）；`workspace.connection` 定档"预留、服务端暂不出"并门咬住（145，projection.py 注释 + 门）。
- 依赖：128 与 runtime 共写 sessions/repository.py（§3.3）；125 源自 runtime 树 092 交回③的 wire 半边（跨线工单路由，代码本身只在 service）。
- 测试：`tests/server/test_wire_seq_numbering_spaces_128.py`、`test_import_asset_request_id_129.py`、`test_config_describe_slots_125.py`、`test_workspace_connection_reserved_145.py`。

### S9 质量门工装与 089 UI-gate 工具链（测试/脚本类，非运行期能力）
- 代表提交：`4282eb068f78`(118)、`3be3d1ac7740`(119)、`9b7b754f5426`+`c3bd518`+`01d86f8`+`1ea024f`(087)、`26c9175afead`/`5abedc0b3811`/`61f5d1b8c8c0`/`3a41c706c353`/`1fa219ab463d`/`0be315fe7f0e`/`e6eba3a85200`/`4f1e83249d52`/`4a115243a437`/`b630acdff41d`(089 系列)
- 文件：`scripts/server-round1/artifact_presence.py`、`ui_gates_89_{leak_check,fake_rehearsal,seed_profile,seed_shape_check,seed_socket_check,sandbox_probe}.py`、`tests/conftest.py`（118 挂钩）、`tests/server/test_first_run_lock.py`（119 事件序判据）、`tests/server/test_cancel_recall_flake_087.py`
- 行为变化：无产品行为。交付：工件缺席由套件自报（QA-010）、负载无关反例门（QA-011）、087 结论=45-G8 门自身下标读错而非产品缺陷（取消轮恒 index 3、召回 index 4；修门需 scripts 写面，未动）、089 的 Windows/WSL 侧 seed/泄漏/预检工具（含 0600 守卫在 NTFS/drvfs 上的平台修正、代理免疫、代码页免疫）。
- 依赖：seed/预演工具消费 S1/S6 的实效（无裸 500、sendability 在响应里）。
- 测试：上述文件本身即测试；087 计数腿 opt-in 环境变量 `AGENTBOX_087_ROUNDS`。

service tip `003b52b2b18a`（dispatch 156 "message.final 必须带 stop reason"）为 docs-only 转单，未落代码——见 §5-R5。

---

## §2 runtime 侧能力组（feature/env-provider-runtime）

### R1 sidecar/执行链可靠性 + 失败原因类型化（106/109/142/150/135/120）
- 代表提交：`614d1c15dfc9`+`5493d0566c8e`(106)、`666080b81443`+`1b98daa5439a`(109)、`9836ee802b84`(142)、`1ced836d9bb0`+`b1e21dc664fc`(150)、`a7d13e8848de`(135)、`d257a61f20ef`(120)
- 文件：`src/agent_box/server/execution/sidecar_backend.py`、`execution/sidecar.py`、`src/agent_box/work_core/services.py`、`src/agent_box/storage/secrets.py`、`bootstrap/runtime.py`、`plugins/agent-box-harnesses/runtime/worker-entry.mjs`
- 行为变化：①106：prompt 边界有界确保存活/重建（SIDECAR_CLOSED→重开重发，上界 2 次+0.2s 退避，耗尽类型化 SIDECAR_REBUILD_FAILED）；②109：`_complete` finally 保证释放（`_retire_run`，`feature/env-provider-runtime:src/agent_box/server/execution/sidecar_backend.py:635`），修复"二次失败后 HTTP 全挂"的逐轮资源泄漏；③142：空快照不再折叠成"没有快照"（sidecar.py 一行修）；④150：sidecar op 失败的上游原因到达产品状态（用户经 HTTP 读到 HARNESS_LAUNCH_FAILED 而非裸 SIDECAR_OP_FAILED）；⑤135：work_core dispatch 包装结构化保留 code（`feature/env-provider-runtime:src/agent_box/work_core/services.py:64` 注释区，此前 RuntimeError 字符串化收成 EXECUTION_FAILED）；⑥120：缺凭据保持 `CREDENTIAL_NOT_AVAILABLE` 类型化到转录（`storage/secrets.py:25` 新异常类 + `:185` MemorySecretStore.read 改抛）。
- 依赖：135/120 与 service S1（错误族墙）同族不同层：R1 保住"码不丢"，S1 保住"族位合规、无裸 500"；互不覆盖、需同时保留。150 的 Worker 生产侧另一半（137 stopReason 合同）只落了观测（`ad68e13117ea`"未动源码"）。
- 测试：`tests/server/test_harness_sidecar.py`（改）、`test_sidecar_transport_109.py`、`test_empty_snapshot_fold_142.py`、`test_sidecar_upstream_cause_150.py`、`test_typed_code_live_leg_135.py`、`test_credential_missing_typed_120.py`。定向命令模式见 `feature/env-provider-runtime:docs/server-round1/106-sidecar-drain-rebuild.md:60`。

### R2 放置/沙箱解析与 WSL 腿（090/088）
- 代表提交：`a18aee156868`+`f9dbebd73a44`(090)、`267611156d50`+`a7b5dbe91696`(088)
- 文件：`src/agent_box/server/bootstrap/runtime.py`、`execution/sidecar_backend.py`、`plugins/agent-box-runtime-wsl/src/agent_box_runtime_wsl/connector.py`
- 行为变化：沙箱默认按 placement 解析而非宿主 os.name（wsl/ssh→bwrap，与控制面宿主无关；不可解析→类型化 SANDBOX_PROVIDER_UNRESOLVED，记 failed 非 ambiguous）；`_CoreSidecarProvider.start` 把 PlacementUnsupported/SandboxPortUnavailable 转 ExecutionStartRejected。WSL：`_decode_windows_output` 两条 UTF-16 猜测各兜底到 code-page replace，任何 wsl.exe 缓冲不再崩读者线程。
- 依赖：Linux/WSL 原生长主线直接相关组；与 service 侧无文件重叠。注意 service 089 账（`b630acdff41d`）记录了 Windows 侧 `SANDBOX_PROVIDER_UNRESOLVED` 现场与本组同源。
- 测试：`tests/server/test_placement.py`（改）、`plugins/agent-box-runtime-wsl/tests/test_windows_wsl_decode.py`。

### R3 队列暂停可见性 + schema 18→19（110）
- 代表提交：`e5c6ebd5b30a`+`7ab60ea611ce`
- 文件：`src/agent_box/server/sessions/queue.py`、`src/agent_box/storage/database.py`
- 行为变化：`server_queue_items` 增 `pause_reason` 列；`pause_pending` 不再丢弃 reason（`feature/env-provider-runtime:src/agent_box/server/sessions/queue.py:134`）；`queue.updated` 事件仅在带原因时附 `pauseReason` 键（`queue.py:180-187` 区域），非暂停事件逐字段不变。`PRODUCT_SCHEMA_VERSION` 18→19，`_migrate_18_to_19` 幂等加列。
- 依赖：pauseReason 是**未声明的合同载荷增补**——两线的 wire-v1 工件副本均无此键（实测 `git show <ref>:<工件> | grep -c pauseReason` 两侧都是 0）。service 树 `9a46f31fc7f5` 预言"合并后 --check/--compare 自己会红"（§4/§5-R4）。
- 测试：`tests/server/test_harness_sidecar.py`、`test_stage_a_server.py`（迁移版本断言 18→19）。

### R4 provider 记录中立化 + canonical 协议词汇 + 兼容性派生（092，schema 19→20）
- 代表提交：`b192a5f8b238`（阶段2）、`826d07962eaa`（阶段3）、`8e6fa4436fc6`（阶段4）、`56af017374eb`（阶段4b）、`6df22134153d`（终态 PROVIDER_REGISTRY_PARTIAL：runtime 半 DONE，wire 半路由 A/settings）
- 文件：`src/agent_box/server/model_configs/repository.py`+`service.py`、新 `model_configs/provider_protocols.py`、新 `execution/protocols.py`、`bootstrap/runtime.py`、`execution/__init__.py`、`storage/database.py`、六家 `plugins/agent-box-harnesses/src/agent_box_harnesses/*/production.py`
- 行为变化：①harness_type 可空 = 共享上游记录，任何声明兼容家可引用（repository create 签名 `harness_type: str | None`；service `_validate`/`_reference` 对应放宽）；②记录可声明 canonical 协议集（四值词汇，方言归一，未知类型化拒）与 per-protocol endpoints（沿 probe 的 URL 纪律）——存进内容寻址 config 对象（`_config_payload`，未声明不写键）；③project() 新增 `protocols/endpoints/protocolsDeclared/compatibility` 读侧派生（never stored）；④freeze 新增双方都声明且无交集才阻断的 PROTOCOL_INCOMPATIBLE；⑤六家 deployment 座位一手声明 wireProtocols；⑥DB：`harness_type` NOT NULL→nullable 走 19→20 表重建迁移（`feature/env-provider-runtime:src/agent_box/storage/database.py` `_migrate_19_to_20`，前向-only 已在 docstring 登记）。
- 依赖：**依赖 S5** 的 probe URL 纪律语义；与 S2/112 在同一对文件上由 126 预先合取（§3）；wire 半（合同/前端锁件）明确交回未做。
- 测试：`tests/server/test_provider_neutralization_092.py`、`test_provider_protocols_092.py`、`test_provider_compatibility_092.py`。

### R5 执行侧原生配置物化族（093/096/108/111/114）
- 代表提交：`c678b813b9bd`+`0f5900ea6b30`+`963c657cdb22`+`312be9e548e2`+`85ac5b8d17a5`(093)、`31ca543bbbd2`(096)、`c75096284193`+`a69ab39b562a`(108)、`2f46db561904`(111)、`9cfb9c6c0266`(114#6)
- 文件：新 `plugins/agent-box-harnesses/src/agent_box_harnesses/native_materialization.py`、新 `model_configs/reasoning_knobs.py`、新 `plugins/.../qoder/native_config.py`、`profiles/posture_translation.py`、三家 deploy 模板（dsh settings.yaml / hermes config.yaml / pi models.json）+三家 production.py、`scripts/server-round1/{pi,dsh}-production-chain-gate.py`、`model-validation-42d.mjs`
- 行为变化：①093：冻结执行→六家原生方言的渲染器 + `materialize_family`（`native_materialization.py:248`）；freeze 透传 protocols/endpoints 给原生落盘（092 残项接线，未声明记录逐字节冻结不变）；②096：思考旋钮取值域 + 越域类型化 `CONTROL_VALUE_UNSUPPORTED`（`reasoning_knobs.py:94,100`）；③108：三家生产模板输出上限从写死 64 解耦为宽松缺省 8192，链门改钉显式 GATE 上限；④111：claude 权限 `ask` 不再塞进 allowedTools，改映射 permissions.ask（posture_translation）；⑤114：Qoder 家族仅落了"原生配置未知键登记表"（item#6），家族注册/登录被真凭据前置阻塞（`09cfb9c6`/`406d7a1` 账）。
- 依赖：093 消费 R4 的 protocols/endpoints；108 的链门与模板同窗改（opencode 门 `scripts/server-round1/opencode-production-chain-gate.py:802` 断言 template==OUTPUT_TOKEN_LIMIT，实测行号吻合）。
- 测试：`tests/server/test_native_materialization_093.py`+`_093_stage3.py`、`test_reasoning_knobs_096.py`、`plugins/agent-box-harnesses/tests/test_{pi,dsh,hermes}_production_template.py`、`test_qoder_native_config_114.py`。

### R6 Worker 合同三元门（102，合同源+生成 golden）
- 代表提交：`938876dde198`、`ea5f77ea5c34`
- 文件：`protocols/worker/v1.schema.json`（op.enum 补 `workspace.get/workspace.list/home.put/attempt.write/stdin.close`）、新 `protocols/worker/golden/{workspace-get,workspace-list,home-put,attempt-write,stdin-close}-request.json`、`tests/server/test_worker_protocol_triad_102.py`；docs 侧改名 stale 快照（`ea5f77e`）。
- 行为变化：无运行期行为；"受审 WORKER_OPS==schema==main.rs 分发臂==golden 覆盖"三元门 + 两向内建反例。明确"门必须显式指 AGENT_BOX_WIRE_SCHEMA、不得默认取本树快照"（`feature/env-provider-runtime:docs/server-round1/wire-review.md:596`）。
- 依赖：与 service S3 是**两份不同合同面**（Worker v1 vs wire-v1），但 137/156（stopReason）落地时要求 102 三元门复算（`8fe7aa14492e`）。
- 测试：`tests/server/test_worker_protocol_triad_102.py`。

### R7 委派/子代理边界族（136/138/139/140/141/146 + 121/127/144）
- 代表提交：`58ff4fd8a945`(136)、`36ec36c1f806`(138)、`0528f1e7cac2`(139)、`7ba9b6ef84ab`(140)、`a10b7c22649c`(141)、`7477816a0caa`(146)；`6506a1287fab`+`a2ffcf64fe32`(121)、`58e037c56216`(127)、`5256441d6cad`(144)
- 文件：`src/agent_box/server/execution/delegation.py`（五单同文件堆叠）、`profiles/subagents.py`、`usage_aggregate.py`、`sessions/repository.py`（146 部分）、门测试若干
- 行为变化：子代理"只能收紧"child_limits 接上生产调用点（136）；委派落点=父轮工作区、名册带 workspace 字段按父区筛（138，`delegation.py:100,119-124`）；task_id 续接校验会话归属（139，复用 SUBAGENT_NOT_AUTHORIZED，零合同变更）；委派用量并入父轮账·读侧（140）；子代理超时先停再报+拒绝体带句柄（141）；委建子轮过既有链门+类型化出口+roster 可用性有据+取回按"本轮、最新"读（146，新增 `sessions/repository.py:1024 turn_message_deltas`）。121=Work Core SQL「升级⇔全新安装」等价门常设化；127=两份分叉门脚本归一或有据；144=bounded environmentId 逐字转发门（纯测试）。
- 依赖：146 与 service 128 共写 sessions/repository.py（不同 hunk，§3.3）。140 的 usage 聚合语义与 service S1 的 usage.aggregate UNAVAILABLE 错误面正交（一个改读、一个改错码），合并后需联跑（§5-R3）。
- 测试：`tests/server/test_child_limits_production_path_136.py`、`test_delegation_workspace_dimension_138.py`、`test_task_continuation_ownership_139.py`、`test_delegation_usage_rollup_140.py`、`test_subagent_timeout_stops_141.py`、`test_delegation_recovery_and_read_146.py`、`test_work_core_migration_equivalence_121.py`、`test_gate_script_parity_127.py`、`test_bounded_approval_forward_144.py`、`test_delegation.py`（改）。

### R8 控制面↔执行面同步引擎（091，PARTIAL）
- 代表提交：`3465ae9c938f`、`1709be2ea9b5`；修订 `ff38655`
- 文件：新 `src/agent_box/server/execution/control_plane_sync.py`
- 行为变化：传输无关同步引擎：`plan_deployment`（内容寻址清单，`:104`）、`ExecutionSideProjection`（首部署+增量、(kind,id,version,digest) 幂等，`:130`）、local_edit 冲突规则（CONTROL_PLANE_AUTHORITY，Windows 胜）、`reject_sensitive_keys`（凭据内容结构上不可入集合，SECRET_FIELD_FORBIDDEN，`:99` 注释区）。
- 依赖：真机部署腿与删除语义（schema 抬版）被工单 v2 明确关闭/交回未做；不依赖 service 组。
- 测试：`tests/server/test_control_plane_sync_091.py`。

### R9 订阅登录引擎（094，阶段 1+2 止）
- 代表提交：`0021851c6051`
- 文件：新 `src/agent_box/server/accounts/login_engine.py`
- 行为变化：device-code 登录引擎骨架（transport 注入、假端点机械路径）。真登录钉 .auth 多文件+机器绑定被一手判定不可臆填（`406d7a1` 账），故无真实订阅登录可用行为。
- 依赖：是 114 家族注册的前置（§5-R7）。
- 测试：`tests/server/test_subscription_login_engine_094.py`。

### R10 截断可见消费侧（134；生产侧未完）
- 代表提交：`c4af82bed3a5`(134)
- 文件：`src/agent_box/server/execution/sidecar_backend.py`（`:579` 传 `terminal_reason=_terminal_reason_from_result(run.result)`，`:980` 提取器）、`src/agent_box/server/sessions/repository.py`（`:753,785-787` complete_turn 可选写 `terminal_reason` 列；列在祖先已存在，`a4f82566:src/agent_box/storage/database.py:125`）
- 行为变化：harness 结果带机器可读 stop reason（如 max_tokens）且非 end_turn 时落库，wire 投影 `reason` 可见截断；缺席时 UPDATE 逐字节不变（缺席安全）。
- 依赖：生产侧（Worker 合同加 stopReason=137、`message.final` 带 stop reason=156）两线都未落码：runtime 只交回观测（`ad68e13`），service tip 是转单 docs（`003b52b`）。消费端已就绪、来源未接。
- 测试：`tests/server/test_terminal_reason_consumer_134.py`。

---

## §3 三个共同源码文件的重叠语义

方法：分别 `git diff a4f82566..<ref> -- <file>`；另用 `git diff feature/env-provider-v1..feature/env-provider-runtime -- <file>` 量残余差。

### 3.1 `src/agent_box/server/model_configs/repository.py`
- service（S2/112）加：`_Keep`/`KEEP` 哨兵（v1 `:22`）、update() 四列默认 KEEP + 按需 SET、COALESCE 移除。
- runtime 加：同样内容 + create() `harness_type: str | None`（092）。**关键事实：runtime 的 update()/KEEP 实现就是从 service 线 112 文本移植的**——runtime 提交 `2474ed009ef0`（126）的 docstring 直接写 "Order 112 (union with 092, via 126)"（`feature/env-provider-runtime:src/agent_box/server/model_configs/repository.py:12-16`），update() 内注释写 "composed with 092 by 126"（`:96-100`）。
- 残余差（`git diff v1..runtime -- <file>` 仅 15 行 +/-）：两处注释措辞 + `harness_type: str | None` 一行。
- 判定：
  - **必须同时保留**：KEEP 哨兵语义（两侧同源同实现）与 harness_type 可空（runtime 独有）。
  - **同一能力的两种演进**：不存在——112 语义已被 runtime 126 预先合取，文本上 runtime ⊇ service；service 侧没有任何 runtime 缺失的 repository 行为。
  - **diff 不能确认的**：runtime 版是否逐条通过 service 树那 28 条 112 门（`test_provider_update_keeps_omitted_112.py` 不在 runtime 树），需真跑联合套件（§5-R1）。

### 3.2 `src/agent_box/server/model_configs/service.py`
- service（S2/112）改：仅 update()——`merged = {**self.project(current), **body, ...}`、`body[...] if ... in body else KEEP` 四列（v1 diff 单 hunk `@@ -70,24 +71,34 @@`）。
- runtime 改：同一 update()（112 合取版，行文本与 service 版逐句一致，另加 `norm` 返回值消费与 `_config_payload`）+ create() 归一化 + `_validate` 改返回 norm dict + `project()` 新增 4 键 + `freeze_execution_configuration`（`:136`）两处放宽与新增 PROTOCOL_INCOMPATIBLE 阻断 + `_config_payload`/`_registry_wire_protocols`/`_derive_compatibility` 三个新函数（runtime diff `@@ -188,6 +222,8 @@`、`@@ -210,14 +257,53 @@`、`@@ -234,6 +320,33 @@`）。
- 残余差（v1..runtime）：runtime 相对 service 的全部增量=092/093 面；service 相对 runtime 的独有内容=update() 里 config/models 发布走 `canonical({"schema_version":1,"configuration":{...}})` 旧形（无 protocols 键），且 `_validate` 无返回值。
- 判定：
  - **必须同时保留**：112 update 语义（等价实现，无分叉）、092 协议词汇/兼容性派生。
  - **同一能力的两种演进，需要选一个**：update() 的 config 对象发布——service 版重发布 `merged["configuration"]`，runtime 版发布 `_config_payload(merged, norm)`。对未声明协议记录两者产出同字节（`_config_payload` 不写空键，runtime 注释 "an unchanged record freezes byte-for-byte as before"）；对声明协议记录只有 runtime 版保真。文本冲突在 update() 一个方法内，取 runtime 版即含 service 语义——这是"选一个"而非"合两个"，属 I 的决定。
  - **digest 面**：内容寻址 config 对象一旦含 protocols/endpoints 键，`config_object_digest` 改变，进而 profile freeze 引用变——跨数据根影响，diff 不可确认（§5-R8）。
- 佐证命令：`git diff feature/env-provider-v1..feature/env-provider-runtime -- src/agent_box/server/model_configs/service.py`。

### 3.3 `src/agent_box/server/sessions/repository.py`
- service（S8/128）改：`WIRE_VISIBLE_EVENT_KINDS` 补四 kind（v1 `:35-44`，wire_seq 赋号点在 `:1155`），门断言与 `wire/projection.py:_EVENT_KIND_MAP` 严格同集。
- runtime（R10/134、R7/146）改：`complete_turn` 增 `terminal_reason` 参数与条件列（runtime `:753,785-787`）；新 `turn_message_deltas`（`:1024`）；`get_session` oldest-first 窗口 docstring。runtime 树该文件的事件 kind 集仍是祖先旧集（`feature/env-provider-runtime:src/agent_box/server/sessions/repository.py:28`，实测行号）。
- 判定：
  - **必须同时保留**：两侧改动区域完全不相交（文件头部常量区 vs `:750+`/`:1020+`），文本可共存。
  - **同一能力两种演进**：无。
  - **diff 不能确认的**：128 的门是"两侧集合等价"断言——合并后 runtime 若把 pauseReason 演进成新事件 kind（今天没有）或引入新 frame kind，集合必须同步扩；该不变式只能靠复跑 `test_wire_seq_numbering_spaces_128.py` 对合并树证明。另外 runtime 146 的 `turn_message_deltas` 读 `server_session_events ... ORDER BY seq`（存储 seq，非 wire_seq），与 128 修的双编号空间正交，实测无交叠。

---

## §4 公共存储形态差异（model config / session 的 schema、迁移、repository 写路径）

| 维度 | 祖先 a4f82566 | service (v1) | runtime |
| --- | --- | --- | --- |
| `PRODUCT_SCHEMA_VERSION` | 18（`src/agent_box/storage/database.py:11`） | **18，文件零改动**（`git diff a4f82566..v1 -- src/agent_box/storage/database.py` 空） | **20**（`runtime:src/agent_box/storage/database.py:11`） |
| 新迁移 | — | 无 | `_migrate_18_to_19`（server_queue_items.pause_reason）、`_migrate_19_to_20`（server_provider_models 表重建使 harness_type 可空；docstring 自述前向-only、"回滚=停在 19 且不得存在 NULL 行"，实测于 runtime database.py diff `@@ -318,6 +319,74 @@`） |
| `server_provider_models.harness_type` | NOT NULL | 未动（写路径 create 仍必填 str） | 可空；NULL=共享记录（repository create `harness_type: str | None`） |
| provider 记录写路径 | COALESCE update | KEEP 哨兵 update（S2） | KEEP update（126 合取）+ 可空 create + config 对象可嵌 protocols/endpoints（改 digest） |
| `server_turns.terminal_reason` | **列已存在**（`a4f82566:src/agent_box/storage/database.py:125`） | 从不写 | 134 开始条件写入（缺席安全） |
| `server_credentials` | register/list | 149 增幂等身份入口 `register_if_missing` | 表未动；读侧错误类型化（`secrets.py:25`） |
| wire-v1 合同工件副本 | `docs/server-round1/fullstack/generated/wire-v1.schema.json` | 改名为 `contract/wire-v1.schema.registered-c4255b31.json`（+`--compare` 工具、server-inventory 生成物、generated/README 指针） | 改名为 `generated/wire-v1.schema.snapshot-33methods-stale.json`（R100，标"非当前工件"；严格门须显式 `AGENT_BOX_WIRE_SCHEMA=`） |
| Worker 合同 | `protocols/worker/v1.schema.json` | 未动 | 102 补 5 op + 5 新 golden |

**形态结论（事实，非建议）**：
1. 数据目录不兼容方向是单向的：schema 20 的库被 service 代码打开即 `FutureSchemaError`（比较点 `feature/env-provider-v1:src/agent_box/storage/database.py:625-627`），service 代码写不出 19/20；runtime 代码可开 18 库并前向迁移。任何共用数据根的先后顺序都由这一条约束（两线代码同开一库时只有 runtime 能活）。
2. wire-v1 公共合同工件在两线**各自改名分叉**且都声明自己那份才是登记口径（registered-c4255b31 vs snapshot-33methods-stale）；两侧副本均不含 pauseReason、不含 provenance 声明（grep 实测 0/0）。合并不会自动消解登记对，须与前端 settings 树重锁同窗（§5-R4）。
3. session 侧公共写路径（complete/append_event）两线改的是不同函数区，无相互覆写；provider 侧公共写路径（create/update/config 对象）在 runtime 侧已是并集形态。

---

## §5 无法仅从 diff 确认的语义 / 风险登记（不含合并建议）

- **R1 联合验证缺口**：service 的 112·28 门与 117·对表门从未在含 runtime 092 的树上跑过（两文件树互缺对方测试：`git diff --name-status` 实测 112/117 测试文件仅在 v1，`test_union_semantics_126.py` 仅在 runtime）。runtime 126 自称"both guards kept"，但 service 版 update() 与 runtime 版对**含 protocols 声明记录**的行为差（§3.2）只能运行期证。
- **R2 错误墙单侧在场**：service `bd5d328` 账一手核过 runtime @`56af017` 时点"handlers 族位仍收内部码、errors.py:112-114 仍 raise、dispatch 无墙、63 个门文件 0 family 守卫"。合并顺序不当时裸 500 形状可由 wire 面回归，且无跨线守卫会喊。
- **R3 usage 语义交叠未验**：service 侧 usage.aggregate/export 钉 200+UNAVAILABLE（S1），runtime 140 改聚合读侧（父轮并入）。两文件不同（`wire/handlers.py` vs `usage_aggregate.py`），但"聚合器可用且并入子代理"的组合形态两侧都无门。
- **R4 重锁链依赖 repo 外工件**：pauseReason(110)、provenance 2 漂移(113 具名)、`message.final` stopReason(156 转单)、credentials 受控入口(151 勘察)都需要前端 settings 树的 wire-v1 工件重锁——登记对在树外，跨树只读被环境拦下过（service `beee590`/`c82cb44` 账）。无法在本仓确认重锁后形态。
- **R5 截断可见只完成消费半**：`terminal_reason` 列写读路径就绪（runtime），Worker 合同 stopReason 生产侧（137）与 message.final（156）两树皆无代码；用户撞到的"砍断不吭声"（154 工单线）在两树均未收口（runtime `d617de8`/`d032102` 为改单文档）。
- **R6 hello/wireProtocols 半成品族**：service hello 发布家族目录但不含协议；runtime descriptor 有 `wire_protocols` 字段但 hello 面零改动（`git diff a4f82566..runtime -- src/agent_box/server/wire/handlers.py` = 0 行，实测）。合并后 hello 是否应发布 protocols 属合同决策，两树各自登记为 PARTIAL/交回。
- **R7 登录/凭据真机腿**：094 的 device-code 真登录、149/151/120 的真机凭据注入、114 的 `.auth` 家族注册均被一手判定依赖真机/真凭据（路径有登记、内容未读，合规）。runtime 树 `~/.qoder` 等 root 名仅出现在 093/114 观测文档中，本调查未访问。
- **R8 内容寻址 digest 的数据迁移面**：092 使 config 对象可嵌新键 → 声明过协议的历史记录在"用哪版 service.py 重发布"上摘要不同；两侧无 dump/重算迁移，diff 不可判定数据后果。
- **R9 计数不可横向比较**：两树全量套件计数互不可比（QA-007 口径：Worker 工件在/不在；service `9455b0c`、runtime `29d8922` 各自账），本报告引用的 pass/fail 均转录自各线证据文档，未复跑。
- **R10 scripts/server-round1 归属分叉**：同一目录 service 侧新增 9 脚本、runtime 侧改 3 脚本（108/106 门），历史章程互判唯一 owner（`fe7c423` vs `a33688f`）。文本无同文件冲突（改/增集不相交，实测 net list），但门语义（GATE 上限 64 vs 模板 8192）跨树须同窗，`opencode-production-chain-gate.py:802` 仅在 runtime 有。

---

## §6 历史文档登记（不得恢复其调度权威）

以下两树内容**全部是历史调度记录/过程文档**，不属于任何能力组，整合时按"留档"对待：

- `docs/implementation/**`：service 侧 81 个文件、对祖先 53 files changed +3735/−1713；runtime 侧 90 个文件、64 files changed +4245/−1612（`git diff --stat` + `git ls-tree -r ... | grep -c` 实测）。含 `status.md`、`worktree-charter.md`（两侧分叉：v1 改 134 行、runtime 改 294 行——文本合并必冲突，纯历史件）、`work-orders/*.md`、`manifest.json`、`blueprint.md`、`master-plan.md` 等。两侧各自做过"剪掉对方历史副本"（service `093def7`、runtime `1b07e09` 删 14 张 A 线单），因此两侧留存集合不同，均非全集。
- `docs/implementation/work-orders/queue.json`：两线各存一份并各自声明"单执行者队列"（service `be86cad`、runtime `d6fed59`）。队列机制（R-00xx/OF-xx/QA-0xx 编号规则、点名/公告、handoffs.md）整体属旧调度体系，按 workspace AGENTS.md 与 `control/decisions.md` 已退役——**只可作历史考据，不得恢复调度权威**。
- 提交消息体量注：service 103 个提交中 67 个、runtime 138 个中 93 个只触碰上述文档路径（=103−36、138−45），即"独有提交"的大头是过程记录而非产品演进；上文 §1/§2 已把 36+45 个产品提交全部归组，无遗漏（复现：`git log --format='%h' a4f82566..<ref> -- src tests scripts workers protocols plugins pyproject.toml | wc -l` = 36 / 45）。
- `docs/server-round1/**`（非 implementation）：各线**验收证据与一手观测文档**（对祖先 service 57 个文件、runtime 36 个文件有增改，`git diff a4f82566..<ref> --name-only -- docs/server-round1 | wc -l` 实测；含 087-runs/*.json、ui-gates-89-*.json、各单终态报告、092/093/096/114 观测表）。它们含不可再生的一手测量（如 104 的 15 门咬旧码 9 红记录、089 socket-check 码表），与调度文档不同类：登记为"证据文档，建议随对应能力组保留"——取舍仍由 I 定，本报告只区分性质。

---

### 附：本调查使用的只读命令（全部可复跑）
```
git -C /home/maoqh/projects/agent-box log --oneline --reverse a4f82566..feature/env-provider-v1
git -C /home/maoqh/projects/agent-box log --oneline --reverse a4f82566..feature/env-provider-runtime
git -C /home/maoqh/projects/agent-box log --format='C %h|%s' --name-only a4f82566..<ref> -- src tests scripts workers protocols plugins pyproject.toml
git -C /home/maoqh/projects/agent-box diff --name-status a4f82566..<ref> -- . ':(exclude)docs/implementation'
git -C /home/maoqh/projects/agent-box diff a4f82566..<ref> -- <file>          # §3 三文件
git -C /home/maoqh/projects/agent-box diff feature/env-provider-v1..feature/env-provider-runtime -- <file>
git -C /home/maoqh/projects/agent-box grep -n '<symbol>' <ref> -- <path>
git -C /home/maoqh/projects/agent-box show <ref>:<path> | grep -c pauseReason
```
