# 消息与交接格式（版本化文件，非聊天）

正式状态**唯一**落 `control/reports/BE-LOOP-001/` 与各组 outbox/inbox；聊天只通知任务 ID、状态、记录位置。
每组**只有自己的 `/outbox` 可写**，`/inbox` 与已批准契约只读；由 C 转录、发布固定版本（不共享可改账本）。

## 消息信封（每条一个 JSON 文件：`/outbox/msg.<id>.json`）
```json
{
  "id": "msg.<group>.<seq>",            // 全局唯一；C 按 id 幂等处理并回 ACK
  "group": "server|execution|harness|platform",
  "task": "T-xxx",                       // 关联任务卡；无任务不发消息
  "baseline_sha": "b067c571…",           // 生产基线，固定不随聊天漂移
  "contract_version": "C-CORE@v1",       // 引用的已发布契约版本
  "type": "CHECKPOINT|INTERFACE_REQUEST|REVIEW_REQUEST|BLOCKED|DONE",
  "summary": "一句话结论（文档/实现/验证三类事实分开标注）",
  "evidence_path": "/reports/…",         // 沙箱内路径，C 转录到报告区
  "decision_needed": "无 或 需 I/C 决定的具体问题（交 I，不由执行者直接触用户）"
}
```

## 幂等与去重
- C `collect` 按 `id` 处理，写 `state/messages/processed.ids`；重复 id → 仅补 ACK，**不重复派工、不重复消费 review**（实测 `CTL-dedup`）。
- 崩溃/重启后 `resume`/`collect` 读同一持久集，不重复调用模型或 reviewer。

## 接口契约变更单（INTERFACE_REQUEST）必须写清
1. 输入 / 输出（类型与语义）；2. **状态权威**（同一事实只有一个权威层，其余为有来源的投影）；
3. 失败 / 重试 / 清理语义（超时、未知、确定拒绝、确定完成**不可混淆**；不得以重试掩盖未知派发）；
4. 兼容影响；5. **反例**（该接口若缺失/退化会出什么问题）。
提供方与消费方**双方确认**后，由 C 发布固定版本号（如 `C-EXEC@v1`）。执行中的任务**固定引用版本**，
新版本不影响在途任务。等待接口期间，组可做夹具与不依赖它的组内工作，不空转调模型。
