# P07 — 核心合同编制、客户端推进与持续状态交接

基线：用户报告前端goal已施工，本单不重审其当前代码；现有发布源core合同此前为空。
目标：已批准语义立即变成可执行客户端设计，不等后端实现；状态与双端交接可审计。
遵守[总方针](../master-plan.md)、[核心语义v1](../contracts/core-semantics-v1.md)、
[交接规则](../handoff-policy.md)。本单是现有goal增量，不开新goal。

```text
之前
├── contracts/index.md       ⚠ 全部等待合同，批准决定尚未汇总
└── status.md                ⚠ 阶段记录缺少明确最终核对与写权交接
之后
├── contracts/               ◀ core语义权威 + 单一wire候选/schema/正反用例
├── src/types/ api/          ◀ 消费合同；不导入上层或原生Harness协议
├── application/ features/  ◀ 实现已批准行为；缺服务不假成功
└── status.md + evidence/    ◀ 每阶段事实与最终交接检查
```

## 范围与调度

P00接管后，下一个小检查点即开始P07，不等P06；与P02–P05共享写集，主代理串行集成。
可改本工作树contracts/status/evidence、src/types/api、必要application调用方、合同测试和宿主客户端。
延续全部保护路径；后端仓只读。不要将发布源status整份复制覆盖自己已有进度。

## 阶段检查点

1. 合入已批准语义，逐条映射现有实施范围和缺口；更新status，包括最新代码检查点和文档消费版本。
2. 在contracts/wire-v1/编制单一候选：优先仓库已有schema/验证库，定义请求响应、
   事件、错误、幂等作用域、分页/游标、版本冲突、能力降级、审批有效性及认证引导。
   标PROPOSED_WIRE；不要同时维护手写TS/Python/JSON三套权威，能生成的客户端类型由schema生成。
   HTTP编码等机械选择可自行提出；安全/业务未决列具体差异，不借“技术细节”扩大授权。
   后端从39即接受或提出局部更正；按index读取后端wire-review.md并回应摘要，
   不等后端独立READY才交流，不重做整套协议研究，不另等用户批准机械编码。
3. 按schema写正反fixture与可执行验证；完成隔离合同服务/客户端测试。
   按核心v1 §9覆盖用户行为，包括接受后失败、未知结果、队列暂停、审批竞争、快照衔接。
   生产缺服务返回真实Unavailable；不把测试服务接成正式后端，也不恢复Hermes回落。
4. 继续P02–P05所有独立部分；双方wire锁定后消费固定摘要。前端完成时按handoff-policy
   提供实施READY或精确PARTIAL，释放写权供后续全栈接管。每阶段及goal结束前核对status。

## 验证

使用现有schema验证工具检验正反fixture；客户端请求/事件用真实序列化往返测试，不能只断言源码文本。
改动面行为测试与Desktop相关typecheck、lint、git diff --check；本单不要求每个子段全量9600项。
新wire覆盖能力与已批准语义逐项对照；合并来源文件时保持许可证及脱敏规则。
不要求真实模型调用，不碰真实凭据，不提前做前后端全栈联调。

## 局部阻断与终态

新产品/权限决定、被保护文件、写入冲突只冻结相应面并报告，继续其余安全任务。
所有工作耗尽仍待另一端核对时HANDOFF_CANDIDATE，不能伪称实际客户端接通。
本单终态P07_GREEN/P07_PARTIAL；P07_GREEN表示合同编制/本端接入与交接纪律完成，
不是后端已实现，更不是FULLSTACK_CORE_GREEN。
