# 104 — 探测出站：SSRF 两条绕过 ＋ 凭据随行（证据）

工单基线 `fc96194`；本单在 `75db678`（098 收口后）上执行，按公告第 28 轮排在 088/090 **之前**。
§1–§4 是**阶段 1（观测）**。凡标 **实测** 是本单一手跑出来的；**推断** 的单列一节并说清哪几环测过、哪一环没测。
**本单全程零真实模型调用**：目标只有本机回环与一个**从未被解析**的假域名，凭据只用字面假值。

## 1 实测：两条绕过都在公开入口上（`pull_models` / `probe_connection`）

被测面：`src/agent_box/server/model_configs/probe.py` 的两个公开函数——**不是**只测私有 helper，
因为 wire 上 `providerModels.probeModels` 与 `probeConnection` 正是分别走这两个（`service.py:24-40`）。

### 1.1 绕过一：域名从不被解析

| 输入 | 结果 |
| --- | --- |
| `https://169.254.169.254` | **拒绝** `PROBE_ENDPOINT_BLOCKED` |
| `https://10.255.255.254` | **拒绝** `PROBE_ENDPOINT_BLOCKED` |
| `https://attacker.example` | **通过**（`_validate_endpoint` 返回 `(base, 'attacker.example')`） |
| `https://metadata.internal.example` | **通过** |
| `https://imds-behind-a-name.internal.example/v1` 走 `pull_models` | **通过校验**，最后以 `PROBE_UNREACHABLE` 结束 |

**关键一手**（把"没解析"从推断变成计数）：把 `socket.getaddrinfo` 换成 tripwire 再跑——

* `_validate_endpoint("https://imds-behind-a-name.internal.example")` 期间
  **`getaddrinfo` 被调用 0 次** ⇒ 校验阶段这个名字**从未被解析**；
* 同一个域名走 `pull_models` 时 `getaddrinfo` 只被调用 **1 次，且发生在连接层**（`http.client` 里），
  它的返回值**没有任何一步看过**；
* 对照：把 tripwire 解析结果指向私网 `10.255.255.254`，同一个地址写成字面量时得到
  `PROBE_ENDPOINT_BLOCKED`，写成域名时得到 `PROBE_UNREACHABLE`
  ⇒ **拒绝与否取决于攻击者选哪种 URL 写法**，而不是取决于目标是不是内网。

⇒ 工单 §Objective 第 1 条成立，且**两个公开入口都受影响**（`probe_connection` 同样通过校验，
最后回 `unreachable/PROBE_UNREACHABLE`——注意这不是"挡住了"，是"连不上而已"）。

### 1.2 绕过二：跟随 302，且 `Authorization` 随行

形态：本机起**两个**回环假端点（`ThreadingHTTPServer`，随机端口）。A 回 `302 Location: http://127.0.0.1:<B>/models`，
B 记录收到的请求头并回一个合法 OpenAI 形状。凭据用字面假值 `DUMMY-NOT-A-REAL-SECRET-0123456789`。

```
A 侧请求: [{'path': '/models', 'authorization': 'Bearer DUMMY-…'}]
B 侧请求: [{'path': '/models', 'authorization': 'Bearer DUMMY-…'}]
出站请求总数 = 2        ← 合同与模块自述都说"一次"
二跳带凭据头 = True     值 == 原请求的凭据 = True
```

⇒ 一次"探测用户声明的端点"实际发出了两次请求，第二次**发给声明之外的主机**，
而且把用户 key 一起发了。工单 §Objective 第 2 条成立。
`CPython` 侧的机理由工单给出（`redirect_request` 只剔 `Content-Length`/`Content-Type`）；
本单**只认领实测到的行为**：头确实到了 B。

## 2 实测：第三条，工单没写——**代理把"声明端点"换掉了**

跑 §1.2 时撞出来的：`getproxies()` 在本机非空（`http`/`https` 都指向 `127.0.0.1:7897`，
`no_proxy = localhost,127.0.0.1`）。`urlopen` 用的是默认 opener ⇒ **代理是隐式生效的**，
而 `_validate_endpoint` 只看用户给的那串 URL，**代理完全不在它的视野里**。三条一手结果：

1. **`https://named-endpoint.invalid`** ⇒ 假代理收到的是 `CONNECT named-endpoint.invalid:443`，
   **没有** `Authorization` 头（TLS 隧道，代理看不见头部）；`pull_models` 回 `PROBE_UNREACHABLE`。
2. **`http://localhost:<port>`**（配一个指向假代理的 `http_proxy`，并把 `no_proxy` 清空）⇒
   假代理收到 `GET http://localhost:<port>/models`，**`Authorization: Bearer DUMMY-…` 明文**，
   并且 `pull_models` 回 **`ok / 1 model ids`**——
   **Server 以为自己在探测声明端点，实际整次对话是和那个中转方完成的。**
3. **不改任何代理设置、按本机真实环境**跑"第一跳 302 → `http://169.254.169.254/models`"：
   第一跳记录到 `/models`（直连，`no_proxy` 豁免 127.0.0.1），
   第二跳**离开了本进程**，由机器上配置的代理代跑，代理回了 `502 Bad Gateway`。
   ⇒ 502 是**那个外部进程**决定不放行，不是我们的代码拒绝的；`no_proxy` 里
   **没有** `169.254.169.254`，所以这条重定向目标天然落到代理手里。

这三条合起来说明：**"只走声明的端点"这句话今天连"由谁去连"都没固定**，
光修 §1 的两条（复检解析结果、不跟重定向）还留着一个能把请求整条交给第三方的旁路。
⇒ 阶段 2 的修法把**"探针不用系统代理"**一并钉住（`ProxyHandler({})`），
理由不是"多加一道防护"，而是合同字面要求（"一次出站请求到**声明的**端点"）。

## 3 既有测试为什么没拦住（同一形状第三次出现）

| 事实 | 出处 |
| --- | --- |
| 唯一的 SSRF 门只喂**字面 IP** | `tests/server/test_usage_parsing.py:392-404`：`http://10.1.2.3/v1`、`ftp://example.com`、`https://192.168.1.9/v1` ⇒ 三个都是字面量，**没有一个域名** |
| 全仓测试里**没有任何** 302/redirect 用例 | `grep -rn "302\|redirect" tests/server/*.py` ⇒ 0 命中（只有 `test_hermes_production_chain.py:320` 一处无关的 `getaddrinfo` 字符串） |
| 正例用的回环假端点是真 HTTP 服务 | `test_usage_parsing.py:407-440`（`HTTPServer` + `request_queue_size=128` 躲 accept 竞态）⇒ 阶段 4 直接沿用这套形态 |

⇒ 和 098/099/101 同一形状：**实现有门，门只走了一条腿**。
本单阶段 4 的三条反例（只查字面 IP／跟随重定向／用系统代理）都要能各咬一次。

## 4 出站面清扫表（工单 §Scope 的"同型清扫"）

Python 侧带凭据的出站**只有一个文件**：

| 位置 | 机制 | 是否带凭据 | 射程 |
| --- | --- | --- | --- |
| `src/agent_box/server/model_configs/probe.py:94` | `urllib.request.urlopen`（默认 opener） | **是**（`:100-101` 加 `Authorization`） | **本单** |
| `plugins/agent-box-web/tests/test_product_loop.py:246-250`、`test_harness_profile_e2e.py:79-82` | `urlopen`，只打**自家 Server** 的回环测试面 | 会话令牌（测试内） | 非本单（测试夹具） |
| `plugins/agent-box-web/frontend/src/api/client.ts` | 浏览器 `fetch` → 自家 Server | 否（同源会话） | 非本单 |
| `plugins/agent-box-harnesses/third_party/harness_remote/bridge/src/agent-model-catalog.js` | 第三方 vendored 件 | 各家自管 | 非本单（第三方纪律） |
| `workers/**` | `grep urlopen\|httpx\|requests\.get\|aiohttp` ⇒ **0 命中** | — | 无面 |

⇒ 结论：**本树没有第二处"服务端带凭据出站点"**；本单修完，这条形状在 Python 侧清零。
JS/third_party 那三处不是同一个威胁模型（不带用户 key 出站到任意端点），
若调度者认为 `agent-model-catalog.js` 的目录拉取也要同样约束，那是另一张单（登记在 §6）。

## 5 由观测得出的修法（阶段 2/3 的落点，含一处**明确不做**）

1. **一次性 opener**（`_open_request` 不再用 `urllib.request.urlopen` 的默认 opener）：
   `build_opener(NoRedirectHandler(), ProxyHandler({}))`——
   `NoRedirectHandler.redirect_request` 直接抛 `HTTPError(3xx)` ⇒ **第二跳根本不发**；
   `ProxyHandler({})` ⇒ 声明端点之外没有第三方代跑。
2. **`_validate_endpoint` 加解析复检**：`socket.getaddrinfo(host, port or 默认端口)`，
   对**全部**返回地址复跑同一条"环回例外／私网／保留／多播"判定，任一不合法 ⇒ `PROBE_ENDPOINT_BLOCKED`。
   拒绝码**复用既有的 `PROBE_ENDPOINT_BLOCKED`**，不新增码（工单允许"或新码"；新增码要动
   wire 词汇，属合同面，本单不顺手做）。
3. **3xx 映射成类型化拒绝**：`_fetch_models_response` 的 `except HTTPError` 分支前先认 3xx，
   否则今天会被当成 `PROBE_HTTP_ERROR`（"端点回了 HTTP 302"）——那是**真话但不够真**：
   它掩盖了"我们差点跟进去"这件事。
4. **明确不做**：把连接**钉到已校验的那个地址**（消灭 DNS 重绑定窗口）。
   理由不是嫌麻烦：https 侧要动 `http.client` 的连接类并自己管 `server_hostname`/SNI，
   而本机现有假端点面**没有 TLS 桩**（环回例外只允许 `http`），钉了也无法给出门的反例。
   ⇒ 写成**残余风险**（§6），并按公告口径交给调度者定是否另开单。

## 6 事实分级与残余风险（这一节是工单 §Notes 点名必须有的那一句）

**分级**：

* **实测**：§1.1 全部（含 `getaddrinfo` 计数 0/1、字面量与域名的分叉结局）、§1.2 全部（两跳、总数 2、
  二跳带同一凭据值）、§2 的三条（`CONNECT` 无凭据／`http` 有凭据且回 `ok`／真实代理环境下第二跳离程并得 502）、
  §3 的两条 grep、§4 的清扫命中数。
* **推断**（各环有实测、组合没端到端跑）："302 → IMDS **且带用户 key**"这一整条链。
  拆开看：跟随机（§1.2）、IMDS 形状的目标会被代理代跑（§2.3）、`Authorization` 在 `http` 腿明文可见（§2.2）
  三环各自成立；**没跑**的是"同一进程内一次 `pull_models` 把这三环串起来"——
  §2.3 那次因为跳 2 交给真代理、回的是 502 而不是我方能观测的凭据投递，所以组合结论按推断记。
  阶段 4 的门会把它变成实测（在 transport 接缝上注入假代理与假跳 2，请求计数与头部都直接断言）。
* **未验证**：Windows 宿主上的 `no_proxy` 与代理配置（本机是 WSL；那边可能根本没有 7897 这个代理，
  也可能有别的出口路径）；各家真实 provider 端点是否会回 3xx（**没有打任何真端点**）。

**残余风险（修完之后仍然在的那一块，写清）**：

1. **DNS 重绑定窗口不消除**。§5.4 决定不钉地址 ⇒ "校验时解析一次、连接时再解析一次"之间，
   一个 TTL=0 的名字仍可先答公网 IP 过关、再答 `169.254.169.254`。
   修好的是**"完全不看解析结果"**（今天这一步是 0 次解析），不是**"看了一次之后不再变"**。
   要闭死需要：把已校验的地址传到连接层（https 侧要自己管 `server_hostname`/SNI 与证书校验），
   且门必须有一个 TLS 桩——本机现在没有（环回例外只允许 `http`）。⇒ **建议另开一单**，
   带威胁模型与 TLS 测试面，别挂在本单尾巴上做半套。
2. **`no_proxy` 豁免清单是宿主给的，不是我们给的**。本单把系统代理整条关掉（`ProxyHandler({})`），
   所以这一项对本单不再相关；但同一台机器上其它出站面（§4 表里 JS 那几处）仍受宿主代理支配。
3. **`localhost` 与 `127.0.0.1` 的环回例外是**合同**要的（本地假端点跑测试），不是漏洞**——
   但它意味着"能改 `/etc/hosts` 或能占听回环端口"的本机攻击者仍能让探测打到自己；
   这是本机沦陷前提，超出本单威胁模型，记录为"已知边界"而非"待修"。
