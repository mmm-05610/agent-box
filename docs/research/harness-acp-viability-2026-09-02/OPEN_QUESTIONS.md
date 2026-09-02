# OPEN_QUESTIONS — 未决问题登记

观察日期 2026-09-02。UNKNOWN ≠ false（SOURCE_POLICY §6）。每条标注影响面与验证路径。

## 协议级

| # | 问题 | 影响 | 验证路径 |
|---|---|---|---|
| Q1 | `session/load` 各家实现的全量重放粒度/顺序保真度（协议只说 MUST replay，质量参差；Codeg 只能排空丢弃） | ObservationHub 事件日志设计；GUI 恢复体验 | 对每 vendor-native 家用 synthetic session 做重放比对（无 credential fixture） |
| Q2 | HTTP/SSE/WebSocket transport RFD 落地时间表（三家 SDK 已先行实验实现，规范滞后） | 远程宿主形态；多客户端扇出 | 跟踪 agentclientprotocol RFD 状态；v2 alpha 变更节奏 |
| Q3 | v2（replayFrom 游标、prompt=受理 ack+state_update、删除 client fs/terminal/set_mode）何时 stable——是否影响已接入 v1 家 | SessionDriver 接口是否需要预留 v2 位 | 钉 v1；每季度复查 v2 tag 状态 |
| Q4 | MCP-over-ACP（agent 反向要工具）unstable 状态何时转正 | Agent-Box 自备 MCP server 的必要性 | 跟踪 RFD；当前按"单向注入"设计 |

## Harness 级

| # | 问题 | 影响 | 验证路径 |
|---|---|---|---|
| Q5 | OpenCode ACP 面上 `question.asked` 的 turn 停滞行为（需 credential 会话，本轮禁止） | OpenCode ACP 第二模式是否可开 | 凭据环境下 synthetic fixture 会话探测（下轮授权后） |
| Q6 | Hermes lazy_deps 首启动触网的落盘范围（boto3 日志出现但未证实安装） | 沙箱网络策略与 bundle 预热清单 | 隔离 HOME + 无网沙箱跑 `hermes acp --check` 并 diff 文件树 |
| Q7 | Codex 启动期 git/git-remote-http 外呼的具体用途（无凭据阶段实测到，用途未证） | 沙箱 egress 白名单 | APP_SERVER_LOGS 审计 + 无网复跑 |
| Q8 | codex-acp 1.8.0 的 plan 审批门与 fork 面（1.7.0 后新能力，Codeg 尚 pin 1.7.0） | ACP 互操作时的能力声明 | tarball diff + fake peer 探测 |
| Q9 | Claude wrapper kill -9 孤儿（U-1）与 bwrap 内 npx 冷启动（U-5） | wrapper 型拓扑的清理兜底证据 | 沙箱内 kill -9 实验树 + pdeathsig 对比 |
| Q10 | Grok Build 版本信号（registry 1.0.17 vs changelog 0.2.97 vs 镜像 0.1.4 CONTRADICTED） | 未来 registry 接入的 pin 策略 | npm/官方渠道交叉复核 + 实测 initialize |
| Q11 | Pi `--mode rpc` 作为 NativeRpcDriver 基底的稳定性（vendor 点名但无 ACP 计划） | Pi 升级路线 | rpc 模式 fixture 回放测试 |
| Q12 | claude-agent-sdk 内嵌 CLI 与宿主 CLI 版本对应关系（U-4）与 #87577 类 bundle 特有 bug 面 | ACP 互操作时 result 丢失的额外触发源 | SDK changelog 跟踪 |

## Agent-Box 架构级

| # | 问题 | 影响 | 验证路径 |
|---|---|---|---|
| Q13 | ObservationHub 事件日志的保留策略/容量（补 durable replay 缺失的最小集） | 磁盘预算；Finish/Evidence 证据链 | 随 Hub 设计轮次定 |
| Q14 | Registry `session_driver` 校验器的 conformance 覆盖率目标（防"列出≠可用"） | 第三方 Harness 准入质量 | fake peer + fixture 回放矩阵 |
| Q15 | ACP 第二模式在 bwrap 内的回环监听需求（OpenCode 进程内 HTTP server）与 `--pure`/无网模式的组合 | 沙箱 profile 模板 | 沙箱内 opencode acp 探活实验 |

## 明确不追（本轮结论已足够）

- "ACP 组织 adapter 是否会变成厂商官方"——组织信誉上升（identity 矩阵结论 3），
  但 Agent-Box 决策只依赖"是否厂商原生"这一稳定信号，无需预测。
