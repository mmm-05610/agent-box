# Backend Server — status

更新：2026-09-13。工作树与调度已准备；实现未开始。

| 单号 | 状态 | 证据 | 下一步 |
| --- | --- | --- | --- |
| [37](work-orders/37-http-codex.md) | READY_FOR_NEW_CODEX_GOAL | 独立工作树/分支从80d2017创建，蓝图与队列本仓落盘 | 新 Codex 执行 A→B→C→D |

终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
GREEN 包括真实 Windows Server→WSL Worker→bwrap→Codex、本机 cold resume。
凭据/model/具体导入源待用户明确；无条件时可完成 A/B，不能宣称 C/D 通过。

已知工程债务：Core全局DB/内部commit、Worker旧codeg_lib依赖、状态路径分类、
Windows耐久性与恢复。后续 Desktop接线/Pi/记忆并发合并/安装器未派。
