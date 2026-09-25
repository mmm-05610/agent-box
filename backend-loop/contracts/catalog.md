# 初始跨组契约目录（草案 · 版本由 C 发布）

状态：**INITIAL / DRAFT**——研究先行，版本在相关组提交方案并由提供方+消费方确认后由 C 固定发布。
每条契约落实 `message-format.md` 的变更单字段（输入输出 / 状态权威 / 失败·重试·清理 / 兼容 / 反例）。
"草案"不等于批准实现；实施任务须另经 `APPROVED`。

| 版本占位 | 提供方 | 消费方 | 语义（初稿方向） | 现状态 |
| --- | --- | --- | --- | --- |
| `C-CORE@v1` | work_core（C 管，冻结） | S / E | 提交事实、领取任务的中立内核；实现不知调用者产品身份 | 冻结，不改 |
| `C-EXEC@v1` | E（server/execution 内部） | S（多次执行编排） | 可靠执行接口：准备依赖→交接→补偿→取消→清理；结果/停止原因如实透传 | 待 E 研究 |
| `C-SVC@v1` | S | Desktop/上层产品 | 会话/队列/配置等业务服务与 HTTP/Wire 既有产品行为 | 待 S 研究 |
| `C-HARNESS@v1` | H（harnesses 插件） | E（委派执行）/ P（文件·终端回调）/ S（用户审批） | ACP 优先直连；能力矩阵；区分系统 ACP Client / 适配器 Agent 端点 / 额外网关 | 待 H 研究（ACP-first） |
| `C-RUNTIME@v1` | P（runtime-local / sandbox-bwrap） | E | 进程操作、隔离保证、资源解析/准备/释放；原始资源 vs 投影、拥有 vs 借用 | 待 P 研究 |
| `C-RES@v1` | P（git/skills/artifacts/terminal-session） | E / H | 资源插件的租约、部分失败、重复释放语义；不得静默从受限退化为裸跑 | **✅ v1 已发布（可发子集 R-1..5/R-7/R-8/R-9，零代码；`goal/contracts/C-RES-v1.md`）**；桩 §10 随文可见：R-6 延 INC2、留存/D4/D5=IFR-01 交 I、D17=契约分流、**skills `disable` 重放泄漏修复=P-FIX-01（已开、待 P 逐路径批）**；桩落定以加性节并入、不发新主版本 |

## 发布规则
- 未发布版本的契约：只可研究、写差量方案与反例，**不可**作为实施依据。
- 公开出口/协议文件（`extensions/api.py`、`capability/`、组合协议、`execution/protocols.py`、`server/wire/`）
  的改动即契约变更，走本目录发布流程，不由任何单组私自改。
- 越出插件与既有批准接入链（尤其 H）、插件格局调整（尤其 P）：先与 C 协商，由 C 决定是否 Sol 审阅后批准。
- Core 语义、公开协议、产品扩权：一律交 I。
