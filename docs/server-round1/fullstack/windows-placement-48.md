# Work Order 48 — Windows 原生放置（报告）

结果：**WINDOWS_PLACEMENT_DONE_IN_D5_DEGRADED_SHAPE**（spike 授权的降级形态；AppContainer 的
恢复需要新 spike，见 §一）

## 一、spike 七问（阶段 A，证据 [windows-spike.md](windows-spike.md)）

1. 非管理员 `CreateAppContainerProfile`：**可以**（SID 获得）。
2. 未授予路径的读：**不可判定**——容器内进程无法初始化（见阻塞观察）；按 D5 取保守声明。
3. 容器进程 + Job：`CreateProcess` 接受容器属性、`AssignProcessToJobObject` 成功。
4. node + adapter 在容器内：**不能**（同因）。
5. internetClient 连通性：同因不可判定（未发生任何网络请求，未调用模型）。
6. ACL 只读挡写：独立发现——容器是 Low IL，写普通用户目录被 MIC 拒；降 IL 需要管理员
  （`icacls /setintegritylevel` 实测被拒）。
7. 逐家 Windows 工件：**均无**（各家运行时工件都是 Linux 原生），逐家声明见 §五。

**阻塞观察**：容器内进程 6/6 组合全部 `0xC0000142`（DLL init failed）——`cmd.exe`、
便携 node、两种 cwd、含父链 ACL 授予后被排除的因素。`CreateAppContainerToken` +
`CreateProcessAsUser` 形态的诊断触发 AccessViolation（P/Invoke 契约未确认），无可用观察。
恢复 AppContainer 需要新 spike（建议管理员权限验证 IL 路径 + token 形态）。

## 二、按 D5 降级的实现（阶段 B/C）

- **新插件 `agent-box-sandbox-windows`**：实现 47 的中性接缝
  （`compose_sidecar_room` / `declaration_document` / `descriptor_id` / `probe`）。
  交付生命与物化半边：真实目录（home/工作区）、就地物化配置（D4 兜底 + 只读文件）、
  凭据进环境块（永不 argv）、尝试目录清理；声明隔离半边**不可用**
  （`filesystem.readonly@1` / `network.none@1` = unavailable）——一条不自报。
- **宿主栈**：`local_channel` 在 Windows 上把子进程赋给 **Job Object**
  （`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` 兜底，`assign_pid` 紧随创建），POSIX 路径逐字节不变；
  `runtime-local` 增加 **windows realm**（身份含 OS build，不带 libc-as-ABI）；
  **tmux 全表面在 Windows 声明 unsupported**（D7）；装配边界按平台选默认 provider id
  （`sandbox-windows` / `sandbox-bwrap`），仍按名字解析、绝不 import。
- 通道向中立请求补传 `native_home`：无 bind 的平台靠它把 guest 目标映射回真实 role 目录。

## 三、一致性门（G3，平台声明驱动）

门改为**按 provider 声明驱动**：声明 supported 的能力正向断言，声明 unavailable 的能力
**反向断言**（边界确实不存在）——降级平台被如实记录而不是因说实话被判失败。

- **Linux（bwrap，回归）**：`SANDBOX_CONFORMANCE_GATE_OK`，exit 0（声明驱动改造无退化）。
- **Windows 真机**：`SANDBOX_CONFORMANCE_GATE_OK`，exit 0
  （[报告](sandbox-conformance-windows.json)）——home 真目录（写入落宿主）、
  读隔离声明 unavailable 且**观测确认为 absent**、只读面 unavailable 且宿主源字节未变、
  ephemeral 按 D4 语义"尝试后删除（未遮蔽，不声称）"、工作区可写、凭据零 argv、
  树杀含正控制、清理有界。
- **Windows 反例**（把 home 重定向到副本并改写调用方的一切 home 锚定路径）：
  `SANDBOX_CONFORMANCE_GATE_FAILED`，exit 1——`home_is_real` 失败，
  **反例仍必须失败**（[报告](sandbox-conformance-windows-counterexample.json)）。
- 修复的真实缺陷：物化覆盖只读目标 EACCES、Windows 清理无法删只读文件（门加 force-remove）、
  门未把 provider 环境传给房间进程、probe 管道缓冲导致报告丢失、CIM 查询匹配到自身。

## 四、生命周期与物化（G4/G5）

- 树杀：本地通道在 Windows 上把子进程赋给 Job；一致性门的树杀检查（正控制 + 杀后无残留）
  在 Windows 真机通过。45 G8（取消后仍连续）的 Windows 重跑依赖真 harness（见 §五）。
- 物化：配置就地写 + 只读文件（D4 兜底），凭据进环境块（门断言零 argv）；
  临时路径按 D4"执行后删除"，门断言删除后无残留并记录"未遮蔽"。

## 五、逐家（G6）与回归（G7）

- **逐家**：八家的运行时工件均为 Linux 原生（46 的 install-set），**没有 Windows 构建**——
  按工单要求逐家如实声明"该平台不可用：无 Windows 工件"；平台栈本身由一致性门的
  sidecar 形状房间（便携 node + staged bundle 入口）在真机端到端证明。
- **回归**：全量 **1103 passed / 3 skipped**（含真 bwrap integration、两家沙箱插件与
  terminal-session 套件）；pi/codex/hermes/opencode 门在 c10 保持 exit 0（45 §14 轮）。
- wire 零改动；部署文档格式零改动。

## 六、费用、清理、未做项

- 真实模型调用 0 次、¥0。
- 清理：spike 目录/ACL 已回收；门的临时根 `cleanup_bounded=pass`；
  `C:gentbox-uigate46\w48-token-diag.ps1` 与 spike 报告副本留在仓库外（证据已入库）。
- 未做项/后续：
  1. AppContainer 的恢复 spike（管理员权限下验证 IL 与 token 形态）——恢复后可把隔离能力
     从 false 升级，需重新过一致性门；
  2. Windows 侧逐家真 harness 轮（等各家有 Windows 工件）；
  3. 45 G8 的 Windows 重跑（依赖上一条）。

## 七、结案（072 追记，2026-09-19）——AppContainer 承载不再追测

**追记来源**（主树只读；本树已留档原始 JSON）：`windows-spike-elevated.md`（用户手跑两轮 +
结案判据）、[windows-spike-elevated-raw.json](windows-spike-elevated-raw.json)（第一轮）与
[windows-spike-r2-raw.json](windows-spike-r2-raw.json)（第二轮 H1 授权 + node），sha256 分别
`4ead2bd0f841…` / `a6d9ca9bd222…`。

**两轮的一手事实（逐字退出码）**：

| 轮 | 前置 | 结果 |
| --- | --- | --- |
| 管理员轮 | `CreateAppContainerProfile` 可创建（SID `S-1-15-2-1227684580-…-3591550254`，与非提权轮**同一 SID**）；只读目录已授 `ALL APPLICATION PACKAGES:(OI)(CI)(RX)` + `Mandatory Level:(OI)(CI)(NW)` | **容器内进程全部起不来**：每个启动 `exit = -1073741502`（`0xC0000142`，`STATUS_DLL_INIT_FAILED`）；Q2/Q5/Q6 `inconclusive`；Q3 Job `jobTerminated=true` 但 `aliveBeforeKill=false`（空观察） |
| 第二轮（H1 授权 + node） | workspace 已授同 SID 读/执行，`-NodeExe` 指真 node | node 在容器内仍 `exit=-1073741502`；四类载荷（cmd 探针 / 网络探针 / node）**同一码** ⇒ **H1（目录授权不足）被排除** |

**结案判据（不只是"起不来"）**：

1. **失败与提权、与目录授权无关**：非提权轮、管理员轮、有无 SID 目录授权，一律 `0xC0000142`
   （加载器初始化失败）。剩余未测假设只有 H2/H3（探针的控制台/句柄形态、启动 API 属性表构造），
   属**探针自身调试**，不是产品问题。
2. **更硬的一条**：即便容器起得来，"把用户目录降到 Low IL"（写隔离）**需要管理员**
   ——非提权轮实测 `icacls /setintegritylevel` 被拒；**产品路径不能假定管理员**。
   ⇒ **用 AppContainer 做读写隔离对本产品无论如何都不成立。**

⇒ **AppContainer 的容器承载在本环境不再追测**，降级形态（Job Object + 真实目录）为**最终形态**。
本结案不改变 §二/§三 的任何实现与声明（本轮只写证据）。

**与 Linux 侧的关系（明示）**：Windows 侧是**低于 Linux 侧**的形态——Linux 侧有 bwrap 的读写隔离
（只读 EROFS、宿主 /home 不可见、RO 绑定等）与一致性门背书；Windows 侧只有 Job 的生命/树杀与
真实目录物化，**写隔离与读隔离声明均为 false**（见 §八 核对记录），不得按对等能力描述。

## 八、声明核对记录（072 stage 2，2026-09-19；只读核对，未改实现）

工单 072 G2 要求：写/读隔离声明**仍为 false**，且不得被夸大。逐处第一手核对：

| 落点 | 内容 | 判定 |
| --- | --- | --- |
| `plugins/agent-box-sandbox-windows/src/agent_box_sandbox_windows/provider.py:11` | "read isolation: **false** (no boundary exists: the harness process is an …)" | false ✓ |
| 同文件 `:13` | "write isolation: **false** (same reason; \"bounded write\" means the …)" | false ✓ |
| 同文件 `:181` | 声明文档自述 "This platform's declaration: life-cycle yes, isolation no." | 一致 ✓ |
| 同文件 `:200` | 能力声明 `("filesystem.readonly@1", "unavailable", ())`（网络同族 unavailable） | 未夸大 ✓ |
| 同文件 `:253` | 房间姿态 `"isolation": "none"` | 未夸大 ✓ |
| 本文档 §二 | 降级形态明示"声明隔离半边**不可用**（`filesystem.readonly@1` / `network.none@1` = unavailable）——一条不自报" | 一致 ✓ |
| 本文档 §七 | "**低于 Linux 侧**"明示（Linux 有 bwrap 读写隔离与一致性门；Windows 只有 Job + 真实目录） | 已写 ✓ |

**结论**：无任一处变为正向声明 ⇒ 无需类型化停下/交回；G2 通过。
（若将来有任一处改为 true，本核对即为那个时点的反例基线：先停下、类型化失败、交回调度者。）

**G3 只写证据**：`git diff --stat -- src plugins tests` 为空（本单三个阶段均只碰 `docs/**`）。
**零真实模型调用**；回归沿用既有门结论（§五：一致性门 Windows 真机 OK、反例 FAILED，c10 提交）。
