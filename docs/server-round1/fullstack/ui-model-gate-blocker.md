# 四家真实 UI 模型门：为什么本轮无法执行（跨端缺口，需裁决）

状态：**BLOCKED_ON_PRODUCT_SURFACE**。本文件记录的不是执行者没做，而是一条**两端都没有的
产品面**：Desktop 用户无法把凭据挂到一个 Provider/Model 上，因此从 UI 发不出需要凭据的真实模型轮。

## 1. 事实（两端逐点核对）

| 层 | 事实 | 位置 |
| --- | --- | --- |
| wire | 28 方法里**没有任何凭据方法**；`credentialId` 是不透明引用 | `wire/handlers.py` 的 `providerModels.create/update` 参数含 `credentialId`；`_PARAM_SHAPES` 无 credentials.* |
| Server | 凭据记录由**带外**方式写入：一次性 CLI 或调用方直接 `CredentialRecords.register(...)` | `server/credential_cli.py`；四个 `--live` 门里的 `CredentialRecords(...).register(credential_id, "api-key", locator)` |
| Server REST | 无凭据端点（仅 `credential_id` 作为请求体字段出现在保留 REST 面） | `transport/http/app.py:44` |
| Desktop UI | Provider/Model 设置页**恒发 `credentialId: null`**，且没有选择/导入凭据的控件 | `features/settings/agentbox-model-settings.tsx:126`（create）、`:285`（update 原样回传） |
| 部署侧 | 真实 Harness 的凭据是"环境变量名 + api-key"式的部署声明，需要 Server 侧凭据存储里有对应记录才能解析 | Pi 生产部署：`credentialKind=api-key`、`credentialEnvironment=DEEPSEEK_API_KEY` |

后果：本机 Server + 真实 Harness 的链路**已经分别验证过**（后端四家 `--live` 门全绿、无模型全栈
联调 15/15），但**从 Desktop UI 发出第一轮真实模型请求做不到**——产品缺的不是 Harness，是"用户如何
把凭据挂到自己创建的 Provider/Model 上"这一小段面。

## 2. 三个可行方案（需用户裁决，执行者不猜）

| 方案 | 内容 | 影响 |
| --- | --- | --- |
| **A（推荐）** | **Desktop 拥有凭据记录**（与 AGENTS.md「Windows 是 Profile、Session、checkpoint 和凭据记录的权威」一致）：设置页提供凭据选择/录入，创建的 Provider/Model 带上该 `credentialId`；Server 仍从自己的存储解析该不透明 id。需要一处"列出已有凭据"的只读面（wire 方法或保留 REST），以及 Desktop 侧的控件 | 需要新增**一个只读方法**或复用保留 REST；不改变 28 方法的既有形状；凭据内容仍不进 renderer |
| B | wire 增加 `credentials.*`（list/import/archive） | 合同变更：需要两端重锁 `WIRE_LOCKED_FOR_IMPLEMENTATION`，超出本轮 28 方法范围 |
| C | 仅联调期变通：由集成驱动把凭据注册进 Server 存储，再**绕过 UI** 把该 id 写进 Provider/Model | **不算 UI 模型门**：UI 仍无凭据路径，只能记为"后端链路已验证、UI 面缺失"，不能记作通过 |

## 3. 本轮实际交付与分账

- **后端四家真实模型门**：已分别通过（`live-model-preflight.md` §6），与本缺口无关。
- **无模型全栈联调**：15/15 PASS（`evidence/p42-integration/integration-results.json`），真实
  Electron → Server → Worker → bwrap → fixture，UI 在环。
- **四家真实 UI 模型门**：**本轮未执行**，原因是上面的产品面缺口；不得用后端门或无模型联调冒充。
- `REAL_FLOW_VERIFIED`：无模型路径**是**；真实模型路径**否**（缺凭据引用面）。
