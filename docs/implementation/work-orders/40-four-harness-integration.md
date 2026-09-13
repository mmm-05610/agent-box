# Work Order 40 — 四 Harness 复用接入尝试

状态：QUEUED，依赖39中立接口可用。2026-09-14用户批准尝试 Codex、Hermes、Pi、OpenCode。
本单解除38的“只研究、不接生产”限制，允许下述固定源码复用和窄补丁，**不授权模型请求或读取真实凭据**。
目标是四家独立完成真实协议组件接入，不承诺今夜全部真实模型 GREEN。

## 复用裁决与边界

采用38有条件首选作为实施候选：harness-remote v3.0.2，固定
`21ce6db49af708c4c7c3f96ef6a50f62dced8dab`。允许有许可证/文件哈希/变更记录的源码快照、
离线可重复依赖锁，以及[boundary.md](../../server-round1/harness-selection/boundary.md)
所列异步权限解析窄补丁和机械工厂导出；通过门后纳入生产，不要求重新广筛生态。
许可与依赖锁无法满足则该候选不能发布，不得“参考后重写”。

```text
server/bootstrap/                    仅选择扩展实现
extensions/                         中立能力契约，不认识四家协议
plugins/agent-box-harnesses/
├── third_party/harness_remote/      ◀ 固定上游实质实现，版权/补丁/离线锁
├── …中立封装与注册…                 ◀ 接 Core/Worker，不能另造 ACP 生命周期
└── …各家既有适配器…                 ◀ Codex app-server / Hermes / Pi / OpenCode 原生差异
workers/agent-box-worker/             ◀ 双向有界通道及隔离生命周期，不解释 ACP
```

Harness 接入是扩展插口，具体 Harness 是接入实现。暂不做用户插件市场、热加载或远程任意代码注册。
不采用上游 machine/task/worktree/registry 产品控制面，不引入第二份会话或角色权威。
上游内部 session/queue 仅限单次协议交互，Server/Core 仍拥有产品排队/恢复/取消裁决。

## 分阶段实施

1. A — 复用底座：按38固定闭包抽取，生成来源、许可证、文件清单、精确依赖与补丁账。
   重跑已有相关 fake 接缝；权限未回答/断连/超时默认拒绝，不能静态 allow_always。
   无凭据运行；不自动升级用户全局工具。阶段检查点通过后即推进接入。
2. B — 通道：升级 Worker 现有 framing，支持长驻子进程双向输入、终止前事件、取消、
   背压/输出限额、断连识别、进程树回收和受限投影。复用现有进程/传输库，禁止重写 ACP。
   旧一次性 stdin + 结束后取回不能算实时通道。升级有版本协商，不静默兼容错版本。
3. C — Codex先通纵切，之后 Hermes、Pi、OpenCode 各自提交和记录矩阵。
   同共享底座串行，独立注册/测试可按写集合分工；一家缺适配器不阻塞其他家。
   Codex必须证明所复用适配器使用 app-server，不能退回 exec JSONL。
   固定 codex-acp 内含 Codex 与本机版本差异按38证据验证，不能偷偷下载/替换用户安装。
   Pi/OpenCode复用已审原生路径；Hermes不在已有支持证据内，定向查找并固定既有适配器，
   证明能经同一底座注册。若缺口需手写完整 native adapter，则标该家阻断并继续其余；
   只允许注册、参数、环境、能力声明的窄胶水，不许 Server 增加品牌 switch。
4. D — 汇总：四家各列依赖版本、复用文件、专有能力、缺失能力、实际执行测试及后续模型验收。
   运行受影响根测试/插件测试/Worker测试，记录平台未执行项，不用 fake 冒充真实模型闭环。

## 每家验收门

- 构建/导入和隔离注册成功；真实下层组件由 fake native peer 驱动的协议测试标为组件证据。
- initialize、支持时 resume、终止前 streaming、cancel、断连、重复事件、配置协商、
  审批 allow/deny/过期/冲突、原生状态投影和回收；不支持项明确 unavailable 而非假成功。
- 每家至少记录一个差异能力或限制，差异留在扩展，前端用描述性字段，不能品牌硬编码。
- 能零凭据完成的真实二进制版本/启动握手可有界运行，清空凭据来源并隔离 HOME；
  若工具握手会读取用户认证或触发付费请求则不运行，只列待验。
- Server服务可在零 Harness/某家失败时启动；其余实现仍可用。无 secrets 进入证据。

调用授权、来源与预算另派；本单不得沿用37旧DeepSeek密钥、用户登录态或聊天密钥。
“接入已实现”与“真实模型验收通过”分列；只有后者有授权且实跑才能记 MODEL_VERIFIED。

## 范围、停止与交接

允许39范围外增加 Harness插件、runtime-wsl、sandbox-bwrap、Worker/protocols对应改动、
测试、依赖锁、脚本和第三方闭包；其他插件仅必要公共契约调用更新，禁止大范围重构。
同一主执行者负责集成/资源；subagent遵守仓库模型上限，不并行改共享工厂、锁文件和status。
缺单家前置先继续其他家；耗时不是停工理由。必须扩权限/改权威/自写完整接入体系才暂停该路径。
不因这一单独立完成就宣称整个后端完成。

继承 Desktop `handoff-policy.md`：两端真实 IMPLEMENTATION_READY 且前端writer_lease RELEASED
后才能全栈联调。本单仍禁止跨仓生产写；全栈单须列明当时前端实际工作树及写权后再接管。
在此前可只读交换合同、继续后端独立工作；不能跳过双门提前联调。

证据写 `docs/server-round1/harness-integration/`；每阶段及goal结束前检查status已更新，
包括分支HEAD、命令、四家矩阵、待验、资源和写权。每家状态：NOT_STARTED / IMPLEMENTING /
COMPONENT_VERIFIED / BLOCKED / MODEL_VERIFIED；本单终态
`FOUR_HARNESS_COMPONENTS_READY`（四家组件门全过，仍无模型验收）或 `FOUR_HARNESS_PARTIAL`。
