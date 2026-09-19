# agent-box-runtime-round1 工作树章程

> 由**调度者**写、**执行者**读。规则正文**引用**主树 `docs/implementation/README.md`（唯一规则文本），不复制。
> 建立：2026-09-19（用户裁定"后端也要拆"；调度者按**链**而非按人切分；本树是**后端第二条线**，与 `agent-box-env-provider` 并列）。

## 1 我是谁

- 工作树：`/home/maoqh/projects/agent-box-runtime-round1`　分支：`feature/env-provider-runtime`
- 分支起点：`a4f82566`（后端 A 树的 HEAD）
- 我做什么：**运行时 / harness / 放置 / 控制面**这条链——放置路由、控制面同步、供应商记录与原生落盘、订阅登录、思考开关、
  其余家真实门、Worker 协议漂移、排空与 sidecar 生命周期
- 我**不**做什么：`server/wire/**` 与**探针语义**（属 A 树）、两条桌面线、发布源 main

> **必读三件（`R-0067`/`R-0068`/`R-0069`，2026-09-19 夜）**：
> ① **目录就是队列**：**每个阶段边界必须重读本树 `work-orders/**`**——新出现（或依赖已满足）的单**要么开工，要么在 `status.md` 记一行「未开工＋原因（判据）」**；**不许只按本 §3 表列出的顺序干活**（`R-0068` 实测：A 线曾宣布「没有下一张可执行的单」，而目录里当时有 **6** 张从未在 `status.md` 出现过的单，最久的已投 3 小时）。
> ② **要别人做事 ⇒ 写 `docs/implementation/handoffs.md`**（主树；跨角色请求队列：提出者**只追加自己的行**，**ops 只写裁决/状态列**），**不写在 `status.md` 的散文里**（`R-0067`：用户原话「agent 间要可以传递消息……通过文档能传递信息」）。
> ③ **阻塞行必须带『解卡入口』（`R-0069`，2026-09-19 夜）**：凡 `status.md` 里标**阻塞/卡住/卡在**的项，**同一格**必须写解卡入口，**只允许三类**——`自行`（本树下一步是什么）／`依赖 <单号/树>`（写可判定的条件）／**`需用户裁定`**。通行格式＝**四列**：`单 | 现态 | 卡在哪（精确） | 解卡入口`（runtime 树 `status.md` 的「队列地图」表已是这个形状，**照抄它、别另造**）。写了 `需用户裁定` ⇒ **你只写那一格**，路由是 ops 的事（ops 当轮记进主树 `docs/implementation/handoffs.md`，由它转给 I 落 `AQ-xxxx`）。判据：**「阻塞」≠「要人拍」**——分不清就会像今晚 `A` 线那句「卡在三条人的腿上」：散文式阻塞，没人知道该不该找用户。
> ④ **`## 先例对照`（`R-0062 ①`）的**落单由 ops 做**：你把先例分析与检索结论写进**自己的 `status.md`**（给出 `C-NN` 编号与出处、写明「它的什么做法／我们抄哪一层」），**ops 负责把它落到单里**——`work-orders/**` 是**调度侧文件**（`R-0058`），执行者直接改它会造成**同一文件两个写者**，并污染 ops 的投递卫生检查（判据＝投递前 `git status --porcelain -- <路径>` 必须为空）。**已发生一次＝`OF-18`**（聊天线 `P56`；内容正确，ops 已如实提交留史）。**例外（留史）**：那一次之后口径即如上，**不再**由执行者直写单文件。 **取号前先看表尾**——`id` 在同一文件内必须唯一；**两个提出者同时取号会撞**（2026-09-19 实测：settings 线执行者与前端审阅者都取了 `H-006`）⇒ 你落行前先读表尾确认下一个空号；**已经撞了就由 ops 加后缀留史**（如 `H-006b`），**不删任何人的行**。
 **阶段进度写进你的 `status.md` 即可**；单文件里的 `- [ ]` 复选框**由 ops 在收口/下次修订时勾**（你勾它＝第二次 `OF-18` 复发，2026-09-19 23:38 实测：只动了一个复选框、内容未变 ⇒ 已收窄，但仍按同一口径办）。


## 2 写权与**归属边界**（两条后端线并行，边界必须严守）

- **本树（B）主写**：`src/agent_box/server/bootstrap/**`、`server/execution/**`、`server/workspaces/**`、`server/sessions/**`、
  `plugins/**`、`workers/**`、`protocols/**`、`tests/**`（自己的用例）、`docs/server-round1/**`、`docs/implementation/status.md`（本树账）
- **属 A 树**：`src/agent_box/server/wire/**`（参数表/handler）、`server/model_configs/probe.py` 及其探针语义、
  **`scripts/server-round1/**`（门脚本与生产链门的唯一 owner＝A 树，`QA-004`）**——本树**只读引用**；
  确实需要改某个门脚本 ⇒ **交回**，由调度者在那张单里开**一次性例外**（先例：`108` 的 `234fa08` 把该路径写进它的 `write_paths`）。
  依据是实测：两棵后端树各带一份门脚本、**md5 逐个 15/15 逐字相同**（`docs/qa/dedup-ledger.md` D-001，**2026-09-19 15:0x 的 pin**）⇒ 两份真相、改判据即静默分叉。
  **更正（ops 第 119 轮，据 `QA-015` 的一手复算）**：该口径**已过期**——A 树现在 **16** 个门（独有 `ui_gates_89_leak_check.py`）、本树 **15**；共同 15 个里 **13 逐个 md5 相同 / 2 已分叉**（`dsh-production-chain-gate.py`、`pi-production-chain-gate.py`，**本树侧改**）。⇒ 引用 D-001/`QA-004` 时**必须带 pin**；两份分叉由单 `127` 处置（归一 to A 或写清有据分叉）。`scripts/server-round1/**` 的 **唯一 owner 仍是 A 树**（`QA-004`）。
- **已开的一次性例外（ops，2026-09-19 第 110 轮）**：单 **`116`**（`wire-500-fork-parity`）允许写
  `src/agent_box/server/wire/handlers.py` 里**两个 `WireError(` 调用点**（`:1196` artifact store、`:1244` usage aggregator）＋ 把守卫测试
  `tests/server/test_wire_error_family_101.py` 带进本树。**理由（实测）**：本树这两处把内部码当 family 传 ⇒ 裸 HTTP 500（live 2/2），
  而正确的形态只存在于 A 树（`bca77821` `:1238`/`:1297`）、守卫测试也只在 A 树 ⇒ 本树套件**永远不会红**（`D-002`/`D-005`）；
  且 `R-0035` 合并冻结 ⇒ "等合并带过来"不是可判定谓词。**例外只覆盖上述三处**：`wire/errors.py` 与 `wire/**` 其它内容**仍在禁写面**（闭合由 A 树的 `115` 负责）；
  这不是边界迁移，`115` 收口后 A 树仍是 `wire/**` 的唯一 owner。
- **共享文件必须串行**：`src/agent_box/server/model_configs/**` 与 `server/bootstrap/runtime.py` 的描述符部分（**这条面仍有效**：同写才要串行）。
  ~~A 的 104/105 与 B 的 092/096 不得同时进行；按公告点名串行（先 A 的 104/105，再 B 的 092）~~
  ⇒ **该串行理由已过期（`R-0051 ①`，2026-09-19）**：`104` 已 `PROBE_SSRF_HARDENING_DONE`、`105` 已 `HELLO_HARNESSES_DONE` 且重锁完成
  ⇒ **`092 → 093 → 094 → 095 → 096` 现在依次开工，不再等任何点名**（`093` 阶段 1 已见 `900d80d` 15:33）；`100` 仍按原口径等 `089`。
- **计数口径（`QA-007`）**：报任何全量/门计数**必须附一行「Worker 工件在/不在」**——本树正是缺这些 git-ignore 的构建产物
  （`workers/agent-box-worker/target/{debug,release}`、`.acceptance-bundle-c*`）才天然 **18 红**；QA 已在同一 pinned sha 用反证钉死
  （不补工件 18 failed / EXIT=1 ⇄ 只补工件 18 passed / EXIT=0，`docs/qa/env-attribution.md` E-001）⇒ **不写这行，你的红数会被读成产品回归**。
  批末按 `R-0040 ⑥`：不宣告"全量通过"，写 sha＋命令＋计数并标 **`待 QA 复算`**。
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

> **⚠️ 优先级覆盖（ops 第 122 轮；据 A 的**一手复算**，**不是点名**）**：**`120`（缺凭据类型化）与 `122`（截断可见）必须先于上表任何一项**。
> **证据**：A 在本树**指 runtime 源码**起了一次探针实例（`18796`＋一次性副本根，跑完即删）**复算 `120` 两次、0 真调用** ⇒ **未兑现**（`execution` 的 reason 仍是 `EXECUTION_FAILED`），并因此**不开窗**（`A-gate-log P-5`，`f081444`）。
> **判据（可判定、每轮自核）**：只要本树 `status.md` 里**没有** `120`/`122` 的收口行，就按本条优先；一旦出现收口行，**自动让位**回上表顺序。
> **同档**：`130`（收不掉进程树——它会**污染验收环境**，残留进程会占端口/数据根）。**其后**：`126`（并集语义，合并窗口硬前置）→ `127`/`121` → 上表 `093` 起 → `131`。批末 `132`（A 线）是这一批的收口门。

> **编号映射（R-0020/R-0023）**：`096a` ⇒ 文件名 `107-thinking-on-in-templates.md`（校验器要求三位数编号）；`096b` ⇒ **原文件** `096-native-reasoning-controls.md`（不新造文件）。
> **与 A 树的共享文件串行**：`server/model_configs/**` 与 `bootstrap/runtime.py` 描述符部分——**A 的 `104/105` 先做，本树的 `092` 后做**（公告点名）。
> **本树不做**：`server/wire/**`、`model_configs/probe.py` 及其探针语义（属 A 树）。

> 契约文件在 `docs/implementation/work-orders/`（**与 A 树同一份历史**）；**新单由调度者投递**（父树白名单）。

### 今晚队列（2026-09-19 19:2x 组织调整 v2；`R-0054` ⑥——**本树＝今晚焦点：后端第二波**）

| 序 | 单 | 开工条件（**可判定谓词**；每轮自己核，成立即开工，**不等任何人放行**） |
| --- | --- | --- |
| 1 | `091` 收口 | 无条件（`090` 已收口） |
| 2 | `092` **阶段 2** | 无条件。**工作区已有未提交改动＝上一任的活，属你自己**：`src/agent_box/server/model_configs/repository.py`、`service.py`、`src/agent_box/storage/database.py`、`tests/server/test_stage_a_server.py`（改）＋ `tests/server/test_provider_neutralization_092.py`（新）⇒ 先 `git status`/`git diff` 看清，纳入并提交，**别丢**。§3 里"092 与 A 线 105 串行"的理由**已过期**（`104` `PROBE_SSRF_HARDENING_DONE`、`105` `HELLO_HARNESSES_DONE` 且重锁完成） |
| 3 | `093`（**8 家＝8 个可并行单元**） | `092` 的收口行能在本树 `status.md` 查到（或 `git log --grep` 命中） |
| 4 | `094` | `092` 收口（同上判据） |
| 5 | `095` | `094` 收口 |
| 6 | `096`（`096b` 主体） | `092` 与 `093` 均收口 |
| 7 | `107`（`096a` thinking） | 无条件可做；**与 `108` 同改一批模板 ⇒ 串行**（`108` 先） |
| 8 | `100`（逐家＝可并行单元） | **等 A 线 `089`**：判据＝A 树 `status.md` 里能查到 `089` 的收口行 |
| 9 | `102` | 无条件 |

> **禁止**：把"等公告点名 / 等调度者放行"当开工条件（`R-0054` ④）。本树实测受害过——等一个**早已过期**的放行，白等一段。
> **谓词不成立时**：先做 §8 fallback 清单里第一条能做的；确实全被阻塞才在本树 `status.md` 写"等什么 / 为什么别的都不能做 / 预计何时醒"，且**单次等待 ≤5 分钟**。

## 3b 并行预算（执行者侧）——**本树是"拆出来提速"的，务必用足**

- 允许开子代理并行：**是**；**同时在跑 ≤6**（机器 20 核但**仅 11 GB 内存**，测试重 ⇒ 内存是瓶颈）；**深度 ≤1**
- **每一张单都声明了 `parallel_units`**——只在声明的单元之间并行；`093`（8 家）、`096`、`100`（逐家）本身就是天然并行单元
- **全量套件是重活**：只在**批末**跑；阶段内只跑**定向**用例；**若公告写着另一棵树正在跑全量**，先跑定向、等它结束
- 子代理**不跑 git 写操作**、不写契约、不写本树 status；提交/勾阶段/跑门由我本人完成；费用计入本树 `§Spend`

## 4 批次与检查点

- **批次 `c1`**：`106 / 088 / 090 / 091`；**`c2`：`108 → 110 → 107 → 111 → 092 → 093 → 094 → 095 → 096`**（R-0036 ② 钉死"**108 → 109 → 110** 最先"，109 已收口；111 必须先于 093）（`107`＝R-0020 的 `096a`，`108`＝AQ-0004 的输出上限参数化，见下）；`c3`：`100 / 102`
- **`108`（2026-09-19 投递，用户已批 AQ-0004）**：`maxTokens: 64` 从 pi/dsh/hermes 三份生产模板里**参数化到部署**（真实使用按声明/宽松缺省，门显式钉 64）。与 `107` **同改一批模板 ⇒ 串行做，不要同时改同一文件**（两张单的 Notes 都写了）。
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

## 6b 阻塞时的 fallback 活单清单（`R-0041 ⑦` ＋ `OF-01` 的回退条款）

> **为什么有这一节**：同类项目上实测过"进程在、只有 `sleep`、零产出"两段（83 分钟、92 分钟）。**规则：等依赖单次 ≤5 分钟，醒来先做下面第一条能做的**，做完在本树 `status.md` 记一行（带计数/证据）再回到等待。

1. **复算本批已收口单的门计数**：按命令原文重跑，**必须附一行「Worker 工件在/不在」**（`QA-007`：本树正是缺 git-ignore 的构建产物才天然 18 红），并标 `待 QA 复算`（`R-0040 ⑥`）。
2. **`093` 的 8 家键位先在假端点预演**：逐家钉"设置键位置与形状"，钉不死就写清**类型化拒绝**的判据（正向 + 反例）。
3. **`107`/`096` 的反例门先写好**：思考开关的"出现 `thought.delta`"门与"关掉后不再出现"的反例，可以先把门写进测试再改生产路径。
4. **给证据建索引**：`docs/server-round1/evidence/**` 按单号列一张"哪张单哪阶段、什么门、几次请求"的表（只读整理）。
5. **核自己的依赖谓词**：读 A 树 `status.md` 与主树 `bulletin.md` 的新条目，确认 `089`/`091` 的谓词是否已成立。
6. 以上全被阻塞 ⇒ 在本树 `status.md` 写"等什么 / 为什么别的都不能做 / 预计何时醒"（**这才允许长一点睡**）。

**不做的事**：不替调度者改契约、不碰他树、不因为等待就宣告"无事可做"。

## 7 启动提示词（用户开新会话时粘贴；≤15 行）

```text
/goal 你是本项目的【后端执行者·runtime 线】（子树 agent-box-runtime-round1），按队列连续施工。

先完整读这些并遵守：
- docs/implementation/worktree-charter.md（本树章程：归属边界、**§3「今晚队列」＝开工顺序与可判定谓词**、§6b fallback、并行预算）
- docs/implementation/work-orders/**（契约权威）
- /home/maoqh/projects/agent-box-server-round1/docs/implementation/ 下的 bulletin.md（公告；最新一条＝「组织调整 v2 / R-0054」）、README.md §3/§4、manifest.json、status.md、rulings.md、prefs.md

今晚焦点＝后端第二波：`091` 收口 → `092` 阶段 2 → `093`（8 家＝8 单元）→ `094` → `095` → `096`；`107` 与 `108` 串行（`108` 先）；`100` 等 A 线 `089`；`102` 随时可做。
【接手】重启前工作区有未提交改动（`model_configs/repository.py`、`service.py`、`storage/database.py`、`tests/server/test_stage_a_server.py` ＋ 新文件 `test_provider_neutralization_092.py`）
——**那是你自己的 092 阶段 2 在写的活**：先 `git status`/`git diff` 看清，纳入并提交，别丢。
边界：不碰 `server/wire/**` 与探针语义（属 A 树）；`model_configs/**` 与 `runtime.py` 描述符部分只在**同改**时串行。
纪律：单内不停；批末 `git tag -a checkpoint/<批> …` + 报告写进本树 status 后继续；**每张用户可见单收口就打检查点（`R-0053`）**；
用足并行（`093` 八家、`100` 逐家；子代理 ≤6、不做 git 写）；全量套件只在批末跑、且**同一时刻最多两棵树在跑**；
`git add -- <显式路径>` + pathspec 提交；不 merge 主干、不 push、不 reset/stash/clean；队列做完才可停并写 `QUEUE_EMPTY_AT <日期>`。
【不许只剩 sleep】等依赖时单次 ≤5 分钟，醒来先做 §6b 第一条能做的。
```
