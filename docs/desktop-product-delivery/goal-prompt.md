# 新会话启动提示词

启动时将本次文档发布提交号一并交给执行者；若已导入则不重复cherry-pick。

```text
/goal 接管并持续交付我们已经批准的“简洁 AgentBox Desktop”。

先完整读取 /home/maoqh/projects/agent-box-desktop-next/docs/desktop-product-delivery/master-plan.md，
再读同目录status.md、manifest.json、contracts/index.md与work-orders/P00-handoff.md。
以这些文档和其引用的产品决定为完整需求，不要求我复述聊天历史。

执行目录为 /home/maoqh/projects/agent-box-desktop-next-wsl-round1。
确认旧Desktop执行者已停止写入后，从39291df建立或恢复feature/agentbox-desktop-product，
保留旧分支；导入随提示词提供的文档发布提交。不要在main施工，不另装一套依赖。

按P00–P06推进：36R返修→上层产品→用例/状态/API→Electron和遗留退役→正式合同接入→真实验收。
每阶段建立提交检查点后直接继续，不逐单等批准。内部拆分、范围内修复、测试安排和子任务协调自行负责。
每阶段边界重新读取发布源的新增工单与合同；正式合同一旦批准，增量纳入当前goal，不重开任务。
一项缺合同/服务时标记该项等待并继续所有安全独立工作，不因一项缺口停掉整条队列。

复用现有UI与已审第三方实现，禁止另写预览产品、在Renderer实现ACP、以Hermes回落维持假成功。
不修改后端，不读取真实凭据，不擅自运行付费模型；正式联调需要新授权时明确登记，先完成无模型部分。
遵守总方针的保护路径、单Windows构建槽、定向验证、真实Electron证据和子代理资源上限。
不得降低测试阈值、删测试凑绿、自动合main或push。

仅在全部真实完成，或所有安全独立任务耗尽且确实需要外部决定/授权时交回。
等待项不能冒充完成；终态分别报告UI_READY、CONTRACT_CONNECTED、REAL_FLOW_VERIFIED。
最终提供分阶段目录树、检查点、功能验收矩阵、真实Windows体验命令和剩余阻断。
```
