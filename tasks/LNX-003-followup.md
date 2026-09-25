# LNX-003 — Qoder 有限补查

签发 I，2026-09-21；执行者：原 LNX-001 Qoder。状态 ISSUED，待接收。
先读 control/LNX-001-review.md。保留 LNX-001 原报告，只写
control/reports/LNX-003/，产品与候选树均只读，不测试、不安装、不调用模型或凭证。
不使用旧调度 skill，不调度其他执行者。

按优先级输出三个短报告，每完成一个就落盘，供集成执行者读取：

1. media.md：对比两种媒体路径，追踪鉴权 token 从哪里来、URL/目标/重定向约束、
   Electron 协议注册权限、blob/请求资源释放、错误与取消行为。建议哪个方案，
   必须保留哪些对照测试；不能仅用旧裁定代替代码判断。
2. configuration.md：补齐 settings 配置保存→IPC/HTTP→后端→存储→重启读取链，
   区分身份登记、秘密录入、secret store 与 profile freeze；列 Linux 缺口和测试。
3. corrections.md：针对 I 审阅列出的限定补证：main #66/#67 和桌面 main 的
   同路径内容差异（非仅文件存在性）；stop reason 生产侧跨 Python/TS/Rust
   的字段与消息流；分支数统计范围。历史服务/构建事实标明来源，禁止当当前实测。

不再全库考古。每个结论附完整 SHA + 路径/行号，明确未验证项。
写 status.md，结束时写 READY_FOR_I_REVIEW 或 PARTIAL，并给最多五条发现。
本任务不决定 schema/媒体/数据迁移政策，I 审阅记录为当前执行指导。
