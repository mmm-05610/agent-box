# PROVIDER — Provider/model 最简方案研究
用户授权：2026-09-23 新开 Qoder 执行者先研究、整合最简方案。此项定向覆盖旧文档“Provider设计暂停”，不批准产品实施或并入 CP-SESSION-001。
工具 Qoder / Qwen3.8-Flash；generation HD002-PROVIDER-1。
工作目录：/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/provider
写域：本工作目录 reports/**，以及 agents/PROVIDER/**。产品树、用户原生配置、凭据和服务只读/不触碰；不要读取秘密。
必读：COORDINATION.md、SESSION-OWNERSHIP.md、SCOPE.md、BASELINE.md、../../product/provider-model-research-v0.1.md、../../product/profile-blueprint-v0.2.md、decision-queue/README.md。
管理：BC 牵头、FC 协调 UI/注册边界、C 裁跨层事项；向自身 outbox 发件 to BC、cc C/FC。需要用户取舍由 C 入决策队列。用户本次亲自启动；禁止中央另起同身份写者。
先 TAKEOVER：登记任务、目录、实际工具、现有文件、下一步；不扫凭据、不做大范围进程/用户配置盘点。
任务：核查多 Harness 产品及 Harness 原生配置源码，给出最简可扩展插件方案；先研究再定结构，不把前一轮建议当已锁定事实。
交付：reports/research.md（事实矩阵）、reuse-map.md（来源/版本或 SHA/许可/文件/采用方式）、proposal.md（最简结构/字段归属/接口/生命周期/非目标）、acceptance.md（可观测场景与反例）。报告有用即可，不追求页数。
下限：至少 3 个多 Harness 产品/实现，其中至少 2 个读承重源码；至少核对 Codex、Pi、Claude Code 原生机制。优先 CC Switch、Zed、Vibe Kanban；ACP 官方 configOptions 为单独协议来源。无法取得源码要明示缺口，不以搜索摘要代替。
结束研究的条件：配置归属、原生继承、应用时机、兼容边界、复用落点有证据；未知问题列待决。提交 DESIGN_READY，不声称实现完成，不无限扩调查。
未经 I 方案批准不改产品、不新建代理/OAuth/token store、不安装全局工具、不调用真实模型测试、不直调 Codex reviewer。只使用现有研究/检索资源。
每阶段先收件再更新简短 status 与进度 JSON；约 10–15 分钟有实质进度再更新，不用刷文件冒充工作。发布自身拓展进度用 decision_queue.py extension；不写主线 checkpoint/USER-DECISIONS.md/他人状态。
阶段交付不自行扩功能；等待审批可完成现有缺口与反例，全部阻塞则如实待命。平台上限保存恢复点，不造 watcher、不修改二进制、不假称持续运行。
