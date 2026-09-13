# Backend Server — status

更新：2026-09-13。派工事实，不是实现结果。

| 单号 | 当前状态 | 已完成证据 | 下一步 |
| --- | --- | --- | --- |
| [37](work-orders/37-http-codex.md) | DISPATCHED_NOT_STARTED | 蓝图 v2、历史记忆报告核对、精确基线已确定；没有新增实现测试 | 独立工作树执行 A→B→C→D |

终态：`SERVER_HTTP_CODEX_R1_GREEN` / `SERVER_HTTP_CODEX_R1_PARTIAL`。
阶段态：`SERVER_HTTP_R1_A_READY`、`SERVER_WSL_R1_B_READY`、`SERVER_CODEX_R1_C_READY`。
GREEN 必须包括 Windows Server→真实 WSL Worker→bwrap→真实 Codex 及本机 cold resume。
代码测试通过但无凭据/模型/环境验证只记 PARTIAL，不修改本定义。

已知债务：Core 全局 DB/内部 commit；Worker 依赖 codeg_lib；状态路径分类；Windows
落盘和故障恢复；真实模型授权所需的具体 Profile/model/凭据来源尚待用户明确提供。
后续 Desktop 接线、Pi、记忆并发合并和安装器均未派。
