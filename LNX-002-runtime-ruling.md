# I 裁决：执行不确定性与 ACP 终态

2026-09-21，针对 LNX-002 第二次交付。I 实测 HEAD 与报告一致，两树干净：
backend e2fc58fb8e33774441994ff8cf1c663e2c2778c8；
desktop 80872f556c001b42217d43bf5f73ab08029bfcb9。
读取 repairs.md 并检查 _dispatch_error_code、DispatchAmbiguous 构造、_safe_code、
worker-entry.mjs 以及 vendored acp-service.js 的 promptAndWait。
本轮未重跑全套测试，1257/21/33/1 是执行者报告。

## 决定 1：保留不确定性，错误原因不能替代执行阶段

不选择“任意 typed code 都公开”，也不删除 135 的全部诊断能力。
DispatchAmbiguous 仍表示不能断言启动/副作用是否发生，必须保持账本分类与幂等
回放语义，不能把它升级为启动前拒绝，不能因错误码相似自动安全重试。

- 对确实在 open/start 前明确拒绝的 ExecutionStartRejected，保留现有类型化拒绝。
- post-open 的普通异常即使携带 CAPABILITY_REQUIREMENT_UNSATISFIED，公开结果
  仍按既有 EXECUTION_FAILED；原始原因作为现有异常链/受控诊断保留，不打印秘密。
- SIDECAR_REBUILD_FAILED 等由具体运行恢复路径产生的错误仍应可诊断。
  由阶段/受信任的错误类型决定公开语义，不靠全局放行同名字符串。
- Work Core 不增加 provider/harness 专属判断；在适当执行边界完成映射。
- 证明首次派发与同 request 的回放均不重复启动；保留 pre-start、post-open
  同名码对照及 rebuild 失败对照。完成后移除该 strict xfail，以实际通过交付。

这是当前错误映射的有限修复授权，不要求另起错误模型或修改公共 wire 结构。

## 决定 2：修复 ACP 结果丢失，不能仅固定“现在丢失”的特征测试

I 查到 worker-entry.mjs 的两条分支都会 `return result ?? {done:true}`。
ACP 分支调用 acp-service.js:1246 的 promptAndWait，其 finish 成功分支是
`resolve()`，无返回值。因此仅在 worker-entry 加字段无法凭空恢复真实原因；
须继续定位 ACP session/prompt response 到当前 turn 完成通知的丢失点。

授权原集成写者在已有 vendored bridge/适配层作最小补丁，并按仓库现有第三方
补丁记录方式登记。必须保留上游原始 stopReason，不猜测缺席值；结果须绑定
实际 turn/generation，避免取消、同 session 排队、多 session 并发串原因。
不新增 harness、不重写集成、不调用真实模型。

用真实 ACP fixture → bridge → worker-entry → Python 完成路径 → DB/wire 的
贯穿测试覆盖 max_tokens、end_turn、cancel 和连续两轮不同终态；补必要的
异常/并发对照。缺字段保持 unknown/既有缺席语义，不能编造 complete。
把断言“结果是 done:true”的特征测试转为目标行为回归，保留故障成因说明。
真实 harness 如何报截断仍待后续验证。

## 完成与下一步

原 LNX-002 写者继续这两个限定修复，在 reports/LNX-002/ 追加 ruling-ack 与
实现/测试证据，提交新候选 SHA。不要声称已有 xfail/已归因等于缺陷已修。
此轮后交独立 Sol 审阅。工具/工件准备缺口保持分账，不要求消灭所有环境红项。
PREPARATION_GAPS 的登记不得把缺工件的平台提升为就绪；独立审阅需验证这一点。
不另派全库考古，不扩展桌面媒体或 Linux SecretStore 功能。
