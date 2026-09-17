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
  `C:gentbox-uigate46\w48-token-diag.ps1` 与 spike 报告副本留在仓库外（证据已入库）。
- 未做项/后续：
  1. AppContainer 的恢复 spike（管理员权限下验证 IL 与 token 形态）——恢复后可把隔离能力
     从 false 升级，需重新过一致性门；
  2. Windows 侧逐家真 harness 轮（等各家有 Windows 工件）；
  3. 45 G8 的 Windows 重跑（依赖上一条）。
