# 用户决策台

待回答 0 项 · 已回答 5 项

此文件由队列工具生成，C和用户均不直接编辑。用户在终端回答，答复自动显示在各项“用户回答”处。
答复原件在 decision-queue/answers/；C读取后在自己的outbox确认收到并执行。回答不等于执行完成。

## 最新阶段检查点（只显示最新状态，不进入审批队列）

◆ CP-SESSION-001  │  进行中  │  更新 #46

用户要求停止词典/代理分类器迭代，C 已撤其对会话功能测试的前置；BE 产品真实两轮已过。BC/FC 正备临时可发送 Server×FE 非敏感首发/续发；背景连接未知项独立留账，具体业务外流即停报。




### 前端整体检查点  ·  进行中

FE 无发送旧总门因背景连接分类 FAIL，用户已裁主线不再迭代词典/代理门；转 FE 非敏感真实发送。

最近核实：2026-09-23T08:00:48.026459+00:00




#### 1. 桌面壳与工作台  [进行中]  负责：F0 / FC

- 结论：本批 FE UI 十项原始 true，但网络分类器 unknown6 使总门 FAIL；无新远端 TCP/send 证据。
- 已完成：FC-0095 背景词典 302 分类及业务串用/降级/凭据反例通过，typecheck/build 绿。
- 正在做：背景连接证据原样保留，停止分类器迭代；功能门记录网络并仅对具体业务外流停。
- 下一步：新门区分真实 TCP/发送/未知，准备本项目功能联调。
- 阻塞：unknown1 独立留账，不作为非敏感 FE 功能测试的统一硬停门。
- 核实：2026-09-23T07:58:10.104328+00:00
- 证据：C-0094；I-DICTIONARY-REVIEW-001



#### 2. 连接管理与后端适配器  [进行中]  负责：F1 / FC

- 结论：ordessa connector 已启入八包候选并通过假 Server 认证 hello；真后端配对仍待。
- 已完成：FC-0093 认证 POST 显式 redirect:error；同源/跨源假 307 无第二请求，typecheck/build 通过。
- 正在做：FC 只读核词典跳转目的地；不启带 token Electron。
- 下一步：做双命令同实例与真实项目首发。
- 阻塞：WireClient.fetch 重定向边界待显式 fail-closed；真实 Profile/项目/首发 ID 未经过 FE。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：FC-0093；C-0082



#### 3. 项目与会话列表  [已完成]  负责：F2 / FC

- 结论：草稿首发错目标和可见草稿 pane 在 FC 合并树通过，仍待产品启用和真实项目联调。
- 已完成：FC-0059/0063 合并 typecheck、renderer 153 通过。
- 正在做：等待独立候选运行装配。
- 下一步：验证真实项目恢复、首发 ID 与列表。
- 阻塞：尚未 FE/BE 配对。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：FC-0059/0063



#### 4. 对话、思考与工具呈现  [进行中]  负责：F3 / FC

- 结论：F3 pane/key/身份修复已由 FC 收编，opened 回原 S1 补测；合并树 renderer 153 通过。
- 已完成：FC-0063 clean d14ac6e0e6，typecheck、renderer 153、conversation 18 通过。
- 正在做：等待候选装配与真实 Server 事件联调。
- 下一步：在固定 FE/BE 配对中验证真实会话行为。
- 阻塞：离线门不能证明真实流式/工具/审批。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：FC-0063



#### 5. 权限审批与交互  [进行中]  负责：F3 / F1

- 结论：对话内审批界面已集成，假 ACP allow/stop 门通过；真实 Pi 审批未测。
- 已完成：卡片按会话隔离，支持响应/失败呈现；界面测试通过。
- 正在做：等待真实 Agent 与 FE/BE 配对。
- 下一步：在固定配对中验证同意/拒绝及会话隔离。
- 阻塞：缺真实审批往返证据。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：BC-0038；SESSION-CHECKPOINT.md


阶段卡点：FE 真实发送门和 BC 可发送 READY 尚未交；一条本地代理连接来源未归因，独立风险留账。

阶段下一步：在新临时 Server/测试 token/空项目上直接跑 FE 首/续发；具体业务数据外流即停。




### 后端整体检查点  ·  进行中

真实产品 Server createAndSend 与同会话 send 两轮 accepted/completed，精确回复 HD002_SERVER_OK_1/2，native id 本次稳定。

最近核实：2026-09-23T08:00:48.026459+00:00




#### 1. Server与项目接入  [进行中]  负责：S / BC

- 结论：真实 Server 会话首发/续发通过，待 FE 接入同实例。
- 已完成：BC-0083 产品真实两轮通过；BC-0086 同实例无发送 Server 半门只收 hello/list/open/profile，零 Send/OTHER，DB 三表零且清理。
- 正在做：BC 整理本批运行清理与真实回执。
- 下一步：依据 C-0036 决定兼容 ACP 接线。
- 阻塞：FE×同实例 Server 尚未测。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：BC-0083/0086



#### 2. 执行组合与核心记账  [进行中]  负责：BC

- 结论：Server×Go桥×Pi 后端真实两轮通过，工具/审批/停止另门。
- 已完成：BC 本批真实 createAndSend/同 Server session send accepted/completed，两轮回复 HD002_SERVER_OK_1/2、native id 稳定。
- 正在做：准备实际权限/停止反例。
- 下一步：修兼容接线并验证真实事件与终态。
- 阻塞：正常工具与审批、停止、历史恢复未实测。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：C-0088；BC 终版待交



#### 3. Harness与ACP接入  [进行中]  负责：H / BC

- 结论：旧 Pi global settings warning 的直接错误为 mkdir settings 锁目标时 EROFS，非已证 JSON 损坏。
- 已完成：direct Pi 无 prompt 与无工具两轮通过，且本批 Server×桥×Pi 真实首/续发通过。
- 正在做：BC 离线构造 A→B 后置 input 改写与未知工具漏 gate 反例。
- 下一步：核原生身份、模型、权限及无敏感首发/同会话第二轮。
- 阻塞：正常 gate 覆盖不足且后置扩展可改最终输入；无工具真实两轮不证审批。
- 核实：2026-09-23T08:00:48.026459+00:00
- 证据：BC-0087；C-0092



#### 4. 启动与部署入口  [进行中]  负责：BC / F0

- 结论：第三批真实 Server 同实例身份/Profile/项目通过，tap 禁止/未知入站 0，停服后 port/lock/进程清。
- 已完成：BC-0068 修复 token-before-tap 监督；BC-0070 C-0058 Server 半门通过，12 个相关 DB 表均 0。
- 正在做：本批停服完成，等待下一配对裁决。
- 下一步：FC 交付按协议/发送分类的更正门后，固定候选版本与 BC 做配对。
- 阻塞：旧 Electron 外联判据误将 UDP 探测计作 TCP；FC 正更正配对门，真实配对尚未执行。
- 核实：2026-09-23T06:57:28.149655+00:00
- 证据：BC-0068/0070；FC-0076


阶段卡点：正常工具 gate 漏 powershell/custom，后置用户扩展可改已批准 input；FE 配对另待分类器复验。

阶段下一步：交 clean 回执，配合 FC 做 FE 实机，再定向跑权限/停止门。




### 整机与用户验收检查点  ·  未开始

BE 产品真实两轮已过；用户裁撤背景网络分类迭代前置，FE 非敏感首/续发待新可发送同实例门。

最近核实：2026-09-23T08:00:48.026459+00:00




#### 1. 真实对话闭环  [未开始]  负责：C / FC / BC

- 结论：真实后端产品对话闭环已过，FE×Server 成套尚未验证。
- 已完成：BC 产品后端 createAndSend/同 session send 真实两轮通过，回复 HD002_SERVER_OK_1/2。
- 正在做：BC/FC 准备 FE×真实 Server 非敏感首发与同会话第二轮。
- 下一步：单流验证项目首发、多轮、工具、审批、停止。
- 阻塞：FE 实发尚未运行；正常工具/审批/停止另门。
- 核实：2026-09-23T06:57:28.149655+00:00
- 证据：BC-0083；C-0094



#### 2. 基线发布与用户试用  [未开始]  负责：C

- 结论：尚无满足检查点的可启动配对工件，Profile 独立包仍隔离。
- 已完成：已明确Profile及后续增量不纳入。
- 正在做：等待真实配对与候选净化。
- 下一步：固定 SHA/命令/端口/目录与已知限制后交用户验收。
- 阻塞：实际验收面未通过。
- 核实：2026-09-23T06:33:36.291177+00:00
- 证据：SESSION-CHECKPOINT.md；integration/checkpoint.json


阶段卡点：Pi managed launcher 额外写域未授权且无prompt复验未做；native 权限/续聊仍未证。

阶段下一步：C 收两边 clean/安全证据后组织项目首发→同会话第二轮→历史/权限/停止。



整体下一步：BC 交可发送同实例 Server READY/stop，FC 用临时 token/空项目做 FE 真实首发与同会话第二轮；网络未知背景项独立记录。




### 拓展 · 独立研究/施工，不计入会话基线验收



◆ profile · 进行中 · 更新 #4

v0.2 四项真差量已全部实施并跑绿（复制、导出/导入含校验预览、零 props 根视图、独立演示）；四状态仍只有独立插件验证成立，接缝与产品装配未做、不在 CP-SESSION-001 基线内。




#### Profile 逻辑蓝图 [进行中] 负责：PROFILE

- 结论：本批独立插件面四项差量已实施并包内跑绿（复制、导出/导入含校验预览、零 props 根视图、独立演示）；仍待把 v0.2 验收面逐项对回测试实名，故本模块记 IN_PROGRESS 而非完成。
- 已完成：符合度核查（差量表纠正三项）；store#clone；portable（export/inspect/import＋store.import_bundle）；root.tsx#createProfileRoot（形参 0 由测试断言）；demo.ts#runDemo（明标测试端口，不在产物内）；BE 73 tests OK、FE 17/17、产物 17152 bytes（规范 cwd）。
- 正在做：无（四项已交，停在验收映射回核）。
- 下一步：逐项把 v0.2 验收面对回测试实名并补进 verification-map；等接缝/装配另裁。
- 阻塞：无；不影响 CP-SESSION-001。
- 核实：2026-09-23T08:42:30Z
- 证据：agents/PROFILE/v0.2-delta.md；BE 58074749／96cdc337；FE ba748793e8／a1baa218a2



#### Profile 独立插件包（P0/P1，仅独立验证） [已完成] 负责：PROFILE

- 结论：既有独立包与本批四项增量在同轮现跑中全绿（BE 73、FE 17/17、tsc/esbuild 0）；「收件」仍只覆盖独立插件验证这一状态。
- 已完成：BE 58 unittest OK 与零 entry_points/零 Requires-Dist wheel（15296 bytes）；FE tsc --noEmit 0 → CJS 出件 0 → node --test 12/12 → esbuild entry.js 15453 bytes；两树 HEAD 未变且 git status --porcelain 各 0 行（本轮 07:07 实测）。 v0.2 增量四项：clone、portable 导出/导入＋校验预览、零 props 根视图、独立演示；BE unittest 73 OK、FE node --test 17/17。
- 正在做：无（该阶段已交，保持不返工）。
- 下一步：若 v0.2 差量触及既有码，改动一律另起提交并在 verification-map 补验收映射。
- 阻塞：无。已登记而不由本包自修的缺口：app vitest include 不含本包测试；跑 build-all 会重写已提交 extensions.lock.json（本包不跑，处置权在 FC/C）。
- 核实：2026-09-23T08:42:30Z
- 证据：agents/PROFILE/verification-map.md；BC-0026:16；BE 58074749／96cdc337（父 f3bcbde9）／FE e869683469



#### Profile 宿主接缝与产品装配 [未开始] 负责：PROFILE

- 结论：未做，且明确不在本包授权内：v0.2:20 只要求独立插件面，装配/接缝若要做需 C 另裁单写域。
- 已完成：无。唯一已核事实：本包依赖的宿主契约 platform/extension-api/src/index.ts 与 FC 集成树字节同源（1797 bytes），故接缝批不必先追平上游。
- 正在做：无。
- 下一步：等 FC/C 对装配或接缝另裁；本包不自行进入，不把 Profile 列为 CP-SESSION-001 前置。
- 阻塞：无（未启动即未启动，不写成执行中）。
- 核实：2026-09-23T07:07:48Z
- 证据：agents/PROFILE/outbox/PROFILE-0006.md §2；BC-0026:16；control/product/profile-blueprint-v0.2.md:20
下一步：把 v0.2 验收面逐项对回测试实名并补验收映射；此后等 FC/C 对接缝或装配另裁，本包不自行进入宿主面。



◆ provider · 可验收 · 更新 #17

研究完成，DESIGN_READY 待审：推荐复用既有 providerModels 子系统的最小方案；未实施。




#### Provider/model 研究 [已完成] 负责：PROVIDER

- 结论：四份交付完成：事实矩阵、复用图（CCS/VK 承重源码+Zed+ACP）、最简方案与反例验收；结论=不新建框架，扩展已有 providerModels+两注册插件，零代理、原生继承默认、无 Profile 可用。
- 已完成：TAKEOVER；≥3 多 Harness 来源（2 读源码）；Codex/Pi/Claude 原生机制交叉核实；字段归属表/生效时机契约/生命周期/非目标/切片；13 场景走查。；本机一手 CLI 交叉（Codex 0.155.1 profile 层叠/strict-config、Pi 0.86.1 auth/模型模式）；claude model 写入核实为 materializer v2 预留缺口。；缺口收口：CCS AuthBinding 委托引用形状（accountId 空=跟随原生默认、归属存疑即拒）定入 delegate_native 设计；Pi PI_CODING_AGENT_DIR 原生重定向与 execution-local 同向互证。；BC-0076 Pi 锁/EROFS 回退机制收入 §10b，acceptance 13→14 条反例（只读暴露原生 settings=违例，回退必须显式诊断）。；审前完整性复读：修 Codex 行表格列错位、S1 措辞与已核实结论对齐；§10b-2 与 H-0013/0014 同题风险建立交叉引用。；BC-0077 收入：Pi 读路径即写 3 锁（--offline/--no-session 不消除）——“只读共享原生 agent-dir”物理不成立升为一手事实，execution-local 投影为唯一零触路径；acceptance 13→15 场景。；承重锚点一手复核完成：DDL/freeze/probe 三坐标与引用全吻合，新增“双侧声明才阻断、未知≠不可用”精化与有界 probe 事实（曾误删“前端现状”行当即恢复，经复读确认在位）。；发现并对齐 Order 56 server_accounts（“binding not credential”成文）：delegate_native 改为引用既有账号行+复用 state/last_verified_at 探针缓存，零新表。；§10b-5/6：用户批准件同向互证；--offline 非写禁止（radius.js persist-before-network）；execution-local 隔离升为“无替代机制”级事实；组件探针部分回补 §10b-2。；§10b-2 由 BC-0080 闭合（锁可用→EROFS 消失、原生模型/思考级别确认=“按原样生效”实证）；VK/CCS/BE/radius 关键锚一手抽核登记入 reuse-map。；proposal 附诊断码分层表（provider 域 5 码/执行 gate 域归 BC 词表只透传/会话域既有），预答审阅重叠问题。；BC-0082 真实两轮通过收入：场景1(无卡原生可用)与会话内零漂移获外部真实对应物；FE providerModels 零消费者一手复核证实，S3 定位自证。；自我红队补漏：probe 网络边界成节（一次有界 GET/只到自填 baseUrl/响应体不入日志/非声明外联先报单列，对齐 C-0074 网络门），acceptance 增第 16 条反例，场景共 16 条。；红队#2：共享 delegate_native 卡×server_accounts(harness_type NOT NULL) 归属语义成文——按执行侧 harness 解析、无账号即 NATIVE_LOGIN_MISSING、绝不串用他 harness 凭据；acceptance 达 17 条（编辑事故当场修复并全量编号校验 1-17 无损）。；红队#3：Codex“下条消息”生效条件化为进程寿命假设+S1 前置核实项（一跳证据不足即不猜）。三轮红队共消除 probe 网络归因/跨 harness 串凭据/寿命假设三处可质疑点。
- 正在做：待 I 审；§10b-2 待决挂 C-DEC-0002=A 后续复验结果（BC 线执行）。
- 下一步：收 BC/I 对 DESIGN_READY(rev6 增量后) 的回执；C-DEC-0002 复验结果可回补 §10b-2 待决。
- 阻塞：实施待 I 批准；权限面 gate 验证属 BC 主线停门（非本研究阻塞）。turn 上限：机制在、实测 100、生效需用户命令。
- 核实：2026-09-23T08:40:21.572292Z
- 证据：reports sha[:8] proposal=83619f13（acceptance 见 rev16，research/reuse-map 不变）；outbox/PROVIDER-0001..0007
下一步：I 审 proposal.md；批准后按切片 S1(materialize 生产接线+delegate_native)→S2(BE 插件壳)→S3(FE settings 分区)推进。

## 自动交互进展（普通消息直接可见；不替代验收结论）

◆ 桌面完整两轮对话  · 本项已验证
  已到：已在桌面选择项目、首发并在同一会话续发；两次真实回复均显示，后端两轮均完成。
  卡点：正常工具审批、停止及跨重启历史恢复未在本项两轮测试中验证。
  当前：暂无在途动作。
  下一步：交 C 进行用户体验验收，并单独核对尚未验证的能力。
  等待：C 验收
  负责：FC · 09-23 17:09:35 记录

◆ 后端原生 Pi 对话链  · 本项已验证
  已到：Server 经 ACP 桥连接原生 Pi 完成同一会话两轮；桌面驱动的同一 Server 会话也完成两轮。
  卡点：本项无；工具审批、停止和历史恢复属于另行验收的能力，尚未验证。
  当前：暂无在途动作。
  下一步：将本项证据交 C 验收。
  等待：C 验收
  负责：BC · 09-23 17:09:32 记录

◆ 会话基线验收  · 待审阅
  已到：桌面选项目、首发和同会话第二轮均实际完成，两次回复已显示；后端记录同一会话两个完成的 turn。
  卡点：正常工具审批、停止/断连及跨重启历史恢复尚未实测，不能称整个 Session 基线通过。
  当前：已核对 FC/BC 终版回执、同会话身份、两次入站与完成数，并在用户截止前提交两轮体验验收。
  下一步：保留本批通过证据；之后定向验证工具审批、停止与历史恢复，不重做已通过的文本两轮。
  等待：用户对桌面两轮体验的验收；后续能力须按各自门继续验证。
  负责：C · 09-23 17:09:20 记录
  ⚠ 有更新交互，本项状态尚未同步；不据此假定仍在运行。


## 决策请求

## I-DEC-0001 · 已回答 · 真实测试预算：要求不可越过的请求硬上限，还是接受可观测计数与止损？

### 问题

你原定所有测试调用少于100次。当前C按每个真实模型API请求都必须有可验证硬上界执行，重试和工具后续调用都计数；原生Agent链尚未证明能这样限制，真实测试一直未放行。原生路径改正后，如果仍无法获得可靠的请求硬上界，是否仍坚持这一门槛，还是接受可观测计数、串行小批和停止阈值的尽力控制？

### 推荐

先要求C检查原生Agent已有的请求统计、重试/步数限制及可复用限额机制，不再扩建通用控制器。在你明确选择放宽前继续遵守原硬上限要求。你也可以答：允许采用可观测计数的尽力控制，并指定止损阈值；C需说明能观测什么后再发具体grant。

### 替代方案

A：保持99次实际请求硬上限，缺可靠限额就不跑该真实测试；可能继续阻塞自动真实验收。B：仍以99为目标，接受串行小批、可观测请求计数和提前停止的尽力控制；在途请求/不可观测重试可能导致越限，不能承诺严格小于100。C：暂缓自动真实模型测试，先完成原生离线接线，你再决定是否手动试用；离线通过不能当真实验收。

### 影响

只涉及测试预算保证，不授权任意模型、读取凭据、扩大产品功能或放开Agent权限。当前总账仍零grant。这里需要你的偏好，不应由C默默放宽，也不应无限做限额脚本而不上报。原生链若已有满足A的限额机制则可直接按原预算推进，C应补充证据。

### 证据

control/missions/HD-001/BUDGET.md §必须诚实处理100次；HD-002/agents/BC/outbox/BC-0026.md：现有fetch计数非原子且存在旁路；agents/C/outbox/C-0021.md：因此真实R2零grant；I-NATIVE-AGENT-001要求切换原生路径后重核，不沿用旧bwrap门。

### 用户回答

2026-09-23T04:00:42.004557+00:00：

> 我前面说100次只是想让你们放开了用，现在我宣布，可以随便用，没有任何限制不必计算任何东西

同一请求如有修订，以最后一条回答为准，历史保留。

## I-DEC-0002 · 已回答 · Pi ACP兼容阻塞：接入路线与能力边界由你审批

### 问题

旧ACP桥在你的原生Pi目录创建会话失败，而本机Pi CLI状态读取成功。是否同意优先验证Zed采用的外部Pi RPC桥，满足当前对话/工具/思考/审批/续聊要求才接入；若存在任何能力缺口，再交你单独决定，不默认接受缩水？这不是批准立刻更换产品依赖。

### 推荐

A：优先核svkozak/pi-acp（Zed官方Pi页指向），与当前Go桥做最小能力对照；固定版本并做隔离验证。已授权的Go临时构建/无prompt诊断保留证据，不因已投入就锁定。只有满足原定能力才由C组织接入；缺口或改变原生行为另报你。

### 替代方案

B：继续优先验证现有Go桥（复用本机CLI，但会注入工具审批扩展，覆盖及续聊需实证）；C：先修/升级现有嵌入SDK桥（保持当前适配形态，但与本机Pi版本及原生目录兼容仍未知）。三者均未证明当前真实对话闭环，不默认批准能力减少或用户配置修改。

### 影响

阻塞后端真实session/new及前后端对话验收；前端草稿修复等无关工作继续。候选产品选型/接线等用户意见；已有授权诊断可继续，不强杀在途进程。版本号与具体缺口由C核实补报，不让用户审批每条测试命令。

### 证据

agents/BC/outbox/BC-0042.md、BC-0044.md、BC-0045.md、BC-0046.md；agents/C/outbox/C-0039.md；agents/I/outbox/I-PI-ACP-REUSE-001.md；https://zed.dev/acp/agent/pi；https://github.com/svkozak/pi-acp 。Zed入口证明已有接入路线，不证明本机能力全部满足。

### 用户回答

2026-09-23T05:48:52.728551+00:00：

> A

同一请求如有修订，以最后一条回答为准，历史保留。

## C-DEC-0001 · 已回答 · CP 桌面启动外联：隔离诊断环境与准入边界

### 问题

Electron 在真实 Server 配对和无 Server/无凭据空宿主中均于启动期成功建立一次非 loopback 连接；已批准的非 loopback 即停门因此使 CP 无法就绪。下一步请选：A 保持硬门，并提供/批准可按目的地址阻断外联且保留本地 Unix/loopback 的隔离网络环境，让 C 在该环境中定位来源后修复；B 明确允许此类外联作为产品行为并调整 CP 外联准入；C 暂停相关 FE live 配对，仅继续静态与独立后端工作。

### 推荐

推荐 A。保持现有硬门与 CP 未就绪结论；在真正隔离网络环境中采完整进程/NetLog 证据，定位请求后再决定产品默认。当前宿主 unshare/bwrap 无非特权 namespace 权限，需你提供可用隔离环境或批准相应环境权限；在环境可用前 FE live 保持停门，其他写域继续。

### 替代方案

B 会改变现有外联停门及用户产品网络行为，且目标请求尚不能与具体模块确证关联；不能把已有局部 UI/Server 通过直接升级为 CP ready。C 最少引入新风险，但 FE/BE 真配对继续受阻；无需新增环境，可等后续信息。测试专用代理或 WebRequest 取消只能改变测试行为，已无法证明生产默认安全，故不作为等价修复。

### 影响

只影响 FC Electron 外联诊断和 CP 整机准入，不暂停 BC 的独立 Pi settings/权限调查或 PROFILE 原会话。A 需要隔离环境和一次新诊断；B 需重新定义产品可接受的外联及告知范围；C 延后用户可试用的 CP。所有旧证据、main、用户服务/Qoder/PROFILE、唯一预算账本原样保留；未授权前不再跑可能成功外联的 FE live。

### 证据

FC-0069、FC-0076/0077、BC-0070：两次真实无发送配对均因 Electron 外联 FAIL，Server tap 无 Send 且 DB 零；FC-0080 空宿主无凭据仍成功外联；FC-0081/0082 注释标签虽映射拼写检查词典下载器但缺 connect 因果边；FC-0084 关闭拼写检查仍外联；FC-0086 WebRequest 前置监听零回调且仍外联；FC-0079 syscall 注入同时拦 AF_UNIX，宿主 unshare/bwrap 非特权 namespace 不可用。具体模块 UNKNOWN；Pi settings 门另为 INCONCLUSIVE。

### 用户回答

2026-09-23T07:38:00.978345+00:00：

> 不选现有ABC。按 I-EGRESS-DIAG-CORRECTION-001 执行：无凭据、无业务数据的空宿主允许有限诊断，取得完整日志后正常退出，不再一见普通连接就杀进程。此授权仅用于定位，不批准产品任意外联，不新增隔离平台。后端排障并行继续。立即确认已读取最新I指令。

同一请求如有修订，以最后一条回答为准，历史保留。

## C-DEC-0002 · 已回答 · Pi 原生设置锁的最小测试写权限

### 问题

已核实 Pi 无 prompt 探针的 global settings 加载在创建 `/home/maoqh/.pi/agent/settings.json.lock` 临时锁目录时遇到 EROFS；当前测试沙箱把该用户目录所在挂载标为只读。是否授权 BC 在一次受控无 prompt 复验中，让原生 Pi 测试进程仅能按 Pi 自身机制对这个锁目录短暂 `mkdir`/`rmdir`，同时只读 settings.json，不改其内容、不改用户权限或配置？

### 推荐

A：授权这个精确锁路径的一次受控写入复验。C 协调单一真实 Agent 流、现有 Pi 身份和模型；BC 先核锁目录不存在及无其他 Pi 持有，运行 `--offline --no-tools --no-extensions` 的无 prompt `get_state`，只记 EROFS warning 是否消失、锁创建/释放、非秘密错误类别、无模型请求和进程清理；异常即停。完成后再单独核原生权限策略与真实首发条件。

### 替代方案

B：你在有正常 HOME 写权限的原生会话自行运行同等无 prompt 探针并提供脱敏结果，C/BC 不触用户锁；但需你操作，联调延后。C：暂不授予锁写权限，BC 保留 EROFS 根因和离线/fake 证据，真实首发继续阻塞。任何选项都不批准编辑 settings.json/auth、清理别人的锁、修改 HOME/agentDir/模型或强杀原 Pi。

### 影响

A 需要让单次测试进程获得当前沙箱外 `/home/maoqh/.pi/agent/settings.json.lock` 的临时目录创建/释放权限；可能触发执行平台的额外权限审查。Pi 会读取现有用户原生 settings 以验证加载，但不输出内容或凭据，不发送 prompt/模型请求。旧错误直接原因已从 UNKNOWN 改为 mkdir→EROFS；旧 ACP ENOENT 与之是否同因仍未知。FE 无凭据外联归因、H 静态能力对照继续，不冻结全队。

### 证据

I-PI-EROFS-001 第一手核旧 147-byte stderr：errno=EROFS、operation=mkdir、目标=settings.json.lock；BC-0072 scope=GLOBAL；BC-0076 复核原探针 env copy、当前 findmnt 用户 agentDir 所属 / ro、Pi proper-lockfile 以 settings 相邻 .lock 目录 mkdir/rmdir；当前该锁目录不存在，settings 文件未读取内容。I-CLOSEOUT-FOCUS-001 要求并行推进真实首发且权限缺口当轮入队。

### 用户回答

2026-09-23T07:54:28.338650+00:00：

> A

同一请求如有修订，以最后一条回答为准，历史保留。

## C-DEC-0003 · 已回答 · Pi 完整无 prompt 复验所需另外两个临时锁

### 问题

C-DEC-0002=A 只批准一次 settings.json.lock 临时创建/释放。BC 静态核出同版 Pi 0.86.1 完整 CLI 在本地读取现有 auth 和模型存储时，还会临时创建/释放 `/home/maoqh/.pi/agent/auth.json.lock` 与 `/home/maoqh/.pi/agent/models-store.json.lock`。是否授权 BC 在同一次无 prompt `get_state` 复验中，额外仅允许 Pi 原生机制对这两个精确锁目录短暂 mkdir/rmdir？仍执行已装同版本的 direct bundled CLI，不调用带更新锁与暂存清理的 managed launcher；实际升权另受平台审查。

### 推荐

A：追加上述两个精确锁目录的单次临时写入权限，并延续 C-DEC-0002=A 的 settings 锁权限。BC 先静态审完同版 direct CLI 的迁移及其他写分支、复核三锁均不存在且无别的 Pi 持有；若不能证明没有更多写面，当即停门上报，不申请升权。审查通过后只做无 prompt、无工具、无扩展、无会话的 get_state，记录锁生命周期、EROFS warning、脱敏错误类别、模型身份与工具数，不读出或修改凭据、设置、模型文件内容，不发消息或模型请求，进程及自建锁正常清理。

### 替代方案

B：维持 C-DEC-0002=A 的写域，只用同版 SettingsManager.create 作 settings 加载组件探针；仅能验证 settings 锁与 drainErrors，不能证明完整 CLI、模型或权限可用，真实首发仍需另行闭门。C：暂不做任何用户目录测试，保留 EROFS 根因及离线证据，真实首发继续阻塞。

### 影响

A 额外涉及用户 HOME 中两个 Pi 自身的相邻锁目录，且 Pi 正常本地读取现有 auth 与模型存储；不批准修改 auth.json、models-store.json、settings.json、权限、HOME、agentDir 或模型，也不批准清理他人锁、更新安装、删除 staging。平台可能仍拒绝越沙箱执行，拒绝时原样报告。FC 的前端配对门修正和 H 的静态对照不受阻；BC 的真实 Agent 流保持停门至决策与预检完成。

### 证据

BC-0077 源码锚：ModelRuntime.create→AuthStorage.create.reload→FileAuthStorageBackend.withLock 对现有 auth.json 创建 auth.json.lock；FileModelsStore 本地刷新→withLockAsync 对现有 models-store.json 创建 models-store.json.lock；--offline 仍恢复本地缓存。Managed launcher 另有 cleanupManagedInstall/update.lock，direct bundled CLI 避开该环境变量。当前三锁不存在、现有 auth 与模型文件仅核存在性，未读取内容。C-0076 已立即上报 I；旧 C-DEC-0002=A 仅覆盖 settings 锁。

### 用户回答

2026-09-23T08:07:22.710509+00:00：

> A

同一请求如有修订，以最后一条回答为准，历史保留。

