---
id: "104"
slug: probe-ssrf-redirect-hardening
batch: b2
baseline: "fc961945b15074a710267b0ed055280b4e5495a4"
depends_on: []
write_paths: ["src/agent_box/**", "tests/**", "docs/server-round1/**", "docs/implementation/status.md"]
forbidden: ["/home/maoqh/projects/agent-box-server-round1/**", "/home/maoqh/projects/agent-box-desktop-next-wsl-round1/**", "release/**"]
ruling: R-0011
terminal: ["PROBE_SSRF_HARDENING_DONE", "PROBE_SSRF_HARDENING_PARTIAL"]
waive: []
parallelism: "none"
parallelism_reason: "已收口的历史单：执行时未拆分单元，补记为单线程（不是本单引入的并行缺口）；再次触碰时按当时实际重declared。"
parallel_units: []
---

# Work Order 104 — 探测出站：SSRF 两条绕过 + 凭据跟随重定向（安全）

## Objective

**来源：审阅者发现 `AUD-B-004`（confirmed / medium / security），调度者已第一手复核。**
**优先级高**：前端 **P28（Providers 页）** 的"获取上游模型列表"按钮会带**真 key** 调这两个探测方法 ⇒ 修好之前不要把真 key 用在探测上。

**两条绕过（都是已提交代码的确定性事实，无需真机利用）**：

1. **域名不解析**：`_validate_endpoint` 用 `ipaddress.ip_address(host)` 判内网；**域名**会抛 `ValueError` ⇒ `address=None`
   ⇒ **私网/保留段检查整段跳过**（`probe.py:70-73`）。`https://attacker.example` 解析到 `10.x` / `169.254.169.254`（Windows 宿主的 IMDS）**无人拦截**。
2. **跟随重定向 + 凭据外泄**：`_open_request` 用默认 `urlopen`（`probe.py:91-94`）⇒ 首跳 `https://legit-provider` 回 **302** 后，
   默认 opener 照跟，**scheme 检查只看首跳**，且 **`Authorization` 随重定向头一起发出**（CPython `urllib` 的 `redirect_request`
   只剔除 `Content-Length`/`Content-Type`，不剔除 `Authorization`）⇒ 合法供应商的**开放重定向**即可把用户的 API key 交给第三方。

**与合同相悖**：55 号单 §SSRF 防护写的是"只 https、拒绝非声明端点、拒绝内网地址除 loopback 例外"；模块自述同义（`probe.py:8-18`）。
"只走声明的端点"字面上就要求**不跟随 3xx**。

**明确不做**：改探针的对外形状（参数/返回）；放宽既有边界（https-only、超时、大小与条数上限、凭据不落库）；
把探测改成"多跳可跟"（那要另开单并带完整威胁模型）。

## Current state

| 事实 | 出处（第一手） |
| --- | --- |
| 私网检查只对**字面 IP** 生效；域名直接跳过 | `src/agent_box/server/model_configs/probe.py:70-73` |
| 默认 `urlopen`（跟重定向、无自定义 opener） | `probe.py:91-94`（`_open_request`） |
| 凭据只在请求头（既有纪律，不变） | `probe.py:95-100` 一带 |
| 既有两个调用方：`providerModels.probeModels` / `probeConnection` | `model_configs/service.py:24-40` |
| 前端 P28 将带真 key 使用它 | `docs/desktop-product-delivery/work-orders/P28-provider-page-redesign.md` |

## Scope

| From | To / action | Reason |
| --- | --- | --- |
| 重定向 | **不跟随**：装一个**拒绝 3xx** 的 opener（或 `HTTPRedirectHandler` 覆写为类型化拒绝）；3xx ⇒ 类型化 `PROBE_ENDPOINT_BLOCKED`（或新码，报告里写明） | 一次性探测="只走声明端点" |
| 域名解析 | 在 `_validate_endpoint` 增加**解析步**：`socket.getaddrinfo(host, port)`，对**全部**解析地址复跑"环回例外/私网/保留/多播"判定；任一不合法 ⇒ 类型化拒绝 | 防 DNS→内网（同型先例：只在首跳按主机名查私网即被打穿） |
| 连接层 | 尽量**连到已校验的那个地址**（如可行），并在报告里如实说明"校验与连接之间仍有 DNS 重绑定窗口"（做不到就写清残余风险） | 不假装完美 |
| 同型清扫 | 扫全仓其它**出站**调用（`urlopen`/`requests`/`httpx`）是否也跟重定向/带凭据；列成表，**只修属于本单范围（探针）**，其余记入 status 待开单 | 一次把形状摸清 |
| 门 | 反例：**302→`http://127.0.0.1`** 与 **302→`http://169.254.169.254`** 必须类型化拒绝；**域名解析到私网**必须类型化拒绝；正例：合法 https 端点（本地假服务）成功；**旧代码必须让门红** | 门要能咬 |

**必须保持不变**：探针的 wire 形状与类型化码语义（除新增的拒绝码）；size/条数/超时上限；凭据不进记录/日志/证据；
`probe.py` 的"结果不写进记录"纪律；R-0017 成本（本单**零真实模型调用**，全用本地假端点/静态复现）。

## Requirements

### Requirement: 不跟随重定向

#### Scenario: 3xx 类型化拒绝

**WHEN** 假端点回 302（Location 指向 loopback 或任意地址）
**THEN** 探测以**类型化拒绝**结束（不跟随、不读二跳、**不发第二次请求**）；gate 断言"请求计数恰为 1"

### Requirement: 域名解析后复检

#### Scenario: 域名→私网被拒

**WHEN** host 是域名且解析结果含私网/保留/多播地址（测试用 `getaddrinfo` 桩或本地可解析名）
**THEN** 类型化拒绝；**反例**：只查字面 IP 的实现必须让门红

#### Scenario: 合法端点不受影响

**WHEN** 合法 https 端点（本地假服务，loopback 例外）
**THEN** 成功返回模型列表；`probeConnection` 仍回 `reachable/unreachable/failed`

## Stages

- [ ] 1. 观测：复核两条绕过（静态 + 请求计数）、出站调用全仓清扫表（提交）
- [ ] 2. 不跟随重定向 + 类型化码（提交）
- [ ] 3. 解析后复检（+ 连到已校验地址，或写明残余窗口）（提交）
- [ ] 4. 门：两条反例 + 域名反例 + 正例；旧代码必红（提交）
- [ ] 5. 账与证据（含清扫表、残余风险）（提交）

## Gates

| Gate | Assertion | Counter-example (required) | Absent / unknown ⇒ |
| --- | --- | --- | --- |
| G1 不跟随 | 3xx ⇒ 类型化拒绝且请求计数 == 1 | 跟随必须门红 | fail (typed) |
| G2 解析复检 | 域名→私网/保留/多播 ⇒ 拒绝 | 只查字面 IP 必须门红 | fail (typed) |
| G3 回归 | 合法端点正例仍成功；既有探针测试与套件计数入账 | 任一变红即门红 | fail (typed) |
| G4 零真机成本 | 本单无真实模型调用（本地假端点/桩） | 出现真实调用必须门红 | fail (typed) |

## Validation

```bash
python3 -m pytest tests/server -q -k probe
python3 -m pytest tests/ -q
python3 ~/.agents/skills/incremental-work-order/scripts/validate_order.py docs/implementation/work-orders --strict
git diff --check && git status --short
```

## DoD

1. 实现（不跟随 + 解析复检）· 2. 反例（G1/G2 各一条 + 旧代码必红）· 3. 真机证据（本地假端点；请求计数）· 4. 回归计数
· 5. 账务（零真实调用）与清理 · 6. status 分账（含清扫表与残余风险）。缺一项 ⇒ `PROBE_SSRF_HARDENING_PARTIAL`。

## Acceptance

- 绿：`PROBE_SSRF_HARDENING_DONE`
- 否则：`PROBE_SSRF_HARDENING_PARTIAL` + 精确剩余

## Notes for the executor

- 本单在 **b2 追加**且**优先于 103**（安全面先行）；前端 P28 的探测接线以本单落地为前置（调度者会同步改 P28 的依赖）。
- `docs/reviews/**` 不归你写；调度者标 `dispatched`。
- 报告里必须有一句**残余风险**（DNS 重绑定窗口是否消除、如何消除或为何不可消除）——不写就按 PARTIAL。
