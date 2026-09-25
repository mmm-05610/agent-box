# B-HARNESS-PI-001 集成核对清单（BC 督导用，依 C-0032 批文）

据本：C-0032（批文，HD-001-C-014）＋BC-0011 §1＋H-0005（G6 定稿）。执行者＝H（h 树 `work/hd001-h`）；BC＝督导＋集成核账；C＝checkpoint 集成。

## 1. HANDOFF_READY 必含证据（缺项即退回复核，不代跑）

- [ ] HEAD SHA＋差量摘要（`git status --porcelain` 干净度声明；不 push、不 add -A、不 reset/stash/clean）
- [ ] 触碰面 == 批文精确路径清单（多出任何一路径＝越界，STOP 报 C）：
  - `scripts/hd001/harness-linux-pi.sh`（新增）
  - `plugins/agent-box-harnesses/src/agent_box_harnesses/pi/production.py`（G3 一行＋help 随行）
- [ ] R0 输出：`scripts/server-round1/pi-production-chain-gate.py` 离线 exit 0 于 h 树（门文件零改动——diff 中出现该路径即违"仅随跑不改"）
  - 基线已册（2026-09-23 01:15 BC 实测）：门文件 sha256＝`1002295b2c34f8eb089ea236fe64eddaafa672540e4c343870db307bdfba4a8f`，bc@92a2d2ba 与 h 树当前**逐字节一致**，且 h 树 `scripts/server-round1/` porcelain 空——HANDOFF 核账时复 hash 即可闭环。
- [ ] R1 输出：脚本产 deployment.json；server 启动校验通过——**必含 `--plugin-root`**（S-0007 §2）；端口/PID/数据根登记样例；seeding 成功回执（零真实模型调用＝R1 边界，R2 不在本批）
  - **seeding 口径修正（BC-0014→C-0035 G4' 正式批准，原"sessions.create"措辞作废；C-0035 §3 并确认本清单按修正口径核账）**：wire 无 `sessions.create`（只有 `sessions.createAndSend`，必带 message 且 accepted 即派发执行＝破零调用边界，禁用）；纯创建面＝REST 兼容层 `POST /api/v1/sessions`→`service.create_session`（app.py:309-313）。核账按「wire `profiles.create` ＋ REST sessions 创建」形验收，零新接口不变。

## 2. 禁改面核账（逐路径 diff 检查）

harnesses.toml／拆包线（plugins/agent-box-harness-*）／SecretStore（storage/secrets.py、bootstrap 默认 store）／wire 面（server/wire/**、transport/http/**）／bwrap／lifecycle／sidecar_backend／profiles.* providerModels.* handlers。
G6 已移出关键路径（H-0005 §2：local-process 通道 `LocalSidecarLauncher`，零 cargo）——**h 树 diff 中出现任何 worker/cargo 产物＝越界**。
  - 核账细则（本轮实测 install-set `--help` 注册）：`harness-install-set.py` 的**合法调用旗标面**＝`--output/--artifact FAMILY=PATH/--skip-builds/--json/--worker-bundle DIR`。其中 `--worker-bundle` 是 install-set 既有生产者参数，**脚本里出现该词组不算越界**；越界判定只看**产物**（编译出的 worker 二进制/`cargo`/Rust 目标树输出）是否入 diff。
  - deployment.json 面事实：install-set 单文档产 `<output>/deployment.json`（Server 唯一所需）＋`install-set.json`（操作者映射、含 machine-local mount 绑定，**非部署输入**）＋`models/<family>.json`；零 host 路径，artifacts 经 `--mount` token 绑定——R1 收据核验以此为准。
  - **plugin-root 联结细则（01:22 实测）**：装载端 `root.joinpath(*relative.split("/"))`（runtime.py `_sidecar_deployment_file`），relative 为 plugin 相对名（禁 host 路径形）——故 `--plugin-root` 取值与文档内 source 相对名前缀必须互补（root＝`plugins/agent-box-harnesses` ⇔ source 形如 `src/agent_box_harnesses/...`；root＝`plugins/` ⇔ source 含包目录头）。H 脚本 L89 现取 `plugins/agent-box-harnesses`——核账时以 R1 server 装载回执（加载成功 or SIDECAR_DEPLOYMENT_* 拒因）判定互补是否成立，不凭脚本外观下结论。

## 3. 回归配对（BC 核账口径，C-010 第 6 项）

- 名册基线：`agents/BC/reports/root-red-ids-92a2d2ba.md`（20F）。
- 预期改善形（**2026-09-23 01:17 实测修正**）：原假设"pi 5 条若成因恰为 G3 则转绿"已被源码证据否决——`test_pi_gate_cleanup.py` 用 stub 链跑门脚本清理逻辑，`pi/production.py` 不在回路；其红因＝`pi-production-chain-gate.py:434-435` 前置 `worker.is_file()` 检（`PI_GATE_WORKER_MISSING`），而名册引用产物 `workers/agent-box-worker/.acceptance-bundle-c4/agent-box-worker` **本树不在场**（实测目录不存在）。批文禁产 worker/cargo 产物，故该 5 条在 pi 批后**无转绿条件**。**修正口径＝20 条全保持逐字节不变（0 预期转绿）**；任何名册条目在 H HANDOFF 后变绿＝需先查是否越界（如偷产 bundle）。
- （注（01:34 更新）：原引 C-0032 §5"门自供 worker"经实测**不成立**——门无自动发现，须显式二进制且本机全盘无（BC-0016 上报中，候 C 裁定 R0 处置形 a/b/c）。）
- 串行 root 门＝C 槽许可，BC 不代跑、不催跑；BC 侧只做名册配对核账。
- checkpoint 绿态后随 BC 集成记录报 C 登记；**已定（C-0033 第 2 条）**：该 checkpoint＝contract_version=wire/1 由预记转**正式登记**时点（`integration/checkpoint.json`；CP1 联调检查点独立存在，两者不混同）。BC RECEIPT 须附配对结果供 C 登记。

## 4. 先验核查（预核账，2026-09-23 01:24 BC 只读完成，先于 HANDOFF）

H 脚本 168 行通读＋接口面逐项实测，**结构面全过**：四旗标含 `--plugin-root`✓、无 `--worker`✓、seeding 走 wire profiles.create/workspaces.open＋REST sessions 创建（避 createAndSend）✓、`/wire/v1/{method}` 路由存在且仅需 Bearer（免 Idempotency-Key）✓、`workspaces.open` 参数形合（handlers.py:42）✓、pi CLI `--out` 部署写面存在✓、CHARTER 登记产 `server-registration.json`✓、FORBIDDEN_PORTS 避让＋内核分配端口✓、token 读自家 data root（runtime.py:102 面）✓、全程无 turns 调用（modelCallsMade:0 自证形）✓。
**运行时留验项**（H 实跑回执判定，非外观可断）：plugin-root/source 相对名互补（§2 细则）；`--artifact-token` 修后 CLI 全链。
**01:29 更新**：留验项之 REST 字段大小写已闭环——H 脚本 184 行版自查修（`session["session_id"]`:167、断言 snake `.get` 形 :169-170，先于 BC-0015 到达＝H 独立发现，两向对账一致）；`listed[0]["harness"]` 键形亦核真（projection.py:144）。静态面无剩余已知风险，仅剩上列两项实跑面。

## 5. 批间接续

pi 集成 checkpoint 落定后，BC 向 C 提请 B-HARNESS-CODEX-001（C-0032 第 4 条：候本批集成后签发；同构＋luna G5＋文档级红 (a) 随批注释修正）。codex 批配对基线＝pi checkpoint 后名册状态。

**文档级红 (a) 精确靶点（01:31 BC 预研定位）**：
1. `plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml:5-7`——codex 头注称"无生产封装（无 codex/production.py…）"，与 H-0003 实测（codex/production.py 在树、16 文件族）不符→注释改实。
2. `docs/server-round1/fullstack/harness-capability-matrix.md:165`（§8 残余行）"Codex 生产封装仍未完成"——与同文档 :100"已完成生产封装"自相矛盾→删改残余行。
   （:68/:71 的"无生产封装、零运行观测"是 Work Order 42 时代回归语境史述，不在 (a) 面，不动。）

## 6. HANDOFF 核账结果（2026-09-23 01:41 BC 实测，BC-0017 已发）

- §1 差量：**过**。HEAD 67049283 单提交树 clean；diff 恰两批准路径（production.py :279-280 两行 G3 修复逐字节核对；脚本 184 行＝先验核查文本）；门哈希 1002295b…4a8f 未动；禁面零触碰。
- §2 证据：**过**。R0 完整门 exit 0（r0e.json；外部同源 worker c12 bundle，BC 复验 main.rs/protocol.rs cmp IDENTICAL、二进制 sha 9d8df86d…7088 与门报告一致、树外零入 diff）；R1 R1_OK 三 ID＋modelCallsMade:0＋G4' 形 seeding＋registration/deployment（零宿主路径）齐。
- §3 配对：**过**。27 FAILED＝名册 19 同形复现＋8 环境（4+4，与披露逐项对上）；hermes 条未收集非转绿；**0 预期外转绿＝无越界信号**。
- 呈裁项：完整 R0 系 deviation ① 外部二进制路径（BC-0016 选项 (c) 之形，未经批准、未违禁面清单字面）→ BC-0017 §4 建议采认按"完整 R0"登记 checkpoint。
- 余程：候 C §4 裁量＋checkpoint 登记＋串行 root 门 C 槽 → 批后提请 B-HARNESS-CODEX-001（§5 行靶已备）。§4 先验核查的三项"运行时留验"全部实测关闭（REST snake 形✓、plugin-root 互补✓、--artifact-token 全链✓）。

### 6.1 补正（01:43 BC-0018；C-0039 指令件与 H-0008 勘正件收讫）

- C-0039 §1 三复核子项闭合：①bundle sha=门报告、源件 cmp IDENTICAL、mtime 09-18 未触碰、sibling 树 workers/ porcelain 空、不入 diff；②node_modules 被 .gitignore:28 覆盖（ignored，非 untracked）；③G4'/modelCallsMade:0 见 §6。
- R0' 双证定档：r0.json=GATE_WORKER_REQUIRED（正验收据）、r0e.json=完整 R0 exit 0（加分证据）；中间件 r0b-r0d 为诚实迭代留痕。记账口径＝R0' 为验收、完整 R0 加分，BC-0017 §4 采认建议不变。
- BC 核账**终态＝通过收口**，候 C checkpoint 登记＋§4 裁量＋root 门排期。

## 7. root 门结果（2026-09-23 01:50，BC-0019 已发）

- 集成：bc 树 FF 合入 work/hd001-h → 67049283 clean（合入前导入归属双证＋1518 collected 零错）。
- 全量串行门（ENV-NOTICE-001 配方、权威锚 venv 跨树解释器）＝**20F/1465P/33skip，FAILED-ID 与 e2b 名册逐字节 diff 空＝绿态**。证据 evidence/gate-67049283.log＋gate-red-ids.txt。
- B-HARNESS-PI-001 提请转 VERIFIED；CODEX 批申请随 BC-0019 §二（codex CLI 必崩硬红新事实）。门槽本期即释。
