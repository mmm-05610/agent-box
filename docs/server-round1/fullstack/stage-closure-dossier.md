# 阶段收口卷宗：c8 返修 + 四家真实模型门（等待 closure 裁决）

状态：**AWAITING_CLOSURE_DECISION**。本文件是同一份可用于两件事的卷宗：
(a) 交给固定 Reviewer 的阶段包（额度恢复后原样投递），(b) 用户据以裁决"以自审代替本轮 closure"的依据。
本文件不构成 `ACCEPT`，也不构成任何 READY 登记。

## 1. 范围

| 项 | 值 |
| --- | --- |
| 工作树 | `/home/maoqh/projects/agent-box-server-round1` @ `feature/server-harness-extension-v1` |
| 审查范围 | `a7b8917d9cd8e3c2ee83147e2be9458e9d50818e..b454e89`（含其后文档提交） |
| 当前 HEAD | 见 `docs/implementation/status.md` 顶部（本卷宗随提交链推进，以 status 为准） |
| 工作树状态 | clean（`git status --porcelain` 0 行） |
| 上游 verdict | `last-verdict.md`：`CHANGES_REQUIRED`（4×P1 + 2×P2，REVIEWED_HEAD `a7b8917`） |

## 2. 本阶段声称完成的内容与证据

### 2.1 上轮 4×P1 + 2×P2 逐项返修

| 上轮发现 | 返修 | 回归证据 |
| --- | --- | --- |
| 真实 capture 凭据失败未进归一化 | `CREDENTIAL_FAILURE_CODES` 按码升格；`scan_state()` 先返回结构化 hits，由唯一判据入口抛错 | `test_a_capture_credential_failure_is_promoted_to_a_hit`、`test_the_capture_scan_reports_hits_instead_of_escaping`（驱动真实控制流） |
| turn-chain 绕过统一阶段入口 | turn-chain 与 reopen 共用 `observe_phase`，settle/stop 异常入本阶段证据 | `-k 'settle or stop or phase'` → 6 passed |
| 双阶段失败丢一个 | 有序 `secondaryFailures` 全保留，主失败判据优先 | `-k 'secondary or failure'` → 6 passed |
| 进程后代身份未闭合 | `process_table()` 读 `ps -eo pid=,ppid=,lstart=,args=`，身份=(pid,启动时间)，归属=argv 含本轮根 **或** 祖先链含之；`ps` 失败 fail-closed；存活=曾见∩当前 ∪ 当前 | `-k 'process or descendant or identity'` → 2 passed（含 argv 不含根的改名后代） |
| 账本现行矛盾 ×2 | status/evidence 的现行 HEAD、唯一计数、版本分层（Harness 0.147.0 / Reviewer CLI 0.154.0）、`plugins=false` 逐变量事实 | 计数唯一定义在 status 一处；本文件不再复制 |

### 2.2 四家真实模型门（`--live`，§8）

| 家 | 结果 | 关键证据 |
| --- | --- | --- |
| Pi | `PI_PRODUCTION_CHAIN_GATE_OK` | 两轮真实答复（13/24 deltas）、同 native id、重开重放观测、未知模型发包前拒绝 |
| Hermes | `HERMES_PRODUCTION_CHAIN_GATE_OK` | 两轮 43/64 deltas、同 native id 续接、state 9 文件零命中 |
| OpenCode | `OPENCODE_PRODUCTION_CHAIN_PREPARED` | 两轮 12/8 deltas、checkpoint `resumable`、未知模型以 `OPENCODE_MODEL_NOT_AVAILABLE` 在 driver 内拒绝 |
| Codex | `CODEX_PRODUCTION_CHAIN_GATE_OK` | 两轮 14/15 deltas 且次轮回忆首轮 nonce、真实 `session/load` 重开、真实流式答复中途取消 `202→cancelled`、`configProjection.unchangedFromDeployment=true` |

共用语义：官方 base URL、不覆盖配置、不装载 loopback guard；授权 locator 只读复制进 gate 自建 0600
token 文件（用户文件绝不写/绝不删，Codex 门有 `authorizedLocatorDeleted=false` 断言）；假端点专有项
（静默窗口、请求体形状、请求计数、出口守卫、重试上界）在 live 下**显式记为未观测并给出理由**。
运行账按产物逐次核对：**29 次 `--live` 运行 / 13 次通过**，累计费用 **< ¥0.07**（上限 ¥10）。

### 2.3 平台与测试

| 门 | 命令（要点） | 结果 |
| --- | --- | --- |
| Windows r4 | `accept-e.ps1 … -Port 18748 -Cleanup`（HEAD 含事件路径改动） | exit 0，`BACKEND_41_E_WINDOWS_WSL_WIRE_OK`；c8 `worker_digest=sha256:514f48a9…` 未重建；有状态 fixture `session/new→session/resume` 同 native id `stateful-13`；delta 10 < completed 12；`stop_mode=tree_terminate`；8s 静默 `elapsed_ms=8799`；7 项清理守卫全部按预期 |
| 独立 PostCheck | 同上 `-PostCheck -InstanceId <两实例>` | exit 0，`BACKEND_41_E_WINDOWS_POSTCHECK_CLEAN`（DataRoot/workspace 不存在、端口未监听、无残留进程、worker view 无残留） |
| Python `tests` | `PYTHONPATH=src + 全部 plugins/*/src` | **576 passed / 3 skipped / 0 failed** |
| 插件套件 | 逐目录 | artifacts 2、git 4、harnesses 127+3 skipped、runtime-local 6、runtime-wsl 36、sandbox-bwrap 112、skills 8、terminal-session 3、web 14（另 2 个 Playwright 用例因本机缺 chromium 二进制**环境不可用**，不计通过） |
| 跨仓 wire（方法+错误） | `AGENT_BOX_WIRE_SCHEMA=<前端生成工件> pytest tests/server/test_wire_v1.py` | 30 passed；错误码 12 家族与后端 `FAMILIES` **逐项相等** |
| 跨仓 wire（事件帧） | 同上（新增帧级门） | 30 passed（带工件与不带工件两种跑法）；帧键集与 kind 为常驻断言 |
| 格式 | `git diff --check` | 通过 |
| Worker/Rust | 本轮未改 `workers/`、插件源 | c8 摘要与 Rust 套件不变，未重跑（见 §4） |

### 2.4 本阶段自查发现并修复的真实缺陷（非橡皮图章证据）

| # | 缺陷 | 影响 |
| --- | --- | --- |
| 1 | live 下 4 处假端点专有断言抛 `AttributeError` | Codex 门 live 接入不可用 |
| 2 | 失败相位的异常对象进入报告 → **报告无法序列化** | 失败运行只剩 traceback，全部证据丢失 |
| 3 | 凭据事实只记录不断言 | token 入事件/部署/工作区不会失败 |
| 4 | `turn_chain_phase` 二次归一化丢弃 settled 命中 | 真实凭据命中可被降级为次要失败 |
| 5 | Pi 的 `refusedBeforeProviderRequest` 由 `None == 2` 求值成 `false` | 报告语义反向（"未拒绝"） |
| 6 | Pi/OpenCode/Codex live 未知模型相位无正向断言 | 该相位无论因何失败都"通过" |
| 7 | 四家 `turn_diagnostics()` 丢弃 `turn.capture` 内层 `error_code` | capture 层失败无法归因（曾真实发生） |
| 8 | OpenCode 清理 stub 未接受 live 关键字（**本轮自引入的回归**） | 该文件 11 项失败；已修，20 passed |
| 9 | `config.changed` 合同已声明但无生产者 | UI 的 `configEffectiveFor` 永不更新 |
| 10 | 停止请求被发成"被中断时的原状态" | 前端 stop phase（由 `stopping` 帧驱动）不启动 |

## 3. 明确未运行 / 未闭合（不得被本卷宗折算为通过）

- **固定 Reviewer 的 §4.2 闭环**：三次投递阶段包均被额度错误截断
  （`ERROR: You've hit your usage limit. … try again at Sep 20th, 2026 12:11 PM.`），**无 verdict**。
- `REVIEWER_AUTOMATION_READY`、`BACKEND_IMPLEMENTATION_READY`：**均未登记**；双门未判定；
  未接管前端（前端一个字节未写）、未记录 `FULLSTACK_INTEGRATION_OWNER`。
- 无模型全栈联调、Windows Electron 真实用户路径、四家真实 UI 模型门：全部未做（依赖接管）。
- 未闭合问题：① Pi capture 间歇（1 失败 / 10 次 live，未复现，诊断已修）；
  ② `workspace.connection` 无生产者且浏览阶段结构上无法承载（已在 wire 反馈登记，需前端裁决）；
  ③ `tool.update` 目前只有 harness 失败一条，端口词汇无工具进度映射，四家是否播发工具调用
  **尚未用证据判定**（需一次强制工具调用的提示），不做臆断；
  ④ `profiles.updateConfig` 尚未发 `config.changed`（已登记待前端反馈）；
  ⑤ `agent-box-web` 2 个 Playwright 用例本机环境不可用。

## 4. 固定 Reviewer 若取得额度，相对本自审额外提供什么

自审已覆盖：控制流反例、跨层错误码、失败层级保留、进程身份、跨仓方法/错误/事件帧合同、账本一致性。
Reviewer 作为**独立只读**审查者额外提供的是：与执行者无关的第二双眼睛对**控制流与账本**的复核，
以及它对"是否满足 §7/§8 收口条件"的**独立判断**；它不会产生新的门证据（不会复跑会产生临时根的测试）。
因此若选择等待，代价是约 5 天；若选择自审收口，建议保留本卷宗并在其恢复后补一次只读复审。

## 5. 裁决选项

| 选项 | 动作 | 后果 |
| --- | --- | --- |
| A（自审收口，推荐） | 明示"以本轮自审代替本阶段 closure"，据此登记两个 READY，随后按 `takeover-prep.md` 接管 | 立即进入联调；status 中如实标注 closure 来源为自审，Reviewer 恢复后补审 |
| B（等待） | 2026-09-20 12:11 后重投本卷宗 §1–§2 | 约 5 天内无法进入联调；期间仅可继续后端侧工作 |
| C（只接管不登记） | 授权写前端但保持两个 READY"未登记" | 违反 §9 的接管前置条件，需用户明确豁免 |
