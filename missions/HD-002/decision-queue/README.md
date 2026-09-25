# 用户审批队列

## 拓展进度（6 拓展）

新增第 6 页：Profile / Provider 各自最新状态，独立于 CP-SESSION-001，不参与主线就绪判定，不增加待答项。旧 watch 须 quit 后重新启动一次。输入 `6` 加回车查看，PgUp/PgDn 翻页。

拓展各自执行者是各自快照唯一常规发布者；C只读取，不代写。I初始化一次。使用顶层字段 id（仅 profile/provider）、revision（该拓展独立递增）、status（IN_PROGRESS/BLOCKED/READY_FOR_USER_REVIEW）、summary/next/evidence/try_it，以及 modules（与主线详细模块字段一致，不使用 sections）。示例见 `../agents/I/extension-provider-initial.json`。先回读 `extension-<id>.json` 版本，更新自身 `agents/<ROLE>/progress.json` 后：

```bash
python3 /home/maoqh/projects/ordessa/control/tools/decision_queue.py extension /home/maoqh/projects/ordessa/control/missions/HD-002/agents/PROVIDER/progress.json
```

PROFILE 同理。每阶段变化和有实质进展时更新，未核事实不刷新 observed_at；未启动不写成执行中。研究待审不等于插件可用，summary明确所处阶段。不得直接编辑生成页或快照。独立版本避免主线 C 发布覆盖拓展状态；工具只展示已上报事实，不唤醒执行者。

## 分层进度台（当前版本）

用户开watch后输入数字加回车切页：1总览、2前端、3后端、4整机验收、5审批。PgUp/PgDn翻页。前后端各自有整体检查点、卡点和下一步，下方以独立模块卡片展示负责人、结论、已完成、正在做、下一步、阻塞、核实时间与证据。总览只摘要；USER-DECISIONS.md保留全部模块详情。退出旧终端重开后生效。

C以后使用分层JSON，格式参考 `../agents/I/checkpoint-hierarchical.json`，不要沿用下面旧平铺示例发布。顶层仍保留id/revision/status/summary/next/evidence/try_it，modules改为sections，恰含frontend/backend/integration。每个section字段：id/name/status/summary/next/blockers/evidence/observed_at/modules。每module字段：name/owner/status/summary/done/doing/next/blockers/evidence/observed_at；非空文字，无事项明确写“无/待命”，时间ISO8601含时区。底层模块名称全局唯一。工具自动生成平铺兼容字段，不必自己维护两份。

阶段状态可用IN_PROGRESS/BLOCKED/NOT_STARTED/DONE/READY_FOR_USER_REVIEW，模块仍用DONE/IN_PROGRESS/BLOCKED/NOT_STARTED。上层完成需所有子模块完成；整体可验收还需全部阶段完成且实际启动入口。不要为了过门减少还没完成的模块。

**更新约定：**主线活跃期间C每2—3分钟核FC/BC并发布；交付/合并/阻塞变化/就绪在下一收件点更新，目标1分钟内。不是硬实时承诺，不另建agent轮询器。源事实未核实就保留observed_at，超过5分钟终端明确警告；重新生成文档不算核实模块。暂停/长命令造成延迟如实显示。每次原子替换最新状态，不累计checkpoint列表。旧报告保留证据。

统一阅读入口：../USER-DECISIONS.md。该文档由工具生成，禁止C直接编辑。用户通过终端答复，文档每项有专门“用户回答”区；不要手改生成文档，否则会被重新生成覆盖。

## 用户启动

```bash
python3 /home/maoqh/projects/ordessa/control/tools/decision_queue.py watch
```

自动刷新、累计保留。`show ID` 看详情，PgUp/PgDn翻页，`list`回列表。
`answer ID 你的回答` 后输入 `y` 确认提交。可再次回答同ID补充/修订，历史不覆盖，以最后一条为准。
`quit` 或 Ctrl-C 退出；队列保存在磁盘，下次打开继续。没有请求时等待，不调用模型、不执行产品代码。
多行答复可写入自己的文本文件，再运行 `decision_queue.py answer ID --file /实际路径/答复.txt`。

## C仅可提交请求、读取答复

## 最新阶段检查点（非审批项）

终端总览和USER-DECISIONS.md顶部显示同一个最新检查点，更新覆盖展示，不累计列表、不增加待答数。`checkpoint`或`list`回总览。旧版正在运行的终端需quit后重开一次才能显示新面板。
C为唯一常规发布者，在自身目录准备JSON，运行：

```bash
python3 /home/maoqh/projects/ordessa/control/tools/decision_queue.py checkpoint /实际路径/阶段状态.json
```

格式：

```json
{
  "id": "CP-SESSION-001",
  "revision": 2,
  "status": "IN_PROGRESS",
  "summary": "会话界面已集成，正在打通原生后端执行与connector。",
  "modules": [
    {"name": "会话与对话UI", "status": "DONE", "summary": "首发草稿、项目选择、对话内审批已合并并通过界面测试。"},
    {"name": "后端connector", "status": "IN_PROGRESS", "summary": "适配器已编写，尚未交付并接入整机。"},
    {"name": "原生后端", "status": "IN_PROGRESS", "summary": "正在实现所选项目下直接启动Agent的路径。"},
    {"name": "整机验收", "status": "NOT_STARTED", "summary": "尚未取得前后端配对真实闭环证据。"}
  ],
  "next": "合入connector与原生后端后跑真实闭环。",
  "evidence": "对应交付报告路径；SHA可附在证据而非替代进展描述",
  "try_it": ""
}
```

此示例仅为格式，不可不核现场就提交。revision是全局递增的面板版本（换阶段ID也递增），先读checkpoint-latest.json取当前值；同版同内容幂等，过期更新拒绝。
阶段状态：IN_PROGRESS/BLOCKED/READY_FOR_USER_REVIEW；模块：NOT_STARTED/IN_PROGRESS/BLOCKED/DONE。模块summary必须一句话讲行为/结果/缺口，不准只填commit。
大阶段提交验收必须发布READY_FOR_USER_REVIEW，所有纳入模块DONE且try_it给实际启动/验收入口；不是用户已验收的声明。阶段内实质变化及时覆盖更新，不制造审批请求来代替进度。
发布是中央报告，不是工具代验收；工具校验字段一致性，不能自动证明测试真假。历史证据留原报告，面板只留最新快照。异常显式显示、不冒充就绪。

## 决策请求格式

C把JSON草稿放自己的 `agents/C/decision-drafts/<唯一ID>.json`，字段如下（全为非空字符串）：

```json
{
  "id": "C-DEC-0001",
  "title": "简短标题",
  "question": "需要用户决定的具体问题",
  "recommendation": "建议选项与原因",
  "alternatives": "其他选项与取舍；无合理替代须说明",
  "impact": "影响范围、成本、是否阻塞以及可继续的工作",
  "evidence": "源码、报告、开源参考路径；不含秘密"
}
```

```bash
python3 /home/maoqh/projects/ordessa/control/tools/decision_queue.py submit /实际路径/请求.json
```

submit立即刷新总文档，即便用户终端未开。重复同ID同内容幂等；不同内容拒绝覆盖。新方案使用新ID并引用旧请求。
请求原件在requests/，用户答复在answers/；提交后的请求不改、不删，回答携带请求摘要防止换题复用批准。不要手写这些文件。
C在每轮收件读answers/或总文档，收到后在自己的outbox ACK答复文件名/请求ID/采取动作。C自己维护已消费答复标识，必须识别新修订，不能只记“该ID处理过”。答复不等于已执行完毕。
执行者仍向所属中央上报，由C筛选确需用户决定的事项入队；普通技术决定不堆给用户。

## 边界

本工具是用户明确要求的人工审批终端，不是代理watcher/控制器，不启动或唤醒agent，不自动执行用户意见。
C/其他agent不得调用answer、代写用户答复、修改生成文件；只有用户或用户明确委托转录的I能写答复。同一OS账号下这是协作权限约束，不是物理安全隔离。
工具文件锁保证协作进程并发写入，原子发布避免半文件；不是防恶意同账号篡改机制。不输入凭据。
# 自动交互看板（2026-09-23）

当前默认页已升级为持续工作项：已到/卡点/当前/下一步/等待谁。
固定ID与负责人见 `../WORK-ITEMS.json`，正常回执格式见 `../WORK-STATUS.md`。
点击工作项展开完成条件、证据与修订历史。普通消息仍在“动态”页；
没有结构化更新时保留有来源的旧状态并提示较新交互，不用消息标题冒充最新工作状态。
同修订冲突或格式错误显式显示，不自动认定收口。

交互更新：默认只显示短卡片，报告正文进入详情后展示。可用鼠标点击顶部栏目、模块卡片、
底部“上一页/下一页/返回”；滚轮每次滚动3行。Esc 返回上一层；PgUp/PgDn、上下键仍可用。
需要重新打开旧的看板进程才能加载新版。鼠标支持取决于终端的 xterm/curses 鼠标协议；
按住 Shift 通常可使用终端自身的文本选择。时间始终只表示记录更新时间。

使用原命令 `python3 control/tools/decision_queue.py watch`；已开的旧进程需退出重开一次。
1 总览、2 前端、3 后端、4 验收、5 审批、6 拓展、7 问题线索、8 交互时间线。
`open agents/BC/outbox/BC-0082.md` 打开原件全文；PgUp/PgDn 翻页。
`show ID` / `answer ID 意见` 保持原有行为。

工具每2秒检查普通 status/outbox，内容按文件签名缓存；不读取凭据、产品日志或进程环境，
不调用模型、不调度执行者。无需再专门发布进度。下面历史 checkpoint/extension 命令仅兼容保留。
文件更新时间不是核实时间，也不证明会话仍运行。新回执与旧状态并列，不擅自解决冲突。
问题页是有来源的文本线索（含历史问题），不是自动维护的已确认活动问题账；
决策引用不是执行确认，必须查看回执原文。阶段验收仍由中央明确提交，用户决定可用性。
非交互查看：`python3 control/tools/decision_queue.py view backend`（也支持 issues/activity/decisions）。
