---
id: 095
slug: provider-logins-and-account-lifecycle
batch: b4
baseline: "f6cbc113791347e20acc85ec34c2e697d2345dd0"
depends_on: [{"order": "094", "condition": "登录引擎与账号资产落位可用；未落地时只做观测与注册表设计"}]
write_paths: ["src/agent_box/**", "plugins/**", "tests/**", "scripts/server-round1/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0013
terminal: ["PROVIDER_LOGINS_DONE", "PROVIDER_LOGINS_PARTIAL"]
waive: []
parallel_units: ["login-kinds","account-lifecycle"]
---

# Work Order 095 — 订阅登录（二）：provider 型登录 + 账号生命周期（刷新 / 额度 / 订阅模型列表）

## Objective

094 让"某家 CLI 的账号登录"（harness 型：登录态就是该 harness 的原生登录文件）跑通。本单补上另外三件事：

1. **provider 型登录**：登录换来的是**可当上游凭据用的令牌束**（GitHub Copilot / xAI / Google）——它属于某个
   **provider 记录**而不绑 harness（用户早先的原话："有些账号登录好像又可以给别的平台用"），落点是
   `credential.kind=oauth`，**原地轮换**（同一 locator），harness 像用 api key 一样被注入；
2. **刷新**：取用时令牌过期则自动刷新（cc-switch 的 `get_valid_token_for_account` 语义）；刷新失败 ⇒ 账号记
   `relogin_required`（类型化、界面可见），**不静默降级**；
3. **额度与订阅模型列表**：按家钉死端点取额度（没有钉死的家**不显示**额度），且"获取上游模型列表"对订阅 provider
   走**该家的订阅端点**（codex 是 `chatgpt.com/backend-api/codex/*`，**不是** `/v1/models`）。

**明确不做**：前端（**P30**）、新开 PKCE/loopback 流、把额度做成"估算值"、为没钉死的家编端点。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| harness 型登录已通（094 落地后） | 094 |
| 凭据表与注入路径：`server_credentials{id,kind,secret_locator}`；harness 侧声明 `credentialKind`/`credentialEnvironment`，取用时读秘密存储 | `storage/database.py:61`；`bootstrap/runtime.py` 描述符；`model_configs/service.py:24` 的读法 |
| provider 的认证两态已在记录上 | 092 的 `authStyle ∈ {api-key, subscription-login(<family>)}` |
| cc-switch 的额度与失败语义（一手可学） | `services/subscription.rs`：成功/确定性失败写快照并通知界面；**传输失败保留上次**、**鉴权失败替换**（陈旧数字消失）；Codex 额度与 Codex CLI 同端点 |
| cc-switch 的订阅模型列表 | `commands/codex_oauth.rs`：`chatgpt.com/backend-api/codex/*`，复用托管账号的 access_token |
| 探针已有出站纪律与按 authStyle 分流的挂点 | `model_configs/probe.py`、`service.probe_models` |

```text
before/
├── 凭据只有 api_key / 外部注入                    ⚠ 登录换来的令牌没有落点
├── 额度无面；订阅 provider 的模型列表会去 /v1/models ⚠ codex 订阅根本没有这个端点
└── 令牌过期只能靠一次失败暴露                      ⚠ 用户体验

after/
├── provider 型登录 → credential(kind=oauth)，原地轮换   ◀ 095
├── 取用时自动刷新；失败记 relogin_required              ◀ 095
├── 额度按家钉死；传输保旧 / 鉴权清空                    ◀ 095
└── 订阅 provider 的模型列表走该家订阅端点                ◀ 095
```

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 流程注册表 | 增 **provider 流程**：copilot（GitHub device flow + `api.github.com/copilot_internal/v2/token` + `/copilot_internal/user`）、xai（OIDC 发现 → `auth.x.ai/oauth2/token`）、google（`oauth2.googleapis.com/token`）；**只登记一手钉死的** | provider 型登录 |
| 令牌落点 | provider 型登录 → `credential.kind=oauth` + 秘密存储；**轮换写同一 locator** | 走既有注入路径 |
| 刷新 | 取用前判过期 → 刷新 → 写回同一 locator；失败 ⇒ 账号/凭据标 `relogin_required` + 类型化错误 | 不静默降级 |
| 额度 | `accounts.quota({accountId})`（或等价）：按家钉死端点；**未钉死的家返回"未声明"**而不给数字 | 学 cc-switch 的诚实 |
| 额度失败语义 | 传输失败 ⇒ 保留上次成功值 + 时间戳；鉴权失败 ⇒ 清空 + 提示重新登录 | 陈旧数字宁可消失 |
| 订阅模型列表 | `probeModels` 按 `authStyle` 分流：`api-key → /models`；`subscription-login → 该家订阅端点`（codex 一手：`chatgpt.com/backend-api/codex/*`） | 订阅没有 /v1/models |

**必须保持不变**：`api-key` 路径的探针与注入逐字不变；凭据纪律（只作 locator、值只在调用期）；R-0012 的跨平台模型；
注销账号时的引用检查（被 profile/记录引用时先类型化拒绝）。

**明确不做**：把额度缓存成"事实"写进记录（快照带时间戳、可失效）；用登录令牌去跑**模型**调用以"验证额度"（额度端点就是额度端点）；
给 copilot/xai/google 之外的家编流程。

## Requirements

### Requirement: provider 型登录落成自刷新凭据

#### Scenario: 登录 → 凭据 → 执行可用

**WHEN** 对某 provider（`authStyle=subscription-login`）发起 provider 型登录并在假端点上完成
**THEN** 产生一条 `kind=oauth` 的凭据记录，其秘密存储里有令牌束；把该 provider 挂到任何**协议兼容**的 harness 上执行一轮，
令牌经既有注入路径到达 guest；**记录里没有令牌内容**

#### Scenario: 原地轮换

**WHEN** 令牌过期后取用
**THEN** 刷新请求发出，新令牌写回**同一 locator**（凭据 id 不变），引用该凭据的记录无需改动；刷新失败 ⇒ `relogin_required` 类型化

### Requirement: 额度诚实

#### Scenario: 有钉死端点 / 没钉死端点

**WHEN** 对 codex（钉死）与某未钉死的家分别查询
**THEN** 前者返回额度快照（含取值时间）；后者返回"未声明"（**不是 0、不是估算**），界面据此不显示额度

#### Scenario: 两类失败不同（反例）

**WHEN** 端点传输超时（第一次），与端点返回鉴权失败（第二次）
**THEN** 第一次**保留**上一份快照并标时间；第二次**清空**；gate 的反例：鉴权失败仍显示旧数字必须门红

### Requirement: 订阅 provider 的模型列表走订阅端点

#### Scenario: 分流正确

**WHEN** 对 `authStyle=subscription-login` 的 provider 点"获取上游模型列表"（接口层：`probeModels`）
**THEN** 请求打到**该家订阅端点**（codex 是 `chatgpt.com/backend-api/codex/*` 系），返回的模型 id 与 `api-key` 路径同形状；
**反例**：给订阅 provider 打 `/v1/models` 必须让门失败

## Stages

- [ ] 1. 观测：凭据注入路径、探针分流挂点、cc-switch 的三家端点与额度语义（落表）（提交）
- [ ] 2. provider 型登录：注册表 + 凭据落点 + 原地轮换（假端点端到端）（提交）
- [ ] 3. 刷新与 `relogin_required` + 引用检查（提交）
- [ ] 4. 额度与订阅模型列表分流（含两类失败反例）（提交）
- [ ] 5. 门与账：套件 + 反例 + 证据 + status 逐家登记（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 provider 型登录 | 假端点登录 → oauth 凭据 → 执行注入可用 | 只回"成功"不落凭据必须门红 | fail (typed) |
| G2 轮换 | 刷新写同一 locator、凭据 id 不变 | 新建第二条凭据必须门红 | fail (typed) |
| G3 额度存在性 | 未钉死的家不返回数字 | 返回 0/估算值必须门红 | "未声明" |
| G4 额度失败语义 | 传输保旧（带时间）、鉴权清空 | 鉴权失败仍显示旧值必须门红 | 无快照 ⇒ 不显示 |
| G5 订阅分流 | 订阅 provider 走订阅端点 | 打 `/v1/models` 必须门红 | fail (typed) |
| G6 回归 | api-key 路径与 094 的登录路径均不退化 | 改动 api-key 探针行为必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q
python3 -m pytest plugins/agent-box-harnesses/tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（provider 型登录 + 刷新 + 额度 + 分流）· 2. 反例（G2/G4/G5）· 3. 真实环境（假端点全路径；真实端点按 R-0011 记账，
额度端点可真实调用一次）· 4. 回归计数 · 5. 账务与清理（临时凭据/资产零残留）· 6. status 逐家登记。
缺一项 ⇒ `PROVIDER_LOGINS_PARTIAL`。

## Acceptance

- 绿：`PROVIDER_LOGINS_DONE`
- 否则：`PROVIDER_LOGINS_PARTIAL` + 逐家剩余（哪家、缺什么证据）

## Notes for the executor

- 三家 provider 流程的端点**必须一手钉死**（cc-switch 源码或官方文档 + 一次真实调用的形状）；钉不死的家**不登记**。
- 令牌只进秘密存储；额度快照只存数字与时间戳（不是凭据）。
- 本单在 **b4**，接在 094 之后；批末 `checkpoint/b4` + 报告。
- 需要人拍的事 → 本树 status §Questions；契约问题交回调度者。
