# 48 阶段 A —— Windows placement spike（七问）

执行：2026-09-17，脚本 `scripts/server-round1/windows-spike.ps1`（另有一次最小化诊断
`C:\agentbox-uigate46\w48-token-diag.ps1`，仓库外）。**零模型调用**。

## 结论置顶（决定 48 形态）

**AppContainer 形态在本机不可用**：`CreateAppContainerProfile` 成功、`CreateProcess` 接受容器属性、
Job 绑定成功，但**容器内任何进程都无法完成初始化**——`cmd.exe`（System32）与便携 `node.exe`
在两种工作目录下一律以 **`0xC0000142`（STATUS_DLL_INIT_FAILED）** 退出（6/6 次一致观测）。
按工单 §3.A 的授权（spike 结论不利不停单、按 D5 降级），48 的实现形态取：

| 维度 | 决定 | 依据 |
| --- | --- | --- |
| 进程树/生命周期 | **Job Object**（树杀、有界清理） | Q3 实测：`AssignProcessToJobObject` 成功；JobKill 观察 |
| 写隔离 | **不声明**（false）：Windows 侧与普通进程同权，报告显式写"低于 Linux 侧" | Q6 类观测：AppContainer 是 Low IL，写普通用户目录被 MIC 拒；把目录降到 Low IL 需写 SACL（`SeSecurityPrivilege` 非管理员没有），`icacls /setintegritylevel` 实测被拒 |
| 读隔离 | **不声明**（false） | 容器进程起不来 ⇒ 无容器读隔离可测；ACL 只读仅约束"被授予者"，不构成读隔离 |
| 凭据 | 环境块注入（不进 argv） | Linux 侧既有规则；Windows 同构可测（B 阶段） |
| 用户工作区 | **真实目录**（无重映射；D6 的"不重映射"保持） | 放弃容器后无需重映射 |

## 逐问证据

### Q1 非管理员能否 CreateAppContainerProfile

- 命令：`windows-spike.ps1` 的 `[AppContainerSpike]::CreateProfile("agentbox.w48.spike", $false)`。
- 观察：`result=created`，SID `S-1-15-2-1227684580-…-3591550254`。
- **结论：可以**（非管理员即可创建；`DeleteAppContainerProfile` 可回收）。

### Q2 未授予路径的读是否被拒

- 意图：容器内读"未授权目录"与"已授权文件"的对照。
- 实际观察：对照**无法成立**——容器内进程全部 `0xC0000142`（见下"阻塞观察"），
  读路径探测（granted 文件 / ungranted 目录 / System32 文件三种目标）均无可执行观察。
- **结论：不可判定（容器起不来）**。按 D5 取"读隔离不成立"的保守声明（false）。

### Q3 AppContainer 进程能否同时入 Job

- 命令：`CreateProcess(EXTENDED_STARTUPINFO_PRESENT + PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES)`
  → `AssignProcessToJobObject`；另有 `CREATE_SUSPENDED` 形态可用（API 已备）。
- 观察：`assigned=true`（属性被内核接受、句柄可绑 Job）；`JobKill` 返回 `terminated=true`。
- **结论：可以绑定**（但进程本身起不来，见阻塞观察）。Job 作为树杀/清理机制**独立可用**。

### Q4 node.exe + 真实 adapter 能否在容器里起来并读只读工件树

- 观察：`"<node.exe>" --version` 在容器内 `exit=-1073741502`（0xC0000142），无输出。
- **结论：不能**（容器进程无法初始化；与 node 版本无关）。

### Q5 授 internetClient 后能否访问 api.deepseek.com（只测连通性）

- 观察：同因 0xC0000142，TCP 探测没有可执行观察（未发生任何网络请求；**没有调用模型**）。
- **结论：不可判定**（附带：容器的 `internetClient` 能力注册本身在 Q1 变体里成功创建）。

### Q6 ACL 只读能否真的挡住容器内的写

- 独立于此的第二类观测（不依赖容器进程）：AppContainer 进程令牌为 **Low 完整性**，
  对 Medium 完整性目录的写会被 MIC 拒绝（写升权）；而给目录设 Low 完整性标签需要写 SACL
  → `SeSecurityPrivilege`（非管理员不具备）。实测：`icacls <dir> /setintegritylevel (OI)(CI)Low`
  返回"处理 1 个文件时失败 / 拒绝访问"。
- **结论**：即便容器能起，**普通用户目录（用户工作区）对 AppContainer 不可写**；
  "ACL 只读"在容器形态下不是"读隔离"，只是 DACL 约束。

### Q7 逐家 Windows 工件核实

- 本机已核实存在（Linux 侧清单，B 阶段逐家进入）：各家的 Linux 原生二进制/闭包（见 46 的
  install-set），Windows 侧除便携 Node 外**没有**逐家的 Windows 原生工件；
  Windows placement 的逐家可行性属 B 阶段（"有工件的家族跑、没有的逐家声明"）。
- **结论：待 B 阶段逐家声明**。

## 阻塞观察（Q2/Q4/Q5 的共同根因）

- 观测：容器内 `cmd.exe /c ver`（cwd=`C:\Windows`）、`node.exe --version`（cwd=node 目录）、
  `node -e "console.log(1+1)"`（cwd=`C:\Windows`）等 6 个组合**全部** `exit=-1073741502`
  ＝ `0xC0000142`（DLL 初始化失败）。宿主侧 `CreateProcess` 本身成功（有 pid），
  失败发生在容器进程初始化阶段。
- 已排除：路径授权（对 workspace/RO/node 目录与其父链做了 `*<sid>:(RX|M)` 授予，ACL 行核对过）、
  命令拼写、cwd（两种）、目标 exe（System32 与用户目录各一）。
- 另一形态（`CreateAppContainerToken` + `CreateProcessAsUser`）的诊断在本机触发
  `AccessViolationException`（P/Invoke 契约未能确认，可能是该 API 的导出/签名差异），
  **未取得可用观察**，留作后续定位。
- 影响：48 的阶段 B+ 按上面的降级形态实现；**AppContainer 的恢复**需要一个新的 spike
  （建议在有管理员权限的机器上验证 IL 设置 + 容器启动形态）。

## 费用与清理

- 模型调用 0 次、¥0（Q5 只做连通性探测且未成功发起）。
- spike 在 `C:\agentbox-uigate46` 下自建目录（`w48-spike-ws` / `w48-spike-ro`）与报告
  `w48-spike-report.json`；容器 profile `agentbox.w48.spike` 保留（可用
  `DeleteAppContainerProfile` 回收，脚本内有 API）；ACL 授予在脚本结束时按 SID 回收
  （`Revoke-Path`）；探测文件已删。
