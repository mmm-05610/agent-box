# HD-002 会话归属（C维护）

状态：UPPER_WRITERS_TRANSFERRED / LOWER_ACK_RECEIVED。依据 `SESSION-OWNERSHIP.md`、用户明确确认独立 FC/BC 已关闭、`handover/site-reconstruction-c.md` 的现场核查。没有独立会话亲写回执，不能称其存在。FC-0008、BC-0007 已确认原有子代理按 writer generation HD002-2 接手；下级只按文件请求 ACK，不宣称终端接管。F0-0004、F1-0004、F2-0003、F3-0006、S-0005、H-0003、E-0002、PROFILE-0002 均已有本人管理 ACK。

|role|tool/model|session ID / PID（已知快照）|目录|generation / 当前任务|实际状态、最后 ACK 与管理方式|
|---|---|---|---|---|---|
|C|Codex / 当前会话模型按启动参数核实|01a0cbf6-2f38-7572-8cb4-1881704c98ea / PID 500296（10:09 快照）|`coordinator`|HD002-1；会话迁移与中央裁决|当前主会话；用户直接管理|
|独立 FC（已关闭）|Codex / 启动参数未核|PID 502605（10:09 历史快照）|`fc`|HD002-1；既有 FE 工作|用户确认已关闭；无前任亲写回执；C 现场重建，不接管其终端|
|C 内 FC|Codex / gpt-6-sol（派生参数）|01a0cbf6-f1ed-7bb3-b232-0a5b2dc1e6cc；`/root/fc`|`fc` / `fc-candidate` / 独立 `fc-pair-corrected` / `agents/FC`|HD002-2；继承 FC-0001..0007|旧 FC-0069/0076 两批无发送门按旧 connect 守卫 FAIL、零 Send；I 第一手与 FC-0090 已勘误：被称 TCP443 的目标是 Chromium UDP IPv6 可达性探测，旧证据保留。原候选 clean `90ca17b8`；FC-0092 独立网络分类门 clean `4a0fcc4e`，合成负例通过，未带 token live；继续核认证请求重定向，原 Qoder 树保留|
|独立 BC（已关闭）|Codex / 启动参数未核|PID 504980（10:09 历史快照）|`bc`|HD002-1；既有 BE 工作|用户确认已关闭；无前任亲写回执；C 现场重建，不接管其终端|
|C 内 BC|Codex / gpt-6-sol（派生参数）|01a0cbf7-06bf-7423-9663-3361931831b9；`/root/bc`|`bc-native` / `agents/BC`，旧 `bc` 保留|HD002-2；BC-0029 接管原生路径|同一原生子代理唯一 BC 写者；`bc-native` HEAD `c83dbc9d` clean；C-0058 Server 半门/tap/DB 通过并清理。Pi global settings warning I 第一手证 `mkdir→EROFS`；C-DEC-0003=A 批三锁临时写，但 BC 静态审见特定认证/缓存态会持久改写 models-store.json，C-0078 已报 I，未升权或起 Pi。H-0013/0014 原会话本人 ACK 已到，pi-acp×Go 对照继续；旧 `bc` 草稿保留，真实首发未发|
|F0/F1/F2/F3|Qoder / Qwen3.8-Flash（编队要求；本人实测以 ACK 为准）|F0 会话 49e3e2e0-0caa-4a2e-a861-e9cdcada4ee0、F3 会话 70e6c54d-df3f-45fe-8564-d63f2a1c5de6；F1/F2 原会话身份以本人 ACK 为准|各自 HD-002 树|原会话不重启；FC HD002-2 文件协调|管理 ACK 均已收；F1-0011 交 clean `221740520b` 待 FC 收；F3 原会话在独立 `f3-cp3` 推草稿视图/M6；F2-0010 已入 FC；FC-0047 已转达新路径；无终端控制权|
|S/H/E|Qoder / Qwen3.8-Flash（同上）|S PID 514369、E PID 516062（各自本人旧实测）；H 当前会话 ID/PID 未提供|各自 HD-002 树|原会话不重启；BC HD002-2 文件协调|管理 ACK 均已收；H 旧 Pi 五脚本只作离线历史证据；BC-0029 已文件请 S/H 提最小原生接线，尚未给施工写域；无终端控制权|
|PROFILE|Qoder / Qwen3.8-Flash（原会话报告）|session 317936fb-2086-4d81-b75e-9994c4661915；PID 516842（PROFILE-0002 本人快照，取代 10:09 PID 口径）|`profile/backend` 与 `profile/frontend`|HD002-2；BC-0002 独立插件包|用户原会话保留；BC-0026 收 BE f3bcbde9/FE e869683469 为独立验证，PROFILE-0006 ACK 且两树 clean、停写；不纳 CP、无终端控制|
|C 曾启重复 PROFILE|Qoder / Qwen3.8-Flash|session ID 未核；10:09 宿主快照已不在|`profile`|已退出的重复尝试|不得恢复；退出原因、子进程与产物待只读核实；不能替代用户原会话|

继承成果按现存文件及 Git：FE baseline1 `d44a5f8e2c`、FC 原集成 `d14ac6e0e6` 与候选 `90ca17b8`；BE 新原生树从 `60d868ef` 起施工至 `c83dbc9d`，旧 BC 草稿隔离保留；F1/F3 原 Qoder 包均已由 FC 收编，原树写域仍属各自 Qoder，C 不触碰。HD-001 唯一 ledger 的原 99/10、零预留、无 grant 已完整存入 `prior_policy`；I-DEC-0001 用户答复取消次数限制，当前 `active_policy` 不要求计数或数字预留。逐行以新 ACK、HEAD/dirty 更新真实归属，不凭旧 PID 猜运行。
