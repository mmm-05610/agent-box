# Provider/model 研究任务 v0.1
状态：研究已授权，结构未锁定、产品实现未批准；独立于 CP-SESSION-001。
目标：不做代理，仅管理连接/认证引用、模型选择和预存；区分 Harness，优先使用其原生已配置能力。没有 Profile 也应能直接使用。
Profile 只引用逻辑选择，不保存 home、机器路径、秘密或历史，不承担 Provider 执行逻辑。

## 必须研究的问题
1. base URL、协议、认证方式是否足以表达各家连接？原生登录能否只引用/委托，不接管登录和令牌？
2. 模型目录从哪里来，ID/别名/上下文长度各由谁声明？实际能力与用户覆盖值不得混同。
3. Claude 的角色映射、Harness 特有参数是否保留在模型域的扩展还是单独能力；按语义而非“复杂就扔出去”划界。
4. 全局/项目/进程/会话配置的优先级、继承、写入位置、切换生效时间、并发会话冲突。不得把 UI 选择当成已经应用。
5. 哪些可共享，哪些必须按 Harness 映射；相同 URL/API key 不代表协议或模型兼容。
6. 运行中切换、下轮生效、重启生效、不可支持的显式反馈；ACP configOptions 不应被误写成通用 Provider 凭据管理协议。
7. 密钥只能引用；研究存储/认证接缝，不读用户密钥，不自行选择新 secret store 或实现 OAuth。
8. 前后端各自独立插件怎么接入现有注册机制，不修改核心来塞品牌 if/else；具体包数由证据决定，不能先造三个框架。
9. 最小版本只覆盖有证据的路径，其他兼容矩阵明确未支持。原生配置保持默认，不按 Profile 复制整个 native home。

## 参考入口（需执行者重新核实版本与源码）
- CC Switch: https://github.com/farion1231/cc-switch ，src-tauri/src/provider.rs 的 UniversalProvider 与各 app 转换；仅参考配置管理，排除 proxy。
- Zed: https://zed.dev/docs/ai/external-agents ，外部 Agent 原生配置/认证边界。
- Vibe Kanban: https://github.com/BloopAI/vibe-kanban/blob/main/docs/configuration-customisation/agent-configurations.mdx ，按 executor 保存 variant，核对实现及维护状态。
- ACP: https://agentclientprotocol.com/protocol/v1/session-config-options 。

## 最少验收场景（先做方案走查，不发模型请求）
无 Profile 使用原生配置；保存选择但未应用；两个 Harness 同源但映射不同；不支持的协议/模型；原生登录缺失；会话切换只影响目标会话或明确拒绝；全局配置变化不可污染其他会话；未知字段保留但不静默生效；上下文元信息和用户覆盖分开；无凭据时不假绿。
产出一张带证据的字段归属表、一条最小用户路径、最多两个方案并推荐其一、拟复用组件与许可、实施切片与边界。需产品取舍交 I；不开始产品实现。
