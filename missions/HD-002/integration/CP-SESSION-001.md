# CP-SESSION-001 — Session 闭环基线候选配对清单

状态：**CANDIDATE_ASSEMBLED_NOT_READY**（2026-09-25 本轮审计会话按用户直接指令汇编）。
未达 `BASELINE_CANDIDATE_READY`，更不是 `READY_FOR_USER_REVIEW`：见 §7 未过门。
本文件只登记事实与缺口；`USER_ACCEPTED` 只能由用户宣布。

## 1. 配对版本（三仓，均为未提交工作树）

| 组件 | 位置 | 精确版本 | 工作树状态 |
| --- | --- | --- | --- |
| 后端 Server（Pacthold） | `worktrees/harness-desktop-002/bc-native` | 分支 `work/hd002-bc-native` @ `e996e9d2251276aea8940a32e616ace2a6d6a99e`（2026-09-23 22:26） | 90 M / 212 D / 82 未跟踪，全部未暂存 |
| 桌面（Electron 宿主+插件） | `worktrees/harness-desktop-002/fc-functional` | 分支 `work/hd002-fc-functional` @ `59856bf20f3ad61eab22472ec63f80508f790200`（2026-09-23 16:52） | 23 文件修改（+609/−52）+ 未跟踪 `plugins/connectors/acp/`、`tests/acp-connector/` 等 |
| Go ACP 桥 | `~/ordessa-builds/acp-adapter`（上游 beyond5959/acp-adapter） | `491151b16846682396aca8c31e9285e414e4f3b8`（v0.3.8）+ Round H 未提交改动（11 文件 +708/−86，6 个未跟踪测试） | 二进制 `acp-adapter-round-h` sha256 `5fd6a37b127274eef5c2f27fe731a720e32e9bd64efd6df23e61fe739bbc61ea` |
| Pi CLI（外部依赖，不重建） | `~/.pi/agent/install/releases/0.86.1/…/dist/bundle/cli.js` | sha256 `e79626f2dd6f94aa45d30f3fa63cd84319a6eefcd150b353cfaf274366926774`，current-version=0.86.1【2026-09-25 实测一致】 | — |
| Go 工具链 | `~/ordessa-builds/go1.24.13`（go1.24.13 linux/amd64） | — | — |

桥工件其余副本（不可由当前源码重建，先于 Round H 改动）：
`bc-native/runtime/tools/acp-adapter/acp-adapter`（`7a727bdb…`，v0.3.8 干净树构建，hd004b 腿在用）；
`…/acp-adapter-r11`（`00c48c3a…`）。历史 /tmp 构建 `/tmp/hd002-bc-go124-pTbe5u/out/acp-adapter` 已消失，
`scripts/hd002/*.py` 4 个旧门脚本仍指向它（保留作历史，按现状不可运行）。

## 2. 桥工件可重建性（本会话 2026-09-25 实测，字节级）

```
cd /home/maoqh/ordessa-builds/acp-adapter
CGO_ENABLED=0 /home/maoqh/ordessa-builds/go1.24.13/bin/go build \
  -trimpath -buildvcs=false -ldflags "-buildid=" -o <out> ./cmd/acp
```
与 `acp-adapter-round-h` 逐字节一致（cmp 通过，sha256 同上）。
**缺口**：该命令未记录在桥仓内（Makefile 无 build 目标；bc-native 的 BUILD-RECORD.md 记录的是
`7a727bdb` 那次更早构建）。收口动作（待批准）：桥仓新增构建脚本+BUILD-RECORD；bc-native 启动器钉当前桥。

## 3. 启动方式（实测在跑的腿）

- **round-h 腿（当前正确配对）**：端口 57413，Server PID 1507568（2026-09-25 15:58 起）：
  `python -m agent_box.server --data-root ~/ordessa-acceptance/round-h/data --port 57413
  --execution-mode native --plugin-root <bc-native>/plugins/agent-box-harness --native-harness pi
  --native-adapter-command ~/ordessa-builds/acp-adapter/acp-adapter-round-h
  --native-adapter-arg=--adapter=pi --native-adapter-arg=--pi-bin=<0.86.1 bundle>
  --native-adapter-arg=--pi-session-dir=<root>/pi-sessions --native-adapter-arg=--trace-json
  --native-adapter-arg=--trace-json-file=<root>/state-logs/pi-acp-frames.jsonl --native-continuation`；
  桌面 = fc-functional Electron（15:59 起）。
  该腿由手动命令变体拉起，**无可复用脚本**（`scripts/hd004b/start-pi-server.sh` 的 SHA 自检会拒绝当前桥）。
- hd004b 腿：端口 57411（9-24 起，旧桥 `7a727bdb`），原样保留，不启停。
- 旧 S-1（18790）/S-2（18810）已停止（实测 HTTP 000；environments.md 相关行过期，未做任何启停）。

## 4. 测试结果（2026-09-25 本会话亲自复跑，受控、零真实模型调用）

| 套件 | 结果 | 备注 |
| --- | --- | --- |
| acp-adapter `go test ./...` | internal/* 全过；`test/integration` **1 例偶发失败** | `TestE2EACPPlanUpdateMappedFromTurnPlanUpdated` 单独复跑 3 次中 2 败 1 过；与 PROGRESS.md「全绿」声明不符，疑与 KI-0055/ADR-0056 背压合并竞态相关 |
| bc-native `tests/acp_orchestration` | **18 失败 / 40 通过**（52.5s） | 与 HD004 报告 §6.8 记录逐字一致＝既有红灯，非新回归 |
| bc-native 受管通道子集（managed_acp_channel + fixture/channel_client selfcheck） | **32 通过，VERDICT=GREEN_NO_SKIPS** | 本链路核心子集仍绿 |
| fc-functional `tests/acp-connector`（vitest） | **79/79 通过（9 文件）** | FC 评审文档期的 33 个 TARGET_MISSING 已全部由 connector 实现解决 |
| fc-functional `test:agent-ui` / `test:agent-shell` | 退出码 0，零失败 | — |

已知旧链红灯（单列，**不得为绿灯恢复 worker-entry 兼容链**，HD004 报告已有裁决）：
`tests/acp_orchestration` 18 失败根因＝旧 sidecar 链 `runtime/worker-entry.mjs` 按计划退役
（14×SIDECAR_CLOSED + 4 下游断言），属插件整合线的既定后果，非本轮回归。

## 5. 真实链路证据（2026-09-25 本会话只读核验）

round-h 帧 trace（`~/ordessa-acceptance/round-h/state-logs/pi-acp-frames.jsonl`，658 帧）：
`session/new ×2`、`session/load ×3`、`session/prompt ×3`（结果 **全部 stopReason=end_turn**）、
`session/request_permission ×1`（桥审批门：bash `pwd && ls -la`，选项 allow_once/allow_always/reject_once）
+ `confirm` 应答、`session/update ×261`（含中文流式思考）。
Pi 会话文件 2 个（16:04/16:06）；Server 状态在 `round-h/data/state/agentbox.sqlite`。
**注意**：该会话项目目录误选 `round-h/app-profile`（Electron 配置目录）；正确测试项目
`round-h/project/` 为空、未被使用。该会话共 3 次发送，不满足 HD004 §6.4 的"新根首发计数=1"受控门，
不能充当受控验收，只证明主路径。

桌面已知 UI 待办（用户裁定留待后续优化，不入本基线范围）：已解决审批卡继续置顶；输入框随内容滚走。

## 6. 未测项

- 正确 project 目录（`round-h/project`）下的受控真实验收：首发计数=1、两轮同会话、审批/停止、
  重启后历史恢复、显式释放（acp.channel.release）与进程清理。
- 重连门拒绝路径与运行中释放的交互；多窗口/第二桌面并发；长会话持久化（HD004 §6.5 未测项延续）。
- `pacthold`/`agent-box-harness` wheel 干净安装可运行性（见 PACKAGE-SPLIT-ASSESSMENT-001.md）。
- Electron 生产模式（当前 run-dev/--no-sandbox 仅本地预览口径）。

## 7. 未过门（→ BASELINE_CANDIDATE_READY 前必须完成）

1. **写入批准未取得**（已向用户报请，未获答复）：桥仓构建记录、bc-native round-h 启动器+桥副本、
   三仓脏改动定稿（SESSION-CHECKPOINT 要求"检查点前两端集成树应无未交付产品修改"）。
2. **真实模型调用授权未取得**：§6 第一项受控验收需真实调用（沿用 I-PI-NATIVE-RUNTIME-APPROVED-001
   边界的提案已呈用户）。
3. acp-adapter 偶发失败用例的定性（竞态定位或记录为已知限制）。

## 8. 回滚/恢复位置

本轮对三仓**零写入**；仅新增本文件与 `PACKAGE-SPLIT-ASSESSMENT-001.md`（control/ 仓）。
两个在跑服务（57411/57413 + Electron）未启停、未改动。round-h 验收目录（用户证据）未触碰。
三仓全部未提交工作原样；如需回到本轮之前状态，删除本目录两个新文件即可。
