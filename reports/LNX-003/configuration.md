# LNX-003 · configuration.md — 配置保存→后端→存储→重启读取 链与 Linux 缺口

只读调查，未运行任何测试/服务。完整 SHA：
desktop settings `feature/agentbox-desktop-settings` @ `01083212aaade2ead3a1be9323943ea3eae3284e`；
desktop chat `feature/agentbox-desktop-product` @ `08b4eac7fe10aacc3220cca94c52659aaf043cc5`；
backend runtime `feature/env-provider-runtime` @ `a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa`；
backend service `feature/env-provider-v1` @ `003b52b2b18a86547d2819ea8875095442d2011b`。

## 0 一句话结论

**桌面侧的"保存配置"与"录入秘密"两条链在代码里都建到服务端了，断点在服务端的 secret store 组合根。**
Provider/Model 记录（非秘密）在 Linux 上可存可读可跨重启；**秘密（credential）在 Linux 上无处可存**，
且这是**有意为之的类型化拒绝**（`runtime.py:354-358` 注释原文："Order 56's encryption-at-rest requirement is
the platform SecretStore's: without one, a bound subscription account is a typed refusal at the turn boundary
rather than an unencrypted asset"）。⇒ Linux 主线的配置业务缺口是**一个 secret store 实现**，不是整条配置链。

## 1 链路（逐跳，含平台相关性）

| # | 跳 | 证据 | Linux 形态 |
| --- | --- | --- | --- |
| 1 | Settings UI 动作 | `01083212:apps/desktop/src/application/provider-model/provider-model-maintenance-port.ts:70,73,82,92,101,108`（`providerModels.list/create/update/archive/probeModels/probeConnection`）；profile 写 `application/profile/wire-profile-writes.ts:61`（`profiles.setPermissions`）、`wire-composer-profile.ts:87,187`（`config.describe`/`config.resolve`） | 平台无关 |
| 2 | 能力面预检 | `01083212:apps/desktop/src/application/provider-model/wire-provider-model-catalog.ts:24-28`：先查 `hello` 是否声明该能力，未声明即抛 `providerModels.list is unavailable` | 依赖 hello 能力面 ⇒ 与 LNX-001 §3 的合同漂移直接相关（chat 面的 hello 缺 `harnesses`） |
| 3 | 渲染→主进程 | `preload.ts:28-30`（`wire.request`/`subscribeEvents`）→ `electron/ipc/workcore-wire-ipc.ts:88`（`agentbox:wire:request`）→ `electron/composition/agentbox-service-composition.ts:59-68` | 平台无关 |
| 4 | wire 传输 | `electron/security/agentbox-wire-transport.ts:49` `POST <endpoint>/wire/v1/<method>`；`:61,130` WS 事件流 | loopback 策略在 `agentbox-wire-endpoint-policy.ts`，平台无关 |
| 5 | 服务端鉴权与路由 | `a7b7b6ff:src/agent_box/server/transport/http/app.py:132`（`/wire/v1/{method}`）、`:110-115`（Bearer 恒时对拍）、`:66`（仅允许 loopback Host/Origin） | 平台无关 |
| 6 | wire handler → service | `src/agent_box/server/wire/handlers.py`（providerModels 族）→ `server/model_configs/service.py`（`_validate`/`create`/`update`/`project`） | 平台无关 |
| 7 | 存储 | `server/model_configs/repository.py:68`（INSERT 列含 `provider_type,credential_id,config_object_digest,models_object_digest`）、`:102`（UPDATE 列集，`KEEP` 哨兵）；表 `server_provider_models`（`storage/database.py:67-74`，`config_object_digest TEXT NOT NULL`）；**schema 20 起 `harness_type` 可空**（`_migrate_19_to_20`） | 需 schema 20 迁移 ⇒ 只有 runtime 系代码能开 |
| 8 | 内容寻址对象 | config 对象（含 092 的 `protocols/endpoints`）写入 data-root 下的对象存储（`bootstrap/runtime.py:345-353` 一族的 `root/…` 派生）；记录里存的是**摘要** | 平台无关 |
| 9 | 执行时冻结 | `server/model_configs/service.py:136` `freeze_execution_configuration(harness, configuration)` ⇒ 校验 provider 未归档、`harness_type` 匹配（`:157-160`），产出非秘密的不可变投影；调用点 `server/sessions/service.py:90`；每轮持久化 `effective_config_object_digest`（`storage/database.py:111`，turn 表） | 平台无关（**但带凭据的 provider 在第 10 跳断**） |
| 10 | 秘密解析 | 执行组装时 `bootstrap/runtime.py:837-846` 读凭据；缺 store → `:842/846` `CREDENTIAL_STORE_UNAVAILABLE`/`CREDENTIAL_NOT_AVAILABLE` | **Linux 必断**（§3 G1） |
| 11 | 重启后读取 | 服务重启 → `Database(root)` 打开同库 → `providerModels.list` 从表读；`server_credentials` 表（`database.py:61`、`:251`）只存**记录与 locator**，字节在 `<data-root>/secrets/credentials/*`；`MemorySecretStore` 内容**随进程消失** | 非秘密：跨重启成立。秘密：Windows/DPAPI 跨重启成立，**Linux 两样都没有** |

## 2 四件事必须分开（它们常被混为"配置"）

| 概念 | 在哪里实现 | 存什么 | Linux 状态 |
| --- | --- | --- | --- |
| **A 身份登记**（credential 记录/幂等身份） | `service:src/agent_box/server/credentials.py:23` `register_if_missing`（149）；表 `server_credentials` | id / kind / label / **locator**，**不含秘密字节** | 可用 |
| **B 秘密录入**（把用户输入送进服务端） | 桌面主进程 `01083212:apps/desktop/electron/ipc/agentbox-credentials-ipc.ts:88-133`（校验长度→写 0600 临时文件→`POST {origin}/api/v1/credentials`＋`Authorization: Bearer <sessionToken>`＋**每次新 `Idempotency-Key`**→`finally` 删文件）；服务端路由 `app.py:244/249`(service)、`:218/223`(runtime)；实现 `service.py:195-197` | 秘密字节（只经路径交接，不进请求体） | **录入链本身通到服务端，但服务端无处安放 ⇒ 401/typed refuse** |
| **C secret store**（静态加密与归属） | `storage/secrets.py`：`SecretStore` Protocol `:19`、`WindowsDpapiSecretStore :72`（构造即 `if os.name != "nt": raise RuntimeError("SECRET_STORE_WINDOWS_REQUIRED")`；写 `<data-root>/secrets/credentials/<id>.dpapi`，`O_EXCL`+0600+`fsync`+ACL；`read`/`delete` 校验 `.dpapi` 后缀与 `Path(locator).name != locator` 防穿越）、`MemorySecretStore :166`（进程内） | 加密后的秘密 | **Linux 无实现**。全仓无 keyring/kwallet/libsecret/文件加密 store |
| **D profile freeze**（配置生效） | `model_configs/service.py:136` + 每轮 `effective_config_object_digest`（`database.py:111`）；原生落盘 `plugins/agent-box-harnesses/…/native_materialization.py`（093） | 非秘密投影与摘要 | 可用；但 digest 语义受 §1 第 8 跳与合同面影响 |

**还有第二套"秘密存储"不要混淆**：桌面主进程自己的凭据/钥匙串（`main.ts:905-915`
`safeStorageApi: safeStorage`、`passwordStoreSwitch`、`migrateLegacyEncryptedSecretsOnce()` 注释
"Keychain encryption is opt-in (default OFF)"）与 `$AGENTBOX_CREDENTIALS` 指向的 JSON 记录文件
（`workcore/agentbox-credentials.ts:111,144,195`，0600）。那是**桌面客户端**的秘密面，
不能替服务端的 C 补位——执行发生在服务端，凭据必须在服务端可解析。

## 3 Linux 缺口

| # | 缺口 | 证据 | 影响 |
| --- | --- | --- | --- |
| G1 | 默认组合在 Linux 没有 SecretStore | `bootstrap/runtime.py:319-320`（runtime）/`:318-320`（service）`if secrets_store is None and os.name == "nt"` | 一切带 `credentialId` 的 provider、订阅账号（`account_assets=None`→`ACCOUNT_STORE_UNAVAILABLE`，`runtime.py:354-358,1066-1068`）、deployment 声明凭据的启动（`SIDECAR_DEPLOYMENT_CREDENTIAL_STORE_MISSING`，`:1378-1383`）在 Linux 全断 |
| G2 | 唯一一次性 CLI 写死 DPAPI | `server/credential_cli.py:31-34` | 连"运维手工塞一条凭据"的兜底都是 Windows 专属；现存活服务靠调度脚本注入 `MemorySecretStore`（`trial-serve-linux.py:57-61` docstring 自述 "Nothing here is a product path"） |
| G3 | `MemorySecretStore` 不跨重启 | `secrets.py:166+` 进程内字典 | 即使用它兜底，**"重开仍生效"这条验收判据在 Linux 上无法成立** |
| G4 | 能力面预检依赖 hello | `wire-provider-model-catalog.ts:24-28` | 合同面未重锁前，Settings 的能力判定随所选桌面线而变 |
| G5 | schema 20 前向-only | `_migrate_19_to_20` 表重建（`storage/database.py`，docstring 自述前向-only） | 新配置根必须从 20 起建；旧用户库不升级（与 I 决定 4 一致） |
| G6 | 092 的 config 对象含新键 ⇒ `config_object_digest` 变化 | `model_configs/service.py` `_config_payload`；`repository.py:68` 存摘要 | 老记录换版本重发布时摘要漂移风险；两树无重算脚本（LNX-001 `integration-analysis.md` §5-R8 同点） |

## 4 测试入口（声明来源；本任务未执行）

| 目的 | 命令 | Linux 可跑性 |
| --- | --- | --- |
| 凭据导入路由（路由形状、幂等、不泄露秘密、列表可解析） | `pytest tests/server/test_credential_import_route.py` | **可跑**，但它 `from agent_box.storage import MemorySecretStore` 并 `store = MemorySecretStore(values={})` 注入 `build_runtime`（`:23,32`）⇒ **测的是"有 store 时"的路由，永远绕过 G1 的默认组合**。默认组合在 Linux 的结局（typed refuse）没有任何测试覆盖 |
| 缺凭据的类型化失败 | `pytest tests/server/test_credential_missing_typed_120.py` | 可跑（120 PARTIAL，三个分支之一 `CREDENTIAL_UNAVAILABLE` 曾被记录为"从未由真实故障复现"，见 `control/current-state.md` §1.2） |
| deployment 凭据 | `pytest tests/server/test_deployment_credentials.py` | 可跑 |
| provider 记录/协议/兼容性（092） | `pytest tests/server/test_provider_{neutralization,protocols,compatibility}_092.py` | 可跑 |
| provider update 的 KEEP 语义 | service 线 `tests/server/test_provider_update_keeps_omitted_112.py`（28 门） | **仅在 service 树存在**；合流后须在候选树复跑（LNX-001 §5-R1） |
| 首运行锁（data-root 独占） | `pytest tests/server/test_first_run_lock.py` | 可跑（119 改为事件序判据） |
| 桌面侧 | `apps/desktop/src/application/provider-model/*.test.ts`、`electron/ipc/agentbox-credentials-ipc` 的测试、`npm run --workspace apps/desktop test` | 渲染/IPC 层可跑（vitest projects） |

**缺口对应的测试清单（〔建议〕）**：①默认组合在 `os.name!='nt'` 时的构造断言（今天只由运行时抛码体现）；
②真实 store 的跨重启往返（写入→关库→重开→`read`）——目前 store 契约测试绑在 DPAPI 文件形状上
（`.dpapi` 后缀 + `<data-root>/secrets/credentials/`）；③凭据录入的用户可见失败面（401/typed code 上屏）；
④`config_object_digest` 在 092 前后记录的稳定性/重算策略。

## 5 未验证项（不得当作已通过）

1. Linux 上是否存在任何可用的 OS 级秘密后端（keyring/kwallet/`libsecret`）**未做环境探测**，本任务不装包不跑服务。
2. `test_credential_import_route.py` 等是否在 Python 3.14 + 本机依赖下真能跑通 —— 未运行。
3. 桌面 `safeStorage` 在 Linux 上的实际后端（GNOME Keyring / kwallet / 明文 `basic_text`）取决于
   `password-store` 开关与桌面环境；`main.ts:905-915` 只证明代码读取了这些值，**不证明本机可用**。
4. 重启后 profile→provider→config 对象→原生落盘的整链一致性，需要实跑（含 §3 G3 的判据）。
5. 未读取任何真实凭据文件或用户数据根内容；只引用代码路径与行号。
