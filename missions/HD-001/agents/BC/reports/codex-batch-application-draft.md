# B-HARNESS-CODEX-001 申请草稿（BC 备料，root 门绿态后经 BC-00xx 正式发 C）

- 备料日期：2026-09-23 01:46（候 C-0040 §5：pi root 门绿态配对后签发）
- 形状＝pi 批同构（C-0032 范本），基线＝root 门后集成树 HEAD（≥67049283）
- 本件为 BC 督导域备料，非批文申请正式件

## 1. 精确路径（两条）

1. 修改 `plugins/agent-box-harnesses/src/agent_box_harnesses/codex/production.py` **:359-360 两行**：
   `--artifact-source`（help "canonical WSL path…"）→ `--artifact-token` ＋ mount-token help 随行（pi G3/dsh 已修形同参照）。
   **实测硬红依据（BC 2026-09-23 01:45 集成树取证）**：CLI 现形必崩——main() :369 消费 `options.artifact_token`，注册名却为 `--artifact-source` → `AttributeError: 'Namespace' object has no attribute 'artifact_token'`（崩溃先于任何文件写出）。即 codex 生产 CLI **当前零可用**，此修复是运行时缺陷修复而非命名对齐。函数层 `deployment_document(artifact_token=…)` 本就正确，修复面恰两行。
2. 新增 `scripts/hd001/harness-linux-codex.sh`：装配脚本同构 harness-linux-pi.sh（G3' 修复后 family CLI 产 deployment.json → 四旗标 server 装载 → CHARTER 登记 → wire `profiles.create`(harness=codex)＋`workspaces.open`＋REST `POST /api/v1/sessions` 纯创建 seeding → 装载校验 → `modelCallsMade:0` 报告）。既有素材在场：`scripts/server-round1/build-codex-runtime-artifact.mjs`＋`codex-production-chain-gate.py`（门仅随跑不改）。

## 2. 验收分级（R0'/R1，口径承接 C-0038/C-0040）

- **R0'**＝`codex-production-chain-gate.py` 本树可加载、参数面正确、失败码＝已知环境因（gate :61 亦需 `--worker`，与 pi 同族）；**完整 R0**（exit 0）按 HD-001-C-017 第 2 条预留路径走树外只读同源 bundle（c12 同款，provenance 已在册可复用）——H 若采此径须同样披露 sha256。
- **R1**＝脚本产 deployment.json 且 server 装载校验通过；codex deployment 文档零宿主路径不变式（ARTIFACT_TARGET/token 绑定形已由 :292-293 源码钉住）。
- **R2 真实 codex 轮不在本批**（另立 grant；G5 luna 条款：真实测试仅 gpt-5.6-luna 显式指定、禁回退）。

## 3. 文档级红 (a) 随批修正（公共文件，经 BC 批行）

- `harnesses.toml:5-7` codex 头注（"无 codex production wrapper"为假——production.py 在场且批后 CLI 可用）；
- `harness-capability-matrix.md:165` §8 残留行（与 :100 自相矛盾处）。
- （:68/:71＝Work-Order-42 历史语，**不在 (a)**，不改。）

## 4. 禁改面（照旧）

harnesses.toml 除 (a) 两行头注外零触碰、拆包线、SecretStore、wire 面、bwrap、lifecycle/sidecar_backend、pi 批已集成两路径。不 push、不 add -A、不 reset/stash/clean。

## 5. 配对基线

root 门当期结果（e2b 名册 20F 逐字节差分）＝codex 批配对底账；codex 批预期**不改任何名册红**（codex 族不在名册——名册之 hermes/delegation 等条目与 codex 无源关联）；任何名册条目变绿＝查越界。

## 6. 待办衔接

- root 门绿态 → BC RECEIPT（红 ID 单+配对）→ C 签发 → H ACK 开工。
- H 计数依据（budget §4）仍欠（R2 grant 前置，与本批并行不阻塞）。

## 7. 批前哈希基线（集成树 @67049283，2026-09-23 01:49 BC 入册；批后逐字节核账用）

- `plugins/.../codex/production.py`＝`d4d3cc4a…9f2f`（批准修复后应且仅应 :359-360 两行变）
- `scripts/server-round1/codex-production-chain-gate.py`＝`d9967cf1…46dc`（门仅随跑不改＝须恒等）
- 文档靶全路径勘正：`plugins/agent-box-harnesses/src/agent_box_harnesses/harnesses.toml`＝`c305ab83…4a73`；`docs/server-round1/fullstack/harness-capability-matrix.md`＝`ab3bd69c…d002`（本批除 (a) 两行外须恒等）
- 新路径预期：`scripts/hd001/harness-linux-codex.sh`（新增，H 树产）。
