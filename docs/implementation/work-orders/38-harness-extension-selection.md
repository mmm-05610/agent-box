# Work Order 38 — 第三方 Harness 扩展实现选型与隔离验证

**授权：**仅研究、代码审查、隔离无模型验证；不是生产重构单。
**工作树：**`/home/maoqh/projects/agent-box-server-round1`，`feature/server-http-codex-r1`。
**基线：**37 的 D 检查点 `67c6b40`（须为祖先，派工提交会推进 HEAD）。
**顺序：**37 goal 已结束，独立验收 PARTIAL；38 不依赖其 GREEN。暂停旧接入扩展，先交选型供用户讨论。

## 1. 目标与已定边界

为 AgentBox 的 Harness 扩展插槽找到可复用的第三方多 Harness 接入项目，提交有源码和
行为证据的推荐/淘汰理由。我们不自建多 Harness 框架；不是把几家原生 SDK 用自写框架
拼起来，也不是只找 ACP SDK 或一个 Codex adapter 就算完成。允许必要的薄边界胶水，
须逐项列出，不可借“胶水”重写接入生命周期、协议转换和多家注册调度。

公共操作与专有功能必须共存；不能把每家削成 prompt/result。Server/Core 不理解品牌
专有逻辑。研究可提出备选接口草案，但不得自行冻结新协议或改产品语义。
Codex 目标接入使用 app-server（可以由第三方适配器间接消费）；不回到 Server 写 Codex 协议。

## 2. 最近审计快照与 before/after

37 实施报告有真实 Windows→WSL→bwrap→Codex 三轮及冷续接证据，保留不重跑。
独立复核：Server 定向 23 passed，但额外并发反例暴露同键两次 accept；Core 拒第二次
派发后出现 completed/captured 与 EXECUTION_FAILED 并存。消息在 wait terminal 后才
解码发布；角色状态只有 generation 递增和 Session checkpoint，接口却报 native_memory；
composition/codex.py 承担原生恢复、捕获和执行协调。以上为本单输入，不冒充实时新测量。
原始完成报告保留，调度以 PARTIAL 为准；这些缺口不授权在 38 中修生产代码。

```text
before（37）
├── server/composition/codex.py    ⚠ 混入原生语义和运行协调
├── plugins/…harnesses/codex/     已有局部适配；不是选型答案
└── Core / storage / Worker      保留；不能因换库让渡治理权威

本轮产物（不是生产目标已落地）
├── docs/server-round1/harness-selection/
│   ├── README.md                结论、证据等级、用户待裁决
│   ├── candidates.md            精确 commit/许可证/包与能力比较
│   ├── boundary.md              带注解目标树、复用范围、所有权
│   ├── verification.md          实跑命令、结果、限制、重现路径
│   └── experiments/             小型实验代码/测试，不包含第三方源码树
└── <独立临时研究根>/checkouts/   固定提交克隆；不提交进产品仓

待选型目标（逻辑边界，非要求照此建目录）
AgentBox Server / Core
└── Harness 扩展插槽             系统合同与必要胶水
    └── 现成多 Harness 接入实现  必须复用、可替换
        ├── 公共操作/事件
        ├── 能力声明与协商
        └── 原生专有扩展         每家独特配置、操作、事件和续接
```

## 3. 候选与必查事项

起点（仅官网/README 初筛，均未选定）：
- https://github.com/giuliastro/harness-remote ：保留原生语义；查接入闭包可否脱离产品控制平面。
- https://github.com/twaldin/harness ：库形态、native options；逐家查会话/app-server 覆盖，勿以 CLI 支持代替。
- https://github.com/CCDevelopForFun/agent-controller ：独立 runtime adapters/能力矩阵；查 ADL/配置/持久化耦合。
- https://github.com/agentclientprotocol/codex-acp ：仅作下层组件与 Codex app-server 实现参考，不单独当多家框架答案。
允许另找更适合的候选，先广筛后只深挖最多两个；不以 star 数和 README 承诺定案。
若有旧 landscape 报告，只定向复用已知报告，不能将其结论当现行版本证据。

对深挖者逐项给文件/符号/测试定位：
1. 许可证、依赖许可证、最近发布与固定 commit、可安装包/可提取闭包、维护与版本兼容。
2. 多家真实接入机制：Codex/Pi/Hermes/OpenCode 分别已实现/未实现/仅声明；不要假定相同。
3. 专有能力：至少两个不同 Harness 的具体独特功能，追踪参数校验→执行→事件/错误；
   证明上层不需品牌分支。通用扩展元数据被忽略不算功能可调用。能力失配必须明确拒绝。
4. 原生 identity/resume、流式输出、审批、取消、断连/恢复、错误保真；公共接口是否损失能力。
5. 进程及状态所有权：可否指定二进制和隔离 home，是否暗读真实 HOME/凭据，是否自动安装、
   升级、放宽权限、替换模型、写第二套权威；是否能服从 Core/Worker/bwrap 与本机回传。
6. 三方代码在哪里运行（Windows/WSL）；传输与进程树如何归 Worker，生命周期能否受控。
7. 用户自注册扩展的已有机制；可信进程内代码与受隔离外部代码边界如实说明，本轮不实现安装市场/热加载。

## 4. 范围、保护与并发

允许写：`docs/server-round1/harness-selection/**` 与 `docs/implementation/status.md`。
调度方维护 master/blueprint/manifest/工单；执行者不顺手改边界。生产 src/plugins/workers/
protocols/tests/pyproject/锁文件及所有既有报告只读，不更改依赖环境和全局工具。
不写兄弟仓（含 Desktop、旧 Studio、原 agent-box），不读 Desktop 未跟踪 POC。
不读取任何真实 Profile/Session/auth/token/native home，不用 37 保留的加密数据根。

临时研究根用 mktemp 创建并记录绝对路径、所有者；每个候选独立 checkout 和依赖环境。
可克隆、检查许可证后安装固定版本到隔离环境；先审安装脚本，禁提权和全局安装。
第三方源码不整棵入本仓。只清本次明确归属且可回收产物；不清用户目录、缓存或发行版。
无真实模型请求、无真实登录、无读取凭据内容。实验移除继承的敏感 env，隔离 HOME，
优先阻断 provider 网络；不能保证隔离时只做静态审查并记录验证缺口。

允许独立候选由子代理并行审查；主代理集成和判断。最高 Sol 做判断/审查，Luna/Terra
做机械调查，禁止更高型号；不并行大构建。与 Desktop 36R 的代码范围不重叠；Windows
实机/大构建若要占用先确认空闲，不能停止其他代理或用户进程。未新增实现单不触碰 37。

## 5. 分阶段与检查点

### A — 初筛与源码锁定
核对工作树和队列，只读确认37检查点。不复跑37全量或模型门。比较至少三个候选，
记录源码固定版本/许可证/实际能力，选最多两个进入实验；每个淘汰给硬证据。
提交 A（仅显式文档/实验路径），状态 HARNESS_EXTENSION_SELECTION_RESEARCHING。

### B — 隔离行为验证
优先跑候选现有定向测试；通过 fake peer/受控子进程验证真实库接缝，而非替候选写实现。
至少覆盖：运行结束前收到事件、原生续接参数/identity、取消和断连区别、两家专有能力
不丢失、未知能力/非法参数拒绝。能测哪些就实测，不能测的列为未知，不能改测试凑绿。
使用现成 Codex 适配器的候选应检查 app-server 启动/握手及二进制版本约束；不需模型的
真机探针仅在隔离保证成立时做。fake conformance 不冒充真实 Harness 行为。
实验必须测试导入的固定第三方实现，不能用完全自写 mock框架证明复用成立。
提交 B，保留命令、退出码、平台与未验证项，不跑无关全量、不为每个文档变更重建。

### C — 推荐与待裁决蓝图
给首选/备选/淘汰，或 NO_FIT；每个说明复用包或源码闭包、许可证义务、改动量来源、
薄胶水清单、第三方升级方式。若需大 fork/重写核心，不能称为可复用合格者。
给目录树与进程/数据流，标明系统插槽、第三方实现、专有扩展、Core/Server/Worker权威。
解释37四个审计问题哪些与选型有关、哪些仍须独立修；不能声称换库自动解决幂等/角色状态。
给选型通过后的第一个最小实施切片及用户验收路径，仅作为待批准建议。
提交 C 和状态，停止等待用户选型，不开始生产接入，不接 Desktop/第二轮真实模型。

## 6. 验证与终态

执行并报告：固定候选的窄测试/实验命令与退出码；文档本地链接；状态/版本一致性；
`git diff --check`、`git status --short`。manifest 若没有现成碰撞工具，以声明路径交集
记录：38与37仅报告根/状态有交集，37实施暂停，状态串行更新；Desktop不共享写路径。
显式 stage 本单产物并提交，不 git add -A/reset/stash/merge/push。保留并发规划修改。

- HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION：源码和实验足以支持至少一个候选建议，
  有明确限制/兼容证据；只表示可讨论选型，不表示生产GREEN或用户已批准。
- HARNESS_EXTENSION_SELECTION_NO_FIT：候选均有实证硬缺口，研究完成但没有合格方案；
  如实提交，不能降级到手写或延长为无边界寻宝。
- HARNESS_EXTENSION_SELECTION_PARTIAL：证据/环境不足，列出缺口和准确下一步。

越界、缺少合法复用许可、需真实凭据/模型、需修改用户环境或必须重写接入框架时，
停止相应候选并报告。没有合适项目可以完成研究目标；未做完的实验不能伪称全部完成。
