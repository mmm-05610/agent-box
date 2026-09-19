---
id: 094
slug: subscription-login-engine
batch: b4
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: [{"order": "092", "condition": "provider 记录的 authStyle=subscription-login 与 harness 侧声明可用；未落地时本单只做阶段 1/2 的引擎与假端点路径"}]
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["SUBSCRIPTION_LOGIN_DONE", "SUBSCRIPTION_LOGIN_PARTIAL"]
waive: []
parallel_units: ["device-code","state-store"]
---

# Work Order 094 — 订阅登录（一）：登录引擎 + codex 的 harness 型登录

## Objective

把"订阅登录"从**导入已有登录态**变成**在应用里登录**（用户裁定：要 OAuth，学 cc-switch）。三件事变真：

1. **登录引擎跑在 Server 上**（R-0012：Windows 是控制面与密钥持有者）：服务端发起 device-code 流、
   有界轮询、成功后**直接把登录态打包进既有的账号资产**（56 的 `accounts/assets.py`），
   **客户端永远拿不到令牌**，只看到"验证网址 + 用户码 + 状态 + 账号事实"；
2. **codex 的 harness 型登录端到端**（用户点名的例子：codex 用 GPT 订阅登录）——一手端点见 §Current state；
3. **未钉死流程的家类型化拒绝** `LOGIN_FLOW_UNSUPPORTED`（**绝不猜端点**），`accounts.importAsset` 保留为后备。

**明确不做**：provider 型登录（Copilot/xAI/Google 是 **095**）、额度与刷新（095）、任何前端改动（**P30**）、
PKCE/loopback 回调流（device-code 覆盖了要的家）。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 账号的**存储与投影**已做：`accounts.create/bind/importAsset`、资产打包（声明文件、上限、每账号锁、回收拒绝覆盖） | `src/agent_box/server/accounts/{records,assets}.py`（order 56）；`wire/handlers.py:797-895` |
| 各家**声明的登录态文件**已可从部署读出：`subscription_files_for(harness)`；codex 已声明 `.codex/auth.json` | `wire/handlers.py:892`；`plugins/agent-box-harnesses/src/agent_box_harnesses/codex/production.py:329` |
| **缺的就是登录流程本身**：令牌从哪来——今天只能 `importAsset`（导入别处已有的登录态） | 同上（`accounts_import_asset` 是唯一入口） |
| cc-switch 的 codex 登录是一手可学的 device-code 流 | cc-switch `src-tauri/src/commands/codex_oauth.rs`、`services/subscription.rs`：`auth.openai.com/api/accounts/deviceauth/{usercode,token}`、用户访问 `auth.openai.com/codex/device`、刷新 `auth.openai.com/oauth/token`，登录态 = Codex 原生 `auth.json` 的 `auth.tokens.{access_token,refresh_token,account_id}` |
| 出站纪律已有先例（https-only + loopback 例外、连接/总超时、响应上限、凭据只在调用期） | `src/agent_box/server/model_configs/probe.py`（55/070） |
| 秘密存储是唯一的令牌落点 | `credential_cli.py` / `secret_store`（`service._probe_credential` 的读法）；R-0012 |

```text
before/
├── accounts.importAsset(path)        ⚠ 只能导入别处已有的登录态
├── 登录态 = opus 资产（已做）          ✓ 保留
└── 无登录会话概念                     ⚠ 应用里不能登录

after/
├── accounts.beginLogin/loginStatus/cancelLogin   ◀ 094（引擎 + 会话）
├── codex：真机 device-code 登录 → 资产落位         ◀ 094
└── 其它家：LOGIN_FLOW_UNSUPPORTED（类型化）        ◀ 094
```

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 无 | 新增**登录会话**（内存 + 有界生命周期）：`{loginId, harness, state, verificationUri, userCode, expiresAt, intervalSeconds, attempts}` | 引擎 |
| 无 | 新增**流程注册表**：`harness → {deviceCodeEndpoint, tokenEndpoint, userCodeField…}`，**只登记已一手钉死的家** | 不猜 |
| `wire/handlers.py` | 新增 `accounts.beginLogin`/`accounts.loginStatus`/`accounts.cancelLogin`（参数白名单同风格） | 契约 |
| 账号资产 | 登录成功后**走既有 `pack_asset` + 记录路径**落位（不新建第二条存储/投影通道） | 单一真相 |
| 出站 | 复用 probe 的边界纪律（https-only + loopback 例外、超时、大小上限、**轮询间隔与总时长上限**、用户取消即停） | 安全 |
| 令牌 | 只进秘密存储；wire 响应、日志、证据、argv 里**不出现** | R-0012 |

**必须保持不变**：56 的资产语义（声明文件、上限、每账号锁、回收拒绝覆盖）、`credentials` 表与凭据注入路径、
R-0012 的一次性投影、账号列表**不返回令牌**（今天就不返回，不许退化）。

**明确不做**：把令牌回给客户端；在桌面端开监听端口；给未钉死的家编端点；把"登录"做成"跳过验证的假成功"。

## Requirements

### Requirement: 登录会话的生命周期

#### Scenario: begin → pending → authorized

**WHEN** 客户端调 `accounts.beginLogin({harness:"codex"})`
**THEN** 返回 `{loginId, verificationUri, userCode, expiresAt, intervalSeconds}`；随后的 `accounts.loginStatus` 在用户完成前是 `pending`，
完成后是 `authorized` 且带 `accountId`；再次查询同一 `loginId` 结果稳定（幂等读）

#### Scenario: 过期与取消是终态

**WHEN** 用户未在窗口内完成（超过 `expiresAt`）；或客户端调 `accounts.cancelLogin`
**THEN** 状态变 `expired` / 取消后**不再有任何出站请求**（gate 用假端点计数断言：取消后请求数为 0）

#### Scenario: 令牌不出边界（反例）

**WHEN** 逐字检索 `beginLogin`/`loginStatus` 的响应、Server 日志与证据文件
**THEN** 找不到任何 access/refresh token 值；gate 的反例：把令牌放进响应必须让门失败

### Requirement: codex 的 harness 型登录端到端

#### Scenario: 假端点机械路径 + 真机人工一轮

**WHEN** 对着**假端点**跑完整路径（usercode → 轮询 pending × N → token → 资产落位）
**THEN** 资产里的文件名与 codex 声明的 `.codex/auth.json` 一致、摘要登记、`accounts.list` 出现该账号；
**另按要求做一次真实登录**（由用户人机界面完成），只记事实（账号标识、时间、成功/失败），**不记令牌**

#### Scenario: 登录态真的能用

**WHEN** 用登录得到的账号发起一轮 codex 执行（假端点或真实按 R-0011 记账）
**THEN** 登录态被物化进 guest（56 的路径）且轮次完成；结束后按 56 的回收规则收尾（harness 若原地刷新则回收新版）

### Requirement: 未钉死的家拒绝，不是猜

#### Scenario: 类型化拒绝

**WHEN** 对未登记流程的家（例如今天的 claude/hermes/pi…）调 `accounts.beginLogin`
**THEN** 类型化拒绝 `LOGIN_FLOW_UNSUPPORTED`（写明"该家未登记登录流程"），**不产生任何出站请求**；
`accounts.importAsset` 仍可用（后备路径）

#### Scenario: 声明不一致也要拒

**WHEN** 某家在流程注册表里有端点、但部署**没有**声明 `subscriptionCredential.files`
**THEN** 类型化拒绝（`LOGIN_STATE_FILES_UNDECLARED`）——没有声明文件就没有落点，不许"猜一个文件名"

## Stages

- [ ] 1. 观测：读 56 的资产路径、`subscription_files_for`、codex 声明与 cc-switch 的端点形状，落 before 表与基线计数（提交）
- [ ] 2. 引擎：会话生命周期 + 流程注册表 + 出站边界 + 假端点端到端（含取消/过期反例）（提交）
- [ ] 3. codex 接线 + wire 三方法 + 令牌边界门（提交）
- [ ] 4. 真机一轮（用户完成设备码）+ 一次执行轮验证登录态可用（提交）
- [ ] 5. 门与账：全套件 + 反例 + 证据 + status 分账（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 会话 | begin/loginStatus/cancel 三态齐全；取消或过期后**出站请求数归零** | 取消后仍在轮询必须门红 | fail (typed) |
| G2 令牌边界 | 响应/日志/证据/argv 里检索不到令牌值 | 把 access_token 放进响应必须门红 | fail (typed) |
| G3 codex 端到端 | 假端点全路径 + 资产文件名/摘要/账号行齐 | 不落资产只回"成功"必须门红 | fail (typed) |
| G4 拒绝 | 未登记的家 `LOGIN_FLOW_UNSUPPORTED` 且零出站；声明缺失 `LOGIN_STATE_FILES_UNDECLARED` | 对未登记的家发出请求必须门红 | fail (typed)，绝不猜端点 |
| G5 执行可用 | 登录态经 56 路径物化并完成一轮；收尾按回收规则 | 绕过资产直接读令牌给执行侧必须门红 | fail (typed) |
| G6 回归 | 既有账号/凭据/探针套件与 56 的资产反例全绿 | 摘掉 56 的锁/上限必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（引擎 + 注册表 + codex 接线 + wire）· 2. 定向测试**与反例**（取消/过期/令牌边界/拒绝）· 3. 真实环境
（假端点全路径 **+ 一次真机登录**，只记事实）· 4. 回归计数与退出码 · 5. 账务与清理（临时账号/资产零残留）· 6. status 分账。
缺一项 ⇒ `SUBSCRIPTION_LOGIN_PARTIAL`。

## Acceptance

- 绿：`SUBSCRIPTION_LOGIN_DONE`
- 否则：`SUBSCRIPTION_LOGIN_PARTIAL` + 精确剩余（哪家/哪条路径/缺什么证据）

## Notes for the executor

- **真机登录需要人**：设备码要用户在自己的浏览器里输入。门里跑假端点覆盖机械路径；真机那一次由用户完成，
  证据只写"何时、账号标识、成功/失败"，**令牌零记录**（R-0012）。
- 凭据/令牌只作 locator 与秘密存储内容；不复制、不打印、不进 argv。
- 需要人拍的事 → 本树 status §Questions；契约问题交回调度者。
- 本单在 **b4**；批末 `checkpoint/b4` + 报告，然后继续 095。
- 自检：`python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py . --strict`。
