# BC
## SESSION-BACKEND latest status (2026-09-23)

```work-status
{
  "work_id": "SESSION-BACKEND",
  "owner": "BC",
  "revision": 1,
  "state": "verified",
  "done": "Server 经 ACP 桥连接原生 Pi 完成同一会话两轮；桌面驱动的同一 Server 会话也完成两轮。",
  "problem": "本项无；工具审批、停止和历史恢复属于另行验收的能力，尚未验证。",
  "action": "暂无在途动作。",
  "waiting_for": "C 验收",
  "next": "将本项证据交 C 验收。",
  "acceptance": "Server 同会话两轮成功；桌面呈现及其他交互能力分别验收。",
  "evidence": "agents/BC/outbox/BC-0095.md；agents/FC/outbox/FC-0102.md"
}
```

## Current (2026-09-23, HD002-2)

- phase: C-0070 Pi/ACP native first-turn closeout; **real first prompt not sent**.
- writer: same BC agent; `bc-native` clean HEAD `c83dbc9d4e0318034cc4ff6979ceeaddf270bf14`; original `bc` secrets.py draft protected. No push/main merge.
- verified correction: I-PI-EROFS-001 proved old 147-byte Pi global settings warning is `EROFS` on `mkdir` of its settings lock. BC-0076 confirms current tool sandbox mount for user agentDir is read-only; old exact mount namespace not snapshotted. This supersedes prior dynamic UNKNOWN/JSON guess. I-ELECTRON-ROOTCAUSE-001 supersedes old TCP443 inference: observed target was UDP IPv6 reachability probe; dictionary request is a separate FC issue.
- fake native continuation gate: `2 passed` on loadSession/no-resume and resume two forms using temporary HOME and fake ACP peer. No real Agent/model. Current product records resumable only when resume is declared and observed; pi-acp load path alone is not yet product continuation proof.
- H management: original H本人 ACK received H-0013/H-0014 for BC-0073/0075; HEAD `1edbe7b2`, dirty only `.qoder/`. H withdrew invalid JSON guess and found pi-acp native tool approval narrower than Go gate. No duplicate H session.
- next: User directly approved three exact lock directories and same-version direct CLI (I-PI-NATIVE-LOCKS-APPROVED-001), but BC-0078 static prelaunch audit found an offline Radius legacy-cache branch that can persistently rewrite `models-store.json`; credentials/cache values cannot be inspected under current boundary to exclude it. No escalation or Pi restart. C/I must narrow to SettingsManager component probe or explicitly decide possible persistent cache write/another proven write guard before full CLI. Only after native model/permission evidence may BC send minimal true first message. Adapter/experience changes go to C/I.

## Historical snapshot (superseded; kept for traceability)
phase: CP_SESSION_001_BACKEND_CLOSEOUT
owner_generation: HD002-2
source_directory: /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc-native (new native branch); original /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc protected
HEAD: bc-native 1d3a9575358ee7b82115ca36887beaca5a6b6ede clean; original bc 60d868ef258e4044a03c8650312431e5b57a48ab
dirty: bc-native clean; original bc only modified src/agent_box/storage/secrets.py stopped draft
latest_ruling: I-NATIVE-AGENT-001 / C-0024 原生 Agent；I-DEC-0001 / C-0025 取消次数上限与数字 grant，真实测试由 C 协调单流。
done: BC-0024 确认同 data-root 稳定认证 hello.serverId；BC-0025 真 Pi ACP 旧隔离离线 A 首发/续聊；BC-0026 收 H f1e94afc 离线证据及 PROFILE 独立包；BC-0027/0028 旧 CP SecretStore 缺口/方案仅存档；BC-0029 ACK 新用户原生裁决并在同一 BC agent 下建 clean `bc-native` 独立树、原 BC 草稿保护；BC-0030 原生源链/分工初核，H/S 只读提案已派。旧 BC-0001..0023 保留。
finding: 旧链已证 local-process+bwrap+真 Pi ACP 在 A 项目完成两轮，但不构成本阶段原生模式证据。旧 Linux SecretStore/ProviderModel 及 H 请求硬 cap 路线均非新 CP 前置；原生路径配置沿用与必要 backend 身份/审批接线待实证。
gate: BC-0025 脚本 sha256 be5dd664ca5d1c821302d27980784a5a09fdc55dba35076dd9fd0ec96815dc54；Pi 工件 digest sha256:afe238d3439df45af77581f7bc969897aa445a1c7b9a686c36c9a31dafa8420f；H Node 单测 9/9 独立复跑；无真实模型请求。工具沙箱外 bwrap 门通过；所有临时 Server/假端点已停。
blocked: 旧 bc 树 `src/agent_box/storage/secrets.py` 未提交草稿已停写保护；原生路径待 H/S 最小接线提案与新树实施。真实测试未协调命令/项目/模型，不自行启动。
management_ack: S-0005、E-0002、H-0003、PROFILE-0002 已收；原会话保留，不新启。
next: BC-0044 按 C-0036 单次运行用户现装 Pi CLI 无 prompt RPC `get_state`：关联 response success=true/modelPresent=true、exit 0，stderr 0600 147 bytes 仅 UNCLASSIFIED，0 connect()、0 残留、0 prompt/tool/model request。此证当前 CLI 可做自身无 prompt 状态读取，不等于 Server ACP；旧 ACP 0.5.0 在当前 agent dir session/new ENOENT，宜待 C 裁相容 ACP 桥/适配器来源。bc-native 1d3a9575 clean，不推 main。
source_writes_started: original bc 有停写未提交草稿；bc-native 自有原生接线已提交且 clean
native_goal_running: ACTIVE
