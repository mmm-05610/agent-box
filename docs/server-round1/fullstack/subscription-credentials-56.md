# 工单 56 阶段 A —— 逐家登录态形态观察（一手）

执行：2026-09-18，env-provider 工作树。方法：对**钉住的工件**做只读字符串/文件结构观察
（`~/.agentbox-all-harnesses/artifacts/<family>`，与各门使用的同一份），零模型调用、
不读任何真实凭据内容、不读宿主登录态。产出=工单 §1 要求逐家回答的四问 + 可用性裁断。

## 逐家结论

| 家 | 登录态载体（一手） | 单/多文件 | 原地刷新 | 官方登录 | 裁断 |
| --- | --- | --- | --- | --- | --- |
| codex | `$CODEX_HOME/auth.json`（`auth_mode`/`tokens`/`last_refresh`/`agent_identity`…；含 "Skipping token refresh…"、"Reloading auth"、"failed to lock auth state"） | 单文件 | 是（进程内刷新令牌） | `codex login`（ChatGPT 登录/设备码/API key，皆入同一 auth.json） | **订阅可用**（单文件资产） |
| claude | `~/.claude/.credentials.json`（`.credentials.json` 7 处、`refreshToken` 56、`oauth` 580；macOS 另有 keychain 53 处） | 单文件（Linux） | 是（OAuth 刷新） | claude 官方登录（OAuth） | **订阅可用**（单文件资产） |
| pi | pi-ai 常量 `AUTH_FILE = "auth.json"`（另有 `PI_KEY`/`PI_KEY_ENV` env 面、oauth 24 处） | 单文件 | 是 | provider OAuth（pi-ai） | **订阅可用**（单文件资产） |
| qwen | `~/.qwen/oauth_creds.json`（**该家自带 `oauth_creds.lock`**；"Qwen OAuth" 288 处、`refresh_token` 83、`oauthBaseUrl/oauthProvider/oauthRecoveryKey`） | 单文件（+自带锁文件） | 是 | **Qwen OAuth** 官方登录 | **订阅可用**（单文件资产；其自带锁文件不物化） |
| hermes | `~/.hermes/auth.json`（76 处；`oauth_runtime_credentials`）；**另注**：hermes 的 auth 模块明确写着"tokens from `~/.codex/auth.json` (Codex CLI shared file)"、"tokens live in the Qwen CLI credential file"——它**消费别家**的登录文件，自身"订阅"不是一等概念 | 单文件 | 是 | 无自家订阅登录（可复用别家） | **订阅可用但语义为"复用"**（按 codex/qwen 的资产物化即可） |
| kilo | **库内**四表 `credential`/`account`/`control_account`/`account_state`（66 §1.2 一手） | 库内行 | 是 | provider OAuth（写库） | **订阅不可用**：登录态在（共享）库里，物化=写库，与 66"只读共享库/禁写锁"直接冲突 |
| opencode | `auth.json`（66 §1.2：库外同目录）+ 库内 `account`/`credential` 面 | 混合（文件+库） | 是 | provider auth | **订阅不可用**（同上；文件那半可再议，未采到"仅文件即够"的一手） |
| dsh | 未观察到登录面（ACP 克隆，工件内无 login/oauth 证据） | — | — | 未证实 | **订阅不可用（未证实）** |

## 对实现的输入

1. **资产形态**：五家（codex/claude/pi/qwen/hermes）为**单文件**；资产 = 该文件字节
   （含 JSON 结构），物化=写到 guest 内**家内**的声明路径（家可写，允许 harness 原地刷新），
   回收=轮末把该文件读回资产（有界 + 只收声明文件）。
2. **qwen 的自带锁**（`oauth_creds.lock`）不物化也不回收：我们每轮是独立进程 + 独占工作副本，
   跨轮并发由**我们**的每账号锁串行（§1 的锁），harness 自己的锁是进程内的。
3. **hermes 的"复用"语义**：它读 codex/qwen 的文件；当 hermes profile 绑定订阅账号时，
   物化的应是**该账号所属家族**的资产（逐条写在部署声明里），实现上即"同一资产、多家声明"。
4. **机器绑定**：四家的令牌均为 Bearer/OAuth（非机器指纹绑定）；未见安装绑定证据 ⇒
   "换执行环境就失效"的风险按**未观察到**记录（不承诺跨机可用）。
5. **kilo/opencode/dsh**：按 §1 末句**如实标注订阅不可用**；api-key 路径不受影响。

## 阶段 B/C 已落地（本工作树，2026-09-18）

**账户资产（新模块 `server/accounts/`）**：
- `assets.py`：资产=单文档（声明文件的 base64 载荷 + 每项摘要），进平台 SecretStore 加密；
  上限（单文件 256 KiB / 整包 1 MiB / ≤8 项）；**只认声明名**（打包与解包同源）；
  **每账号一把锁**（O_EXCL；抢不到 → `ACCOUNT_RECLAIM_BUSY`；陈旧锁**只报告年龄、绝不窃取**）；
  **乐观摘要**：回收在锁内复查资产摘要，与物化时不一致 → `ACCOUNT_ASSET_CONFLICT`，
  旧资产原样保留（反例已测）。
- `records.py`：`server_accounts`（schema 11→12 迁移；行内只有 locator/digest 与状态，
  **零令牌**，视图亦零 locator/digest）；`ProfileRecords.bind_account`（版本化变更）。
- 装配：`build_runtime` 构造两份并挂到 runtime；无 SecretStore 的宿主上绑定账户 =
  类型化拒绝 `ACCOUNT_STORE_UNAVAILABLE`（Linux 无 DPAPI 时保持 fail-closed，不落明文）。

**物化与回收（本机通道端到端已证）**：
- 部署声明 `subscriptionCredential.files`（guest-home 相对名，同一套沙箱语法，≤8）；
  guest 路径减 `/runtime/home/` 即 role 相对宿主路径（native home 与 window 两条绑定同规）。
- 轮前物化（`write_subscription_files`：只写声明名、父级限在 home 内、`O_NOFOLLOW`、
  0600、有界）；轮末回收（`read_subscription_files` 同规；`_reclaim_subscription` 在
  完成路径调用，任何失败**只记警告、绝不半途替换**）。
- Worker 通道：尚无 home 写操作 ⇒ 绑定账户的轮**类型化拒绝**
  `SUBSCRIPTION_MATERIALIZE_UNSUPPORTED`（不静默跳过登录态）。

**测试（7 条，全绿）**：打包/解包只认声明名、边界与形状反例、锁与陈旧锁、回收冲突保旧、
回收写回、记录零令牌、**端到端**（建号→存资产→绑 profile→真转轮：物化→夹具原地刷新→
回收成新资产且 state=valid；未声明伴随文件从不入资产；资产被移动时回收类型化拒绝且旧资产完好）。

## 56 未做（下一腿）

- **wire 面**：`accounts.create/list/import/bind/status`（含两仓摘要）与前端 P12 同步；
- **Worker 侧物化**：`home.put` 类操作 + c11 bundle 重建（本机通道已通）；
- **逐家模板声明**：codex/claude/pi/qwen/hermes 的 `subscriptionCredential`（形态已一手观测，
  见上表）；kilo/opencode/dsh 按观测结论标注订阅不可用；
- **门 G1–G6 的独立脚本**（当前以测试级反例覆盖 G1 存储/G3 回收/G5 零泄漏；
  G2/G4 的"真登录→换号下一轮生效"需真机登录轮，不假装已跑）；
- **45 文档补节**（§4 要求：订阅登录态=受管凭据资产，不属原生状态）。

## Worker 侧物化落地（2026-09-18，第二腿）

- **Worker 新操作 `home.put`**（role 相对路径，与 `home.list`/`home.get` 同规）：有界
  （≤256 KiB/文件）、父级在 role 内创建（逐级 canonicalize 校验）、叶子 `O_NOFOLLOW`
  且 0600、已存在必须是常规文件（链接一律类型化拒绝）；空载荷/超大类型化拒绝。
- **协议版本 4→5**（Rust `protocol::PROTOCOL_VERSION` 与 Python client 的常量同步递增；
  Rust 侧"同号"钉测随之更新）——新操作随协议版本走，client 的等值校验不会静默放行旧 Worker。
- **通道接线**：`materialize_subscription()`（可直测：一次 `home.put`/携带的声明名，别的什么都不发）；
  `_WorkerChannels.read_subscription()`（按声明名逐个 `home.get`，缺名=缺席，单名失败不掩其余）；
  本机通道同前。
- **回归**：Worker 单测 **42 passed**（新增 home.put 的 round-trip/越界/符号链接/逃逸反例）；
  Python 全量 **811 passed**；c11 bundle 重建（`sha256:c1e353c8…`，manifest 同步）。
- **仍缺**：真机登录轮（claude/pi/qwen/hermes 的确切文件路径要靠一次真实登录把文件钉死后再声明）、
  前端 P12 同步与两仓重锁、G2/G4 的"登录→换号下一轮生效"实跑。
