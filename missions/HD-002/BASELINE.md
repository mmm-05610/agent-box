# 真实交接快照（本轮核对，不使用旧看板日期推断）
用户确认全部旧会话关闭。旧HD-001九个产品工作树均实测clean。新树是精确提交新分支，无自动合并。
|角色|新树路径（相对/home/maoqh/projects/ordessa/worktrees/harness-desktop-002）|HEAD|判断|
|---|---|---|---|
|FC/F0/F2|fc / f0 / f2|16398e7cec6a2f7aa816ebc4ce5a1e63c01553a5|FE-PREP已集成，非停在step2|
|F1|f1|ce7919304deb987285cd9c84b1ebf0f1215d11f8|连接workspace/statusbar已交付，尚未入FC；后端connector不可凭此声称完成|
|F3|f3|fb87a2929d56b6a10121f1aed468cf3d15070104|会话范围过滤/model隐藏+测试已交付；右栏撤除等未完成|
|BC/S/H/E|bc / s / h / e|60d868ef258e4044a03c8650312431e5b57a48ab|Pi/Codex离线启动装配已合，真实对话未验证|
|PROFILE FE|profile/frontend|16398e7cec6a2f7aa816ebc4ce5a1e63c01553a5|独立插件起点，无产品接线|
|PROFILE BE|profile/backend|60d868ef258e4044a03c8650312431e5b57a48ab|独立插件起点，无旧数据迁移|
分支均work/hd002-<role>，Profile分别work/hd002-profile-frontend/backend。
F1/F3均含FE baseline0祖先，保留原始提交以供FC集成，不要求先重写。

## 必读交付
- ../HD-001/agents/FC/outbox/FC-0019.md：迁移集成回执，报告60 tests与桌面门通过。
- ../HD-001/agents/F1/outbox/F1-0015.md、F1-0016.md：P2-1完成交接，新增connections workspace/stoppable契约需收编。
- ../HD-001/agents/F3/outbox/F3-0041.md、F3-0042.md：部分P2-2交付、真实待办、合并行为耦合核对；不是整个界面完成。
- ../HD-001/agents/F2/reports/：P2-3方案沿用，迁移坐标已就绪，不重新整轮调研。
- ../HD-001/agents/BC/outbox/BC-0021.md、BC-0022.md、agents/H/reports/：后端离线门与真实测试计数准备。
- ../HD-001/agents/{F0,F1,F2,F3,S,H,E}/reports/reuse.md：已有复用研究优先重用，不为凑下限重复查。
旧task-board/checkpoint滞后，不能依据其“F0步2”重做迁移。报告中有未来日期笔误，按消息引用链+Git提交核实，不以文本时间为唯一顺序。

## 待修的组织性问题
1. 先合F1/F3，不再让全队重新等待已完成迁移。
2. build会改extensions.lock.json；FC负责最终装配工件，不让执行者被机械生成差量卡死；F0可提最小可复现方案，不用每批重新请示。
3. 右栏审批不是产品必须位置；保留可扩展区域，审批放对话体验内按参考方案完善，不为了现有烟测常量保留错误产品行为。更新应用测试由FC批准F0/F3协作。
4. 根门20失败为既有报告口径，不写“全绿”；复核具体失败ID且不将离线通过写成真实模型通过。

