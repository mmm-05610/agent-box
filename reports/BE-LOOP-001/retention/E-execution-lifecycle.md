# B1 §3 · E 节：执行侧生命周期结构账（零删除、零动作、只读，锚 `10a6b99`）

E · 2026-09-22 03:13Z · 派工＝`goal/acks/ack-D-0033.md` B1-E；口径＝结构账（数值存量账按环境约束双重定死，同包 README）。行号＝`10a6b99` blob。分工边界：DB turn 台账语义＝S 节（msg.32）、对象平面四根总表＝P 节（r38/r39）——本节只记执行侧（`src/agent_box/server/execution/` 与其直接触达的 FS 面），跨账处引用不重账。

## 1. 寿命账（创建→终结，逐族）

| # | 工件族 | 落根 | 创建 | 终结路径 | 残留语义 |
|---|---|---|---|---|---|
| F1 | local-channel 执行根 `agentbox-local-channel-*`（view/bundle 副本、`stderr.log`:512、`secret` 0600 :440-444、change-set copies :522→change_set.py:111-113） | P 之 R-B（`tempfile.mkdtemp` :431） | 每 launch 一次 | 失败路径 `BaseException`→rmtree :536；close 时 rmtree :636（`ignore_errors=True`），env `AGENTBOX_LOCAL_CHANNEL_KEEP=1` 显式不删（调试面，注释自认） | **无任何时间寿命**；close 前崩溃＝永久孤儿，启动无对账扫 temp（全 src 零 `agentbox-` 清扫路径） |
| F2 | ssh connector 运行目录 `agentbox-ssh-connector-*`（`<alias>.conf` 含 host/user/IdentityFile 路径 :264、`known_hosts`） | R-B（:84） | 每 connector | `close()` rmtree :306 | 崩溃/漏 close ⇒ **连接拓扑面滞留 tmp**（无密钥内容、有路径与主机指认）；同样无启动对账 |
| F3 | usage scratch sqlite（`gettempdir()` 主＋`-wal/-shm` :188-194） | R-B | 每次聚合 | finally 三件套 unlink :228-231 | 崩溃残留；sqlite 亦可能自生 `-journal` 不在 unlink 清单（**UNCERTAIN-1**：journal 模式假设 WAL 未逐处证） |
| F4 | sidecar **home**（LocalChannelHome root、marker `.json` 0600 带 `createdAt` :253-255、`_sessions/` store :216、role/window 目录 :225/:261） | 装配方给的 `home_root`（Profile 域） | prepare 时惰性建 | **本层零删除**——注释明言 home 是"Profile 的 durable 目录、非本次 attempt 的 scratch"（:632-635 括注）；仅审计 `delete(relative)` 逐文件面（regular-file-only、拒 symlink :345-352） | 寿命＝Profile 寿命（注销归 BE-PROFILE/S 账）；`createdAt` 是**记账字段非 TTL 执行者**（全库无消费它做清理者，检索零命中） |
| F5 | artifact store（`.staging`、`.incoming/<token>`、`<family>/<version>`、`.current` 引用文件，artifact_store.py:65-74/124-127/161-173） | 装配注入（handlers `_artifact_store` 未注入即 typed `ARTIFACT_STORE_UNAVAILABLE` :1593-1601） | install 流 | `install()` 内 staging rmtree :127；**incoming token 源仅成功安装后由调用方 rmtree**（handlers:1636） | install 中途崩溃/失败 ⇒ `.incoming/<token>` 无主、无扫者；`rollback`＝换 `.current` 指针、**不删旧版本字节**（可回滚面＝引用而非物理清除）；**UNCERTAIN-2：本树未见生产装配 `ArtifactStore(root)` 构造点（仅注入面），线归属＝组合层，待与 P 四根表对账** |
| F6 | 取消/清理链事实（非 FS 工件） | — | `cancel_execution` 三态（sidecar_backend:711；CancelOutcome 不塌缩＝INC1a 钉） | teardown 失败/落账失败 ⇒ `mark_turn_cleanup(turn_id,'failed')`（repository:876），双失败仅 log :637-640 | `cleanup_state` 是**台账事实不是文件系统事实**：failed 时 FS 残留无人再动；无时钟、无重试队列（同 S"无时钟"口径） |

## 2. 取消失败面（E 视角补 S 账）
取消成功≠清理成功：channel close 与 ledger 落账是两个动词两面（close 的 rmtree `ignore_errors` 吞部分失败⇒回执仍可为 cleaned——**结构风险 R-E1：`cleaned` 强度弱于字面**，与 P README 呈 I 要点 4 同源，E 侧实据即 :536/:636 双 ignore_errors）；native 面 teardown 失败被显式转成 failed-cleanup 事实且**永不反转为 grant**（:616-617 注释原文）。

## 3. 崩溃恢复窗口（执行侧）
启动对账＝零：`SERVER_RESTART_INTERRUPTED` 只写 turn 行（repository:658-659，归 S 账），**执行侧无任何进程重启后重发现/重清理 F1-F5 残留的代码路径**。恢复语义只有"下次同名装配复用"（marker/store 幂等 mkdir exist_ok）；tmp 族（F1/F2/F3/F5-incoming）的回收完全依赖 OS/管理员对 temp 的处置＝**无人持有删除授权**。

## 4. 回滚丧失时点（E 链枚举）
- **E-L1**（最早）：`mkdtemp` 返回瞬间——工件存在但不在任何账上；崩溃＝无痕孤儿（无清单可回滚）。
- **E-L2**：secret/stderr 首写之后（:441/:512）——敏感面已落盘；close 之前崩溃＝回滚只剩"OS 回收"这一外部行为。
- **E-L3**：install 将 token 挪出 `.incoming` 之前，源目录可整删回滚；**之后**（destination 逐文件落盘 :124）回滚粒度退化为"版本目录删除"，本层无删版路径（仅 `.current` 可回指）。
- **E-L4**：`rollback()` 只在旧版本字节仍在场时可逆——同 version 名再 install 落盘即**物理覆盖时点**（写同路径），此后不可回滚到被覆盖内容。
- **E-L5**：`cleanup_state='cleaned'` 落账时点＝FS 部分失败的观察窗口关闭（ignore_errors 吞后无从补记）。

## 5. 呈 I 事实（只列）
(a) 执行侧全部临时工件都无应用层寿命参数与清扫者，回收事实外包给 OS；(b) Profile home 面的清理被刻意排除在执行生命周期外（设计注释原文）；(c) `cleaned` 回执与 FS 实况之间隔着 `ignore_errors`；(d) 无主 `.incoming/<token>` 与中断 ssh 目录（含主机指认面）是当前唯一"有清单线索却无人消费"的族；(e) 启动零对账＝恢复窗口内新旧 attempt 无隔离职责。

## 6. UNCERTAIN（列而不裁）
1. F3 `-journal` 面是否可达（sqlite 打开模式全链默认检查未做）。
2. F5 生产装配点缺位（组合层或未来批文；与 P 四根表的 R-归属待定）。
3. sidecar room 内部（插件 runtime 区）文件寿命＝P R-A 账，本节只记交接点，两账衔接处未逐文件核。
