# E — HD-001
建议zcode模型：GLM-5.3
工作目录：/home/maoqh/projects/ordessa/worktrees/harness-desktop-001/e
## 写域
src/agent_box/execution/**及其测试；server/sidecar_backend.py等残留接缝必须BC逐段单写批准
每批批准必须列真实精确路径；以上是职责域，不是修改全目录的无限白名单。
## 首轮及后续任务
研究现有execution生命周期/资源接口与H/S接缝，复用而非重写。只补完成真实闭环必需的执行组装、归属、交互路由与停止错误语义。无品牌分支/无上层UI语义，不接管独立插件资源实现。Work Core默认不改；若真阻塞提交具体反例与最小建议。旧profile迁移任务不继续。
## 状态与回执
只写 /home/maoqh/projects/ordessa/control/missions/HD-001/agents/E/**。先读README列出的所有共同文档。每轮查C和本方中央outbox；TAKEOVER记录HEAD、dirty、现有规则冲突、阶段和下一动作。不读key，研究不需真实调用。
与旧任务冲突时本任务明确授权优先；其余安全边界不变。实施必须收到本轮批准，不因旧批文存在自行实施。任何从零组件有复用记录和批准ID。无批准任务等待原生goal下一轮并如实报告，不自标整体完成。

