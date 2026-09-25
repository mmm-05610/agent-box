# C — HD-002 中央当前状态

phase: CP-SESSION-001；桌面非敏感文本两轮已交用户体验验收，完整基线仍为 REVIEW
owner_generation: HD002-1 C；HD002-2 复用原 `/root/fc`、`/root/bc`，无重复角色
source_directory: `/home/maoqh/projects/ordessa/control/missions/HD-002/coordinator`
ownership: 独立 FC/BC 由用户确认关闭、无前任亲写回执；`handover/site-reconstruction-c.md` 是 C 现场重建。原下层 Qoder 会话保留，只经文件协调；PROFILE 用户原会话不动
heads: FE `fc-functional` clean `59856bf20f`；BE `bc-native` clean `567e6e2a`；旧 FC/BC 树及其成果原位保留，main 未 merge/push
done: FC-0102 + BC-0095 第三轮全新根真实 Electron→Server→Go 桥→Pi 两轮 PASS：UI 首发打开 SESSION、显示首条回复、同 SESSION 续发显示第二条回复；Server 入站 createAndSend=1/send=1、DB 1 session/2 completed turns、DONE PASS/sendCount2、约5秒 exit0、进程/锁/端口清理。前两轮 FAIL 保留
fixes: FE WebSocket 构造误调用已修；Server 缺 WebSocket 实现库的产品 server extra 已声明 `wsproto>=1.2,<2`，本批隔离 overlay 1.3.2 握手有效会话101/无认证和未知403；业务 connector loopback origin 与 redirect:error 保持
remaining: 正常工具审批同意/拒绝/取消、停止/断连、跨重启历史恢复未实测。Go gate 漏 powershell/自定义工具且后置用户扩展可改获批输入，见 BC-0087/C-0092；不以无工具文本两轮冒领完整 CP
next: 用户可验桌面两轮；后续逐项定向验证剩余能力，先裁正常权限接缝。Profile/Provider 独立于当前 Session 基线
budget: 仅 HD-001 唯一 ledger；原历史与当前无次数上限政策保留，未建副本
deadline: 用户给 17:12 硬截止；C-0101 已在截止前收束，本批不再启动新实机/模型测试
goal: active；用户未叫停不主动结束整体 goal，平台限制如实报
