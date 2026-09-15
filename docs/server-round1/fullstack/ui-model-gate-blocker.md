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

## 2b. 用户裁决：选 A，已落地的部分

用户 2026-09-15 裁决 **A**（Desktop 拥有凭据记录）。A 的前半已实现并分别提交：

| 半 | 检查点 | 内容 |
| --- | --- | --- |
| 后端：让 Server 知道"声明过的凭据在哪" | `14cdc55` | 部署文档新增可选 `credentials: [{credentialId, kind, sourcePath, label}]`：**文档结构性不含秘密**（允许键就是那四个，写 `value`/`secret` 一律类型化拒绝）；来源由 Server 自己的 secret store 读取（symlink/文件类型/大小规则在那里）；声明的 id 由 records 解析；同一部署重启复用既有记录、不重读来源、不重复身份；来源不可读则启动即带类型码失败。11 项测试（含内联 `value` 的拒绝）；全套 **588 passed / 3 skipped / 0 failed**。 |
| 前端：凭据记录归 Desktop | `30de1ffd` | 主进程持有记录（`{credentialId, label, kind}`，来自本侧文件，`AGENTBOX_CREDENTIALS` 指定）；renderer 的全部可见面就是这个三元组——id 用来挂到 Provider/Model，label 用来显示；秘密与路径是 main-only 事实。坏条目丢弃不修补、同 id 只列一次、文件缺失/不可读=空列表而非报错。6 项测试（Windows 上 vitest 6/6）。 |

### 2c. 用户裁决补充：需要界面录入 → 运行中的 Server 导入面（`75ce4a9`）

用户要求"需要录入"。查文档后发现一条硬约束：**数据根锁是非阻塞排他的**
（`bootstrap/runtime.py:63` 的 `msvcrt.LK_NBLCK` / `fcntl.LOCK_NB`，冲突即 `DATA_ROOT_IN_USE`），
所以已批准的 CLI 导入（`credential_cli`）**在 Server 运行期间必然失败**——界面录入不能走 CLI，
只能由运行中的 Server 自己接。已实现：

- `POST /api/v1/credentials`：请求体只带**路径**（`kind`、`source_path`、`confirm_source_path`），
  秘密由 Server 自己的 secret store 读取（symlink/类型/大小规则在那里），返回**不透明 id**；
  必须重复路径（与 CLI 同一纪律），同幂等键重放只导入一次，来源被拒不留记录。
- `GET /api/v1/credentials`：只列 id/kind/createdAt，**不含 locator**（秘密地址属 Server 内部）。
- 7 项测试；全量 **595 passed / 3 skipped**。首轮全量有 1 例既存间歇失败
  （`test_harness_sidecar.py` 的 unusable-checkpoint 用例），单跑该文件 95 passed、复跑全量干净，按间歇记录。

**由此确定的录入形态**：与 legacy gateway 同形的"renderer 表单 → main → Server"。用户选择"需要录入"
即接受密钥会在 renderer 的输入框里短暂存在（不进持久状态、不进日志、不进事件）；若以后要改成
main 侧原生输入，那是另一次裁决。

**仍未落地的部分（A 的最后一段 + 门本身）**：
1. 设置页的凭据选择控件（把上表两条接起来：UI 选 id → 创建/更新 Provider/Model 带上它）；
2. 四家真实 UI 模型门（依赖 1）；
3. 首次录入凭据的入口：秘密若由用户在界面输入，值会经过 renderer 的输入框——这与"秘密不进 renderer"的严格读法冲突，需要决定是接受与 legacy gateway 同形的"renderer 表单 → main 存储"，还是走 main 侧的原生输入。**这一条仍待裁决**，不得由执行者默认。

## 3. 本轮实际交付与分账

- **后端四家真实模型门**：已分别通过（`live-model-preflight.md` §6），与本缺口无关。
- **无模型全栈联调**：15/15 PASS（`evidence/p42-integration/integration-results.json`），真实
  Electron → Server → Worker → bwrap → fixture，UI 在环。
- **四家真实 UI 模型门**：**本轮未执行**，原因是上面的产品面缺口；不得用后端门或无模型联调冒充。
- `REAL_FLOW_VERIFIED`：无模型路径**是**；真实模型路径**否**（缺凭据引用面）。
