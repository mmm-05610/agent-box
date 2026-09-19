# agent-box-env-provider 工作树章程

> 由**调度者**写、**执行者**读。规则正文**引用**主树 `docs/implementation/README.md`（唯一规则文本），不复制。
> 建立：2026-09-19（按 skill `incremental-work-order` 调整当前工作流）。

## 1 我是谁

- 工作树：`/home/maoqh/projects/agent-box-env-provider`　分支：`feature/env-provider-v1`
- 基线：`e39959f`（本批起点；每次调度者合并/改基线会更新这一行）
- 我做什么：后端基础设施实现——Server/Core、插件、Worker、协议、门与证据
- 我**不**做什么：前端（桌面工作树）、发布源 main、Hermes Desktop；不替用户做产品裁决

## 2 写权

- **可写**：`src/agent_box/**`、`plugins/**`、`scripts/server-round1/**`、`tests/**`、
  `docs/implementation/work-orders/**`（契约权威）、`docs/implementation/status.md`（我的执行账）、
  `docs/server-round1/**`（证据）
- **禁止写**：主树的任何文件、其他子树、发布源、受保护路径
- 只显式 `git add -- <paths>`；提交**用 pathspec 形式**（`git commit -m ... -- <paths>`）；
  不 `reset`/`stash`/`clean`、不 `merge` 主干、**不 push**

## 3 队列切片（按此顺序）

| 顺序 | 单 | 一句话 | 依赖 |
| --- | --- | --- | --- |
| 1 | `068-ledger-catchup` | 把本树执行账补齐：60–65 的终态行 + 刷新 52/54/55 的陈旧行 | 无 |
| 2 | `066-shared-session-store` | kilo/opencode 改"共享整库 + 空凭据守卫"；切绑定不搬库 | 无（与 068 可并行） |
| 3 | `067-per-session-admission` | 准入单位从 profile 改为会话；禁同会话双写；home 并发可变态逐家判定 | 45 已落地 |
| 4 | `070-real-endpoint-probes` | 55 的 G2–G4：真实端点探测（R-0011 已授权，不设上限、逐笔记账） | 无 |
| 5 | `072-windows-48-closeout` | 48 结案取证（只写证据；核对写/读隔离仍为 false） | 无 |
| 6 | `069-wsl-observation-54` | 54 的 WSL 通道观测轮（c11 门已绿）：变更集一手事实，含否定项 | 无 |

> 契约文件在 `docs/implementation/work-orders/`；**新单与修订由调度者直接投递进来**（父树对本树有白名单写权），
> 我每个阶段边界重读该目录即可，不需要去别处复制，也没有副本要合并。

## 3b 并行预算（执行者侧）

- 允许开子代理并行：**是**；**同时在跑 ≤6**（2026-09-19 起从 4 提到 6；本树**不分树**，见下）；**深度 ≤1**（子代理不再开子代理）
- **为什么后端不分树**（2026-09-19 调度者第一手）：剩余各单的 `write_paths` **每一张都含 `src/agent_box/**`**（多数还含 `plugins/**`），
  是同一耦合模块集；硬分两棵树＝两个写手改同一批文件 ⇒ 并行的正确做法是**本树内子代理**，不是第二棵树。
- 只允许在**工单声明的 `parallel_units`** 之间并行；没声明就单线程
- 子代理**不执行 git 写操作**、不写契约、不写本树 `status.md`；提交、勾阶段、跑门都由我本人完成
- 子代理的请求数与费用计入本树 `§Spend`，受主树 `prefs.md` 成本上限约束
- 项目 `AGENTS.md` 的模型/数量限额与本节叠加，**取更严者**

## 3c 优先级（调度者定，2026-09-19 夜；与公告同步，冲突以最新公告为准）

**依据（项目主线）**：让用户**在自己的真实数据上、从桌面对任一 harness 说一句话就得到回答**——
多 harness、各家原生语义、单一控制面、诚实到底。所以优先级按"**离真实用户路径的跳数**"排，不按工单大小排。

| 序 | 单 | 为什么排这里 | 备注 |
| --- | --- | --- | --- |
| 1 | 手上这张（085） | 已开工，不中断；做完即收尾 | 无 |
| 2 | **097-hello-capability-table-sync** | 极小；应用正按这份表门控（探测按钮、能力判断），不修就一直说假话 | b2 追加 |
| 3 | **098-provenance-500-fix** | 极小；前端 P28 的上游面一用就 500 | b2 追加 |
| 4 | **088-windows-wsl-decode** | 试用里真实撞到的 Windows 宿主解码崩溃；与 090 同一条链 | b2 |
| 5 | **090-placement-routing** | **关键路径**：它一通，用户现有的 WSL 工作区在**真数据根**上就能执行（配合前端 P27） | b2 追加 |
| 6 | **091-control-plane-sync** | 090 的配套（首次部署 + 变更增量 + 凭据一次投影） | b2 追加 |
| 7 | **089-four-real-ui-gates** | 主线验收（四家真实模型 UI 门），在 090/091 之后才有意义 | b3 |
| 8 | b4：092 → 093 → 094 → 095 → 096(v2) | "设置做对"这条大 epic（两层模型设置 + 原生落盘 + 订阅登录 + 思考旋钮）；与前端 P28/P29/P30/P35 配对 | b4 |

**阶段接受线（用户 2026-09-19 裁定）**：
- **控制面＝Windows**（R-0014）：WSL/远程只是执行侧；"Server 跑在 WSL"是试用权宜之计，**不是**产品形态。
- **Stage 1 广度＝先 pi + codex 两家**（R-0015；广度判断授权给调度者）：089 只做这两家，其余家移到 **100**。
- **成本（R-0017）**：真实额度＝DeepSeek 账号余额，**用尽为止、不设上限**；**假端点优先**，真实调用只花在门上，逐笔记账。
- **子代理可再开子代理**（R-0016）：65 的"子默认不带 `run_subagent`"与"深度 ≤2 默认拒绝"**已撤销**；
  环检测保留（可证的具体危害）；要新增任何限制**必须先用第一手观测写成证据**。

**流程纠正（099 追认时定，面向执行者）**：发现不在本单 `write_paths` 的缺陷 ⇒ **写进本树 `status.md` 的 §Questions/待开单**，
由**调度者当轮投递**新单；**不要自起草工单**（099 那次动机正确、内容也真，但编号差点与调度者撞车）。
**编号现状：099 已被追认占用，后续单从 100 起。**

**做单纪律不变**：单内不停、批末打 tag 写报告后继续、升级标阻塞继续做别的；**新优先级只改顺序，不改验收**。
## 4 批次与检查点

- **批次 `b1`**：`068 → 066 → 067 → 069` 全部做完（或其中被阻塞的部分如实标注）后收口
- 收口动作：`git tag -a checkpoint/b1 -m "068-069 done; suite <计数>; <日期>"`（**tag 不得覆盖**）+ 把检查点报告写进本树
  `status.md`（能试什么 / 要人拍的 / 花了什么 / 恢复点）→ **然后继续下一批，不为它停下**
- 主树合并时**按 `checkpoint/b1` 指向的 commit sha** 合，不按会移动的分支

### 下一批 `b2`（b1 收口后按序执行；细则以届时投递的工单为准）

| 序 | 单（待写） | 一句话 | 来源 |
| --- | --- | --- | --- |
| 1 | 066-G5 收尾 | 共享库"**首次运行**并发"加锁（实测 6/7 失败：5×database-is-locked、1×workspace FK race；初始化后 3/3 绿） | 066 的 G5 真并发轮 |
| 2 | 两仓重锁收口 | 登记前端交出的工件摘要，与后端最后一条**逐字一致**（前端交回值 `b284f70c`，后端需重登记） | Q1 报告 §5 |
| 3 | 45 收口 | 067 已让 **45-G3 转 pass**（当前基线复现）⇒ 45 报告补记，`PARTIAL → DONE` | 067 提交 460781c |
| 4 | 62/64 的 WSL 真腿 | 两单被 068 降为 PARTIAL（DoD 的 WSL 真腿未跑）⇒ 补跑并回填 | 068 自查 |
| 5 | 53 剩余解析器 | hermes/claude 观测轮 + opencode/kilo blob 解析 | 53 结论 |
| 6 | 60 的配置写入 | 姿态逐家翻译产物写进配置（**先**逐家钉死设置键位置与形状，钉不死就类型化拒绝） | 60 遗留 |
| 7 | 65 的最后一圈 | 真 harness 父侧自发起 `tools/call`（现受夹具限制） | 65 结论 |
| 8 | G8 取消/召回间歇 | 067 记录的维护债（run1 空召回、run2 通过） | 067 提交 |
| 9 | 四家真实 UI 模型门 | 累计 ≤¥10（现由 R-0011 放开，仍逐笔记账）——**这是通向最终验收的门** | 长期目标 |

> **已投递（b2，可执行；按序）**：`082-ledger-45-closeout`（45 转 DONE）→ `083-wsl-legs-62-64`（62/64 的 WSL 真腿）→
> `084-usage-parsers-remaining`（hermes/claude 观测轮 + opencode/kilo blob）→ `085-posture-config-write`（60：先钉键再写配置）→
> `086-subagent-harness-round`（65 最后一圈：真 harness 父侧自发起 tools/call）→ `087-cancel-recall-flake`（G8 间歇）→
> `088-windows-wsl-decode`（试用抓到的真 bug：Windows 宿主读 `wsl.exe` 输出被非 UTF-8 打挂）。
> **已投递（b2 追加，2026-09-19 试用抓到）**：`097-hello-capability-table-sync`（`server.hello` 的能力表从派发表派生：实测 27 声明 vs 64 派发、差 37 个方法含两个 probe ⇒ 应用按它门控会一直说"服务没有这个方法"；加发散即失败的门）。
> **已投递（b2 追加，2026-09-18 由 086 阶段 2 第一手抓到）**：`099-worker-home-put-dispatch`（Worker 的分发臂漏了 `home.put` ⇒
> 真实通道上 58 的资产/65 的桥**一发即死** `OP_UNSUPPORTED`；实现齐、线没接；带"旧 bundle 必红"与"实现集==分发集"两条反例门。
> 它是 086 阶段 2 的硬前置——086 的 `write_paths` 不含 `workers/**`，故另立单）。
> **已投递（b2 追加，R-0012 相关）**：`090-placement-routing`（WSL 工作区的执行必须路由到 WSL worker；无环境 ⇒ **派发前**类型化拒绝）→
> `091-control-plane-sync`（控制面以 Windows 为准：首次连接部署 + 变更增量 + 凭据只留 Windows 按执行一次性投影；原生 home/会话仍按平台）。
> **已投递（b3，b2 收口后）**：`089-four-real-ui-gates`（四家真实 UI 门＝最终验收路径；**Server 须跑在 WSL 侧**，
> 见主树 `docs/server-round1/try-checkpoints.md` 的教训）。
> **已投递（b4，b3 收口后按序）**：`092-provider-registry-and-protocols`（R-0013 第 1 层：provider 记录中立化 ——
> `harness` 可空、canonical 四协议词汇、模型事实、描述符 `wireProtocols`、读时派生 `compatibility`、冻结时
> `PROTOCOL_INCOMPATIBLE`）→ `093-native-config-materialization`（R-0013 第 1 层的执行侧：冻结配置落进各家原生文件，
> 逐家钉键、钉不死就类型化拒绝）。两单引用主树 `docs/server-round1/model-settings-two-layer-design.md`（R-0013 设计全文）。
> 批末打 `checkpoint/b4` tag + 写检查点报告，然后继续。
> **已投递（b4 追加，R-0013 订阅登录）**：`094-subscription-login-engine`（登录引擎跑在 Server 上：device-code 流 + 有界轮询 + 令牌只进秘密存储 + **codex 的 harness 型登录**端到端；未登记的家 `LOGIN_FLOW_UNSUPPORTED`）→
> `095-provider-logins-and-account-lifecycle`（**provider 型登录** copilot/xai/google → `credential.kind=oauth` 原地轮换；取用自动刷新 + `relogin_required`；额度按家钉死、传输保旧/鉴权清空；订阅 provider 的模型列表走订阅端点）。
> **已投递（b4 追加，R-0013 思考旋钮）**：`096-native-reasoning-controls`（逐家**声明**思考/推理旋钮 + **取值域动态**（模型事实 ∪ 家钉死枚举，方言翻译后）+ 校验拒绝 + 093 写入器落盘；**旋钮 harness 级、档位模型级**）。
> **修订 v2（2026-09-19，R-0013 追加）**：092/093 各追加一节——**一个 harness 多个模型槽**
> （claude-code：主模型 / opus / sonnet / haiku / fable / **子代理**；opencode·kilo：主模型 / 小模型）
> 与**逐模型限额**（上下文/输出，覆盖与事实分离、缺席不写键）。以单文件里的 §修订 v2 为准。
> **队列不空规则（调度者失误的如实标记）**：`080-first-run-lock` 与 `081-relock-register-frontend` **已投递**，可执行；
> 若我在做完当前单后发现 `work-orders/` 里**没有属于 b2 的下一张**，就在本树 status 写一行 `QUEUE_EMPTY_AT <日期>`——
> 这是**合法停止**但要如实报出来；调度者把它视为自己的失误并在下一次边界补齐投递。
> 注：b2 的**具体契约**由调度者在 b1 收口后逐单投递（v2 格式、过校验器）；本表只是队列计划，便于提前看到方向。

## 5 每个阶段边界重读什么（只读，不复制）

```bash
cat docs/implementation/worktree-charter.md        # 本文件：范围/写权/切片/批次
ls  docs/implementation/work-orders/               # 契约与新增单（权威在这里）
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/README.md     # §3 规则 + §4 纪律
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/manifest.json  # 队列/依赖/executors
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/status.md      # 主树汇总账
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/rulings.md     # 裁决账（R-xxxx）
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/prefs.md       # 偏好账
cat /home/maoqh/projects/agent-box-server-round1/docs/implementation/bulletin.md    # 调度公告（每阶段必读，只追加）
```

- **阶段边界 = 每次阶段性提交之前**；纳入**修订**后在本树 status 记 `已纳入 work order <NNN> 修订 @<sha>`
- 契约有问题 → 不改契约，交回调度者改并投递新版本

## 6 格式冻结（迁移债，如实记账）

- **44–65 为 v1 遗留契约**（无 frontmatter、两位编号）：**冻结只读**，不重写、不重命名；若某单需要实质改动，
  改动时一并对齐 v2 并过校验器
- **068 起必须 v2**：frontmatter（JSON 列表）+ 固定小节 + 复选框 Stages + 门四列（断言/反例/缺席行为）
  + `python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py <新单路径> --strict` 必须过
- **66/67 与 44–65 同属 v1 文本**（本批由主树投递，未重写）：按它们自身的小节执行即可；**要改它们**
  （修订/重发）时一并对齐 v2
- **下一批起**：所有新契约一律 v2 + 过校验器（本批的 068/069 已是 v2）

## 7 证据与账

- 证据落点：`docs/server-round1/**`（门报告、JSON、日志摘要；**凭据绝不落盘**）
- 我的账：`docs/implementation/status.md`（每单终态、已知缺口、阻塞、检查点报告、§Spend）

## 8 纪律

见主树 `docs/implementation/README.md §4`：单内不停、批末打 tag 写报告后继续、升级≠停下（标阻塞继续做别的）、
事实分级（实测/引用/未验证）、门要能被证伪、凭据只作 locator。

## 9 启动提示词（用户开/重开会话时粘贴；≤15 行）

```text
/goal 你是本项目的【后端执行者】（子树 agent-box-env-provider），按队列连续施工，不写调度文档以外的文件。

先完整读这些并遵守：
- docs/implementation/worktree-charter.md（本树章程：范围/写权/批次/§3c 优先级与流程纠正）
- docs/implementation/work-orders/**（契约权威；含 100–104 与 092–098）
- /home/maoqh/projects/agent-box-server-round1/docs/implementation/bulletin.md（调度公告，每阶段边界必读；准序在这里）
- 主树 README.md §3/§4（规则）与 manifest.json / status.md / rulings.md / prefs.md

纪律：单内不停；批末 `git tag -a checkpoint/<批> …` + 把检查点报告写进本树 status 后**继续**；升级标阻塞继续做别的；
只写工单声明的 write_paths；`git add -- <显式路径>` 与 pathspec 提交；不 merge 主干、不 push、不 reset/stash/clean；
凭据只作 locator；真实调用按 R-0017（假端点优先、逐笔记账）。队列做完才可停，并写 `QUEUE_EMPTY_AT <日期>`。
```
