# agent-box-runtime-round1 工作树章程

> 由**调度者**写、**执行者**读。规则正文**引用**主树 `docs/implementation/README.md`（唯一规则文本），不复制。
> 建立：2026-09-19（用户裁定"后端也要拆"；调度者按**链**而非按人切分；本树是**后端第二条线**，与 `agent-box-env-provider` 并列）。

## 1 我是谁

- 工作树：`/home/maoqh/projects/agent-box-runtime-round1`　分支：`feature/env-provider-runtime`
- 分支起点：`a4f82566`（后端 A 树的 HEAD）
- 我做什么：**运行时 / harness / 放置 / 控制面**这条链——放置路由、控制面同步、供应商记录与原生落盘、订阅登录、思考开关、
  其余家真实门、Worker 协议漂移、排空与 sidecar 生命周期
- 我**不**做什么：`server/wire/**` 与**探针语义**（属 A 树）、两条桌面线、发布源 main

## 2 写权与**归属边界**（两条后端线并行，边界必须严守）

- **本树（B）主写**：`src/agent_box/server/bootstrap/**`、`server/execution/**`、`server/workspaces/**`、`server/sessions/**`、
  `plugins/**`、`workers/**`、`protocols/**`、`tests/**`（自己的用例）、`docs/server-round1/**`、`docs/implementation/status.md`（本树账）
- **属 A 树**：`src/agent_box/server/wire/**`（参数表/handler）、`server/model_configs/probe.py` 及其探针语义
- **共享文件必须串行**：`src/agent_box/server/model_configs/**` 与 `server/bootstrap/runtime.py` 的描述符部分——
  A 的 104/105 与 B 的 092/096 **不得同时进行**；**按公告的点名串行**（先 A 的 104/105，再 B 的 092）。
- 只显式 `git add -- <paths>`；提交用 **pathspec 形式**；不 `reset`/`stash`/`clean`、不 `merge` 主干、**不 push**、不碰另两棵树

## 3 队列切片（按此顺序）

| 序 | 单 | 一句话 | 依赖 |
| --- | --- | --- | --- |
| 1 | `106` | 排空不得撞上已退出的 sidecar（`SIDECAR_CLOSED`；用户验收 `ACC-R2-1`） | 无 |
| 2 | `088` | Windows 宿主读 `wsl.exe` 输出的解码崩溃 | 无 |
| 3 | `090` | **关键路径**：WSL 工作区的放置路由（Windows 控制面 → WSL worker） | 无 |
| 4 | `091` | 控制面同步（首次部署 + 变更增量 + 每执行凭据投影） | 090 |
| 5 | `092` | 供应商记录中立化 + 协议词汇 + 兼容派生（**与 A 的 105 串行**） | 105（A 树） |
| 6 | `093` | 原生配置落盘（**8 家＝8 个可并行单元**） | 092 |
| 7 | `094` | 订阅登录引擎（device-code） | 092 |
| 8 | `095` | provider 型登录 + 账号生命周期 | 094 |
| 9 | `107`（**R-0020 的 `096a`**） | **thinking 打开**（pi/dsh 模板，配置层）+ 门"真一轮出现 `thought.delta`"；`parallel_units: ["pi","dsh"]` | 无（可先做；**A 线 P35 等它**） |
| 10 | `096`（**R-0020 的 `096b`**） | 思考旋钮/取值域/落盘（原 096 主体）；`parallel_units: ["pi","dsh"]` | 092+093 |
| 11 | `100` | 其余家真实 UI 门（**逐家＝可并行单元**；假端点优先）；`parallel_units: ["per-family"]` | 089（A 树） |
| 12 | `102` | Worker 协议漂移（op 枚举/正例/三元门）；`parallel_units: ["schema-enum","dispatch-arm","golden"]` | 无 |

> **编号映射（R-0020/R-0023）**：`096a` ⇒ 文件名 `107-thinking-on-in-templates.md`（校验器要求三位数编号）；`096b` ⇒ **原文件** `096-native-reasoning-controls.md`（不新造文件）。
> **与 A 树的共享文件串行**：`server/model_configs/**` 与 `bootstrap/runtime.py` 描述符部分——**A 的 `104/105` 先做，本树的 `092` 后做**（公告点名）。
> **本树不做**：`server/wire/**`、`model_configs/probe.py` 及其探针语义（属 A 树）。

> 契约文件在 `docs/implementation/work-orders/`（**与 A 树同一份历史**）；**新单由调度者投递**（父树白名单）。

## 3b 并行预算（执行者侧）——**本树是"拆出来提速"的，务必用足**

- 允许开子代理并行：**是**；**同时在跑 ≤6**（机器 20 核但**仅 11 GB 内存**，测试重 ⇒ 内存是瓶颈）；**深度 ≤1**
- **每一张单都声明了 `parallel_units`**——只在声明的单元之间并行；`093`（8 家）、`096`、`100`（逐家）本身就是天然并行单元
- **全量套件是重活**：只在**批末**跑；阶段内只跑**定向**用例；**若公告写着另一棵树正在跑全量**，先跑定向、等它结束
- 子代理**不跑 git 写操作**、不写契约、不写本树 status；提交/勾阶段/跑门由我本人完成；费用计入本树 `§Spend`

## 4 批次与检查点

- **批次 `c1`**：上表 1–4（`106 / 088 / 090 / 091`）做完后收口；`c2`：`092 → 093 → 094 → 095 → 096a/096b`；`c3`：`100 / 102`
- 收口：`git tag -a checkpoint/c1 -m "runtime line c1 done; suite <计数>; <日期>"`（**tag 不得覆盖**）+ 报告写进本树 `status.md` → **继续，不为它停下**
- 主树合并按 **tag 指向的 commit sha**（不按会移动的分支）；批次名用 `c*`，与 A 树 `b*`、桌面 `Q*/R*` 不撞

## 5 每个阶段边界重读什么（只读，不复制）

```bash
cat docs/implementation/worktree-charter.md        # 本文件
ls  docs/implementation/work-orders/               # 契约与新增单
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/README.md      # §3 规则 + §4 纪律
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/bulletin.md     # **公告：串行点名与优先级**
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/manifest.json
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/status.md
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/rulings.md
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/prefs.md
```

- **阶段边界 = 每次阶段性提交之前**；纳入修订后在本树 status 记 `已纳入 work order <ID> 修订 @<sha>`

> **注意（继承副本，不是真相）**：本树 `docs/implementation/manifest.json` 与 `status.md` 是**从 A 树分支时继承下来的历史**；
> **派单真相在主树**（`agent-box-server-round1/docs/implementation/manifest.json` 与 `status.md`）——读队列/依赖/执行者一律回主树读，本树那份不要当依据。
- **每次阶段性提交之前：先看一眼主树 `bulletin.md` 的「新条目」**（只读比上次新读到的部分）——白天节奏改短（R-0024）：
  L 每 1–2 分钟一轮、审阅者/侦察者 8–12 分钟一轮，公告可能在你两次重读之间就变了。
- **等依赖/卡住时不长睡**（R-0024 ②）：等新单或等别的树时，单次等待**不超过 5 分钟**，醒来重读公告与工单目录。
- **提交粒度建议 ≤15 分钟一次**（R-0024 ⑤）：白天用户在看，落一次提交＝让进展可见；这不是新门，是节奏建议。
- 契约有问题 → 不改契约，交回调度者

## 6 格式与账

- 工单文件名 `NNN-slug.md`（与 A 树同一编号空间，**不要自造编号**）；内容按 v2；
  校验：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py <本单> --strict`
- 证据落 `docs/server-round1/**`；本树账 `docs/implementation/status.md`；**凭据只作 locator**、真实调用按 R-0017（假端点优先、逐笔记账）

## 7 启动提示词（用户开新会话时粘贴；≤15 行）

```text
/goal 你是本项目的【后端执行者·runtime 线】（子树 agent-box-runtime-round1），按队列连续施工。

先完整读这些并遵守：
- docs/implementation/worktree-charter.md（本树章程：归属边界、队列切片 c1/c2/c3、并行预算）
- docs/implementation/work-orders/**（契约权威；你的切片从 106 → 088 → 090 → 091 起）
- /home/maoqh/projects/agent-box-server-round1/docs/implementation/bulletin.md（公告；串行点名与优先级在这里）
- 主树 README.md §3/§4 与 manifest.json / status.md / rulings.md / prefs.md

边界：不碰 server/wire/** 与探针语义（属 A 树）；model_configs/** 与 runtime 描述符部分按公告串行（A 的 104/105 先）。
纪律：单内不停；批末 `git tag -a checkpoint/c1 …` + 报告写进本树 status 后继续；只写工单声明的 write_paths；
用足并行：每张单的 parallel_units 就是授权范围（093 八家、100 逐家），子代理 ≤6 且不做 git 写；
全量套件只在批末跑（若公告说别树在跑全量，先跑定向）；pathspec 提交；不 merge 主干、不 push、不 reset/stash/clean。
队列做完才可停，并写 `QUEUE_EMPTY_AT <日期>`。
```
