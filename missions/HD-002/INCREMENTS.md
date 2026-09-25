# 持续增量入口
**用户验收边界优先：**[CP-SESSION-001](SESSION-CHECKPOINT.md)只收Session主线。下文允许独立增量并行不等于允许混入该检查点；Profile及后续插件不得成为主线前置或改变正在验收的配对版本。
新任务落 BACKLOG.md，必须有：
ID、用户来源、目标/非目标、牵头中央、包目录和唯一owner、基线、依赖契约、复用证据、验收、真实调用需求、是否默认启用。
状态：PROPOSED→DESIGN→APPROVED→IMPLEMENTING→PACKAGE_READY→INTEGRATING→USER_REVIEW。
C不等待上一整批结束；无冲突目录可从最近已验检查点建新树。依赖未实现可做显式fake的包测试，但不宣称产品已可用。
FC/BC可批准范围内实现，新增产品功能需用户批准。Provider/Model当前仅DESIGN，Profile已有隔离授权。
集成需请求列出共享文件、消费者、兼容策略、回归门；默认不启用实验插件。C决定是否发布新产品配对版本。
