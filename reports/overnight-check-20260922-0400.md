# Ordessa 一次性夜间巡检 — 2026-09-22 04:00 Asia/Shanghai

触发：2026-09-21T20:00:05.269Z，即上海时间 04:00:05。检查窗口约 04:00–04:04。
巡检者：本次 Codex 定时任务；不是中央 C，不接管方案审批或集成。

## 结论

未发现足以认定为意外退出、重复实例或明确调用空转的证据，未恢复、暂停或重启任何会话。中央在巡检期间继续发布批准件和 inbox 通知；四组原生 goal 落盘均为 active，前端有正在执行的 R003 角色调用。状态页存在滞后，不能把滞后等同于会话卡死。

本次唯一持久写入为本报告。未修改产品代码、审批、契约、目标、预算或原生任务状态；未合并、推送、回滚、清理工作树、启停产品服务、调用 Sol、替换模型或安装工具。未读凭据、环境变量、真实用户数据、完整进程参数或终端原始输出，未截图。

## 规则与核验方式

先读 `control/backend-loop/GOAL-START.md`、中央 `control/reports/BE-LOOP-001/goal/current-state.md` 和 `control/design-loop/RUNBOOK.md`，再核对项目 AGENTS 与 control README。以 D-0029 原生五会话及前端原生 loop 为准；旧 STATUS-PAUSED、旧控制器与旧编队不作为恢复入口。

检查非秘密控制报告、outbox/inbox/acks、预算账本、goal 元数据及前端阶段 meta/log。Git 仅用 `--no-optional-locks` 读取 HEAD 与 tracked 状态；没有重跑产品测试，以下测试成绩均为中央/执行者已有证据，不冒充本次亲跑。

普通执行环境的 ps 只见容器内 codex/ps，不能代表宿主。经单次只读提权检查宿主进程名、PID/PPID、状态、TTY、运行时间及 Qoder cwd；未读取 argv/environ。该只读检查成功，不代表获得其他会话审批权限。

## 会话与产物

| 对象 | 进程/原生状态 | 产物与判断 |
|---|---|---|
| 前端 | 根目录存在 Qoder 进程链；另有设计目录角色进程 1131583，其父链回到 164124 | R002 review.meta=ok（03:47），R003 plan.meta=ok（03:57），03:58 已装配 designer 材料且角色子进程存活。R003 designer 输出当时为空，仅属在途，不能据此判死。 |
| C | 根目录另一 Qoder 进程链 570973→571049；唯一根目录 goal 文件状态 active，turnsUsed=43/1000000 | 03:58 中央摘要；巡检中新增 `approvals/S-block1-perpath-approved.md`（20:01Z），04:02 向 S/E 写 inbox。足以证明中央正在协调，不需替代或恢复。 |
| S | 790902→791001；goal active，78/1000000 | HEAD b067c57，tracked clean；t16/msg.server.15 逐路径申请后，中央已发布批准及 `C-notice-S-block1-approved.md`。本次不重复派单。 |
| E | 791182→791269；goal active，19/1000000 | HEAD 400577a，tracked clean；INC1a 已有中央验收记录，E-013/014/015 为后续提案。04:02 中央新增 `C-notice-E-block1-leg.md`，保持 S/E 同批约束。 |
| H | 791475→791566；goal active，turnsUsed=0、updatedAt 仍为启动时 | 实际 HEAD 已为 f896fe8，tracked clean；状态页 COMMIT_SUBMITTED。中央摘要仍写未提交，已与现盘冲突；不是无活动证据。原生计数与实际工作不一致，不修改计数或据此重启。 |
| P | 791742→791830；goal active，10/1000000 | HEAD 2fa8b5a，tracked clean；P-T1–T4 已由 C 验收。msg.platform.11 为 ACK/待派，暂无已批下一产品增量，等待合理。 |

四组各一条 launcher→runtime 链，不把父子进程算成重复会话。根目录两条交互链与前端/C 两项活动相符；进程名/cwd 不足以证明每条链的全部内存状态。P 的既有定时任务 3481576e 绑定会话 6eda401b-00eb-46a9-8315-0973c2365105 与 PID 791742，未改动。

五份 goal 元数据中 creditsUsed 均为 0；这是文件原值，不等同于真实调用免费或额度未消耗。未重置任何字段。前端采用 dynamic ScheduleWakeup，根目录 scheduled_tasks.json 为空不能证明循环停止；其内存中下一次唤醒不能由本次落盘检查确认。

## 消息、审批与阻塞

- 中央正在响应新消息：S t16 后已有逐路径批准，并向 S/E 镜像通知。没有重复催办或绕过中央向四组发新工作。
- acks 目录四份文件时间早于部分新消息，但 checkpoint/decision/inbox 已承载后续响应；不能把每个无独立 ACK 条目的消息都算丢失。E 后续命名轮、INC1b/INC2 草案与 P 待派请求属于中央队列，不属本次可代批事项。
- H 状态页声明已发 goal-H-008，但两次目录检查仍仅见 goal-H-001…007；这是一项消息落盘一致性待核实问题，可能处于写入过程中。H 提交已实际存在，不重复要求提交，也不冒充 C ACK。
- 中央摘要仍保留“Sol 第四次在途”“H 未提交”等旧措辞；新批文已引用候选 ac28ad5，旧摘要末尾仍为 24f4679。本次保留两种记录，提示状态同步，未改写中央事实源，也未以时间戳直接裁定候选验收完成。
- IFR-01（秘密/留存策略）与 IFR-06（Harness 复用、许可、公开 Wire）仍挂 I；本次不读取秘密、不替用户批准。P 的 D17、ssh 排期、公共动词，E 后续范围，H 后续增量继续按中央门办理。
- H 先前缺 pytest 的门已有中央代跑记录，不安装工具。未发现控制报告中可直接安全处理的待批准具体命令。

## 重复失败与 review 预算

前端 R002 review 存在多次格式拒绝：非法 verdict、角色越权判 CE、字数不足、缺 BOUNDARY_SCAN/ESCAPE_HATCH_SCAN。最终 review.meta 为 ok，随后进入 R003 plan 并通过；不同尝试有不同输出，当前已有实质推进，不能定为明确重复空转。未暂停。仍需前端维护者关注重试保护及摘要刷新：state.env 仍显示 R002/review，而 R003 已有 plan 产物。

前端 summary 的确定性结论为未收敛：独立覆盖 7/12、缺归属 1、open major CE 1、clean streak 1/3。Sol 账本 cap=10、reserved=0、ok=0、bad=0，日志只有表头，剩余 10（含最终保留 2），自动派发 off。未把普通 Qoder 独立上下文算作 Sol。

后端 budget.json：total=10，used=4，group_used E=4，其余=0；四个唯一请求全部 counted，history used_after 连续 1…4，无账本内重复请求再扣证据。剩余总数 6，其中 E-impl-accept 具名保留 1、机动 5；H 上限 3、已用 0。所有记录模型为 gpt-5.6-sol。没有重置/增额证据，但未做全宿主调用历史审计，不能宣称已排除一切账外调用。

两次 design-final 与两次 impl-accept 均有真实审阅记录。impl 请求 milestone 写为 `E-impl-accept`，具名保留的 milestone 为 `impl-accept`，因此两次实施审阅从 flexible 扣，具名保留仍在；这是账目命名/保留状态不一致，实际四次均计入总数，不直接认定预算绕过。本次不修账。

中央记录第二次 impl 审阅仍为 REJECT-on-packaging，后由 C 亲跑红绿证据关闭打包/并发钉缺口并免第三次 Sol。本次只报告已有裁定，不重新签发验收，不把它改述为 Sol 对最终候选 ACCEPT，也不批准豁免任何后续 E 必需审阅。

## 干预记录与能力限制

恢复/提醒/暂停/审批次数均为 0：已有进程、阶段产物和中央实时通知，不满足恢复条件；新批文已镜像，重复提醒收益不足。未遇“恢复失败再试”的情形。

检查前：宿主进程不可见于普通 sandbox ps。
依据：用户授权检查进程且禁止秘密内容。
动作：单次只读提权读取宿主进程元数据，再按 Qoder cwd/父子链核对。
检查后：确认四组进程各一条链及根目录两链、前端一个角色子调用；未发送信号或终端输入。

本次可读文件、写报告和检查宿主进程；没有已核实可安全操作这些 Qoder 原生会话的单次权限批准、/goal pause/resume、ScheduleWakeup 状态查询或会话输入接口。Codex 的任务工具不能据 Qoder session UUID 直接操作 Qoder。本次未抓取无法预先排除秘密内容的终端屏幕或完整会话日志，因此原生权限弹窗是否积压、内存中 loop 下一唤醒、实时用户主动暂停意图没有直接验证。不能把“无已见阻塞”写成“无权限阻塞”。

建议后续仍由现有 C 同步 H 提交与 outbox、补齐必要 ACK、更新摘要和 review 保留口径；本报告不是新方案批准或任务派发。一次巡检到此结束，不创建后续调度。
