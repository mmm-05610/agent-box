# Work Order 126 — 并集语义组合：阶段 1 一手观测 + 组合蓝图（QA-014 高）

状态：**阶段 1 完成（两侧语义一手核到、组合判定=可能、给出可执行组合蓝图）；阶段 2–4 的实际改写留给专注单元**
（组合可行但不该在回合预算末尾仓促动 `repository.py`+`service.py` 共享段并跑全套件核对——仓促即风险把当前
1231/19 的干净树弄红，反而更坏）。§Spend：0 真调用。跨树**只读核验经本地 git 对象**（`git show 89c72b5:…`，
A 树工作区 FS 读被策略拦，但历史两树同库，合规）。

## 1 冲突一手（两侧 `ProviderModelService.update`，逐字）

**A `112`（commit `89c72b5`，"省略＝保留、显式 null＝真的清空"）**：
```
current = self.records.get(record_id)
merged  = {**self.project(current), **body, "harness":…, "provider":…}   # ← project 打底 ⇒ 未点名即保留
self._validate(merged, creating=False)
config  = publish(canonical({…,"configuration": {…for item in merged["configuration"]}}))
models  = publish(canonical({…,"models": merged["models"]}))
records.update(..., display_name=merged["displayName"], credential_id=merged.get("credentialId"),
    base_url=body["baseUrl"] if "baseUrl" in body else KEEP, …四列同 KEEP)   # ← 哨兵区分"没点名"vs"点名 null"
```
配套 `repository.py`：`class _Keep; KEEP=_Keep()`；`update(... base_url=KEEP …)`；SET 子句按需生成
（`if value is not KEEP: SET col=?`），COALESCE 从这条写路径消失。

**runtime `092`（本树当前）**：
```
merged = {**body, "harness":…, "provider":…}      # ← 非 project 打底：靠手写"缺 protocols 保 prior"
norm = self._validate(merged, creating=False)      # ← normalize_protocols/validate_endpoints/模型事实
config = publish(canonical(_config_payload(body, norm)))   # protocols/endpoints 进 config 对象、缺席不写
models = publish(canonical({…,"models": norm["models"]}))   # ← 归一后的 models
records.update(..., wire_api=body.get("wireApi"), …)         # ← 无 KEEP
```

**为何单边红（QA-014 U-A 73 failed / U-R 48 failed，EXIT=1）**：两段各自重写 `update` 与 `repository.update` 签名；
合并取任一侧 ⇒ 另一侧的守卫**当场丢**（A 侧赢⇒092 的 protocols/endpoints 归一/校验消失，092 反例 10 条红；
runtime 侧赢⇒112 的"省略即保留 + 显式 null 清空"退化，112 的 41 条守卫红）。这正是"互补压在同一段"的形状。

## 2 组合蓝图（两边守卫同时绿，`model_configs/**` 内，不动 wire）

组合后的 `update` = **A-112 的 project-打底 + KEEP 哨兵** 与 **092 的 normalize/validate** 的合取：
```
current = self.records.get(record_id)
merged  = {**self.project(current), **body, "harness": current["harness_type"], "provider": current["provider_type"]}
norm    = self._validate(merged, creating=False)        # 092：对 merged 里的 protocols/endpoints/models 归一+严校
config  = self.objects.publish(canonical(_config_payload(merged, norm)))
models  = self.objects.publish(canonical({"schema_version":1,"models": norm["models"]}))
records.update(...,
  display_name=merged["displayName"], credential_id=merged.get("credentialId"),
  base_url=body["baseUrl"] if "baseUrl" in body else KEEP,       # 112：四列 KEEP 哨兵
  auth_style=…, wire_api=…, fields_source=…)                      # （wire_api 仍存 provenance 原值，与 092 §边界一致）
```
- **112 守卫保住**：未点名 displayName/credentialId/configuration/models ⇒ `project(current)` 打底；四 provenance 列 ⇒ KEEP 哨兵区分没点名 vs 点名 null。
- **092 守卫保住**：`_validate(merged)` 对 merged 的 protocols/endpoints/models 归一+严校；`_config_payload(merged,norm)` 落归一后的 protocols/endpoints、缺席不写。
  且因 merged 是 project 打底，protocols/endpoints 天然从 current 继承 ⇒ 我原来手写的"缺 protocols 保 prior"可删（由 project 兜底），更单一真相。
- **需移植进本树**：`repository.py` 的 `class _Keep`/`KEEP` + `update` 的 KEEP 默认与按需 SET 生成（A `89c72b5` 已有，本树 repository 停在 092 态无 KEEP）。
- **A 守卫测试带进本树**（`89c72b5` 的 test 文件，逐字/适配路径，**不改弱**，同 `116` 先例）＋ 本树 092 守卫（`test_provider_protocols_092` / `test_provider_neutralization_092`）原地 ⇒ 两条反例**同时绿**。

## 3 判定与剩余（不删守卫凑绿）

**组合可能**（上面蓝图），非"结构不可能"⇒ 不走交回裁决那条（那条留给"组合真不可能"时）。
剩余＝**阶段 2–4 实际执行**：① 按蓝图重写 `service.update` + 移植 `repository.py` KEEP；② 带 A `112` 守卫测试进本树；
③ 跑**全套件**验两侧反例同绿、旧实现（任一侧单独）必红、092/120/121 不回退；④ status 逐家/逐守卫记账。
**为何不在本次仓促做完**：动的是两树共享的 `repository.update` 签名（092 也改过它）+ 必须跑全套件核对 ⇒ 需要专注回合与
一次干净的全套件对照，不能在预算末尾半拉子弄红共享段（`G3 逐字未弱化` + 现树 1231/19 干净是资产）。
**合同工件那处 docs 冲突（8 条 FileNotFoundError）＝ 归 `113`（工件/重锁），本单只记录不动手**（已记：rename/rename 的
`wire-v1.schema.registered-*.json` 是测试承重的 ⇒ 合并不可机械收口，须两仓重锁）。
