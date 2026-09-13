# Backend Server — status

更新：2026-09-13。37 的实施者报告 GREEN，独立验收裁决为 PARTIAL；保留真实三轮和冷续接证据，不覆盖原完成报告。当前只执行38选型验证，不自动修37或接Desktop。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_PARTIAL** | [原完成审计](../server-round1/completion-audit.md) / [C/D证据](../server-round1/stage-c-d.md)保留；检查点5a45303/5b71393/cd5efbe/67c6b40。独立定向23 passed，另复现同键并发两次accept导致状态矛盾；非实时消息、角色状态未实现却报能力、composition混入原生语义，详见[38 §2](work-orders/38-harness-extension-selection.md) | 返修待选型后派单；本轮不重跑模型、不读取保留验收数据 |
| [38](work-orders/38-harness-extension-selection.md) | **HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION** | A/B/C完成：[推荐与边界](../server-round1/harness-selection/boundary.md) / [候选](../server-round1/harness-selection/candidates.md) / [行为证据](../server-round1/harness-selection/verification.md)。有条件首选`harness-remote v3.0.2`，无合格完整备选；固定`codex-acp` app-server seam已验证，零模型/凭据 | 停止生产接入，等待用户决定是否批准单独的最小无模型抽取工单；不接受维护边界则NO_FIT |

终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
37 不按完整 GREEN 接受。38 的 READY_FOR_DECISION 仅指研究可交付，不替代37验收或生产授权。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。

38终态：`HARNESS_EXTENSION_SELECTION_READY_FOR_DECISION` / `HARNESS_EXTENSION_SELECTION_NO_FIT` / `HARNESS_EXTENSION_SELECTION_PARTIAL`；阶段态 `HARNESS_EXTENSION_SELECTION_RESEARCHING`。没有合格候选不得转手写。
