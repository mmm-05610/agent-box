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
- **`scripts/server-round1/**` 的唯一 owner＝本树（A）**（`QA-004`，2026-09-19 调度者裁定）：门脚本与生产链门的家在这里；
  runtime 线**只读引用**，它要改某个门 ⇒ 交回，由调度者在那张单里开**一次性例外**（先例：`108` 的 `234fa08`）。
  立这条的依据是实测的：两棵后端树各带一份 15 门脚本、**md5 逐个比对 15/15 逐字相同**（`docs/qa/dedup-ledger.md` D-001）
  ⇒ 两份真相，任一侧改判据即**静默分叉**（而 `R-0032 ②` 已经在人工要求"两树同步 086 G2 字面"，说明这条通道一直在被手工维持）。
- **计数口径（`QA-007`）**：报任何全量/门计数**必须附一行「Worker 工件在/不在」**——
  `workers/agent-box-worker/target/{debug,release}` 与 `.acceptance-bundle-c*` 都是 git-ignore 的构建产物，缺它的树跑全量**天然 18 红**；
  同一 sha 已用反证钉死（只补工件 ⇒ 18 passed / EXIT=0）⇒ **不写这行，红数会被别的线读成回归**。
  批末按 `R-0040 ⑥`：不宣告"全量通过"，写 sha＋命令＋计数并标 **`待 QA 复算`**（本树 `9455b0c` 已这么做）。
- 只显式 `git add -- <paths>`；提交**用 pathspec 形式**（`git commit -m ... -- <paths>`）；
  不 `reset`/`stash`/`clean`、不 `merge` 主干、**不 push**

## 3 队列切片（按此顺序）

> **2026-09-19 起本树只剩"wire / probe / 契约"链**（R-0022：后端按**链**拆成两棵树，本树＝**A 线**）。
> 运行时/harness/放置/控制面那半在 **`agent-box-runtime-round1`**（分支 `feature/env-provider-runtime`，起点 `a4f82566`）；
> **`106` 与 `107`（R-0020 的 `096a`）已从本树 `work-orders/` 移走**（属 runtime 线，R-0023 ②）——本树**不要做**这两张。

| 顺序 | 单 | 一句话 | 依赖 |
| --- | --- | --- | --- |
| 1 | `104-probe-ssrf-redirect-hardening` | 探测出站的两条确定性绕过 + 凭据随重定向外泄（**在飞**；阶段 1 还撞出第三条：系统代理把"声明端点"整个换掉） | 无 |
| 2 | `105-hello-declares-harnesses` | `server.hello` 增 `harnesses`（AQ-0003 后半）+ 工件重生成 + 两仓登记；**与 runtime 线的 `092` 共享文件 ⇒ 本单必须先于它** | 097（已收口） |
| 3 | `101-wire-error-family-500-fix` | 五个方法在生产组合上必 500（AUD-B-001）——错误族位 + 组合注入裁决 | 无 |
| 4 | `103-wire-drive-coverage-meta-gate` | 元门：每个方法都要被真实 wire 驱动过（含驱动覆盖账 + 豁免登记） | 101 |
| 5 | `089-four-real-ui-gates` | 两家真实 UI 门（R-0015 收窄到 pi + codex）；`090` 之后才有意义 | 090（runtime 线） |

> **共享文件串行（R-0022 ③）**：`src/agent_box/server/model_configs/**` 与 `server/bootstrap/runtime.py` 的描述符部分——
> **本树的 `104/105` 先做，runtime 线的 `092` 后做**（公告点名，不许两边同时改）。
> 本树**写**：`server/wire/**` 与 `model_configs/probe.py` 及其**探针语义**；本树**不写**：`bootstrap/**`、`execution/**`、`workspaces/**`、`sessions/**`、`plugins/**`、`workers/**`、`protocols/**`（属 runtime 线）。

> 契约文件在 `docs/implementation/work-orders/`；**新单与修订由调度者直接投递进来**（父树对本树有白名单写权），
> 我每个阶段边界重读该目录即可，不需要去别处复制，也没有副本要合并。

### 今晚队列（2026-09-19 19:2x 组织调整 v2；`R-0054` ⑥）

| 序 | 单 | 开工条件（**可判定谓词**；每轮自己核，成立即开工，**不等任何人放行**） |
| --- | --- | --- |
| 1 | `087-cancel-recall-flake` | 无条件（本树重启时工作区**干净**，直接开工） |
| 2 | `QA-008` 新单（`usage.aggregate/export` 真 HTTP 500，主路径） | 由 ops **当轮投递**（`R-0054 ⑧a`）；投递进本树 `work-orders/` 即可开工 |
| 3 | `QA-009` 新单（`profiles.list` 不投影 `recovery_pending`，主路径） | 同上 |
| 4 | `103-wire-drive-coverage-meta-gate` | `101` 已收口（谓词已成立） |
| 5 | `089-four-real-ui-gates` | **等 runtime 树 `091` 收口**：判据＝runtime 树 `status.md` 里能查到 `091` 的收口行 |
| 6 | `099-worker-home-put-dispatch` | 无条件（已投递） |

> **禁止**：把"等公告点名"当开工条件（`R-0054` ④）。谓词不成立 ⇒ 先做 §8 fallback 清单第一条能做的，别长睡（单次 ≤5 分钟）。
> **本树不做**：`092–096/100/102/107/108`（runtime 线）、`P*`（两条桌面线）。

## 3b 并行预算（执行者侧）

- 允许开子代理并行：**是**；**同时在跑 ≤6**；**深度 ≤1**（子代理不再开子代理）
- **本树从 2026-09-19 起是"按链拆"的两条后端线之一**（R-0022）：本树＝**wire / probe / 契约**链（A），
  另一半在 `agent-box-runtime-round1`（运行时/harness/放置/控制面）。**两条线各自 ≤6 子代理，但全量套件同一时刻最多两棵树在跑**
  （机器 11 GB 内存为瓶颈）：公告写着另一棵树在跑全量时，本树先跑定向。
- 只允许在**工单声明的 `parallel_units`** 之间并行；没声明就单线程
- 子代理**不执行 git 写操作**、不写契约、不写本树 `status.md`；提交、勾阶段、跑门都由我本人完成
- 子代理的请求数与费用计入本树 `§Spend`，受主树 `prefs.md` 成本上限约束
- 项目 `AGENTS.md` 的模型/数量限额与本节叠加，**取更严者**

## 3c 优先级（调度者定；本树＝A 线切片，与公告同步，冲突以最新公告为准）

**依据（项目主线）**：让用户**在自己的真实数据上、从桌面对任一 harness 说一句话就得到回答**——
多 harness、各家原生语义、单一控制面、诚实到底。优先级按"**离真实用户路径的跳数**"排，不按工单大小排。
**本树只排自己的切片**（runtime 线的序列在它自己的章程里）。

| 序 | 单 | 为什么排这里 | 备注 |
| --- | --- | --- | --- |
| 1 | **104-probe-ssrf-redirect-hardening** | 安全：域名不解析 ⇒ 内网检查整段跳过 + 默认跟随 3xx 且 `Authorization` 随行（AUD-B-004） | **在飞**；修好前不要用真 key 点"获取上游模型列表" |
| 2 | **105-hello-declares-harnesses** | AQ-0003 后半；**它解锁桌面 B 线整条队列**（P39/P28 等），且**必须先于 runtime 线的 092**（共享 `model_configs/**`） | 097 前置已解 |
| 3 | **101-wire-error-family-500-fix** | 五个合同方法在生产组合上必 500（AUD-B-001） | 已派 |
| 4 | **103-wire-drive-coverage-meta-gate** | 元门：每个方法都要被真实 wire 驱动过 | 依赖 101 |
| 5 | **089-four-real-ui-gates** | 两家真实 UI 门（R-0015：pi + codex） | 等 runtime 线的 `090` |

> **效力**：以**最新公告**为准；上表是 2026-09-19 10:5x（轮询第 33 轮）按 R-0022 收窄到本树切片后的版本。
> **不在本树**：`106`、`107`（R-0020 的 `096a`）、`088/090/091/092/093/094/095/096/100/102` ⇒ 全部属 runtime 线。

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
- **每次阶段性提交之前：先看一眼主树 `bulletin.md` 的「新条目」**（只读比上次新读到的部分）——白天节奏改短（R-0024）：
  L 每 1–2 分钟一轮、审阅者/侦察者 8–12 分钟一轮，公告可能在你两次重读之间就变了。
- **等依赖/卡住时不长睡**（R-0024 ②）：等新单或等别的树时，单次等待**不超过 5 分钟**，醒来重读公告与工单目录。
- **提交粒度建议 ≤15 分钟一次**（R-0024 ⑤）：白天用户在看，落一次提交＝让进展可见；这不是新门，是节奏建议。
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

## 8b 阻塞时的 fallback 活单清单（`R-0041 ⑦` ＋ `OF-01` 的回退条款）

> **规则：等依赖单次 ≤5 分钟，醒来先做下面第一条能做的**，做完在本树 `status.md` 记一行（带计数/证据）再回到等待。**不许只剩 `sleep`。**

1. **复算已收口单的门计数**（按命令原文重跑；报数附命令与"工件在/不在"一行；`QA-007` 口径）。
2. **`089` 的四个真实门先预演**：假端点优先，把门脚本与"无环境 ⇒ 派发前类型化拒绝"的反例先写好。
3. **`103` 的元门**：把"每个方法都要被真实 wire 驱动过"的账先跑一遍，列出现在还没被驱动过的方法。
4. **核依赖谓词**：读 runtime 树 `status.md`，确认 `091` 的收口行是否已出现；读主树 `bulletin.md` 新条目。
5. **补本树 `status.md` 的"已知缺口"行**（未验部分要写清验法）。
6. 以上全被阻塞 ⇒ 写"等什么 / 为什么别的都不能做 / 预计何时醒"（**这才允许长一点睡**）。

## 9 启动提示词（用户开/重开会话时粘贴；≤15 行）

```text
/goal 你是本项目的【后端执行者·A 线（wire / probe / 契约）】（子树 agent-box-env-provider），按队列连续施工。

先完整读这些并遵守：
- docs/implementation/worktree-charter.md（本树章程：范围/写权/**§3「今晚队列」＝开工顺序与可判定谓词**/§8b fallback/§3c 优先级）
- docs/implementation/work-orders/**（契约权威）
- /home/maoqh/projects/agent-box-server-round1/docs/implementation/ 下的 bulletin.md（最新公告＝「组织调整 v2 / R-0054」）、README.md §3/§4、manifest.json、status.md、rulings.md、prefs.md
  （**`rulings.md` 与 `approval-queue.md` 现在只有对话窗口写——你只读**）

今晚队列：`087` → `QA-008`/`QA-009` 两张新单（由 ops 当轮投递，投进来就做）→ `103` → `099` → `089`（**谓词：runtime 树 `091` 已收口**，判据＝那棵树的 `status.md` 能查到 `091` 的收口行）。
纪律：单内不停；批末 `git tag -a checkpoint/<批> …` + 把检查点报告写进本树 status 后**继续**；**每张用户可见单收口就打检查点（`R-0053`）**；
升级标阻塞继续做别的；只写工单声明的 write_paths；`git add -- <显式路径>` + pathspec 提交；不 merge 主干、不 push、不 reset/stash/clean；
凭据只作 locator；真实调用按 `R-0017`（假端点优先、逐笔记账）。队列做完才可停并写 `QUEUE_EMPTY_AT <日期>`。
【不许只剩 sleep】等依赖时单次 ≤5 分钟，醒来先做 §8b 第一条能做的。
```
