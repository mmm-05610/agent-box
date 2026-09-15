# 后端执行者自审（2026-09-15，用户指示"不用等 reviewer，你自己审阅即可"）

范围：本轮联调阶段（接管 → lifecycle connection → 无模型全栈 → 四家真实 UI 模型门 → 合同增补 →
OpenCode 尾巴修复）在**两仓实际提交**上的自审。**这不是 Reviewer 的 ACCEPT**；固定 Reviewer 因额度
（2026-09-20 12:11 恢复）未参与，替代为：独立上下文审查代理一次（13 项发现，已逐项处置）＋本自审。

## 1. 覆盖核对（声称 → 证据）

| 声称 | 证据 | 判定 |
| --- | --- | --- |
| 双门接管、`FULLSTACK_INTEGRATION_OWNER` | 两仓 status 记录 + 前端 `123919e5` | 成立 |
| lifecycle connection（主进程读 Server 令牌，无回退，loopback 判据复用） | 前端 `ed1ccd85` + 11 项 main 测试 + 四家门里实际连通 | 成立 |
| 无模型全栈 22 步（§10 方法 + 反例） | `evidence/p42-integration/integration-results.json`，22 PASS / 0 FAIL，exit 0 | 成立 |
| 四家真实 UI 模型门 | `evidence/p42-ui-model-gate/*.json`，Pi/Hermes/OpenCode/Codex 各 8 PASS / exit 0 | 成立 |
| 重启恢复（真实模型） | `ui-model-gate-pi-restart.json`，9 PASS / exit 0（两轮之间停并重启 Server） | 成立 |
| 凭据经界面录入 | 四家门的 `credential-added-through-the-app` 步 + 前端 11 项 main 测试 | 成立 |
| 合同增补（`profiles.create` 可选 `credentialId`） | 后端 `55e1f8c` + 前端 `d7464166` + 工件重锁（`7746404984…`/`14f7f736…`）+ 后端 32 passed | 成立 |
| OpenCode 尾巴修复 | 后端 `5a8b6fc` + `tailSuffix` 单测 + UI 门复跑 8/8 | 成立 |

## 2. 自审发现（并已修）

1. **UI 门驱动的"预期步数"检查缺失**（前端）：`p42-ui-model-gate.mjs` 只统计 PASS/FAIL，未核对
   应有的步骤清单，若某步因异常提前 return 会被静默少算。已在集成驱动里保留该项（22 步核对），
   UI 门驱动以 `allOk && executed>0` 兜底——**记录为已知弱点**：步骤清单校验只覆盖集成驱动。
2. **`p42-ui-model-gate.mjs` 的重启分支在未开启时不留痕**（前端）：`server-restart-between-turns`
   步仅在 flag 下记录；这是刻意的（步骤清单按 flag 过滤），但**必须在证据里说明该家是否带重启跑过**，
   否则同一文件名的两份报告会被误读。已把带重启的那份命名为 `ui-model-gate-pi-restart.json`。
3. **附件步骤的断言口径**（前端）：当前断言"接受 + 转录里不含正文"，**没有**断言 guest 内实际落盘
   路径与权限回收；后端 `test_attachment_*` 与 r4 门覆盖了投递与回收，属**不同层证据**，已在证据里
   标注为"产品路径验证到接受与不外泄，投递细节由后端门覆盖"。
4. **`sendOutcome.query` 的 unknown 分支**（前端）：只验了 unknown 一个反例；"拒绝前失败保留草稿"
   在后端 wire 测试里，UI 路径未验——**记录为未覆盖**，不冒充。
5. **本阶段两处产品行为修复（`stopping` 投影、`config.changed` 生产者）只在后端测试与 r4 里验过**，
   UI 门未单独复验它们的呈现；属**分层证据**，不重复记账。

## 3. 明确未完成（不得由本自审折算为通过）

- **真实 UI 控件路径**：所有发送都走**产品自己的 renderer 传输**（renderer bridge → IPC → main →
  Server），**没有**驱动"在输入框打字 → 点发送 → 看答案流出"这条人手路径；工作区选择、审批弹窗、
  附件选择等控件同样未被驱动。这是本阶段最大的一处未覆盖。
- **固定 Reviewer 的最终只读审查**：额度限制，未做；`REVIEWER_AUTOMATION_READY` 与
  `BACKEND_IMPLEMENTATION_READY` 的登记来源为**用户授权 + 自审**，已在两仓 status 如实标注。
- 合同增补后的**前端侧**未跑全量 typecheck/lint 之外的 UI 测试套件（只跑了受影响的设置页 10 项与
  工件校验）；后端对新工件 32 passed。

## 4. 自审结论

已交付部分：链路与产品路径在**无模型 22 步**与**四家真实模型**上均有可复跑证据，合同缺口与五处真实
缺陷（preload 嵌套、幂等键、渲染循环、OpenCode 尾巴、`profiles.create` 缺凭据字段）均已修复并留回归。
未交付部分：真实 UI 控件路径、Reviewer 终审。因此最终状态仍是
**`FULLSTACK_CORE_PARTIAL`**，而不是 GREEN——用无模型全绿或后端门冒充 UI 门是本次自审刻意拒绝的。
