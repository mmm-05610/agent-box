# Agent-Box Project Resource & Capability Runtime 调研报告
>
> Historical record — describes an earlier architecture or decision input and is not current implementation guidance.

> 文档导航：[总目录](../README.md)

调研日期：2026-08-20
结论先行：**Modify / Medium Value（有条件成立）**

不要建设一个广义的 “Resource Registry + Secret Manager + IAM + Sandbox + Workflow” 平台。这个范围已被 MCP Gateway、ToolHive、原生 harness 权限、Vault/1Password、Docker Sandbox 等成熟方案大量覆盖。

值得建设的是一个更窄的模块：

> **Profile Capability Binding Runtime**
> 将 Project、Profile 和现有外部能力绑定成一份可解释、可执行、可审计、运行期有效的 Launch Plan。

它的独立价值不在“存资源”或“管理 Secret”，而在：

- 跨 Claude Code、Codex、OpenCode 等异构 harness 计算统一的有效授权；
- 将授权编译成每个 harness、MCP gateway、sandbox 能执行的配置；
- 在 Agent-Box 启动边界上提供 run-scoped binding、cleanup 和跨 harness 审计；
- 让上层 workflow 只引用 Profile，不接触 credential 和 harness 私有配置。

---

## 1. Executive Summary

### 总判断

| 维度 | 判断 |
|---|---|
| Useful engineering feature | **High** |
| Independent product value | **Medium，且有前提** |
| Resume / demo value | **High** |
| 当前广义方案 | **应 Kill** |
| 收窄后的 Capability Binding Runtime | **建议 Modify 后 Go** |

独立价值成立的前提：

1. 同一资源确实被至少两个不同 harness/Profile 使用；
2. 不同 Profile 对它需要不同权限；
3. Agent-Box 能在 gateway、sandbox 或 native permission 层真正执行这些限制；
4. 能解释某次运行“为何获得这些能力”；
5. 不把 launch-time 注入记录冒充成真实使用审计。

如果最终 dogfood 只相当于：

```text
.env + 一份 MCP 配置 + Claude/Codex 原生权限 + shell script
```

那么它没有足够的独立产品价值，应停止。

### 最重要的反向发现

Agent-Box 当前的 Bubblewrap 主要实现的是配置隔离，不是资源安全边界：

- launch plan 将整个 `/` 以可写方式 bind 进去；
- 共享宿主网络；
- 默认继承宿主环境变量。

这可以在 [架构说明](../ARCHITECTURE.md#launchpy-行为)、[`launch.py`](../../src/agent_box/launch.py) 和 [`agent_types.json`](../../src/agent_box/core/agent_types.json) 中看到。

因此现在即使数据库中写了：

```text
Reviewer: no production access
```

也不能称为强制授权：Reviewer 仍可能从宿主文件、环境、网络或现有 CLI 获得绕过路径。

这是该模块立项前必须明确的事实。

---

## 2. Problem Definition

当前设想实际混合了三个不同问题：

1. **配置与可移植性**

   哪些资源可用于某个 Project/Profile，如何映射到不同 harness。

2. **授权与执行约束**

   Agent 是否真的无法使用未授权的文件、网络、工具或 credential。

3. **Credential 生命周期**

   Secret 如何存储、获取、轮换、撤销、过期。

Agent-Box 最适合拥有第一个问题，并负责第二、第三个问题的编排与适配；不适合自行实现完整的 enforcement engine 或 Secret Manager。

### 对核心口号的修正

“Agents should receive capabilities, not raw secrets”方向正确，但需要更严格地表述：

> Agent 进程应优先获得受约束的调用通道，而不是长期、宽权限的上游 credential。

原因是：

- env/file 注入仍然是 raw secret；
- 带任意 shell 权限的 Agent 可以读取、打印或外传这些值；
- scoped token 本质上仍是 bearer credential，只是风险更小；
- 只有 gateway、proxy、short-lived delegated token 或受约束句柄，才更接近 capability；
- 即使 Secret 不进入 prompt，也不代表它对 Agent 进程不可见。

### 建议区分的对象

- `ResourceDefinition`：逻辑资源及非敏感元数据；
- `CredentialRef`：外部 Secret provider 中的引用，绝不保存值；
- `ProjectResourceRef`：Project 对资源的引用和别名；
- `Grant`：Profile 在该 Project 下被允许的动作；
- `BindingDriver`：如何转为 MCP、sandbox、native permission、env 等；
- `EffectiveRuntimePlan`：一次运行的最终不可变计划；
- `AuditEvidence`：decision、binding、invocation、external effect 的不同证据。

---

## 3. Existing Solutions Landscape

现有生态已经分层解决了大部分基础问题：

| 层 | 已有成熟方案 | Agent-Box 缺口 |
|---|---|---|
| 工具发现与调用 | MCP | 跨 harness 的 Project/Profile grant |
| Coding agent 客户端协议 | ACP | Profile 与 runtime plan 的绑定 |
| 独立 Agent 通信 | A2A | 本地 Profile adapter |
| MCP gateway | Docker MCP Gateway、ToolHive | 选择和启动哪个 gateway profile |
| Harness 权限 | Claude Code、Codex、OpenCode 原生规则 | 统一编译、解释和审计 |
| Secret 管理 | Vault、1Password、OS keychain、SOPS | provider reference 和运行期解析 |
| Sandbox | Docker Sandboxes、Anthropic sandbox-runtime、E2B、Modal | 与本地 Profile 配置集成 |
| Policy | OPA、Cedar、Casbin、OpenFGA | MVP 并不需要复杂 policy engine |
| Workflow | LangGraph、AutoGen、Semantic Kernel、Temporal | 只需 adapter，不需重建引擎 |

---

## 4. Relevant Open Source Projects / Standards

以下“活跃”指截至 2026-08-20 仍有近期提交、release 或规范活动。

| 项目 | 活跃程度 / License | 核心抽象 | 可复用内容 | 与设想重合 | 建议 |
|---|---|---|---|---|---|
| [MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic) | 高；新规范/代码逐步转 Apache-2.0，治理说明见 [Governance](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/GOVERNANCE.md) | tools、resources、prompts、transports、OAuth | 能力发现、调用、远程认证 | 高 | **直接采用协议，不扩展私有协议** |
| [ACP](https://github.com/agentclientprotocol/agent-client-protocol) | 高；Apache-2.0 | 编辑器/客户端与 coding agent 的 JSON-RPC 协议 | session、prompt、permission、tool/MCP event | 中 | **直接适配** |
| [codex-acp](https://github.com/agentclientprotocol/codex-acp) / [claude-agent-acp](https://github.com/agentclientprotocol/claude-agent-acp) | 高；Apache-2.0 | 现有 harness 到 ACP 的 adapter | 不改 harness 即可暴露统一接口 | 高 | **直接复用 adapter** |
| [Docker MCP Gateway](https://docs.docker.com/ai/mcp-catalog-and-toolkit/mcp-gateway/) | 高；代码 MIT | MCP routing、server/tool filter、secret、profile、生命周期、日志 | 受控 MCP sidecar、credential 注入、tool allowlist | 极高 | **MVP 首选，不自建 gateway** |
| [ToolHive](https://github.com/stacklok/toolhive) | 高；Apache-2.0 | MCP runtime/gateway、registry、authz、audit、secrets | 更完整的 MCP 安全运行层 | 极高 | 后续可选；MVP 不同时集成两套 |
| [Claude Code permissions](https://code.claude.com/docs/en/permissions) | 产品持续更新 | Bash/Read/Edit/Web/MCP 权限规则 | Harness 内最终审批与工具限制 | 高 | 编译到原生规则 |
| [Codex config](https://learn.chatgpt.com/docs/config-file/config-reference) | 产品持续更新 | sandbox mode、writable roots、MCP tool allowlist、approval | 原生 sandbox/MCP 限制 | 高 | 编译到原生配置 |
| [OpenCode permissions](https://opencode.ai/v2/docs/permissions) | 活跃 | action/resource/effect 有序规则、agent override | Agent-specific tool permission | 高 | 编译到原生配置 |
| [Vault Agent](https://developer.hashicorp.com/vault/docs/agent-and-proxy/agent) | 成熟；当前源码采用 BSL | auto-auth、lease、template、process supervisor | 动态 secret、续租、撤销 | 高 | 外部 provider；不嵌入 |
| [1Password CLI](https://developer.1password.com/docs/cli/secrets-scripts/) | 成熟；商业产品 | secret reference、`op run`、service account | 本地 credential 获取 | 高 | 可选 provider |
| [SOPS](https://github.com/getsops/sops) | 高；MPL-2.0 | 加密配置文件、age/KMS backend | 版本化 secret refs | 中 | 可选；不是 broker |
| [Anthropic sandbox-runtime](https://github.com/anthropic-experimental/sandbox-runtime) | 活跃但 beta；Apache-2.0 | Linux/macOS filesystem/network policy | 本地轻量约束 | 高 | 可评估集成，不 fork 自建 |
| [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) | 活跃 | 每 Agent microVM、filesystem/network policy | 强隔离运行环境 | 高 | 后续 backend |
| [E2B](https://github.com/e2b-dev/e2b) / [Modal Sandboxes](https://modal.com/docs/guide/sandboxes) | 活跃 | 云端隔离执行和生命周期 | 远程 sandbox backend | 中 | Later |
| [Daytona](https://github.com/daytonaio/daytona) | OSS core 自 2026-06 起不再维护；AGPL-3.0 | 云开发环境 | sandbox/workspace | 中 | **不建议依赖其旧 OSS core** |
| [OPA](https://www.openpolicyagent.org/docs) / [Cedar](https://docs.cedarpolicy.com/) | 高；Apache-2.0 | 通用 PDP / principal-action-resource policy | 条件策略和决策解释 | 中 | MVP 不需要 |
| [Casbin](https://v3.casbin.org/docs/supported-models) | 高；Apache-2.0 | ACL/RBAC/ABAC 模型 | 嵌入式授权 | 中 | 仍属过度设计 |
| [OpenFGA](https://github.com/openfga/openfga) | 高；Apache-2.0 | Zanzibar-style ReBAC | 大规模关系授权 | 低 | Drop |
| [LangGraph](https://langchain-ai.github.io/langgraph/) / [AutoGen](https://github.com/microsoft/autogen) / [Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-orchestration/) | 高；主要为 MIT | durable workflow、多 Agent orchestration | reference workflow | 低至中 | 不嵌入核心 |
| [Temporal](https://docs.temporal.io/) | 成熟；MIT | durable execution | 长任务恢复、重试 | 低 | MVP Drop |
| [A2A](https://a2a-protocol.org/latest/specification/) | 高；Apache-2.0 | 独立 Agent discovery、task、streaming | 未来远程 Agent 服务互操作 | 低 | Later |
| [AG-UI](https://github.com/ag-ui-protocol/ag-ui) | 高；MIT | Agent backend 与 UI 的事件协议 | 未来 UI streaming | 低 | 当前无关 |

### MCP 覆盖了什么，没覆盖什么

MCP 已经定义：

- tool/resource discovery；
- tool invocation；
- transport；
- HTTP OAuth；
- server capability negotiation。

但 MCP 没有定义：

- 本机所有资源的 inventory；
- Project 对资源的 scope；
- Profile grant；
- 本地文件、shell、网络权限；
- Secret provider；
- 跨 harness 的 effective policy。

规范还明确要求 server 自行实施 access control，client 负责确认和审计；tool annotation 必须被视为不可信信息。[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

所以：

> MCP 是能力承载协议，不是 Agent-Box 的授权数据库或 OS enforcement boundary。

---

## 5. What Can Be Reused

### 直接复用

1. **MCP 作为服务型能力接口**

   数据库、GitHub、HTTP API、内部服务优先通过 MCP 或受控 proxy 暴露。

2. **Docker MCP Gateway 作为 MVP broker**

   它已经提供 server/tool selection、credential 管理、隔离、日志和 profile。[Gateway 文档](https://github.com/docker/mcp-gateway/blob/main/docs/mcp-gateway.md)

3. **Harness 原生权限**

   Agent-Box 的 grant 是权限上限；Claude/Codex/OpenCode 的本地确认规则可以进一步收紧，但不能扩大。

4. **外部 Secret Provider**

   - 本地 dogfood：Docker MCP secret store、1Password CLI；
   - 加密文件：SOPS + age；
   - 动态凭证：Vault；
   - 平台原生：GitHub App token、AWS STS 等。

   Vault 的 database secrets 和 lease 已经解决动态 credential 和撤销问题，不应重新实现。[Vault database secrets](https://developer.hashicorp.com/vault/docs/secrets/databases)、[Vault leases](https://developer.hashicorp.com/vault/docs/concepts/lease)

5. **ACP adapter**

   Zed 的 ACP 生态已经证明 Claude、Codex、OpenCode 等可通过 adapter 暴露为外部 agent。[Zed External Agents](https://zed.dev/docs/ai/external-agents)

6. **Sandbox backend**

   Agent-Box 可以选择集成 sandbox-runtime、Docker Sandbox 或未来云 backend，但不要自己做新容器/VM 平台。

---

## 6. What Should NOT Be Rebuilt

以下内容不应成为 Agent-Box 自有实现：

- Secret 加密算法、master key 管理；
- Vault 类动态 secret、续租、轮换；
- OAuth server 或 OAuth proxy；
- MCP gateway；
- MCP Registry；
- 通用 RBAC/ABAC/ReBAC policy language；
- Zanzibar/OpenFGA 类权限服务；
- SPIFFE/SPIRE workload identity；
- 容器、microVM 或远程 sandbox 平台；
- workflow engine、durable execution；
- Agent message bus；
- 自定义 Agent 通信协议；
- 通用 Web 管理控制台；
- 面向所有云、数据库、SSH、CLI 的统一资源 ontology。

尤其不要自行实现 MCP OAuth proxy。MCP 官方安全文档已经列出 confused deputy、token passthrough、SSRF、session hijacking 等风险；这不是一个 2–3 周适合重新实现的组件。[MCP Security Best Practices](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)

---

## 7. Competitive / Substitute Solutions

| 替代方式 | 能解决什么 | 解决不了什么 | 重叠程度 | 对 Agent-Box 的含义 |
|---|---|---|---|---|
| CLAUDE.md / AGENTS.md | 告诉 Agent 应做什么 | 无 enforcement、secret、生命周期、可信审计 | 低 | 继续作为 prompt surface，不当 policy |
| `.env` / shell env | 最简单的 project credential 注入 | Agent 可直接读取；易泄漏；无 scoped grant | 高 | 不重建 dotenv；只作为明确标注的 unsafe escape hatch |
| MCP server config | 工具发现、调用、部分 OAuth、server/tool filter | 无统一 Project/Profile policy 和 OS 权限 | 高 | 主要能力接口，应复用 |
| Docker / devcontainer | Project workspace、mount、network、service、secret | 不理解 Agent-Box Profile；跨 harness 配置不统一 | 高 | 复用为 runtime backend |
| Vault / 1Password / keychain | Secret 存储、获取、动态凭证 | 不知道哪个 Profile 在哪个 Project 可使用 | 高 | Agent-Box 只保存引用 |
| Claude/Codex 原生权限 | 本 harness 内的 shell/file/MCP 控制 | 配置格式各异、缺少跨 harness 审计 | 高 | 编译目标，不是竞争性替代 |
| Workflow framework tool config | 为 workflow node 配工具 | 通常只管理框架内 Agent，不覆盖外部 coding harness | 中 | 不自建 workflow；提供 Profile adapter |
| Sandbox provider | 隔离文件、网络、进程和生命周期 | 通常没有本地 Profile/resource registry | 高 | 做 backend adapter |
| Secret manager + shell scripts | 对高级用户可解决约 80% | 配置漂移、无统一 explain/audit、跨 harness 重复 | 极高 | 最大替代威胁；MVP 必须显著优于脚本 |
| 自定义 MCP gateway | 隔离 credential、过滤工具、调用日志 | 通常不理解 Agent-Box Project/Profile | 极高 | Docker Gateway/ToolHive 已覆盖，不应自建 |

### “80% 组合方案”是否成立

成立。今天用户可以这样做：

```text
devcontainer
+ 1Password/Vault
+ Docker MCP Gateway
+ Claude/Codex permission config
+ shell launch script
```

它已经获得：

- Project 隔离；
- Secret 存储；
- MCP tool filtering；
- harness 权限；
- 运行命令和部分日志。

Agent-Box 剩余的 20% 必须是：

- 相同资源在不同 harness 之间只声明一次；
- Project/Profile grant 的统一决策；
- 将统一 grant 编译到不同 enforcement backend；
- 一次运行的 effective plan、来源解释、生命周期和关联审计；
- workflow node 只绑定 Profile，不携带 Secret。

如果不能做到这些，它只是脚本和 Secret Manager 的 UI wrapper。

---

## 8. Product Value Analysis

### Useful engineering feature：High

Agent-Box 已经拥有：

- Profile identity；
- Project-aware config projection；
- 所有 harness 的统一 launch chokepoint；
- session 生命周期；
- registry-driven harness adapter。

当前 launch plan 本身已被设计成可测试、可审计的数据结构。[`launch.py`](../../src/agent_box/launch.py)

所以 effective capability compilation 是现有架构的自然延伸。

### Independent product value：Medium，条件式

它只有在以下场景出现时才有独立价值：

```text
多个 harness
× 多个 Project
× 多种 resource binding
× 不同 Profile grant
× 多次运行审计
```

如果用户只使用一个 Claude Code Profile 和两个 MCP server，原生配置更简单。

### Resume / demo value：High

一个严格的小 demo 可以展示：

- identity、policy、adapter、sandbox、MCP、secret brokering；
- deterministic plan compilation；
- least privilege 和 negative tests；
- 跨 harness interoperability；
- audit evidence 分层。

它比做一个大而全 Dashboard 更有技术深度。

---

## 9. Strongest Arguments Against This Direction

1. **“Global Resource Registry”容易退化成手工 CMDB**

   系统无法可靠知道“机器上存在什么”，只能知道用户登记了什么。大量 SSH、CLI、env、cloud、DB 类型最后会变成松散 YAML。

2. **MCP gateway 已经吞掉服务型资源层**

   Docker MCP Gateway 和 ToolHive 已包含 registry、secret、filter、runtime、audit。再做一套会变成薄封装。

3. **Harness 原生权限正在增强**

   Claude、Codex、OpenCode 都在强化 permission、sandbox 和 MCP controls。Agent-Box 的通用 capability 语义可能永远落后。

4. **本地单用户环境未必有 IAM 痛点**

   很多用户只想“能运行”，不愿维护 resource、scope、grant 三层配置。

5. **当前 runtime 不构成安全边界**

   整个 `/` 可见、共享网络、继承 env 时，deny policy 可能只有展示价值。

6. **通用 capability 名称无法自动执行**

   `query`、`migrate`、`deploy` 对不同 DB、CLI、MCP server 意义不同。没有 binding-specific mapping，它们只是标签。

7. **Audit 容易产生虚假保证**

   “资源被注入”不等于“被使用”；“工具被调用”也不等于外部系统产生了预期效果。

8. **Secret 不进 prompt 不等于安全**

   Agent 若有 shell 权限，仍可能读取 env/file；prompt injection 也可能诱导它调用合法但危险的工具。

9. **三层模型可能增加配置成本**

   对 Project-local resource，Project Scope 与 Grant 可能重复；用户可能更倾向一份直接的 profile binding。

---

## 10. Strongest Arguments For This Direction

1. **异构 harness 的权限配置确实不同**

   Claude 的 rule、Codex 的 sandbox/MCP config、OpenCode 的 ordered permission rule 无法直接复用。

2. **Agent-Box 已经拥有正确的启动控制点**

   它能在进程启动前计算 plan，在退出后 cleanup；这比外部脚本更可靠。

3. **Profile identity 是现成的统一主体**

   Workflow 不需要知道 Codex/Claude 的 credential 和配置位置。

4. **Project-scoped grant 并未被单个 harness 覆盖**

   Harness 通常只知道自己的 user/project config，不知道同一 Profile 在不同 Project 的统一权限。

5. **Brokered binding 可以真正减少 Secret 暴露**

   Agent 只得到一个过滤后的 MCP 通道，上游 token 保留在 gateway 进程或外部 secret provider。

6. **跨 harness explain/audit 是明确差异点**

   “为什么 Reviewer 此次只看到三个只读工具”是原生配置和 shell script 不容易统一回答的问题。

---

## 11. Recommended Product Boundary

建议将模块重命名或至少内部定位为：

> **Profile Capability Binding Runtime**

而不是泛化的 Resource/IAM Platform。

### Agent-Box 自己拥有

- 资源的非敏感引用和 binding metadata；
- Project resource references；
- Profile grant；
- effective plan compiler；
- decision explanation；
- harness/backend adapter；
- run-scoped binding lifecycle；
- 跨层 audit correlation。

### Agent-Box 不拥有

- Secret 值；
- credential rotation；
- OAuth server；
- gateway；
- sandbox implementation；
- workflow；
- 通用 policy language；
- 企业权限管理；
- 资源自动发现平台。

### “Global Registry”的修正

不要宣称回答：

> What resources exist on this machine?

建议改成：

> What externally managed resource bindings are known to Agent-Box?

这避免承诺自动发现、状态同步和真实性。

---

## 12. Recommended Architecture Boundary

```text
                    Control plane
┌──────────────────────────────────────────────────────┐
│ Global Resource References                           │
│ id / kind / metadata / provider_ref / binding_driver │
└───────────────────────┬──────────────────────────────┘
                        │ reference
┌───────────────────────▼──────────────────────────────┐
│ Project Scope                                        │
│ project_id -> resource aliases                       │
└───────────────────────┬──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│ Grants                                               │
│ project + immutable_profile_id + resource + actions  │
└───────────────────────┬──────────────────────────────┘
                        │ compile / validate / explain
┌───────────────────────▼──────────────────────────────┐
│ Effective Runtime Plan                              │
│ run_id / plan_hash / bindings / native permissions  │
└───────────────┬──────────────────┬───────────────────┘
                │                  │
       Data & enforcement plane    │
                │                  │
┌───────────────▼──────────┐  ┌────▼───────────────────┐
│ MCP Gateway / ToolHive   │  │ Sandbox + native       │
│ scoped tools, secrets,   │  │ harness permissions    │
│ invocation logs          │  │ files/shell/network    │
└───────────────┬──────────┘  └────┬───────────────────┘
                └──────────┬───────┘
                           ▼
                 Claude / Codex / OpenCode
                           │
                   session exit / cleanup
                           ▼
┌──────────────────────────────────────────────────────┐
│ Audit                                                │
│ decision → binding → invocation → external evidence  │
└──────────────────────────────────────────────────────┘

Workflow / editor ── ACP ──> Agent-Box Profile adapter
```

### Enforcement 原则

- Grant 是权限上限；
- native permission 或用户确认只能进一步收窄；
- adapter 不认识某个 action 时 fail closed；
- 不允许用通用字符串假装已 enforcement；
- 每个 binding driver 声明自己支持的 action vocabulary；
- Project/Profile 使用不可变 ID，显示名不能作为安全主体；
- 每次 launch 生成不可变 plan snapshot 和 hash。

### Audit 分层

| 事件 | 能证明什么 | 不能证明什么 |
|---|---|---|
| `decision.granted` | Policy 计算允许 | 资源已提供或使用 |
| `binding.created` | 通道、mount 或配置已建立 | Agent 调用了它 |
| `tool.invoked` | Gateway 收到调用 | 外部系统最终成功 |
| `external.effect` | 上游系统确认效果 | 需要 GitHub/DB/cloud 自身日志 |
| `binding.cleaned` | Agent-Box 已清理本次 binding | 上游 credential 一定已撤销 |

---

## 13. MVP Scope

### Must Have

#### 1. 极窄的数据模型和 CLI

只支持：

- `mcp_gateway` resource binding；
- Project resource reference；
- Profile tool-level grant；
- immutable profile/project/run ID；
- external secret reference，不保存值。

不要在 MVP 支持 SSH、cloud server、arbitrary CLI、database DSN、local directory 等通用类型。

#### 2. Effective Plan Compiler

提供类似：

```text
agent-box capability explain <profile> --cwd <project>
agent-box launch <profile> --cwd <project> --dry-run
```

输出：

- resource 来源；
- project scope 来源；
- grant 来源；
- 最终允许的 MCP server/tools；
- 使用的 binding driver；
- 无法执行的 grant；
- plan hash；
- unsafe exposure 警告。

这是最有差异化、也最适合测试的核心。

#### 3. 一个真实的 MCP Gateway Adapter

首选 Docker MCP Gateway：

- Agent-Box 为每次 run 启动独立 gateway/sidecar；
- 传入被授权的 server 和 tool allowlist；
- credential 只交给 gateway；
- Agent 只获得 stdio 或受限 endpoint；
- 退出时终止 sidecar。

不要实现自己的 gateway。

#### 4. 最小可信运行边界

至少做到：

- 不再无选择继承全部宿主 env；
- Agent 看不到 gateway 上游 Secret；
- 隐藏 Docker socket 和常见 credential 路径；
- Project 目录按需要只读/读写；
- 网络默认受限，只开放必要 gateway/upstream 路径；
- 复用 sandbox-runtime 或正确收紧现有 bwrap。

如果 2–3 周无法安全完成这一点，必须把 MVP 定位为：

> Capability configuration compiler

而不是：

> Least-privilege security runtime

#### 5. Audit、Cleanup 与 Reference Demo

演示：

```text
Coder Profile
  github MCP: read + write

Reviewer Profile
  github MCP: read only

Coder via ACP -> produces change
Reviewer via ACP -> reviews change
```

审计中显示：

- 两次不同 plan；
- 两套 tool allowlist；
- gateway binding；
- tool invocation；
- session exit；
- sidecar cleanup。

### Should Have

- `plan export --json`；
- negative test：Reviewer 调用写工具被拒绝；
- Codex 和 Claude 两个 adapter；
- ACP wrapper；
- secret/output redaction；
- gateway invocation log 与 Agent-Box `run_id` 关联；
- 明确标注 `env` binding 为 `exposure=raw`，默认禁用。

### Do Not Build

- Web Dashboard；
- Vault clone；
- generic resource catalog；
- RBAC role hierarchy；
- ABAC conditions；
- deny precedence language；
- cloud IAM federation；
- SSH credential broker；
- database proxy；
- custom MCP gateway；
- workflow UI；
- Kubernetes；
- A2A server；
- multi-user/team administration。

### 建议的 3 周安排

- 第 1 周：schema、CLI、compiler、explain、negative tests；
- 第 2 周：Docker MCP Gateway binding、launch isolation、cleanup；
- 第 3 周：Claude/Codex adapter、audit correlation、ACP 两节点 demo、文档。

---

## 14. Non-goals

明确写进 README：

- 不保证发现机器上的所有资源；
- 不保存或轮换 Secret；
- 不替代 harness 原生权限；
- 不替代 MCP；
- 不替代 sandbox；
- 不提供 enterprise IAM；
- 不提供多人授权治理；
- 不提供通用 workflow；
- 不保证任意 CLI/网络操作可映射成细粒度 capability；
- 不把 prompt instruction 当成 security control；
- 不把 binding audit 表述为 usage audit。

---

## 15. ACP / Workflow Integration Recommendation

### 1. 是否已有成熟协议

有，但分工不同：

- **ACP**：客户端/编辑器调用本地 coding agent；
- **MCP**：Agent 调用工具、资源和服务；
- **A2A**：独立网络 Agent 之间的 discovery、task 和 streaming；
- **AG-UI**：Agent backend 与前端 UI 的事件交互。

ACP 最符合当前需求。

### 2. Agent-Box 是否只需 adapter

是。建议：

```text
agent-box acp serve --project <id> --profile <immutable-id>
```

内部：

1. 计算 Effective Runtime Plan；
2. 启动 `codex-acp`、`claude-agent-acp` 或 OpenCode 对应 adapter；
3. 注入受控 MCP binding；
4. 将 native permission event 转发给 ACP client；
5. 记录 session 和 cleanup。

不要 fork 或改造 ACP 协议。

### 3. 是否定义新协议

**没有必要。**

ACP 的实验性 MCP-over-ACP 扩展尚不应成为核心依赖。优先使用 adapter 已支持的 client-provided MCP 或 harness 原生 MCP 配置。

### 4. 最简单 reference workflow

一个很薄的顺序 driver 即可：

```text
start coder Profile via ACP
→ submit task
→ capture result/diff
→ start reviewer Profile via ACP
→ submit diff/repo state
→ capture review
```

可以直接使用 ACP SDK；[acpx](https://github.com/openclaw/acpx) 也可用于 PoC，但其自身仍标注为 alpha，不建议成为 Agent-Box 核心依赖。

### 5. Workflow node 如何绑定 Profile/Grant

Workflow node 只保存：

```text
project_id
profile_id
task input
```

Grant 不复制进 workflow。运行时由 Agent-Box 根据 Project/Profile 重新计算。Workflow 无权扩大 grant，也不接触 Secret。

A2A 只应在未来 Agent-Box 把 Profile 暴露为独立远程 Agent 服务时考虑。

---

## 16. Risks

| 风险 | 严重度 | 缓解 |
|---|---:|---|
| 当前 bwrap 不是资源安全边界 | Critical | 收紧 sandbox 或降低产品声明 |
| Agent 通过其他宿主 credential 绕过 gateway | Critical | clean env、隐藏 socket/home、网络隔离 |
| 通用 capability 无法映射到 backend | High | binding-specific action vocabulary |
| Native harness 更新导致 adapter 漂移 | High | versioned adapter contract + compatibility tests |
| MCP server 本身不可信 | High | 独立进程/容器、只读 mount、tool filter |
| Audit 被误认为完整事实 | High | 明确 evidence level |
| Global Registry 配置腐化 | Medium | 只保存引用，不做自动 inventory |
| 用户配置成本高于 shell script | High | 一份 project manifest + `explain` |
| Docker Desktop 依赖限制 Linux/WSL 用户 | Medium | 后续 ToolHive/native adapter |
| Secret 出现在日志、argv、plan | Critical | ref-only、redaction、禁止 argv secret |
| UI 扩张吞掉时间 | Medium | MVP CLI-only |
| ACP adapter 行为差异 | Medium | 两个 harness 的契约测试 |

---

## 17. Unknowns That Need Real User Validation

必须用 dogfood 或访谈验证：

1. 用户是否真的同时使用两个以上 coding harness？
2. 同一资源是否需要按 Profile 分配不同权限？
3. 用户是否愿意维护 Project/Profile grant？
4. 原生 MCP config 的重复是否已经造成明显痛点？
5. `capability explain` 是否能显著缩短配置排错时间？
6. 用户最关心的是防误操作、Secret 隐藏，还是合规 audit？
7. MCP tool-level 权限是否足够，还是实际需要参数级限制？
8. Gateway sidecar 的启动延迟是否可接受？
9. 用户是否已经使用 Docker Desktop、1Password 或 Vault？
10. Review/Deploy Profile 的隔离是否会被真实使用，而不是只在 demo 出现？
11. 对 local directory、shell、SSH 的需求是否远高于 MCP 服务？
12. 用户是否接受“部分资源可 enforce，部分只是 advisory”的模型？

### Kill Metrics

满足任一情况应停止扩展：

- 4–6 周 dogfood 后仍只有项目作者自己使用；
- 没有一个真实场景需要不同 Profile 使用不同 grant；
- 用户始终直接复制 MCP config，认为 compiler 多余；
- 无法证明一次拒绝确实发生在 enforcement point；
- 主要登记对象只是 API key；
- 维护 adapter 的成本高于它消除的配置重复；
- “资源使用审计”只能记录 launch，无法记录实际调用。

---

## 18. Final Go / Modify / Kill Recommendation

### 最终建议：**Modify 后 Go，产品价值评级 Medium**

Kill 原始大方向：

> 通用 Project Resource Registry + Secret Manager + IAM + Sandbox + Workflow。

Go 收窄后的方向：

> 跨 harness 的 Profile Capability Binding、Effective Plan 和 run-scoped lifecycle。

它不是一个新的安全平台，而是 Agent-Box 对成熟安全与协议组件的编排层。

### 如果只有 2–3 周，我究竟会实现哪 5 个东西

1. **Resource Reference + Project Scope + Profile Grant 的极窄 schema/CLI**
   只支持 MCP gateway resource。

2. **Deterministic Effective Plan Compiler + `explain/dry-run`**
   包含来源、拒绝原因、plan hash 和 exposure warning。

3. **Docker MCP Gateway Adapter**
   每次运行启动受限 server/tool 集合，Secret 不进入 Agent prompt/process。

4. **可信的 Launch Binding 与 Cleanup**
   clean env、最小 filesystem/network、隐藏 credential 路径、结束 sidecar。

5. **分层 Audit + Claude/Codex 两 Profile 的 ACP reference workflow**
   展示 Coder 可写、Reviewer 只读，并包含真实拒绝测试。

如果时间不足，优先顺序是：

```text
Effective Plan
> Gateway Binding
> Runtime Isolation
> Audit
> ACP Demo
```

不要为了 ACP demo 牺牲真正的授权执行。

---

## Final Component Decision Table

| Component | Build / Reuse / Drop / Later | Recommended Solution | Reason |
|---|---|---|---|
| Resource metadata/reference | Build | 极窄 Agent-Box schema | 跨 harness 统一引用是核心价值 |
| 自动发现本机所有资源 | Drop | 无 | 易退化成不可信 CMDB |
| Project Scope | Build | Project resource refs | Agent-Box 特有上下文 |
| Profile Grant | Build | 显式 principal-resource-action | 差异化核心 |
| Effective Plan Compiler | Build | Agent-Box deterministic compiler | 最重要的自有能力 |
| Explain / Dry Run | Build | CLI + JSON export | 优于脚本的关键体验 |
| Secret storage | Reuse | Docker keychain、1Password、Vault、SOPS | 不应自行处理加密 |
| Secret rotation / leases | Reuse | Vault/cloud IAM | 高风险成熟领域 |
| MCP protocol | Reuse | 官方 MCP | 行业标准 |
| MCP gateway | Reuse | Docker MCP Gateway；ToolHive later | 已有完整实现 |
| Harness permissions | Reuse + thin adapter | Claude/Codex/OpenCode native config | enforcement 应留在原生层 |
| Sandbox implementation | Reuse | sandbox-runtime / Docker Sandbox / bwrap policy | 不造容器或 VM |
| Environment injection | Later / restricted | 仅显式 unsafe escape hatch | 本质是 raw secret |
| Generic policy engine | Drop for MVP | 简单代码/SQL decision | OPA/Cedar 当前过度设计 |
| Conditional ABAC | Later | Cedar 或 OPA | 有真实规则复杂度后再引入 |
| RBAC/ReBAC/Zanzibar | Drop | 无 | 本地单用户过度设计 |
| Audit decision/binding | Build | Agent-Box run event log | 跨 harness 差异化 |
| Tool invocation audit | Reuse + correlate | Gateway logs + run ID | 不应假装仅凭 launcher 可观察 |
| External effect audit | Reuse | GitHub/DB/cloud audit logs | 只有上游可证明 |
| ACP | Reuse | ACP + 现有 adapters | 不定义新协议 |
| A2A | Later | 官方 A2A | 仅适合未来远程 Agent |
| Workflow engine | Drop | 薄 ACP driver；未来 LangGraph/Temporal | 不属于本模块 |
| Web UI | Drop | CLI first | 2–3 周无必要 |
| Cloud sandbox | Later | E2B/Modal/Docker Sandbox | 非本地 MVP 核心 |
| Generic SSH/DB/cloud resource types | Later or Drop | 优先包装成 MCP/broker binding | 避免 ontology explosion |

最终一句话：

> 这个方向不是“再做一个 Secret/IAM 平台”才有价值，而是只有在 Agent-Box 成为异构 coding harness 与现有 gateway、sandbox、credential provider 之间的可解释授权编译器时，才具有真实、独立且能在 2–3 周内证明的价值。
