# Backend Server — status

更新：2026-09-13。Work Order 37 的 A/B/C/D 行为门和显式 Git 检查点均已完成。用户授权的 DeepSeek 来源已通过一次性 Windows 导入器写入 current-user DPAPI；真实 `deepseek-flash` 两轮续接和 Server 冷启动后的第三轮续接均成功。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [37](work-orders/37-http-codex.md) | **SERVER_HTTP_CODEX_R1_GREEN** | [完成审计](../server-round1/completion-audit.md) / [C/D 证据](../server-round1/stage-c-d.md)：Windows Server→HTTP/SSE→Ubuntu Worker→bwrap→Codex 0.153.4→DeepSeek Responses；C 两次、D 冷启动一次；同一 native thread，事件 1..18，无历史缺口；根测试 179 passed/1 skipped、Codex/WSL/bwrap 52 passed/3 skipped、Windows 22 passed/2 skipped、Rust 3 passed、显式 Windows/WSL 门 1 passed；A/B/C/D 均有显式 pathspec 检查点 | 当前无新增可执行工单；保留 Windows 本机加密验收数据供复核，停止 Server，不扩展到 Desktop/Pi/UI/安装器 |

终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
GREEN 的全部运行行为、验收物和检查点要求均已满足。

已知边界：Codex CLI 此路径没有硬输出 token cap，验收以短回答提示、4 KiB 输入与 120 秒超时约束；首轮仅白名单 `deepseek-flash`。后续 Desktop 接线/Pi/记忆并发合并/安装器未派。
