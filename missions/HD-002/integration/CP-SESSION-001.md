# CP-SESSION-001 — Session 闭环基线候选配对清单

状态：**READY_FOR_USER_REVIEW**（2026-09-25 汇编并于同日完成受控验收；用户验收裁决待用户本人给出）。
`USER_ACCEPTED` 只能由用户宣布；本文件只登记事实、证据与已知限制。

本轮（2026-09-25）执行依据：用户对收口会话明确答复"统统批准"（三仓写入 A1/A2/A3 + UI 并入 +
真实调用授权 B），并澄清 `app-profile` 为用户自选目录（非误选）。

## 1. 配对版本（已全部本地提交冻结；不 push、不碰 main）

| 组件 | 位置 | 提交 |
| --- | --- | --- |
| 后端 Server（Pacthold） | `worktrees/harness-desktop-002/bc-native`，分支 `work/hd002-bc-native` | `71203f83`（harness 插件收敛）→ `348efbea`（受管 ACP 通道接缝+测试）→ `88089412`（启动脚本+桥工具）→ `a0b343e0`（round-h 启动器+BUILD-RECORD 增补） |
| 桌面（Electron 宿主+插件） | `worktrees/harness-desktop-002/fc-functional`，分支 `work/hd002-fc-functional` | `866559a3b9`（ACP connector+native wiring）→ 合并 `d1ebfdae97`（UI polish 冲突解决：preload 双桥、styles token 化+保留侧栏区块、lock 重建 9 扩展） |
| 桌面 UI 分支（来源） | `worktrees/desktop-ui-codex`，分支 `work/desktop-ui-codex-0` | `95aec192cf`（审批卡移到线程尾部+视觉刷新+无边框窗口）——已并入 fc-functional，分支保留可回退 |
| Go ACP 桥 | `~/ordessa-builds/acp-adapter`，分支 `work/round-h` | `41d9d94`（Round H 源码+构建脚本+BUILD-RECORD+二进制，self-contained） |
| Pi CLI（外部依赖） | `~/.pi/agent/install/releases/0.86.1` | sha256 `e79626f2…926774`，current-version=0.86.1（实测一致） |

桥工件：`acp-adapter-round-h` sha256 `5fd6a37b…bbc61ea`，由 `work/round-h` 用
`scripts/build-round-h.sh`（`CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags "-buildid=" ./cmd/acp`）
**字节级重建已两次实测**（本日审计轮+提交前自检轮）。bc-native `runtime/tools/acp-adapter/`
持有同一 sha 的副本（不入库，启动器逐次校验）。旧桥 `7a727bdb`（hd004b 腿在用）与 `00c48c3a`（r11）
不可由当前源码重建，仅作历史证据保留。

## 2. 启动方式（不再依赖 /tmp 或手动命令变体）

- Server：`bc-native/scripts/hd004b/start-pi-server-round-h.sh [port]`
  （默认端口 57415，ACCEPT_ROOT 默认 `~/ordessa-acceptance/round-h-cp`；自检桥/Pi sha、
  Pi 版本、PI_* 环境清洁、端口占用，任一不满足即拒绝启动）
- 桌面：`ACCEPT_ROOT/tooling/start-desktop-cp.sh`（env -i、隔离 APP_HOME、token 文件鉴权、
  CDP 59415 供受控驱动；`--no-sandbox` 仅为本地预览口径）
- 旧 `start-pi-server.sh`（钉旧桥）原样保留；`scripts/hd002/*.py` 旧门脚本保留作历史（其
  `/tmp` 桥路径已消失，按现状不可运行）。

## 3. 受控验收结果（2026-09-25，全部为执行会话亲测，真实模型调用经用户当轮批准）

环境：隔离根 `~/ordessa-acceptance/round-h-cp`（独立 data-root/pi-sessions/state-logs），
测试项目 `round-h-cp/project`（wire `workspaces.open` 注册，workspace `ws_492e9aee…`，
accessibility readable+writable），桥 5fd6a37b，Server 57415，桌面 CDP 驱动。
证据：`round-h-cp/evidence/`（10+ 截图与 JSON）与 `state-logs/pi-acp-frames.jsonl`。

| # | 项目 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 新会话草稿+必须选项目 | ✅ | `02-newsession-project.png`；未注册项目时列表为空（项目必须选择），注册后即列出 |
| 2 | **首发计数=1**（HD004 §6.4 遗留门） | ✅ **通过** | 帧 trace 全程 `session/prompt` in-request 恰 1 次；`evidence/send1.json` |
| 3 | 第一轮真实回复 | ✅ | stopReason=`end_turn`；回复「收到」；思考流可见 |
| 4 | 同会话第二轮 | ✅ | 回答正确引用第一轮约定（「收到」）；无串会话 |
| 5 | 工具审批（bash pwd） | ✅ | 审批卡三选项 Allow once/Allow for session/Reject；Allow once → 卡片 `data-state=resolved`；pwd 输出=项目目录（项目绑定贯穿到执行边界） |
| 6 | 运行中停止（sleep 30 + Request stop） | ✅* | UI「Request stop」→「等待确认」→ run 结束回归空闲，无悬挂；帧 `session/cancel` 已达桥；终态 `end_turn`。*限制见 §5-1 |
| 7 | 桌面重启后历史恢复 | ✅ | 杀测试桌面→重启→连接→Refresh→会话（标题=首轮 prompt）→`session/load`→**10 条消息全量恢复**（4 轮对话） |
| 8 | Server 优雅关停进程清理 | ✅ | TERM Server → access-entry/acp-adapter/Pi 子进程**全树消失**；用户腿进程（394938 等）原样未动 |
| 9 | Server 重启后历史恢复 | ✅ | 重启 57415→重连→开项目（通道重建）→Refresh→开 会话→**10 条消息再次全量恢复**（`11-history-after-server-restart.png`） |
| 10 | 客户端断开≠释放（接缝语义） | ✅ | 杀桌面后 access-entry+adapter+Pi 保持存活（只摘挂接），直至 Server 关停/显式释放 |
| 11 | 显式 `acp.channel.release` | ✅ | open 幂等返回现有 connectionId；release → `{released:true, endReason:"released"}`；`executions.get` → `state=closed, endReason=released, inFlight=false`；通道进程全树收掉 |

前置事实核验：服务注册即用 wire 同一接缝（`workspaces.open` environment 需 `{kind,host,user}`
全键、requestId ≥8 字符——`INVALID_REQUEST` 族拒绝明确）。

## 4. 测试结果汇总（全部执行会话亲测复跑）

| 套件 | 结果 |
| --- | --- |
| 桥 `go test ./...`（work/round-h） | internal 全绿；integration **1 例偶发失败** `TestE2EACPPlanUpdateMappedFromTurnPlanUpdated`（3 跑 2 败；疑 KI-0055/ADR-0056 背压合并竞态；未定性，见 §5-3） |
| bc-native `tests/acp_orchestration` | 18F/40P——与 HD004 记录逐字一致＝worker-entry 退役既定红灯，**非新回归**；受管通道子集 32 绿 GREEN_NO_SKIPS |
| fc `tests/acp-connector`（vitest） | **79/79**（合并 UI 分支后复跑仍全绿） |
| fc `test:agent-ui` / `test:agent-shell` / `test:ui-preview` | 合并后退出码全 0 |

## 5. 已知限制与未测项（不隐瞒，逐条可查）

1. **停止不中断在飞工具**：Request stop 的 cancel 帧到达桥后，运行中的 bash sleep 跑完全程
   （31.5s）才以 `end_turn` 结束；未出现 `cancelled` 终态。UI 语义诚实（等待终态、不伪造），
   但"停止=中断工具执行"在 Pi 链路上不成立。属桥/Pi 能力边界，需后续定性（Round H cancel
   语义已部分处理，未覆盖在飞工具中断）。
2. **审批卡无超时显示**：桥审批门 30s 超时后，桌面卡仍显示 pending；迟到点击静默失效（该轮
   以「命令被用户阻止」结束）。用户可见反馈缺失，列 UI 债。
3. **桥 flaky 测试未定性**（§4）。
4. UI 债（用户裁定后续处理）：审批卡置顶、输入框随内容滚走——其中置顶问题经 UI 分支
   （审批卡移到线程尾部）已并入本候选；输入框滚走待 UI 会话确认是否已随分支解决。
5. 未测：重连门拒绝与运行中释放的交互、多窗口并发、断连下的审批、长会话持久化、
   Electron 生产模式（无 --no-sandbox）安装包形态。
6. hd004b 双发疑虑历史记录：本次受控环境首发计数=1，未复现双发；历史假设（早期中止驱动
   残留排队发送）未被推翻但也未成立，记录保留。

## 6. 服务边界声明（本轮结束状态）

- 本轮新建服务（57415 测试腿、CDP 测试桌面）已全部停止并验证无孤儿进程。
- 用户服务：57411（hd004b，旧桥）本轮全程未动、结束时仍存活；57413（round-h 腿，pts/5 前台）
  在本轮期间由用户侧停止（进程消失；执行会话未对其执行任何操作）——如需可由用户自行重启。
- 未 push、未合并 main、未动凭据、未改用户 Pi 配置；真实调用在用户当轮"统统批准"授权下进行
  （账本政策 I-DEC-0001：计数不强制）。

## 7. 用户验收入口

按 SESSION-CHECKPOINT：建议用户在新隔离根亲自走一遍（命令见 §2），重点体验：
选项目→首条创建→流式/思考/工具卡→审批→停止→重启恢复历史→显式释放（或直接关闭）。
已知限制 §5 请一并阅读。用户给出"验收通过"后本检查点标 `USER_ACCEPTED`；
反馈修复形成修订检查点，不混入后续插件。
