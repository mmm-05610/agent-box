# P04 — Electron宿主边界与遗留退役

遵守[总方针](../master-plan.md)全部授权、保护区、资源与持续执行纪律。
输入：[产品决定](../../night-work-planning/product-decisions.md)；基线见[状态](../status.md)。

范围：electron/**、preload与窄renderer宿主调用、构建打包/scripts/相关AGENTS及测试。
process/host-capabilities不得依赖legacy-hermes；Electron只启停AgentBox服务基础设施，
Harness/Execution生命周期归后端；WSL发现/目录浏览等已过宿主能力可保留。
本机Harness安装更新在设置；远端连接/选角色按需准备由后端合同提供，不在Electron新造远端调度器。
复用安装实现：LinkCode固定版本BSL不能当MIT复制；新选型须核许可/最小依赖/既有行为测试。
模型复用按调查文档：CC Switch映射逻辑归接入边界，不将专属React hook硬搬进通用UI，
不得把其全局auth/config写盘带入产品。后端归属的源码抽取只写交接建议，本队列不跨仓落代码。
服务合同未到：可完成启动与服务Unavailable、退出回收、窄IPC及禁回落，不发明spawn参数/控制帧。
逐个退役Hermes-only默认引导、配置发现、gateway/profile pool调用；删前查剩余消费者。
通用git/文件/终端/窗口不要误删，版权、历史数据迁移键和用户已有安装不要动。
移除mock/动态import/构建资源等悬空引用；测试改用新行为而非删覆盖；AGENTS与README事实更新。
验收：无Harness/无凭据也能正常打开并操作离线功能；服务不可用错误明确；优雅退出及零本轮残留。
Windows本地构建、启动/退出截图与日志；不在UNC大型构建。等待服务的子项不挡其余清理。

阶段终态：P04_GREEN 或 P04_PARTIAL。
PARTIAL必须拆出等待子项与下一可做项，不默认终止整个goal。
