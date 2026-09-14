# Work Order 40-C — 四家 Harness 组件验收矩阵

日期：2026-09-14。状态：C 阶段组件门通过（`FOUR_HARNESS_COMPONENTS_READY` 候选）。
**零真实模型调用、零凭据读取、零付费请求**；本轮费用 ¥0。

## 复用底座与注册表

固定快照 harness-remote v3.0.2（`21ce6db`）承载三家 ACP 家（codex/pi/hermes）与
OpenCode 的托管 HTTP host。上游注册表只有 `omp/pi/claude/codex`，**没有 hermes
也没有 opencode**，因此：

- `runtime/profile_extensions.mjs`（AgentBox 自有窄胶水）：新增 hermes 描述符，
  只含注册数据（命令 `hermes acp`、参数、能力声明、审批默认 deny）。它把 profile
  交给上游工厂 `createAcpRegistration`，不复制 ACP 生命周期、不加品牌分支。
- OpenCode 不是 ACP profile：它由同一快照的 `ManagedOpenCodeHost` 承载（启动
  `opencode serve` + 认证健康检查），因此**不伪装成 ACP profile**（测试断言
  `opencode` 不在 ACP 注册表中）。

## 真实二进制有界握手（零凭据，可复现）

脚本：`scripts/server-round1/harness-handshake-40c.mjs`；输出：
`handshake-40c.json`。规则由脚本强制：清空所有凭据类环境变量、HOME/XDG/HERMES_HOME
重定向到空临时根、每家硬 deadline、失败即如实报错（不换二进制、不下载）。

| 家 | 结果 | 时长 | 证据 |
| --- | --- | --- | --- |
| Codex | `TYPED_FAILURE` | 448 ms | 适配器活着并给出类型化错误 `CODEX_API_KEY or OPENAI_API_KEY is not set`；隔离 HOME 下未读取用户登录态、未发起付费请求。按工单规则列"待验"，不提供凭据 |
| Pi | `INITIALIZED` | 906 ms | `@automatalabs/pi-acp 0.5.0`；promptCapabilities `{image}`，sessionCapabilities `{resume, fork, list, close}` |
| Hermes | `INITIALIZED` | 1939 ms | `hermes-agent 0.19.0`；promptCapabilities `{image}`，sessionCapabilities `{fork, list, resume}`；日志明确 `No .env found at <isolated>/.hermes/.env, using system env`（即未读用户配置） |
| OpenCode | `HEALTH_OK` | 2102 ms | 真实 `opencode` 经 `ManagedOpenCodeHost` 启动并认证健康检查通过 |

Codex 的 **app-server 证据**（工单硬要求，不得退回 exec JSONL）取自固定工件本体：
适配器 dist 中 `spawn(..., ["app-server"])`（`"app-server"` 出现 5 处 spawn 位置），
`exec --json`/`--experimental-json`/`jsonl` 出现 **0** 次。脚本把这两个计数写入证据
JSON，可重复核对。

Hermes 的运行要求：它是用户 site-packages 里的 Python 包，隔离 HOME 会让解释器搜索
路径失效，因此必须恢复 `PYTHONPATH=<site-packages>` 而保持 HOME 隔离。已记入证据。
另观察到 Hermes 启动时尝试 lazily 安装 `boto3`；实测**未污染用户环境**（用户 site 中
boto3 仍是 8 月的 1.43.71，近 12 分钟内 site-packages 无改动）。生产接入需禁用该行为。

## 组件门（fake native peer，`tests/harness_remote/four_harness_component.test.mjs`）

9/9 通过：

1. 四家经同一底座注册，无品牌分支；OpenCode 明确不走 ACP profile。
2. Hermes 由 AgentBox 注册，未验证能力保持 false（models/todos/commands/actions/
   sessionRename/sessionDelete 全 false，historyLoader 未声明）。
3. 家间能力差异可观察且落在扩展数据里（codex.todos=true、pi.todos=false、
   opencode.actions=true、hermes.actions=false）。
4. initialize、终止前 streaming（客户端层与 peer 层双证）、原生身份保持、
   resume/claim 逐家通过。
5. cancel 以协议通知到达原生 peer（逐家）。
6. peer 断连拒绝在途工作，不伪造完成（逐家）。
7. 审批 allow/deny/未回答/伪造 optionId 逐家解析正确（默认拒绝）。
8. 未声明的 resume 不被假装成功。
9. 单家失败不阻塞其余家注册与启动。

### 家间差异（实测基线，已锁进回归）

- **transcript 来源**：同一 fake peer 下，codex 的读回含实时 chunk（本桥自持流失效），
  Pi 读回为空——Pi 自己的 journal 是权威且 fake peer 不写 journal。故 Pi 的
  transcript 保真**不能**由组件证据宣称，需真实运行验证。
- **能力声明**：codex/pi/omp 在上游声明 todos/actions 各不相同；hermes 由我们保守声明。
- **审批策略**：上游 profile 用 `permissionMode: allow` 静态放行；AgentBox 的 hermes
  与注入解析器一律默认 **deny**，未回答/超时/断连拒绝。这是有意差异，不是上游行为。

## 修正：40-A 的一处证据错误（重要）

40-A 我记录了"`npm ci --ignore-scripts` 干净重建"，但当时**未校验安装产物**。实测
该次安装留下的内嵌 codex 二进制只有 16,777,216 字节（应为 258,278,208），
`file` 报 `missing section headers at 258278144`，运行时段错误。根因是我的安装过程
被截断，而非锁或上游问题：按锁记录重新下载同一 tarball（122,020,574 字节）其
sha512 与 `package-lock.json` 记录**完全一致**，干净重装后二进制完整并 `--version`
返回 `codex-cli 0.147.0`。

结论与整改要求：
- 锁与 integrity 正确有效；**缺少的是产物校验步骤**。
- 因此把"安装后必须验证平台二进制可执行（存在+尺寸/版本+可运行）"列为运行时加载器
  与 CI 的必需步骤；本轮以 `handshake-40c.mjs` 的 `artifacts` 段作为该检查的落点
  （记录 codex 二进制字节数与两个适配器包的版本/许可证）。
- 该错误已在本文件与 status 中留痕，不隐藏。

## 另一处修正：37 测试竞态

`tests/server/test_stage_c_codex.py::test_capture_failure_blocks_later_turn_and_never_acks`
此前被 38/39 记为"失败"。实测为**测试侧竞态**：它在观察到 `failed` 状态后立即断言
`transport.abandon_calls == 1`，而 abandon 发生在终止状态持久化之后约 50 ms
（已用探针证实）。负载高时必失败（本机一次 10/10 失败），负载轻时通过——即
"偶发"的真正机制。已改为**有界等待该副作用**，断言强度不变；修后连跑 10/10 通过。

## 门禁实绩

```text
node --test plugins/agent-box-harnesses/tests/harness_remote/*.test.mjs
→ tests 25, pass 25, fail 0（快照接缝12 + 侧车4 + 四家组件9）
node scripts/server-round1/harness-handshake-40c.mjs
→ codex TYPED_FAILURE(诚实) / pi INITIALIZED / hermes INITIALIZED / opencode HEALTH_OK
python3 -m pytest -q tests/server plugins/agent-box-runtime-wsl/tests \
  plugins/agent-box-harnesses/tests + 组件门
→ 97 passed, 4 skipped, 0 failed（含上述竞态修复）
```

## 明确未通过 / 待验

- **无一家经真实模型验收**：`workbench_model_verified_count = 0`。Codex 的真实模型门
  需 42 §D 授权下的 DeepSeek 兼容配置与凭据注入，且 Codex 需先解决"适配器握手即要求
  API key"的问题；Pi/Hermes/OpenCode 同理待 42-D。
- transcript 保真、原生续接在真实运行中的表现未经真实验证。
- Hermes 的 lazy 依赖安装、`PYTHONPATH` 要求尚未做生产级收口。
- Worker→sidecar 的 Python 侧封装（把 interactive 通道接到 envelope）尚未实现；
  当前 40-B 通道与 40-C 侧车各自通过组件门，端到端串接属 41 的范围。
