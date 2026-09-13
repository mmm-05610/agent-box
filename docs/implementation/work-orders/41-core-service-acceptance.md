# Work Order 41 — 核心产品合同与后端独立验收

状态：QUEUED。依赖39边界就绪、40至少一个真实复用组件通过；40其他家可继续，不以四家全绿阻塞核心。
目标：真正实现已批准产品合同，不把39的拆目录或40的协议组件当作完整Server。

## 权威、范围与目标树

只读设计源 `/home/maoqh/projects/agent-box-desktop-next/docs/desktop-product-delivery/` 下
`contracts/core-semantics-v1.md`、`contracts/index.md`、`handoff-policy.md`。
前端实际产物在 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1/docs/desktop-product-delivery/`，
需读实际分支状态，不把发布源初始状态当成执行进度。
P07产出的wire优先复用；前端明确移交候选编制时，按已批准语义编制到本仓 `protocols/desktop/`，
交换候选和测试证据，不在两边各造一套协议。锁定版本与摘要前只标候选；必要安全/业务裁决仍交用户。

```text
before server/                    39中立边界；40提供部分Harness，完整业务尚未验收
after server/
├── workspaces/                   ◀ 本地/WSL统一身份、连接、浏览、归档
├── profiles/ model_configs/      ◀ 角色与模型配置、版本、动态选项、可运行性
├── sessions/ execution/          ◀ 首发接受、历史、队列、切换、停止、恢复
├── approvals/ events/            ◀ 原子审批、持久化事件与游标
└── bootstrap/ transport/http/    ◀ 独立Windows服务、认证、错误信封、能力发现
storage/                          ◀ 本机权威、事务/迁移、秘密与普通数据分离
protocols/desktop/                ◀ 单一wire及双方共享契约用例
```

## 实施阶段（各阶段定向验证、提交后继续）

1. A 合同：沿用39已开始的wire-review反馈通道，不把合同反馈推迟到本阶段。
   把core-semantics/1的逻辑能力逐行映射到wire、实现及行为测试，标真实/组件/未实现。
   复用P07 schema并核对双方摘要，记录 WIRE_LOCKED_FOR_IMPLEMENTATION；不得降低已批准语义。
   认证引导须仅loopback、每实例随机凭据、窄受控引导和受保护存储，凭据不放URL/argv/日志；
   拒绝未认证和越域请求，模型凭据不通过普通事件传递。无法满足的安全边界不得默认开放。
2. B 资源：工作区/私有连接/远端目录，Profile版本和Provider/Model引用，保存与验证分离，
   角色覆盖不反写静态默认；本地/远端同路径不混同。归档不删文件，不暗中迁移用户真实数据。
   记忆和续接材料由扩展声明、按角色/会话隔离回传，未知文件不能整目录当普通数据打包。
   对同角色并发记忆写入使用版本冲突保护，不做未经设计的语义合并或静默覆盖。
3. C 会话：首次发送的一致接受、请求标识/内容冲突、单会话队列、配置快照、停止与失败暂停，
   运行中实际角色/工作区切换由支持能力裁决；不支持明确拒绝。审批绑定内容与有效版本，
   多客户端竞争只接受一个有效决定。事件先持久化再发布，快照和续流无窗口丢失。
4. D 恢复：测试Server重启、Worker失联、取消/结束竞态、游标过期、用户重试、秘密扫描、
   投影回传确认及清理；启动时先核对旧任务身份，不重复派发。终止前流式内容必须有证据。
5. E 独立验收：Windows本机起真实Server、真实WSL通道和隔离目录，终端HTTP验证资源/配置/
   接受拒绝/历史/事件/审批。无模型执行只在显式测试配置使用替身，并标注它不能证明Harness模型可用。
   保存可复制启动/退出/清理命令，准确依赖版本与测试命令；不得必须启动Hermes网关才能使用Server。

测试范围：沿用39/40对应pytest、Rust测试入口；每阶段跑改动组件，最终跑受影响后端全套一次，
保留基线失败及平台skip。行为测试禁止读源码正则；不得删测试、吞异常、降级协议来凑绿。
每个缺陷先复现后修，局部返修不反复重跑无关Windows构建。

## 所有权和终态

允许server/storage、必要Core接缝、extensions/resource_contracts、已接入插件、Worker/protocols、
对应测试/依赖/脚本/文档。Core不依赖Server；无新群聊/子代理编排/云同步/任意插件市场。
安装/备份等外围能力不是本单完成范围，前端有页面也不能自动扩大为全后台平台建设。
只读前端合同与交接；不启动跨端链路、不写前端、不占用其Windows构建槽。

后端核心均实现、同wire验证通过、独立运行证据齐全则 `BACKEND_IMPLEMENTATION_READY`，
并列Harness组件矩阵和模型未验范围；否则 `BACKEND_IMPLEMENTATION_PARTIAL`。
Ready不是全栈Green。将状态、代码HEAD、wire摘要、启动命令、缺口/owner和证据写status，继续42。
非必要不暂停：单家/单平台问题先推进可独立路径；真实安全裁决或受保护数据才请求输入。
真实模型调用只依42 §D已经登记的DeepSeek来源及累计预算，禁止读取其他用户凭据。
