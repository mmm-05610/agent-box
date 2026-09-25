# HD-002 决策

I-001：用户确认旧会话全关闭，上级Codex/gpt-6-sol，下级Qoder；本次新树承接所有已提交成果。
I-002：Profile独立插件授权，不能动主线施工域；Provider/Model仅设计；无Profile仍可使用相关能力是后续设计要求。
I-003：HD-001唯一budget ledger保留权威，99总/10review不重置，初始零预留；中央常规工作不冒充独立review。
I-004：C-0002采F3-0040乙案：P2-2第4点随baseline1后应用批整体处理；FC统筹F0/F3单写及应用门。F1/F3已交付的其余项先集成，不冒称右栏项完成。
I-005：F1 connections域新增workspace机制面按baseline1内部增量收编，公共跨团队消费须在合并树验行为；不据此扩shared wire或Provider/Model。
I-006：C-0003暂不发R2真实调用grant；旧N=4以两请求离线见证推全live路径不足，Codex live另有第三个真实取消轮。BC重核逐请求上界，ledger不变。
I-007：C-0004另核Pi full live gate在主两轮后还有reopen两个prompt，BC-0001的Pi reserve 2也不成立；仍无真实grant，要求先给可验证上界。
I-008：C-0006仅批准H在scripts/hd002做Pi测试专用离线请求限额探针与反例，先证guest全路径覆盖；不等于真实调用grant，不装产品或造通用控制器。
I-009：C-0008裁P2-3B最终目标身份为Server验证的workspaceId；项目目录用现有workspaces.open、独立目录由Server在专属data-root子树分配并保留归属，先由BC/S实现新增BE能力，FC后接真正backend adapter。旧FE native固定cwd不可冒充。无Profile产品入口；现有Profile若不可发送则明确拒绝，不造假默认。
I-010：C-0009把普通服务端Profile实际provisioned且sendability=ready列为FE→BE发消息前置；全新Linux缺默认SecretStore须另有受权setup证据或最小后端/测试设置包，不通过主线加Profile/Provider/Model管理入口，真实调用仍需单一预算grant。
I-011：C-0010批准BC-0010的additive `workspaces.allocateIndependent` 行为与S单写六路径，含shared `storage/database.py` 仅server_workspaces schema；先收S管理ACK再下包，BC集成复验。失败须可追踪且不删他人目录；仍零真实调用。
I-012：C-0011准FE后端适配器首版复用现有认证REST纯建空会话（真实workspace/Profile与幂等键），不以createAndSend空消息代建；桌面token只留可信host且产品启动同实例证明待补。Server通用input/editor/choice缺口归BC先设计，不能冒充approvals.decide或新turn。前端交互主操作必须在对话内、撤右栏，F3早期加法提交只作素材。

I-013（覆盖 I-009/I-011/I-012 中与首发冲突部分）：用户通过 `I-SESSION-FIRST-SEND-001` 裁定新对话仅前端草稿，首次发送优先复用现有 `sessions.createAndSend`；真实 ID 成功后入历史。项目模式实际 cwd 为所选项目；无项目使用核实的 Agent 既有默认工作区。新增独立目录分配与 REST 纯创建空会话撤出本轮关键路径，旧证据和成果保留。失败/结果不明不盲重试。

I-014：`I-SESSION-CHECKPOINT-001` 要求独立固定 `CP-SESSION-001` 可运行配对供用户验收；Profile、Provider/Model、后续插件均非前置。仅用户可标 USER_ACCEPTED；不自动 merge/push main，预算规则不变。

I-015：`I-BASELINE-CLOSEOUT-001` 与 `SESSION-BASELINE-TARGET.md` 要求当前只收口 Session 基线，不派新架构/插件设计。FE 候选单一 ordessa 后端 connector，直连原型另存；BE 核必要依赖最短链；候选树只收可安装启动且验证的用途明确包，不能以默认禁用容纳实验代码。C-0012 已通知 FC/BC 纠正任务板与下级批。

I-016（覆盖 I-013 的无项目分支）：`I-PROJECT-REQUIRED-001` 裁定启动对话必须选择有效项目；当前连接作用域恢复上次有效选择，首用/失效必须重选，跨连接不串项目。旧默认工作区发现/解析/分配撤出本轮，项目真实 cwd 仍须验证。草稿首发 createAndSend、纯建和独立分配撤销、CP 冻结及预算门保持。C-0013 已向 FC/BC 通知修正。

I-017：`I-DECISION-REUSE-001` 与 `I-DECISION-QUEUE-001` 规定技术决策先复用现有证据或核相同约束的开源源码；普通实现中央可裁，跨用户语义/契约/安全/预算须上报。确需用户审批由 C 去重并经 decision_queue submit 入队；C 不编辑生成文档或代答。C-0015 已 ACK，当前队列无待答。

I-018：FC-0024 采 F3-0005 源码反例，在 FE 包内将可操作交互卡迁入 conversation 同 bundle，撤右栏与候选产品空 interactions 插件；旧包/历史保留。此为 FC 单写装配内的实现归属修正，遵守用户要求的对话内可操作行为和候选 main 不含空实验包；无新共享契约或插件间依赖。

I-019：C-0018 收敛 F1-0007/F2-0006 冲突：沿 F2 已交 `90972a03d6` 的单一 additive 草稿/项目/首发合同推进，F1 不再另写 `newSession(target)` 合同；F2 为 shared contract 唯一写者。Server 现有认证 `server.hello.serverId` 按 data-root 持久，联同可信 origin 作连接作用域键，须注册前取得；上次项目选择跨桌面重启保存、恢复时再 `workspaces.open` 同 ID/非归档核验。F0 桥可持 token 不等于生产同实例 handoff 已接通。

I-020：C-0019 选 CP 双进程本机启动拓扑：明确 Server data-root/实际 port/sidecar 工件，再让 Electron main/native 以同次命令的 loopback origin 与 token 文件 locator 认证 hello；固定 userData 验项目选择跨重启。不造后台控制器，不用默认端口猜同实例。FC-0035 已统一 `ORDESSA_SERVER_ORIGIN`/`ORDESSA_SERVER_TOKEN_FILE` 两个 host 环境名，F0/F1 分域做正反例，仍须实际运行才可称 ready。

I-021：C-0020 按 SESSION-BASELINE-TARGET.md 裁 FC 最终候选单写装配：从干净精确 SHA 开独立候选分支隔离未接线直连原型与空插件源码，原分支/历史/成果原位保留；build-all 干净 dist/lock 只交付 enabled 及实际承重依赖，负例证明未启用包不混入。FC-0042 ACK；仅在收齐已批包后的装配窗执行，不授权 main merge/push，未完成不得称 CP ready。

I-022：`I-NATIVE-AGENT-001` 用户裁决本阶段后端走 Server/Execution/Harness 插件下的本机原生 Agent，cwd 为所选项目、沿用其配置/native home/权限审批；旧 bwrap/sidecar/SecretStore 投影不再为 CP 前置。C-0024 已撤 C-0021/C-0023 相冲突新工作，旧成果和 BC 未提交草稿原位保留，BC 从干净旧 HEAD 另开原生路径单写树；FC 单 connector 与前端已批行为续作。其时 `I-DEC-0001` 尚待用户答复，后续答复见 I-023。

I-023：`I-DEC-0001` 用户答复取消原 100 次及其他次数上限/计数要求；C-0025 已读答复原件并在 HD-001 唯一 ledger 把旧 99/10/零预留/零 grant 保存为历史、登记现无次数上限政策。任务/模型/权限/凭据边界不变；不再为真实测试构造硬 cap，待原生链及具体 endpoint/model/项目核实后由 C 协调单真实测试流。
