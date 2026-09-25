# H 复用账（HD-001，Phase 0）
owner: H（gen 1）· 基线 BE 92a2d2ba · 2026-09-23T01:03+08:00 · 格式=REUSE-TEMPLATE.md
本轮结论：**两批（harness-pi/codex）新增仅 <150 行 Linux 装配脚本+4 行 CLI 修复；全部实质能力面复用基线既有件，零新依赖、零新协议、零从零组件。**

| 能力/组件 | 候选项目+版本/commit | 源码路径/官方链接 | 许可证 | 检查/实验结果 | 直接/适配/参考/不用 | 修改边界/拒绝原因 | 本地落点/升级方式 | owner |
|---|---|---|---|---|---|---|---|---|
| Pi 接入传输（ACP） | @automatalabs/pi-acp@0.5.0（已采用件，证明适用） | plugins/agent-box-harnesses/runtime/vendor/automatalabs-pi-acp-0.5.0.tgz（tar 内 package.json+LICENSE 直验） | Apache-2.0（tar 内证据） | 真实模型全链门 exit 0（docs/server-round1/fullstack/live-model-preflight.md §6 Pi，Linux+bwrap+真进程）；tarball 源码读过（worker 经 createAcpRegistration 消费） | 直接复用 | 无改 | runtime/package.json pin＋vendor tgz（升级=换 pin+重跑门） | H |
| Codex 接入传输（ACP） | @agentclientprotocol/codex-acp@1.1.14（已采用件） | 同目录 agentclientprotocol-codex-acp-1.1.14.tgz | Apache-2.0（tar 内证据） | 真实门 exit 0（preflight §6 Codex：两轮 14/15 delta、session/load 续接、取消、CODEX_HOME 隔离）；由它拉 codex app-server 子进程（codex/production.py:82-83） | 直接复用 | 无改 | 同上 | H |
| ACP 桥底座 | giuliastro/harness-remote v3.0.2 @21ce6db4 | third_party/harness_remote/（SOURCE.json 逐文件 sha 在案） | Apache-2.0（SOURCE.json:5-6） | 基线内 2 处已签名补丁（PATCHES.md：异步权限裁决、acp-registration 工厂化）；node 测试 25 passed（能力矩阵 §7） | 适配（已发生于基线，随迁零新增） | 不再加补丁（今晚面不触碰 bridge） | third_party 快照 | H |
| Pi/Codex 适配器家（8+16 模块） | 基线 agent_box_harnesses.{pi,codex}（已采用件） | plugins/agent-box-harnesses/src/agent_box_harnesses/{pi,codex}/（production.py 等，亲读） | 本仓既有 | deployment_document→bootstrap 装载校验通（bootstrap/runtime.py:480-576）；模板测试两家齐（tests/test_{pi,codex}_production_template.py）；**缺陷=G3 CLI dest 漂移 2 行**（pi/production.py:280 vs :288；codex :361 vs :369，直验） | 直接复用+4 行修复 | 修复仅对齐 --artifact-token（dsh 先例 agent_box_harness_dsh/production.py:288-299），随批文 | 原包内 | H |
| Linux 产品启动装配 | 候选1: scripts/server-round1/accept-a.ps1（Windows 专属）；候选2: 新写 Linux shell（harness-install-set.py 产 deployment.json + python -m agent_box.server --sidecar-deployment） | accept-a.ps1 头 20 行亲读（参数形状=DeploymentPath/PluginRoot/Mount/Port 即所需形状） | 本仓 | 候选1 形态可用但平台不符；候选2 组装全部既有件，零新语义 | 参考(1)+从零(2) | 从零部分 <150 行 shell：仅装配/登记（CHARTER 端口/PID/数据根登记），不内嵌凭据、不新增配置功能；批准 ID 随批文 | scripts/hd001/（新目录，批文列精确路径） | H |
| 凭据注入（今晚 Pi/Codex） | MemorySecretStore＋import_file(locator) | src/agent_box/storage/secrets.py:166＋门自注入先例（pi gate :815、codex gate :1365） | 本仓 | preflight §3 全断言通过（tokenIn* 全 false、locator 不删、清理全 true）；恰合 CHARTER"仅内存注入" | 直接复用 | 边界：不修 Linux 持久 store（凭据管理扩面禁区；LNX-002 已钉 tests/server/test_linux_default_secret_store_lnx002.py） | 无落点变化 | H |
| 沙箱执行室 | 基线 agent-box-sandbox-bwrap 声明式房间 | sidecar_room.py:54-124 compose_sidecar_room（全 ACP 家族共用）；harnesses.toml native_home 驱动投影 | 本仓 | 历史门真 bwrap 跑绿（preflight §6 各家 HOME 隔离实证） | 直接复用 | 零新条目（声明式覆盖） | 不变 | H |
| 真实/离线验收门 | pi/codex-production-chain-gate.py＋host-substitution-gate.py | scripts/server-round1/（头注亲读：offline=loopback 假端点，--live 才真实） | 本仓 | 即 R0 验收器：离线绿=C 预算零消费的配对证据；--live 消费走 C grant | 直接复用 | 不改门语义；如 G3 修复触及其加载路径则同步核对 | 不变 | H |
| 拆包方案（H-044 全家 8 模块迁+21 条白名单） | 旧循环先报 backend-loop/harness/reports/H12-pi-prereport.md | 同上 | n/a | 按 92a2d2ba 重核：技术仍成立但**与本任务闭环零依赖** | 不用（本晚） | 拒绝原因：README"不重做整条旧拆包路线"；登记为拆包线历史证据 | 另批另任务 | H |

| Pi CLI 上游（宿主于 pi-acp 进程内） | earendil-works/pi（原 badlogic/pi-mono）`@earendil-works/pi-coding-agent`；候选2=直连 Pi 自研协议 | github.com/earendil-works/pi；docs/configuration.md | MIT（repo README） | 官方文档核读：agent-dir 默认 ~/.pi/agent（PI_CODING_AGENT_DIR 覆盖）、settings.json/models.json/auth.json 布局＝基线 deploy/pi 投影内容物同形；候选2 拒绝（另造协议违章程） | 参考（协议面经 pi-acp，不直连） | 不 vendored Pi CLI 本体（用户已有配置原样运行，CHARTER） | 用户既有安装＋guest 投影 | H |

官方文档对照轮已完成（ACP v1 方法清单、codex-acp 认证/MODEL_PROVIDER/env_key 官方姿势、两家 npm pin 许可证 npm 侧复核=Apache-2.0 与 tarball 内证据一致）——结论与偏差登记见 harness-pi-codex-feasibility.md §5。
>=2 候选且 >=1 读源码：满足（两 npm tarball 解包直读、bridge 与门脚本亲读；候选对=ps1 vs Linux 装配、迁包 vs 启用）。
缺行自查：今晚 H 域新增可见组件＝启动脚本 1 件（第 5 行覆盖）；无新 UI/无新协议/无新包。

## B-HARNESS-PI-001 实装轮补记（H gen1 · 2026-09-23T01:36+08:00 · HEAD 67049283）

| 能力/组件 | 候选+版本/commit | 源码路径 | 许可证 | 检查/实验结果 | 采用方式 | 修改边界/拒绝原因 | 本地落点 | owner |
|---|---|---|---|---|---|---|---|---|
| Pi 运行时 artifact 构建 | 基线脚本（已采用件） | scripts/server-round1/build-pi-runtime-artifact.mjs --output --json | 本仓 | 离线跑绿（R1 链首步）；发布只读树+.manifest.json；digest 经 agent_box_sandbox_bwrap.runtime_artifact_tree_summary | 直接复用 | 零改 | 无 | H |
| deployment.json 产面 | family CLI（G3 修复后） | python -m agent_box_harnesses.pi.production --artifact-token pi-runtime | 本仓 | R1 活体经此产 deployment.json＝G3 修复的端到端验收 | 直接复用 | 仅批准两行旗标修复 | 原包内 | H |
| 纯 session 创建面 | REST 兼容层 | POST /api/v1/sessions（snake_case, session_id）+ Idempotency-Key | 本仓 | seeding 绿；wire 无纯 sessions.create（仅 createAndSend 会派发 turn）→ 零调用口径必须走此面 | 直接复用 | 不改 wire/REST 语义 | 无 | H |
| Worker 二进制（R0 外供） | agent-box-env-provider .acceptance-bundle-c12 | /home/maoqh/projects/agent-box-env-provider/workers/agent-box-worker/.acceptance-bundle-c12/agent-box-worker | 源线快照 | main.rs/protocol.rs 与本树 workers/ 逐字节同源直验；server-round1 各 bundle 为他源，实测弃 | 直接复用（只读引用） | 拒绝自 build：本机无 cargo | 无落点（外部只读） | H |
| 安装器全家批产 | harness-install-set.py | scripts/server-round1/ | 本仓 | **--skip-builds 定义即死代码**（正文零引用，实跑建 8 家）→ 单 family 不可用 | 不用（本批） | 拒绝原因：越界改它非批准路径；family CLI 直产即达目的 | 无 | H |

## B-HARNESS-CODEX-001 实装轮补记（H gen1 · 2026-09-23T02:01+08:00 · HEAD 60d868ef）

| 能力/组件 | 候选+版本/commit | 源码路径 | 许可证 | 检查/实验结果 | 采用方式 | 修改边界/拒绝原因 | 本地落点 | owner |
|---|---|---|---|---|---|---|---|---|
| Codex 装配脚本 | pi 脚本同族换装（本批自产件复用自家先例） | scripts/hd001/harness-linux-codex.sh（184 行） | 本仓 | R1 首跑即绿（无 pi 轮 npm 闭包/旗标类撞车）；换装点=builder/token/module/seat grep/requestIds | 直接复用（结构 1:1） | 零改 pi 脚本本体 | 本仓 scripts/hd001/ | H |
| Codex 运行时 artifact 构建 | 基线脚本 | scripts/server-round1/build-codex-runtime-artifact.mjs --output --json | 本仓 | 离线跑绿（R1 链首步，codex-runtime treeDigest sha256:9051b844…）；**无需 pi 轮的 npm ci --offline**（codex 闭包现场完整） | 直接复用 | 零改 | 无 | H |
| deployment.json 产面（codex） | family CLI（G3 修复后） | python -m agent_box_harnesses.codex.production --artifact-token codex-runtime | 本仓 | R1 活体验收＝BC-0020 先验点三确证：修复前 CLI 必崩（main() 消费 artifact_token 而旗标定义 artifact_source） | 直接复用 | 仅批准两行旗标修复（:361-362，批文行号漂移 2 行已申报） | 原包内 | H |
| Codex 全链门 | 基线门（本批零触碰） | scripts/server-round1/codex-production-chain-gate.py（sha d9967cf1 恒等） | 本仓 | R0' typed GATE_WORKER_REQUIRED；完整 R0 exit 0 loopback-fake-endpoint；**门自插 sys.path（:101-106），裸跑只需补 venv site-packages**——与 pi 门（缺自插、需全量 PYTHONPATH）形状不同，已按实况使用 | 直接复用 | 不改门语义；BC-0020 基线哈希恒等实测 | 无 | H |
| Worker 二进制（完整 R0 外供） | agent-box-env-provider .acceptance-bundle-c12（与 pi 批同一枚） | 9d8df86d…7088＝manifest 登记值＝门报告 worker.sha256 回声值（三重恒等） | 源线快照 | C-017 §2 预留路径照用；bundle 目录仅二进制+manifest.json（无源码，源码同证沿用 pi 轮 main.rs/protocol.rs 记录） | 直接复用（只读引用） | 拒绝自 build：本机无 cargo | 无落点（外部只读） | H |
| (a) 文档红改写事实底座 | 树内既有证据文档 | docs/server-round1/fullstack/codex-production-packaging.md＋live-model-preflight.md §6 Codex（2026-09-15 --live exit 0） | 本仓 | 两文档亲读——注释断言"还没有生产封装/没跑过全链门"系过时事实，改写只纠正事实、保住 observed 留空语义（门证据未吸收为逐项声明） | 参考（措辞依据） | 只在 (a) 两靶行域内改；:163 四家 MODEL_NOT_VERIFIED 行零触碰 | 无 | H |
