# 跨组接口 / 契约待议登记（C 维护，非批准）

版本占位均为草案；双方确认后由 C 固定版本发布。ACK=收到，≠批准。

## IFR-01 — P→C：D4 artifacts 明文落盘 + 无 release（INTERFACE_REQUEST）
- 来源：P `reports/03-resource-lifecycle-matrix.md`（D4a/D4b）、`04-...md §C`、`02-...md §4`。
- 为何非单组可决：给 artifacts 增 `release()` 改 **C-RES 释放面**；「临时目录 / tmpfs / 阅后即焚」属**秘密策略**；prompt 载体语义牵 **H（回调文件/终端）** 与 **E（执行生命周期编排）**。
- C 处置：**不批准 P 单方实施**。待 E 提交执行生命周期、H 提交文件回调设计后，C 组织三方在 `C-RES@v1` 上定 release 语义与秘密载体策略。
- **可能升级 I**：若最终是「秘密/数据留存的产品取舍」（例如 brief 是否等同秘密、留存时长），超出组内技术范围 → 交 I，不由 C 或组自定。

## IFR-02 — S→C：C-SVC-v1 业务服务契约草案（DRAFT，待消费方）
- 来源：S `reports/C-SVC-v1-draft.md`。内容 S 已标草案占位。
- 消费方现状：本 loop 内 C-SVC 的对外消费者是 Desktop（**不在本轮写入范围**）。S 在本 loop 的**首要实施路径是与 E 协商单次执行迁移**（`C-EXEC@v1`），不是先固化 C-SVC 发布。
- C 处置：已 ACK；**暂不发布 v1**（无 loop 内消费方确认）。待 S 提出与 E 的迁移增量（DESIGN/INTERFACE_REQUEST）时一并处理。

## IFR-03 — C-EXEC@v1（E↔S 单次执行协调）
- **已发布 block-1**（`contracts/C-EXEC-v1-block1.md`），双方语义一致；O-3/M-1 已裁。E-INC0 批准（钉住测试）；E-INC1 产品实施 + S 切换待 E design-final Sol#1 与 E block-1 检查点。

## IFR-04 — E→H 确认请求（C-HARNESS@v1 未定稿阻塞项）
- E 等 H 裁定 `E-D1 §2`：H-1 sessionUpdate/sessionCapabilities 词汇解释归 H；H-2 「哪些 stopReason 算干净停止」判定归 H（E 纯透传，**不按旧四值枚举**，GOAL-START 明示）；H-3 usage 家族解析器归 H；H-4 `whole_db_store` 家族独占声明归 H。
- **前置**：H 尚无产物（进程存活 ~20min，到线）。C 已只读确认 791475 存活、**不重启/不判失败**；待 H 落规范地图/能力矩阵 → C 审 → 组织 E↔H 确认 → E 定稿。

## IFR-05 — E→P 确认请求（C-RES/C-RUNTIME@v1）
- E 等 P 答 `E-D1 §3`：P-1 端口形状是否足以表达两通道（kill 阶梯/Job 树杀/KEEP 调试门）→ 经 `RuntimeHost/TerminalSession/HostTransport`（`protocol.py:474-498` 已定义未接入）；P-2 凭据写删/处置归 P（E 只交审计事实+回执）；P-3 room entrypoint 归 provider（走 C 发布）；**P-4 双 `IsolatedProcessSpec` 同名异构合并 → 由 C 裁定**（倾向 composition 侧中立、sandbox_port 侧降局部，待 P/H 证据）；P-5 `wrap/allocate` 是否承诺零目标副作用（决定 E 是否加失败登记路径）；P-6 ssh/artifact/change_set 归属次序。
- P 正实施 T1（D1/D2/D5），P-1..6 作为其 design-final/后续增量对齐 C-EXEC 依赖 P 的项 → 与 IFR-01(D4) 一并进 C 组织的 P↔E（必要时 H）协商。

## 未决 / 观察
- H 尚无产物（启动后 ~12 min，<20 min 未越线）。到 20 min 无更新 → C 主动只读检查其 worktree/进程，不判失败、不重启。
