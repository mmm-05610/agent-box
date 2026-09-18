# 持续执行 goal 提示词（派单循环版，2026-09-16）

用途：粘给前端会话，**整段替换它的 goal**。与旧 `goal-prompt.md` 的差别：**不写死做哪几张单**——
每阶段边界自己去 `docs/desktop-product-delivery/manifest.json` 查有没有新增/改派的工单，有就继续做，
直到自己的订单全部完成。旧 `goal-prompt.md` 里"按 P00–P06 推进"那句已被本文件取代。

```text
/goal 接管并持续交付 AgentBox Desktop 的已批准目标，不得在局部阶段提前结束。

执行目录：/home/maoqh/projects/agent-box-desktop-next-wsl-round1
发布源 main（**只读、禁止施工**）：/home/maoqh/projects/agent-box-desktop-next
后端仓（**只读、禁止写入**）：/home/maoqh/projects/agent-box-env-provider 与
/home/maoqh/projects/agent-box-server-round1

═══ 核心规则：别背清单，每阶段去派单表里查 ═══

调度权威是本工作树的 docs/desktop-product-delivery/manifest.json。**每一轮开始前、以及每个阶段
结束时**，都执行一次"查派工"：

  python3 - <<'PY'
  import json, pathlib
  m = json.loads(pathlib.Path("docs/desktop-product-delivery/manifest.json").read_text())
  for o in m["orders"]:
      print(o["id"], o["file"], "| depends_on:", o.get("depends_on"), "| scope:", o.get("scope"))
  PY
  ls docs/desktop-product-delivery/work-orders/

有更新（新工单、或条目内容变了）就：把缺的工单文档纳入阅读、按 depends_on 顺序执行、
在 status/evidence 里登记推进；**没有可执行的更新时**，把当前未完成的单做完。
每次收尾都要重新查一遍——**不得**因为"我记的清单做完了"就宣布结束；父派单表无新增且自己的单全部
完成、或所有安全独立任务耗尽且确实需要外部决定/授权时，才交回。

先完整读取（顺序）：master-plan.md → status.md → manifest.json → handoff-policy.md →
contracts/index.md → 当前可执行工单。以这些文档与其引用的产品决定为完整需求，不要求用户复述历史。

═══ 硬性规则（违反即返工） ═══

- **不在 main 施工**、不 reset/stash/clean、不 merge main、不 push。
- **保护路径零改动**：仓库内 `docs/architecture/acp-desktop-phase1-design.md`、`docs/desktop-src-tree.md`、
  以及 manifest `protected` 列出的其余路径；**后端仓与真实用户数据一律只读**。
- **不修改后端**；不读取真实凭据；不擅自运行付费模型（需要真实联调时先登记授权缺口，先做无模型部分）。
- 只在**取到写权**（按 handoff-policy.md 的租约）后写入；单 Windows 构建槽；收尾按同一规则释放。
- **不降低测试阈值、不删测试凑绿**；保护路径与既有用例不得退化。
- 形状改造优先**引入外部 copy-in 组件**（如 AI Elements），但：**许可证必须核实并写进 evidence**，
  且**不得**把外部库的运行时/传输层带进来（传输与状态用本仓既有实现）。
- **不许假成功**：缺服务/缺数据时如实显示"未知/等待"，不得用估算、占位或回落（例如用别家 harness
  回落）冒充；未声明的东西不显示。
- 每阶段边界重新读派单表；正式合同一旦批准，增量纳入当前 goal，不重开任务。

═══ 每阶段收尾 ═══

提交检查点 + 更新 status.md/evidence + 该单的门逐条给结果（含计数、命令、未做项与阻塞项）。

═══ 最终报告 ═══

逐单结论 + 汇总（以当时派单表里的实际单为准），外加：功能验收矩阵、真实 Windows 体验命令、
剩余阻断、以及"已复查派单表，无新增"的声明。等待项不得冒充完成。
```
