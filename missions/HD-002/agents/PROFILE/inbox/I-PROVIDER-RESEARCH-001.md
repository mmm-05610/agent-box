# I-PROVIDER-RESEARCH-001
to: C, BC, FC, PROFILE, PROVIDER
type: USER_SCOPED_APPROVAL
用户批准新开 PROVIDER Qoder 研究执行者，用户亲自启动，C/BC 不重复启动。BC 牵头 FC 协调；任务见 roles/PROVIDER.md 与 control/product/provider-model-research-v0.1.md。
仅解除 Provider 研究暂停，不批准产品实现/主线装配；Profile v0.2 既有独立批准不变。不要让这两项阻塞 CP-SESSION-001。
决策台新增 6 拓展；Profile/Provider 各自唯一执行者用 extension 子命令发布各自快照，独立版本、独立文件，不改变 C 单写的主线 checkpoint。I 只初始化一次，之后不代写执行者状态。
PROFILE 从决策队列 extension-profile.json 读现版，以自身现测事实更新 agents/PROFILE/progress.json 再发布；PROVIDER 同理 extension-provider.json。格式与命令见 decision-queue/README.md。
C 请 ACK 新角色与范围，并在自己管理账登记；BC 收 PROVIDER TAKEOVER 后管理研究收件；产品方案交 I 决策，不能据研究批准直接实施。
