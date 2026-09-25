# F0
phase: F0 gen3 按用户指令暂停收束(F0-0013 STATUS 已发 FC/cc 全队):FE-PREP-001 全链闭环(F0-0010→FC-0019 RECEIPT 零漂移→C-0053/54 baseline 登记);在途 6 项挂账见 F0-0013 §2 移交清单(核心候:C 甲/乙裁→F0 应用半边专批、FC-0013 §6 夹具批、FE-RENAME 裁决、baseline1 集成条款含 lock 规则);恢复按 next 字段接续
mission: HD-001
head: b3d8492b48def1825f525b9585ee5031cb57311f
branch: work/hd001-f0
dirty: false
approved_paths: FE-PREP-001(FC-0012+A1/A2/A3)已执行并交付(F0-0010);现无在途实施批文,写域限 agents/F0/**
current_action: 低频待命收件（原生 goal 轮询 C/FC outbox）
dependency_messages: 已收并处理 C-0001..C-0052、FC-0001..FC-0018、F3-0039、BC-0023/0024（后五件 F0 仅 cc,无需回件）；已 ACK：C-0001(F0-0001)、C-0004/C-0011(F0-0004/F0-0006)、FC-0002(F0-0005)、C-0016/C-0017/FC-0011/FC-0012(F0-0007)、接管登记(F0-0009,C-0051 §6 已确认)、交棒更名答复(F0-0010 §六)；持续运行规则(F0-0003)
next: 候三项:①C 对 F3-0040/F0-0011 的甲乙案裁决(乙案则第4点+探针两行入 F0 应用半边专批);②FC-0013 §6 app-gate 夹具批文;③FE-RENAME 微批候 C/用户裁决(FC-0019 已转呈)。无新批文保持待命,不扩功能不造任务不发空转报告(C-0051 §边界)
deliverables: agents/F0/reports/{reuse.md, build-scheme.md, fe-prep-research.md}；outbox F0-0001..F0-0012；证据 /tmp/hd001-f0-baseline/(基线快照+门日志+residual-final.txt=RESIDUAL=NONE)
stop_writing: false
wake_mechanism: VERIFIED(上限生效) — Qoder 原生 goal 轮询收件;实测 2026-09-23 00:53: goal 提醒按 turn 计数(3/100,余 97),平台明示 100 turn 自动暂停且仅用户 /goal resume 可续——原生 turn 上限实际生效,非文字承诺。被动唤醒机制本身仍未单独验证;用户指示不追改上限,靠不主动终止 goal 持续。

## 持续运行规则（用户 2026-09-23 指令，已 ACK=F0-0003；中央已记 HD-001-C-003）
- 用户明确停止前不主动完成/关闭/取消 goal；阶段交付≠整体完成。
- 无任务/等依赖时低频待命：原生 goal 轮询收 C/FC 消息；不扩功能、不造任务、不重复跑测试、不耗测试预算。
- 有授权任务即推进；局部阻塞同步证据并推进其他已授权工作。
- 不自建控制器/守护进程维持运行。
- 若工具不支持持续等待/额度耗尽/会话被终止：在此如实记录恢复点与限制，不假称仍在运行。当前恢复点=本文件 next/deliverables 字段+agents/F0/outbox/F0-0007.md。
- 用户 2026-09-23 补充指令：turn 上限不必处理，少主动终止 goal 即可。
- 用户明确停止指令优先。

## 备注
- 工具变更（本会话）：F0 由 zcode 会话接替为 Qoder CLI，经用户指令，按 F3-0002 先例以 F0-0007 TAKEOVER 核对登记；gen 保持 1。HD-001-C-004 中"F0 未报变更仍 zcode"记录已过时，候 C 按 C-007 编队更新登记。
- 前任 ZCode 会话最后写入 00:29（F0-0006/status.md），接管前实测树 clean、无并写证据；本会话为 agents/F0/ 唯一在写者。

updated: 2026-09-23 08:51 +0800
