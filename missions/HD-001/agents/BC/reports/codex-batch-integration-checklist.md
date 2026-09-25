# B-HARNESS-CODEX-001 督导集成清单（BC，批文＝C-0043/decisions HD-001-C-019，基线 67049283）

范本＝pi-batch-integration-checklist.md（同构，条款从略处均以该件 §N 语义代入）。申请备料＝codex-batch-application-draft.md（§7 哈希基线在册）。

## 1. 批准面（恰好四文件）

1. `plugins/agent-box-harnesses/src/agent_box_harnesses/codex/production.py` **仅 :359-360 两行**（`--artifact-source`→`--artifact-token`＋help）。批前哈希 `d4d3cc4a…9f2f`。
2. `scripts/hd001/harness-linux-codex.sh`（新增）。
3. 文档红 (a) 两靶：`plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml` **仅头注 :5-7 语义域**（基线 `c305ab83…4a73`）＋`docs/server-round1/fullstack/harness-capability-matrix.md` **仅 :165 行**（基线 `ab3bd69c…d002`）——(a) 外零触碰，经 BC 批行（本件在册即 BC 批行，diff 超出行域＝越界）。
4. 门 `scripts/server-round1/codex-production-chain-gate.py`＝**须恒等**（`d9967cf1…46dc`）。

## 2. 禁区（照旧全列）

harnesses.toml (a) 行域外、拆包线、SecretStore、wire 面、bwrap、lifecycle/sidecar_backend、**pi 批已集成两路径**（pi/production.py、harness-linux-pi.sh）。worker/cargo 产物不入 diff（完整 R0 走 C-017 第 2 条预留路径须同形披露 sha256）。不 push。

## 3. 配对基线

本批 root 门后 20F 名册（e2b 逐字节集）＝底账；codex 族不在名册 → **预期批后仍 20F/0 新增、0 转绿**；任何名册条变绿＝先查越界。skip `test_first_run_lock.py:453` 照录。

## 4. 先验要点（pi 批教训前授，H 施工免撞重车）

- **REST 兼容层＝snake_case**（`session_id`/`profile_id`/`workspace_id`，写 POST 响应与 GET 回读两侧断言；pi 批 BC-0015 已证两处必红形）。
- **seeding G4' 形**：wire `profiles.create`(harness=codex)＋`workspaces.open`(kind=local)→REST `POST /api/v1/sessions`＋Idempotency-Key；**禁 `sessions.createAndSend`**（必派发）。
- **`--artifact-token` CLI 在修复前两行未落时必崩**（AttributeError :369，BC 亲测）——脚本活体验收即修复证据，勿绕开 CLI 直调函数。
- data/ 目录**不预建**（server owner guard）；`/live` 就绪轮询；FORBIDDEN_PORTS 18790/18810 避让＋内核分配兜底；PY 解析链与 sibling-venv import-probe 兜底照抄 pi 脚本。
- codex 门 `--worker` 前置同族（gate :61 usage 面）；R0' 正验收据＝GATE_WORKER_REQUIRED 完整输出留档。
- 若装 node_modules 走 `npm ci --offline`：产物须被 `.gitignore:28` 覆盖（pi deviation ④ 先例，树 clean 佐证）。

## 5. HANDOFF 核账三件套（照 pi 流程）

§1 四文件差量逐字节（含 (a) 行域核验）→ §2 禁区扫描 → §3 配对 → BC RECEIPT 报 C（子集复算即可，串行 root 门槽另行申请）。

## 6. 施工期只读观察（2026-09-23 01:53 BC）

- H-0009 ACK（开工即差量在册）。h 树 @67049283 未提交三文件＝**全∈批准面**：
  - `codex/production.py`＝恰 G3 两行（:361-362 域，`--artifact-source`→`--artifact-token`＋help，别无他改）✓
  - `harnesses.toml`＝仅 codex 头注域（-3/+5，声明 observed 仍逐项留空＝零能力扩张措辞）✓
  - `matrix.md`＝**恰 :165 一行** ✓；新文引用 `codex-production-packaging.md`＋`live-model-preflight.md`（两文档实测在场，后者确有 Codex 真实模型预检记载 :31/:34——"已过门"措辞有案可查）。
- 未落：`scripts/hd001/harness-linux-codex.sh`（候）。禁面零触碰迹象。

### 6.1 脚本静态预核账（2026-09-23 01:54，harness-linux-codex.sh 185 行全文通读）

结构面**全过**：①四旗标＋--plugin-root（:98-102）无 --worker ✓；②修复后 family CLI 活体路径（:87-89 `--artifact-token codex-runtime`，恰为本批 G3 修复之运行时验收）✓；③G4' seeding（wire profiles.create harness=codex＋workspaces.open→REST POST sessions＋Idempotency-Key，:152-159；createAndSend 零出现）✓；④**REST snake_case 双侧断言已吸收**（:167 session_id、:169-170 profile_id/workspace_id——BC-0020 前授即时生效）✓；⑤端口避让＋内核分配（:68-74）✓；⑥data/ 不预建（:41-43）✓；⑦CHARTER 登记（:114-124）＋/live 轮询＋EXIT trap ✓；⑧报告 modelCallsMade:0/turnSent:false＋全程零 turns 调用 ✓。mount token 三面一致（CLI/mount/deployment 文档），ARTIFACT_TARGET 零宿主路径由 production.py :292-293 源码钉。运行时留验：codex profile 装载回执（harness=codex 声明层在场）＋builder 离线全链。零预警需发。

## 7. 提前静态预核账（turn 42，只读观察，H 未提交态）

H 树四文件差量全落批准面，正式核账仍候 HANDOFF_READY+HEAD：
1. **production.py**＝恰 G3 两行（:361-362 位置，`--artifact-source`→`--artifact-token`＋help 同步），与 C-0043 §2 措辞等值，零其他出现。
2. **harnesses.toml**＝仅 codex 段头注域（:5-7→:5-9，-3/+5），无能力行/其他 harness 段触碰。
3. **matrix.md**＝仅 :165 靶行（1 换 1），§8 其余行零动。
4. **gate 恒等**：`codex-production-chain-gate.py` sha256 仍 `d9967cf1…46dc`＝§1 基线，未 modified（porcelain 无此路径）。
5. **新头注两引用文档直验在场**：`codex-production-packaging.md`、`live-model-preflight.md §6/§Codex`（:161 节、:216-217 四家真门证据）——文档内容改述属实，非杜撰引用。
结论：静态面 5/5 过；剩余核账＝提交差量逐字节复审＋R0'/R1 实跑证据＋配对。零预警需发。

### 7.1 R0' 证据形状预研（turn 43，只读）

codex 门 worker 前置两码（bc 树 :998-1053）：无 `--worker`/`AGENTBOX_W43_WORKER` → `GATE_WORKER_REQUIRED`（:1048，附盘上 bundles 清单）；指名缺席 → `CODEX_GATE_WORKER_MISSING`（:1053）。核账时 H 的 r0 证据＝已知环境因失败码形（pi 先例同形，C-0038 (a) 款）；若走完整 R0＝外部 bundle，须同 pi 口径披露 sha256+cmp 证据（c12 bundle 为 pi 用同源 worker 二进制，codex 门同族可复用其 provenance 形）。

## 8. 提交后证据预核验（turn 44，只读，HEAD=60d868ef，HANDOFF 消息未到先行核）

1. **差量面**：`git show --stat` ＝恰四批准文件（+192/−6），porcelain clean；production.py 提交差量与§7 预核账逐字节一致（:361-362 两行，G3 行号漂移 :359-360→:361-362 已在提交文披露，符合 H-0009 §1-2 登记差量承诺）。
2. **R0' 形**：`/tmp/hd001-c1/r0.json`＝typed `GATE_WORKER_REQUIRED`（exit 形），sha256 `77d38ac7…80fd` ＝提交文所载。
3. **完整 R0（C-017 §2 预留路径）**：`r0full.json` sha256 `27aa7dc2…3859` ＝提交文所载，内文 `CODEX_PRODUCTION_CHAIN_GATE_OK` mode `loopback-fake-endpoint`，bundle sha256 `9d8df86d…7088` 在报内回显＝pi c12 同源 bundle（provenance 义务已履行，门报告自证）。
4. **R1**：`harness-linux-codex.report.json` ＝ `HARNESS_LINUX_CODEX_R1_OK`，profile_dbdae6e5/session_9ce8bff4，`modelCallsMade:0`+`turnSent:false`；server-registration.json 在场；deployment.json 宿主路径 grep＝0（`/runtime/home/.codex*` 为沙箱挂载视图命名空间，非宿主路径，与 pi 形一致——BC 粗检 `/home` 前缀假阳性已定性排除）。
5. **门恒等**：commit 文自证 sha `d9967cf1…` ＝BC-0020 基线，且 §7 时点实物核过、porcelain clean 未再动。
6. **配对自报**：codex 子集 127P/0S GREEN_NO_SKIPS＋全树 collect 1518/0 errors（1465+33+20 等式成立）。BC 正式配对＝子集复算候 HANDOFF 落地后执行；串行 root 门另约 C 槽。
结论：五项预核验全过，零异常；正式 RECEIPT 候 H-0010 HANDOFF_READY。

## 9. HANDOFF 核账终态（turn 45-46，H-0010 收到后）

1. **§8 预核验五项**与 H-0010 全文零冲突；批后 sha 四枚实测全等表值（c1b6a5416578/d5bb78270c43/a0c40c23e1cf/87c7be8d9759，mode 775 执行位属实）。
2. **子集复算（BC 自主，权威 venv 跨树＋import 归因双检 `agent_box.__file__`∈h 树）**：
   - 11 codex 名文件超集＝76P/3S；三枚 skip＝`test_codex_executable_bundle.py:15/:24/:39`（官方 Codex 二进制/npm launcher/bin link 缺席），**bc 树批前基线同文件集逐项同形复现＝环境因既有 skip，非批生**。
   - **H 127 申报复现**：假说证实＝全 codex 相关＋`test_capability_declarations.py` 除 executable_bundle → **127 passed/0 skip 整除复现**（"6 文件"为措辞登记差，实际 11 文件面；数值与 GREEN_NO_SKIPS 结论等值，非实质差异）。
   - `test_capability_declarations.py` 单跑 53P——**harnesses.toml 注释改写的消费面安全实证**（FAMILY_MATRIX 无面可依改动论断成立）。
   - root 门口径全树 collect＝**1518/0 errors** 实测等值；`tests/ -k codex` 范围 55P/0S。
3. **配对判定**：codex 族不在 20F 名册、名册文件零触碰（四文件均在 plugins/docs/scripts 面）；0 预期转绿/0 预期新增红与复算相容。**正式配对终态＝FF 合入 bc 树后串行 root 门全量复算（候 C 槽）**。
4. **偏差三条核**：行号漂移（预告在册）、外部 bundle（C-017 §2 预留路径本体＋门报自证 sha）、脚本零修复——全部在批准/预留口径内，零越界。
5. **BC 核账终态＝通过收口**；BC-0021 RECEIPT 发 C（cc H），FF 合入随后执行。

## 10. root 门绿态闭环（turn 52-53，BC-0022）

C-0044 §2 槽位批准→本树 @60d868ef 权威配方全量串行门：`20 failed, 1465 passed, 33 skipped, 2 warnings in 183.36s`，FAILED-ID 归一化 diff 空（逐字节＝20F 名册）；与 pi 集成点底账逐数等值。log sha 前缀 `5110c14c0d78`，证据双份归档 `reports/evidence/`。**codex 批督导全闭环**（核账 §8/§9＋门绿 §10），BC-0022 请转 VERIFIED。根门槽用毕释放。
