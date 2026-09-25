# Pi/Codex Harness 接入可行性与最小批边界（HD-001 Phase 0，RESEARCH_ONLY）
owner: H（gen 1，会话 H-0003/C-0023）· 基线 BE 92a2d2ba · 2026-09-23T01:05+08:00
方法：本树源码+历史门证据只读实测；旧 H-044 pi 先报（/home/maoqh/projects/ordessa/worktrees/backend-loop/harness/reports/H12-pi-prereport.md，绑 0c042f54）按 HD-001 规则重新核对。零真实调用、零预算消费。

## 0. 前提修正（必须最先行）
HD-001-C-006 第 7 条与 BC be-baseline-audit"缺口1"称**"基线无 Pi/Codex 包"——口径失真**。实测事实：
- Pi/Codex 是**基线内完整存在且已证可用**的接入：legacy 包 `plugins/agent-box-harnesses` 内 pi 8 模块（含 production.py 303 行、AcpRegistration 路线）与 codex 16 文件（385 行 production），harnesses.toml（codex :3-77、pi :371-421）、ADAPTERS（adapters/__init__.py:11）、旧包 pyproject entry-points（:12,16）、runtime worker pin（codex-acp@1.1.14、pi-acp@0.5.0，runtime/package.json:13-16，vendor tgz 在案）**注册链全齐**。
- 真缺的是两件事：①**包装形态**未做 dsh/qwen/kilo 式独立拆包（＝旧循环拆包线，README 明示"不重做整条旧拆包路线"，与本任务闭环无依赖）；②**Linux 产品级启动接线**（见 §2 缺口清单）。
- ⇒ harness-pi/harness-codex 两批**不是"从零接入"，是"启用+验收"**。批边界因此比 C-016 预想小得多。

## 1. 已证明到什么程度（证据分级，历史门实据）
docs/server-round1/fullstack/live-model-preflight.md（2026-09-15）§6/§7：
- **Pi**：`pi-production-chain-gate.py --live` **exit 0**（Linux，真实 DeepSeek，Server→Core→Worker→bwrap→真 Pi，两轮真实流式+nonce 上下文回忆+journal 重放续接+未知模型派发前拒绝+凭据零泄漏+全清理）。
- **Codex**：`codex-production-chain-gate.py --live` **exit 0**（同链，两轮 14/15 delta，同 native id `session/load` 续接，取消 202→cancelled，CODEX_HOME/HOME 隔离实证，官方 config 原样投影 sha 在案）。
- 能力矩阵 docs/server-round1/fullstack/harness-capability-matrix.md §4：两家 start/observe/finish/stream/native_continuation **已观测**；attach/permissions **声明未观测**（诚实 supported=false）。今晚 FE 的"审批/输入响应"场景在 Pi 上 permissions 声明为 F、Codex 为声明未观测——**审批如实透传的 UI 场景先以已观测面（流式/工具/思考/停止/断连/续接）设计，审批面待真实发生证据再宣称**（PLAN"能力缺失不伪造"）。
- 文档级红：matrix §8"Codex 生产封装仍未完成"与 §4/09-15 preflight 矛盾（§8 为 09-14 残留行）；harnesses.toml codex 头注释同样过期。**证据以 preflight+门码为准**。
- 残余未决（如实报）：①Pi `attach` 无一次真实附件运行；②Pi permissions 从未 round-trip（今晚"真实审批"场景在 Pi 无已观测证据，Codex 有静态声明）；③Reviewer 复审登记（REVIEWER_AUTOMATION_READY）历史欠账；④harnesses/ 目录缺 test_codex_real_bwrap.py（非阻塞，门已覆盖）。

## 2. 今晚 Linux 闭环的真实缺口（逐项，均已实测定位）
| # | 缺口 | 证据 | 最小处置（批文候选） |
|---|---|---|---|
| G1 | 无 Linux 产品启动脚本（真启动链只有 Windows accept-a/e.ps1） | scripts/server-round1/harness-install-set.py:38（FAMILIES 含 codex+pi，直接调 deployment_document :149-156,234 产 deployment.json）；server/__main__.py:12-16 消费 `--sidecar-deployment` | 新增 **shell 装配**（不新增 Python 语义）：install-set 产 deployment.json → `python -m agent_box.server --data-root … --port … --sidecar-deployment … --plugin-root … [--mount …]`（**勘误承 BC-0009 §2：server CLI 无 --worker 旗标**）；登记端口/PID/数据根（CHARTER 要求） |
| G2 | Linux 持久 SecretStore 缺（DPAPI-only，LNX-002 已钉） | storage/secrets.py:72-74 `os.name!="nt"` 即拒；bootstrap/runtime.py:341-343 仅 nt 默认；server/__main__.py:49-57 不传 store → 运行期 CREDENTIAL_STORE_UNAVAILABLE（:871-873）；tests/server/test_linux_default_secret_store_lnx002.py 钉为已知缺口 | **今晚不修持久 store**（属配置/凭据管理扩面，禁区）。走既有 MemorySecretStore+locator import_file 注入＝H 域门与 preflight §3 的现役路径，且恰合 CHARTER"指定 runner 读 key 仅内存注入"。G1 脚本内以 `--authorized-secret` 类 CLI 参数触发 import_file（门已示范 :815/:1365） |
| G3 | pi/codex production.py 模块 CLI 坏码（argparse dest 漂移） | pi/production.py:280 定义 `--artifact-source`、:288 读 `options.artifact_token`→AttributeError；codex/production.py:361 vs :369 同病；dsh 已修（agent_box_harness_dsh/production.py:288-299） | 两批各带 **1-2 行修复**（对齐 dsh --artifact-token 单旗标，BC-0009 复核口径）＋现有模板测试零改；install-set 不经 CLI 可绕，修复仍建议做——防未来误判"包不可用" |
| G4 | 无 pi/codex profile（无 seeding，按设计） | seam-facts §5：profiles.create 必带 harness（handlers.py:1283-1295），无 ensure_default | G1 脚本调既有 wire `profiles.create`+`sessions.create`（既有方法，零新接口）；OD-1 裁决与事实一致无需推翻 |
| G5 | Codex 测试模型=显式 gpt-5.6-luna（非历史门的 deepseek-flash） | deploy/codex/models.json+config.toml:49 env_key=CODEX_API_KEY；codex/production.py:242-248（codex 无别名表）；BUDGET 只能 luna 且禁回退 | 批文申请单列：候选 SHA+显式模型参数+`native_model()` 证据路径；key 走 G2 注入面。**DeepSeek-key 场景**（章程"其他 Harness"）历史门已证可用 |
| G6 | ~~Rust worker 二进制需在树~~ **已移出关键路径（补充轮定稿）** | 通道由 workspace `env_kind` 决定（bootstrap/runtime.py:901-903 resolve_placement；placement.py:23-25 三通道；:65 local 无需 connector）；local→LocalSidecarLauncher（runtime.py:1152）直接 Popen 同一 bwrap 房间（local_channel.py 头注"the same room, run on this machine instead of through a Worker"、:526）；host-substitution-gate.py（Pi 专用、local channel 无 Worker）历史已跑真 Pi | **今晚 Linux loopback 闭环走 local-process 通道，零 Rust worker**。G6 仅当要复现 wsl/ssh 传输面或复跑旧 --worker 门时按需（另批，非关键路径） |

**结论：两家均可行，无一处需要新协议、新依赖、新包、Profile/Provider/Model 管理扩面。** 关键路径风险从"接入开发"降为"启动装配+环境核对"。

## 3. 最小批边界草案（供 BC 汇合，批文由 C 逐批签发）
### 批 1：B-HARNESS-PI-001（先，H 写域内；脚本命名采 BC-0009 修正案按家拆分）
- 精确路径候选：`scripts/hd001/harness-linux-pi.sh`（新增，装配脚本 G1+G4；scripts/ 公共文件须批文列精确路径）＋`plugins/agent-box-harnesses/src/agent_box_harnesses/pi/production.py`（G3 1-2 行）＋对应模板测试仅随跑不改。
- 验收（分级）：R0 离线=pi-production-chain-gate.py（loopback 假端点）exit 0 于本树；R1=启动脚本产 deployment.json 且 server 装载校验通过；**真实 Pi 一轮（C grant 后，Pi=原样已有配置）**经 FE 可达＝CP3 前置。
- 不动：harnesses.toml、拆包线、SecretStore、wire 面、bwrap（声明式覆盖已在真 bwrap 跑绿，sidecar_room.py:54-124）。
### 批 2：B-HARNESS-CODEX-001（后）
- 同构脚本参数化 + codex/production.py 两行修复；真实测试显式 luna（G5），复用 codex-production-chain-gate 断言面；可选补 test_codex_real_bwrap.py（另小批，非阻塞）。
- 两批合计新代码预计 <150 行（脚本+4 行修复），零从零组件——复用账见 reports/reuse.md。
### 与 FC/F1 接缝
- FE 消费面=BC interface-facts v1 权威清单原样（wire/1+WS event-stream）；harness 身份经 session→profile 单绑透传为不透明数据（seam-facts §2）——FE"连接区域二级选择 Harness"落到 profile.harness_type 选择，无跨 Harness 事件混排风险（服务端既有闸）。

## 4. 旧 H-044 先报处置
其"全家 8 模块整体迁＋垫片＋21 条白名单"＝拆包工程（旧循环 CP-MODULE-BASELINE 线），**HD-001 不需要**：今晚闭环不依赖新包（§0）。先报的分歧点（双 `__all__` 死名、三资产旧根保留、活投影缝字符串契约）登记为拆包线历史证据，若 BC 汇合认为后续维护需要再另批，不并入本任务。

## 5. 官方文档对照（2026-09-23 独立联网核查，纯官方来源）
- **ACP v1**（agentclientprotocol.com，Zed 发起、独立 org 维护，Apache-2.0）：本任务关心的能力全部是协议标准面——`session/update` 的 `agent_message_chunk`/`agent_thought_chunk`（思考透传）/`tool_call`/`tool_call_update`/`plan`、`session/request_permission`（审批）、`session/cancel`（取消）、`session/load`+`session/resume`（断连续接）。仓库基线消费的 kind 集（seam-facts §1）与之逐一对应，**无自造协议**。
- **codex-acp@1.1.14**（Apache-2.0，前身 zed-industries/codex-acp）：官方声明其启动 Codex App Server 并翻译 ACP；认证=ChatGPT 登录(auth.json)或 **`CODEX_API_KEY`（优先）/OPENAI_API_KEY**；`MODEL_PROVIDER` 选 provider、`CODEX_CONFIG` 合并 session config（**显式 luna 模型可行**）；Features 含 reasoning/plan/permission request/`session/load`。与基线消费一致（codex/production.py:74 env 名、:331 subscriptionCredential）。
- **Codex config `env_key`**（developers.openai.com/codex/config-reference）：`model_providers.<id>.env_key`＝指向存放 provider key 的环境变量名，base_url 指第三方端点——deploy/codex/config.toml:49 的用法即官方姿势，DeepSeek 兼容场景有官方依据，无需猜端点。
- **Pi**＝earendil-works/pi（原 badlogic/pi-mono，Mario Zechner；CLI `@earendil-works/pi-coding-agent`，**MIT**）。**pi-acp@0.5.0**（Apache-2.0）进程内经 Pi 官方 SDK 嵌入，声明能力含 model 目录、模型感知 `thinkingLevel`（思考透传）、elicitation、`session/load` 回放；**官方未声明 permission 能力（未找到公开证据）**。认证=ambient：读 Pi 自身 `<agent-dir>/auth.json` 或环境变量 key；agent dir 默认 `~/.pi/agent`（`PI_CODING_AGENT_DIR` 覆盖），文件布局 settings.json/models.json 与基线 deploy/pi 投影内容物一致（投影目标 /runtime/home/.pi/agent 即该 dir 语义）。
- **对照结论/偏差登记**：①官方文档证实基线声明形状，未发现协议面缺口；②**今晚"真实审批"UI 场景只可能先落在 Codex**（request_permission 有官方能力声明+历史静态声明），Pi 侧审批无公开证据且历史未观测——建议 BC/C 把 CP4 审批场景的先行 Harness 定为 Codex，Pi 用流式/工具/思考/停止/续接场景验收（不伪造能力面）；③Pi"原样已有配置"运行前提核实为：guest agent-dir 内 auth.json 或环境 key＋models.json——基线投影已覆盖 models/settings，**key 走 G2 内存注入面**，与"不改模型/认证/默认配置"承诺一致。

