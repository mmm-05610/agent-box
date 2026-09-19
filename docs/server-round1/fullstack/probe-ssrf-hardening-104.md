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

## 7 阶段 2 实施：一个"只此一跳"的 opener

`_open_request` 不再走 `urllib.request.urlopen` 的**默认 opener**，改用一个模块级、
导入时一次性建好的 `_OPENER`：

```
_OPENER = urllib.request.build_opener(_OneShotRedirect(), urllib.request.ProxyHandler({}))
```

* `_OneShotRedirect.redirect_request` **抛 `HTTPError`** 而不是返回新请求 ⇒
  第二跳**连发起的机会都没有**（不是"跟了再回头"），这正是 G1 要求断言"请求计数恰为 1"的原因；
* `ProxyHandler({})` ⇒ 系统代理彻底不参与（§2 那条旁路的根因）。

**实测（本机回环，A 回 302→B）**：

```
pull_models -> PROBE_ENDPOINT_BLOCKED | the endpoint answered with a redirect; a probe makes one request to the declared endpoint
A 侧请求数 = 1     B 侧(重定向目标)请求数 = 0
⇒ 出站总数 = 1（合同要 1）    凭据跟到二跳 = False
```

一条附带的自证：这轮我把 `http_proxy`/`https_proxy` **故意指到 A 自己的端口**，
而 A 记录到的请求行是**原点形式** `/models`（不是代理形式 `http://127.0.0.1:PORT/models`）
⇒ 代理确实没被使用，而不是"用了但恰好同一台"。正例同步复跑：
`pull_models -> ok '1 model ids' ('model-a',)`、`probe_connection -> reachable endpoint answered`。

**顺手修掉一个会骗人的地方**：`_typed_http_error()` 在 `probe.py:108` 定义了，
但 `_fetch_models_response` 的 `except HTTPError` 里是**另一份内联的同款映射**——
那个函数**没有任何调用者**（`grep -rn "_typed_http_error" src/` 只命中定义行）。
也就是说"给探针加一条错误映射"这件事，改在那份看起来是正主的函数里**不会生效**。
本单把内联那份删掉、统一走 `_typed_http_error`，3xx 分支才真的接得上。

3xx 映射成 `PROBE_ENDPOINT_BLOCKED`（**复用既有码，不新增**）：工单允许"或新码"，
但新增码要动 wire 词汇＝合同面，不是一张修 bug 的单该顺手做的。

## 8 阶段 3 实施：校验看"解析到什么"，不看"名字长什么样"

`_validate_endpoint` 里那段"`ipaddress.ip_address(host)`，`ValueError` 就 `address=None`"换成
**解析 + 对全部答案复检**：

```
port = parsed.port or (443 if scheme == "https" else 80)
resolved = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
for entry in resolved:            # 每一个答案，不是第一个
    address = ipaddress.ip_address(entry[4][0].split("%")[0])
    if address.is_loopback: continue
    if private|reserved|multicast|link_local: -> PROBE_ENDPOINT_BLOCKED
```

三条设计决定，逐条给理由：

1. **看全部答案**。一个名字同时给公网和内网两条 A 记录是真实攻击形状（"第一个能过"就够了）；
   只取 `resolved[0]` 会留下同型缺口。
2. **解析失败仍回 `PROBE_UNREACHABLE`**（不是新码、也不是 `*_BLOCKED`）：
   这与"连不上"在调用方看来是同一件事，且 `probe_connection` 的
   `unreachable` 语义（工单 §必须保持不变）不被本单改写。
3. **加了 `is_link_local`**：工单 §Scope 列的是"私网/保留/多播"。
   实测 `ipaddress` 里 `fe80::1` 与 `169.254.169.254` 的 `is_private` **本来就是 True**，
   所以这一项是**保险不是扩权**（它没有拒掉任何工单没打算拒的东西）。

**实测**（`getaddrinfo` 全部打桩，**零 DNS、零出站**）：

| 名字（桩答案） | 校验结论 |
| --- | --- |
| `imds-behind-a-name.invalid` → `169.254.169.254` | **`PROBE_ENDPOINT_BLOCKED`**（阶段 1 同一输入是"通过"） |
| `mixed-answer.invalid` → 公网 `93.184.216.34` ＋ 内网 `10.0.0.1` | **`PROBE_ENDPOINT_BLOCKED`**（全部答案复检生效） |
| `v6-linklocal.invalid` → `fe80::1` | **`PROBE_ENDPOINT_BLOCKED`** |
| `public-only.invalid` → 公网 v4＋v6 | 通过校验（正例不受影响） |
| `no-such-name.invalid` → `gaierror` | `PROBE_UNREACHABLE`（与修前同一结论） |
| 字面量 `https://192.168.1.9` | `PROBE_ENDPOINT_BLOCKED`（回归：字面腿一字未变） |
| `ftp://example.com` | `PROBE_ENDPOINT_BLOCKED`（scheme 先拒，不做解析） |
| `http://127.0.0.1:<假端点>` | 通过，且 `pull_models` 回 `ok ('m1','m2')`、`probe_connection` 回 `reachable` |

### 8.1 一处**没修**的分类缺口（实测，交回）

`ipaddress` 在本机 Python 3.12 下对 **CGNAT `100.64.0.0/10`** 四个旗标全 `False`：

```
100.64.0.1  private=False reserved=False multicast=False link_local=False   -> 通过校验
```

而 WSL2 / Tailscale / 各类 VPN 的内部面常常正落在这段。工单 §Scope 只列了
"私网/保留/多播"三类，**把 CGNAT 拉进拒绝集是一次语义裁决**（它会顺带拒掉一些用户真想探的内部网关），
所以本单不自行扩集，**登记为待拍**：要么调度者裁定加进来，要么维持现状并在文档里写明这段是可达的。

### 8.2 本单改动让两条既有测试改了一处（如实报）

`test_pull_models_rejects_oversized_and_shapeless_responses` 与
`test_a_slow_drip_answer_hits_the_total_deadline` 都用 `https://…example…` 这种**不存在的名字**
并且只打桩 `_open_request`。修前校验**从不解析** ⇒ 名字无所谓；修后解析会真去问 DNS。
两条都补了一行 `socket.getaddrinfo` 桩（返回一个公网地址），**断言一字未动**。
⇒ 这是"语义变严了，旧夹具里藏着的'名字不用存在'这个假设浮出来"，不是回归；
改前先跑（`2 failed / 69 passed`）、改后复跑（`71 passed`）都记在案。

## 9 阶段 4：门（`tests/server/test_probe_egress_104.py`，15 条）

门一律**数请求**，不读源码：每个用例连的都是本机回环的 `ThreadingHTTPServer` 假端点，
断言的是"谁收到了几条、请求行长什么样、带没带 `Authorization`"。

### 9.1 用例 ↔ 门

| 用例 | 钉哪道门 | 断言的形状 |
| --- | --- | --- |
| `test_a_redirect_is_refused_as_a_typed_endpoint_block` | G1 | 302 ⇒ `PROBE_ENDPOINT_BLOCKED` |
| `test_exactly_one_request_leaves_when_the_endpoint_redirects` | **G1 的正身** | 源站 `count == 1` **且**目标站 `count == 0`（"跟完再抱怨"过不了这条） |
| `test_the_credential_reaches_the_declared_endpoint_and_no_one_else` | G1（凭据腿） | 源站确实收到了 `Bearer …`（证明"本来有机会泄"），目标站 `requests == []` |
| `test_probe_connection_refuses_the_redirect_too` | G1（第二个公开入口） | `status=unreachable` ＋ `detail=PROBE_ENDPOINT_BLOCKED`，目标站 0 条 |
| `test_a_configured_proxy_is_not_used_even_for_a_plain_http_probe` | §2 那条旁路 | 假代理 `count == 0`，且声明端点记到的请求行**不是**绝对 URI（`not path.startswith("http")`） |
| `test_the_module_does_not_go_through_the_shared_default_opener` | 同上，独立一条 | 把 `urllib.request._opener` 换成"一用就抛"的假 opener，正例仍成功 ⇒ 它有自己的 opener |
| `test_a_name_resolving_to_imds_is_refused` | **G2** | 域名→`169.254.169.254` ⇒ 拒，**且 `create_connection` 记录为空**（"拒了但还是伸手了"过不了） |
| `test_a_name_offering_public_and_private_together_is_refused` | G2 的"全部答案" | 公网＋内网两条答案 ⇒ 拒 |
| `test_an_ipv6_link_local_answer_is_refused` | G2（v6） | `fe80::1` ⇒ 拒 |
| `test_literal_private_addresses_are_still_refused` | 回归（既有那条腿） | `10.0.0.1`/`192.168.1.9`/`169.254.169.254` 字面量结论一字未变 |
| `test_a_public_name_still_passes_the_endpoint_check` | G3 正例（判定侧） | `create_connection` 被打桩掉，所以"通过"只能是**校验放过**，不是"后来失败了" |
| `test_an_unresolvable_name_is_still_unreachable_not_blocked` | G3 语义不变 | `gaierror` ⇒ `PROBE_UNREACHABLE`（没被顺手改成"我们拒绝了你"） |
| `test_both_public_entries_still_succeed_against_a_loopback_fake` | G3 正例（端到端） | `pull_models → ok ('model-a',)`；`probe_connection → reachable` |
| `test_the_scheme_rule_is_checked_before_any_resolution` | 边界顺序 | `ftp://` 在**`getaddrinfo` 一被调用就抛**的桩下仍被拒 ⇒ 顺序没被本单挪动 |
| `test_nothing_was_resolved_outside_this_files_own_table` | **G4** | 全文件的 DNS 流量就是两张列表：问过的名字 ⊆ 本文件自己那张表；直接答的数字 ⊆ 本文件声明的那几个常量 |

零出站不是靠"记得不发"：`getaddrinfo` 桩对**任何**不在表里且不是回环的名字回 `gaierror`，
`create_connection` 在需要它的用例里被换成"记录并抛"。所以真发出去一次就是红的。

### 9.2 反例：整份门拿去咬**修复前**的 `probe.py`

跑法与 098 相同（复制 `src/agent_box` 到 `/tmp`、只替换副本里的 `probe.py` 为
`git show d2b2036:…`，`PYTHONPATH` 排前，工作树一字未动，跑完 `rm -rf` 并核实缺席）。

| 结果 | 内容 |
| --- | --- |
| **9 failed / 6 passed** | 红的正是：G1 四条（含"恰一次"与凭据两条）、判定侧三条（IMDS／混合／`fe80::1`）、默认 opener 那条、以及"解析不出仍 `UNREACHABLE`"那条 |
| 绿的六条 | 三条本来就管字面量（`literal_private`、`public_name_passes`、`scheme_rule`）、两条正例（`both_public_entries`、G4 列表）、以及**代理那条（见下）** |
| 一次白送的证据 | 旧码某条红得很难看：`AssertionError: a probe attempted to connect to ('127.0.0.1', 7897)`——那是**本机的代理端口**，旧代码在测试里就把请求交给了它 |

**代理那条为什么在旧码跑里是绿的**（必须说清，不然像在挑好看的）：旧代码用
`urlopen` 的**默认 opener**，而那个 opener 是**进程内首次使用时的快照**——
同一进程里前面的用例已经把它建好了，本用例后面再 `setenv` 就不起作用。
⇒ 这一条的反例**不在进程内**，而在阶段 1 的两处一手测量里（§2.2：假代理收到
`GET http://localhost:…/models` **带明文凭据**并回 `ok`；§2.3：真实代理环境下第二跳离程），
两者都是在**修复前**的代码上跑的。门这边留的是"修完之后不许复发"。

### 9.3 计数

* 门文件：`15 passed in 6.66s`（最终源码）
* 咬旧码：`9 failed / 6 passed in 6.69s`
* 定向回归：`tests/server -k "probe or usage or provider or model"` ⇒ 改前 `2 failed / 69 passed`
 （两条既有夹具需要解析桩），补桩后 **`71 passed`**
* 全套件与账在 §11

## 10 残余风险与交回（工单 §Notes 点名的那一句）

**残余风险（不消除，写清为什么）**：**DNS 重绑定窗口仍在**。校验解析一次、连接再解析一次，
中间 TTL=0 的名字可以先答公网地址过关、再答 `169.254.169.254`。
本单把"**完全不看解析结果**"修成了"看"，**没有**修成"看了之后不再变"。
闭死它需要把已校验的地址带到连接层（https 侧要自己管 `server_hostname`/SNI 与证书校验），
而本机没有 TLS 桩可用（环回例外只放 `http`）⇒ 没有反例的门不算门，所以本单**不做半套**，
建议另开一单（带威胁模型与 TLS 测试面）。

**交回**：

* **CGNAT `100.64.0.0/10` 今天可通过校验**（`ipaddress` 在本机 Python 3.12 下
  对 `100.64.0.1` 的 `private/reserved/multicast/link_local` 四个旗标全是 `False`，实测见 §8.1）。
  WSL2／Tailscale／各类 VPN 的内部面常落在这段。要不要拒是**语义裁决**，本单不自扩拒绝集。
* **`_typed_http_error` 曾是零调用者**（§7）：修前的错误映射有两份，改在"看起来是正主"的那份上不生效。
  本单统一之后只剩一份。这类"两份映射"如果别处还有，属 102/103 的形。
* **`workers/**` 与 JS 侧不是本单的射程**（§4 清扫表）：Python 侧带凭据出站在本单之后清零；
  `plugins/agent-box-harnesses/third_party/.../agent-model-catalog.js` 的目录拉取若要同样约束，是另一张单。
* **给 103**：`providerModels.probeConnection` 里那个 `_provenance` 死调用点（098 §10 已记）
  与本单无关，但 103 的覆盖面会把"每个登记方法至少被真 wire 驱动一次"这件事一并照出来。

## 11 计数、账与清理

| 项 | 结果 |
| --- | --- |
| 门文件 | `15 passed in 6.66s`（最终源码）；旧码对照 `9 failed / 6 passed`（§9.2） |
| `python3 -m pytest tests/server -q` | **687 passed in 332.20s**（**687 = 672 ＋ 本单 15**，一条未掉） |
| `python3 -m pytest tests/ -q`（第一轮） | **1 failed / 986 passed in 489.39s** |
| `python3 -m pytest tests/ -q`（复跑） | **987 passed in 298.45s**（**987 = 972 ＋ 本单 15**） |
| `validate_order.py --strict` | 30 OK / 31 FAIL（FAIL 恰为 37…67 的 v1 历史单）；068–105 全 OK |
| `git diff --check` | 干净 |

**那一条红不是本单的回归，且按事实记成三行**：红的是
`tests/server/test_first_run_lock.py::test_without_the_gate_the_same_first_runs_overlap`
（080 的反例门，断言"没有锁则两次冷跑的时间窗**必相交**"——相交与否是线程时序问题）。
一手证据：① **同一份源码**在 `tests/server` 那一腿里 **687 全绿**（该文件包含在内），
② 单跑该文件 **3 次 × 5 passed**，加 `tests/integration` 一起 **74 passed**，
③ 出问题那一轮 `tests/` 用时 489.39s，而同机前后两轮是 358.34s / 374.66s、复跑（无并发全量）只用 298.45s
——用时与结果一起指向"负载下时序被拉长"，与 R-0023 点名的 11 GB 瓶颈一致。
本树**没有**为让门绿改那条断言（章程 §8）；已登记进 `status.md` 的 §待开单，
连同"该反例门需要一个不看墙钟时间的写法"一起交回调度者。

**费用**：真实模型调用 **0 次 / ¥0**，且这是**机制**不是承诺——门文件里 `getaddrinfo` 对表外名字一律 `gaierror`、
需要它的用例把 `create_connection` 换成"记录并抛"，真发一次就是红的（§9.1 最后一条 G4 断言）。
凭据 locator **未访问**；全程出现的凭据只有一个字面假值
`DUMMY-NOT-A-REAL-SECRET-0123456789`，它没进过任何日志或证据（除本行引用它本身）。

**清理**：`/tmp/104-oldcode`（咬旧码用的副本）跑完 `rm -rf` 并核实缺席；
三次假端点都是进程内随机端口、随用例 `shutdown()`；临时数据根 `obs105-`/`obs105b-`/`real*` 全部核实删除；
工作树在阶段 2/3 的两次"咬旧码"前后一字未动（§9.2 的跑法）。
