# FC 管理的会话（HD002-2）

此表是文件协作登记；外部 Qoder 的 PID/状态只采用 I 在 10:09 的宿主快照与各自 status，不代表 FC 能控制终端。当前 sandbox 的 `ps` 不提供这些宿主进程的可验证现场，ID 未知处不补造。

| role | tool/model | session ID | PID/启动时刻（最后已知） | 目录 | generation | 当前任务/状态 | 最后管理 ACK | 管理方式 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FC | Codex / gpt-6-sol（C 指定） | `01a0cbf6-f1ed-7bb3-b232-0a5b2dc1e6cc`（C 快照） | 原生子代理，无独立 PID | `.../harness-desktop-002/fc` | HD002-2 | baseline1 clean；继承 FC-0001..0007，待集成 F1/F2 | C-0007，FC-0008 | C 的原生 `/root/fc` 子代理 |
| F0 | Qoder / Qwen3.8-Flash（角色配置，未独立验当前模型） | `49e3e2e0-0caa-4a2e-a861-e9cdcada4ee0`（本人 goal 文件） | PID 未知；508318 仅 I 10:09 旧快照 | `.../harness-desktop-002/f0` | HD002-1（本人确认） | F0-0004 确认 goal 在跑、无在途命令；FC-0011 状态栏探针迁移包已批 | F0-0004 接受 FC HD002-2 文件协调 | 文件 outbox/status；不控制终端 |
| F1 | Qoder / Qwen3.8-Flash（角色配置，未独立验当前模型） | 未知 | PID 未知；510081 仅 I 10:09 旧快照 | `.../harness-desktop-002/f1` | HD002-2（本人 F1-0004 宣告） | F1-G1 @43cb9ad 已停写交付、FC 暂收；FC-0012 G2 已批 | F1-0004 接受 FC HD002-2 文件协调 | 文件 outbox/status；不控制终端 |
| F2 | Qoder / Qwen3.8-Flash（角色配置，未独立验当前模型） | 未知 | 510997 / 启动时刻未知（I 10:09 快照） | `.../harness-desktop-002/f2` | HD002-1（待自回） | P2-3A 原会话在途；只读核 HEAD 4915e9，FC 不触树 | FC-0009 已请求，待本人回件 | 文件 outbox/status；不控制终端 |
| F3 | Qoder / Qwen3.8-Flash（角色配置，未独立验当前模型） | 未知 | 511965 / 启动时刻未知（I 10:09 快照） | `.../harness-desktop-002/f3` | HD002-1（待自回） | 应用片预备；@d44a5f8 有未提交差量，FC 不触树 | FC-0009 已请求，待本人回件 | 文件 outbox/status；不控制终端 |

替换或新会话需明确停写/退出和在途子命令核查；本次不启动、恢复或终止上述 Qoder 会话。C 才可管理 FC 原生子代理。收到各角色 ACK 后更新对应行。
