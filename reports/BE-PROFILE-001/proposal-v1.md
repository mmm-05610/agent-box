# BE-PROFILE-001 · 统一提案 v1（C 汇总）— Profile 独立能力：职责盘点与拆分方案

汇总：中央 C · 2026-09-22 01:37Z · 性质＝**研究/提案**（任务卡 `control/tasks/BE-PROFILE-001.md`：不动产品码、不迁数据；实施须 I 批准另立）
输入（四组全齐，逐组归属；事实/推断分级沿用原件标注）：
- **S**＝`server/reports/BE-PROFILE-001-S-inventory.md`（绑 `405b8b4`）
- **H**＝`harness/reports/H7-profile-responsibility-inventory.md`＋`H7-evidence.md`（绑 `1c7c76c`，锚点已在 `57e91ec` 复验）
- **P**＝`platform/reports/33-be-profile-001-p-boundary-input.md`（绑 `a5e230a`）＋`reports/34` §4/§5
- **E**＝`execution/reports/E-BE-PROFILE-001-input-draft.md`（绑 `2c69343`；正式并入候 INC1c 后，本稿按登记材料引用）

---

## 交付 1 · 两类 Profile 现状：职责/数据/调用关系表

**总判断（H7 结论 1，S 盘点互证）：本仓存在两套互不调用的 Profile 权威**——不是同一数据的两个视图：

| 面 | 权威①：server Profile（S 域） | 权威②：插件 ProfileStore（H 域 envelope） |
|---|---|---|
| 载体 | 单表 `server_profiles`（`storage/database.py:40-60`）＋内容寻址对象（canonical publish） | JSON envelope 文件（`generic/profile_store.py:65-80`，原子替换+0600） |
| 身份/版本 | 三轴正交：`version`（行 CAS）/`config_revision`（配置世代，仅两处原子抬升）/`config_object_digest`（内容寻址）〔S §1〕 | `revision` 整数＋digest 漂移守卫（`PROFILE_DIGEST_DRIFT`/`REVISION_CONFLICT`）；**但 `create()` 无 expected_revision＝静默 upsert（探针 P2 实测至 r3）＝缺陷**〔H §5〕 |
| 写者 | profiles 域 `_mutate`/create/clone＋sessions 域运行态三列（5 点）；**无 DELETE**（软删归档）〔S §3〕 | `put/_read`＋`disable()`（**r+1 把 native_payload 清成 `{}`、body_preserved=false，探针 P1**＝缺陷）〔H §1〕 |
| 校验 | `descriptor.configuration_validator` 422 typed——**但生产恒 `None`**（唯一构造点 `bootstrap/runtime.py:757` 不传；10 处供给全在 tests）⇒ `TURN_OVERRIDES_INVALID` 生产不可达〔H §1.2/§1.6〕 | 每-family 校验实现运行时被调、内容仅 `isinstance(payload, dict)`（探针 P3：空字典/任意键全收）〔H §1.3〕 |
| 调用关系 | 受理冻结双写点归一（intent＋直建，同一 helper 对）；E 只消费冻结 raw key（β2 正例）〔S §5、E F1〕 | 5 个生产 entry point 共用同一 generic 组件；**与权威①零字节交换**；`materialize_family` 生产零调用（能力存在、未接线）〔H §1.4〕 |
| 消费/投影 | `get_turn_context`（legacy COALESCE 仅 NULL 行、INC1c 删）；wire 投影不吐 digest〔S §4〕 | selector→`ResourceSelection`；envelope 宿主适配＝`ProfileEnvelopeManager`〔H §2〕 |

**同名陷阱（卡片"不以同名证明重复"的答案，H §3）**：两个 `HarnessRegistry`（server `execution/__init__.py:100` vs 插件 `registry/loader.py:13`）类名同、类型异、互不灌数据；两个"Harness 校验器"（S `configuration_validator` 恒 None vs H `validate_native_payload` 仅 isinstance）无任何调用关系。
**幽灵契约（H §1.5）**：`agent-box.opencode-profile@1` 全仓仅定义行、未登记 `resource_contracts/__init__.py`、零消费者——拆分要防的不止同名重复，还有**族自造契约的反向漂移**；新权威须契约 id 单点登记。〔处置待裁，见交付 5 后附〕

## 交付 2 · 目标边界：各职责唯一所有者（提案）

| 职责 | 目标唯一所有者 | 依据/现状 |
|---|---|---|
| 身份 / CRUD / 行版本 CAS | **Profile 能力本体**（现宿主＝S profiles 域；**不新建权威表**，现 `ProfileRecords`+`ProfileService` 边界原样成契约） | S §6 观点采纳；卡片"独立能力≠独立进程/仓库/新执行组" |
| 配置组合（controlId 平面＋canonical 发布） | Profile 能力本体（S 宿主） | S §2 |
| 配置世代/digest 语义（**内容变⇒revision 必抬**＝W1-W3 不变量） | Profile 能力本体；**任何拆分必须保持此不变量**（同读锚的前提） | E F4 硬约束 |
| 受理时冻结（固定快照铸造） | Profile 能力本体（S 两写点 helper 对已归一）；委派写点归一随 INC1c c-1B | S §5、E F2/F3 |
| Harness 声明（toml 13 字段×8 家） | **H** | H §4.2① |
| 按 schema 校验（把 8 家已声明无人读的 `payload_schema` 做实） | **H**（接缝＝Profile 能力写入前按 harness_type 查注册表取校验器——**恰好接到 S 已声明但恒 None 的 `configuration_validator` 缝**，加性、不改公共 wire、不动数据） | H §4.2②/§4.3；S §6"Harness 声明/校验"行 |
| 原生转换/materialization（posture→family 形状、build_command、slots 消费） | **H**（现状：S 文件内 `posture_translation/posture_config` "名在 profiles、性属 harness"→若迁移须另批；`materialize_family` 未接线不得登记为在跑职责） | S §6、H §1.4 |
| 秘密：凭据**引用**资格与语义 | 凭据域（现 H 侧 `codex/credentials.py` 形状）；Profile 只存 `credential_id` 引用（S：无 FK＝U-2 登记） | P §2、S §1 |
| 秘密：**内容** | **无人拥有**（三重只读实施：H metadata-only＋DTO 校验＋P `--ro-bind`；P 秘密源刻意不做内容摘要＝披露派生物防线，**方案不得引入内容指纹类需求**） | P §2 事实 1/2 |
| 投影（两层，**不合并**） | 内容/形状层＝**H**；挂载层（宿主路径→guest、ro/rw、tmpfs）＝**P** | P §3 立场采纳 |
| 租约 | execution/attempt 级＝**P**（键无 Profile 维度）；**Profile-scoped 撤销当前不存在**＝需新契约面才可存在（P §4.2 推断：Profile 变更不能撤销已发凭据租约） | P §4 |
| 释放/清理 | P 自身临时资源＝P（C-RUNTIME@v1 §2 已定形）；envelope/原生临时文件＝H；**冻结快照对象：〔P r36＋r37 实测〕现状＝存储层能力缺失**（`objects.py` 仅 4 动词、全仓无 GC 触点）；**5 张表跨 4 域**（profiles/provider_models/sessions/turns/queue_items）共指唯一 store 实例（`runtime.py:309`）＋publish 去重无引用计数⇒**一个物理文件被 4 域共指，释放非域内动作**。〔r37 两层表述，C 采纳〕**声明回收（R-8 档）按写点分域；物理释放动词单点在存储层且前置引用视角**。〔形状定版〕目标态＝**(b) 永不物理删、仅逻辑退役＋重绑（容量账）**——与受理冻结模型自洽（内容寻址字节持久＝F3「重放同件」与恢复语义的前提，(a) 物理删拆前提且需先建跨域引用视角）；(a) 引用视角＋物理删仅登记为**远期扩展**（须重设计重放保证＋IFR-01 另批）。两平面分写：参照平面可删（`secrets.py` delete）vs 内容平面无回收 | E §2 第 6 问题获答（P msg.33/34、r36 `bc8ae0a9…`/r37 `28505f7a…`） |
| 运行态三列（run_state/native_generation/recovery_pending） | S sessions 域（执行账非配置账；Profile 独立化时**留在 turn 生命周期侧**） | S §6 观点采纳 |
| 结构性风险登记（不属任何所有者、须方案显式处置） | **H→P 私有字典直弹**：`cleanup_mount` 经 `getattr` 鸭子类型弹 P `_secret_sources`，`sandbox_port=None` 时**静默不释放**、绕过 cleanup 族回执、P 改名即静默失效＝「不得静默退化」反例。提案：凭据释放必须走 C-RUNTIME §1 显式声明动词或新 typed 撤销面，**二选一由 I 定**（涉公共契约面） | P §5.2 |

## 交付 3 · 最小契约草图＋两条 Harness 接入轨迹

**ProfileCapability v0（草图，加性、不动公共 wire）**：
```
identity/create/get/list/archive(clone)     # 现 ProfileRecords 面，CAS=expectedVersion+Idempotency-Key
update_configuration/set_permissions        # 原子抬 config_revision（不变量）
compose(controlId 平面) → canonical publish → config_object_digest
freeze(session,turn 受理点) → effective_config_object_digest   # β2 已落地的语义原样上收
validator_for(harness_type) → 校验器|None→typed 拒绝           # 接 H 每-family schema 校验（做实 P3 空校验）
resolve_credential_ref → 引用资格（H/凭据域）；内容永不经手
```
**轨迹 A（codex，生产在跑）**：`harnesses.toml [harness.profile]` 声明（13 字段）→ ProfileCapability 写入前取 `codex-profile-v1` 校验器（目标态；现状＝isinstance 空校验）→ 受理冻结（β2 正例）→ 原生转换 `codex/remote.py:75-83`（config.toml/models.json，宿主 /tmp）→ 秘密挂载 `codex/credentials.py prepare_mount`→P `register/_secret_path`（token↔attempt 一一绑定）。
**轨迹 B（pi/hermes/claude-code/opencode 任一，生产共用 generic 链）**：同一 v0 契约面；域差异**只从两个数据点进入**——toml 数据段＋`deploy/<family>/**` 模板字节；**每-family Python 差异代码今天＝0**（8 adapter 子类零覆写）；若某 family 未来需要代码级差异，扩展点＝adapter 子类覆写（现有空位）而非新存储/新契约。opencode façade（自建 authority、`projection.py:84` 自报写点）**仅测试实例化、未接生产**——不得作为轨迹 B 的现实形状引用。
**域差异扩展规则（提案）**：数据（toml）→模板（deploy 字节）→代码（adapter 覆写）三级递进，前两级为零代码扩展；契约 id 单点登记（防幽灵契约）。

## 交付 4 · 与在途冻结增量的衔接、数据兼容、分步迁移与回退

**衔接（关键：本提案不推倒在途，反而以之为地基）**：
- β2（已入 `57e91ec`）确立的「受理时冻结＋raw key 消费＋NULL→typed 拒绝＋同读锚 409」**就是 ProfileCapability 的 freeze/消费语义原型**——H7 §1.6：「主机拥有权威快照、Harness 只供声明与转换」在今天基线已有在跑实例。
- **INC1c（实施中）完成后**，execution 域第二权威触点清零（E I1）：委派写点归一、legacy COALESCE 删、resolve_all 直读删 ⇒「执行永不读最新 Profile」不变量成立——**拆分方案以此为前置，不与其并行改同批文件**。
- P r34 §4/§5（并入材料）：β2 删除的旧 accept() 活重算段＝卡片禁止形状的原文证据（Order 60 A/B 注释自陈）——冻结语义的方向已不可逆。
**兼容**：`server_profiles` 表不动、无新权威表、无 DDL；插件 envelope 存量文件不动；legacy NULL turn 行语义随 INC1c（读侧暴露原始 NULL、accept typed 拒绝）；冻结对象存量单调增长＝**迁移方案必须含存量快照处置**（E I3），留存期政策随 IFR-01 交 I。
**分步迁移（每步加性、可独立回退；实施均须另批）**：
1. **接缝步**：ProfileCapability 契约面成文（C 发布版本、指定单写者）＋`configuration_validator` 缝接通（H 供每-family 校验器、S 构造点传参）——零数据移动、零 wire 变化。回退＝摘除传参。
2. **镜像步**：插件 `ProfileStore` 写路径改「新权威写、旧 store 只读镜像」（H7 §4.4 顺序）；对账钉证两侧一致。回退＝停镜像、旧 store 恢复写。
3. **切读步**：消费方（selector/envelope/façade）切读新权威；旧 store 降为归档只读。回退＝读开关回拨。
4. **清理步（形状 (b) 定版后）**：**第一步＝动词落点非所有者指派**（P r37）——存储层加逻辑退役＋重绑语义；**禁止任何消费者侧绕存储层 `unlink`**（拆 F3 重放前提＝S 幂等钉的基座）；envelope 存量处置（依 I 留存政策）；H→P 释放面按 I 裁定落 C-RUNTIME 动词或 typed 撤销面。
**红线**：步骤 2-4 涉及数据移动/公共契约面，**全部须 I 批准后另立任务卡**；本提案不预授权。

## 交付 5 · 反例六格对账（合并四组实测；「不支持」≠「配置无效」、禁静默兜底）

| 反例 | 现状读数（组归属） | 目标态（提案） |
|---|---|---|
| 受理后编辑 Profile | β2 后直行不漂移（S F1/F2 钉）；E N1 强制交错钉＋委派入口随 INC1c c-3（E §3）；**P 侧无感＝Profile 变更不能撤销已发租约（缺口，P §4.2）** | 冻结不变量保持；Profile-scoped 撤销＝新契约面交 I（见交付 2 租约行） |
| 同版本并发更新 | S：`_mutate` CAS 409＋执行腿 409（双身份）；**插件侧 `create()` 静默 upsert＝真缺陷（H P2，待裁归属）** | 新权威统一 CAS；upsert 缺陷在镜像步前修或明示禁用 |
| 插件卸载 | entry-point 注册面消失、envelope 仍在盘、**无清理所有者（H §5）**；`cleanup_mount` 无 port 时**静默不释放（P §7）** | 清理步统一处置；静默释放路径按 P §5.2 裁定根除 |
| 旧快照重放 | 内容寻址不可变⇒重放同件（S F3 幂等钉、E §3）；插件 `PROFILE_DIGEST_DRIFT` 守卫＝**插件侧做得最实的一格（H）**；P 层重放＝响亮失败（token↔attempt 绑定＋重启 typed 拒） | 以 digest-drift 守卫为新权威行为基线（H 建议采纳） |
| 缺失凭据引用 | S：create 404 `CREDENTIAL_NOT_FOUND` 无静默；H 侧插件 `credential_source_ref` **只落盘不校验**（迁移不得带过去）；E：typed 拒绝链 | 引用校验归 Profile 能力写入前（validator 缝同批） |
| 原生配置不支持 vs 配置无效 | **今天全仓无法产生「配置无效」**：生产 validator 恒 None＋插件校验仅 isinstance（H §1.6/P3）；「不支持」有 typed 词（clone/posture 逐项 refusal、`CREDENTIAL_LOCATOR_UNSUPPORTED`） | 做实每-family schema 校验后两词分层：schema 违例＝`PROFILE_CONFIGURATION_INVALID`（422 typed）；family 能力缺位＝`*_UNSUPPORTED` typed；**任何路径不得静默用当前配置兜底**（INC1c 后已无活兜底路径，S §6 对账） |

## 附 · 待 I 裁定清单（提案不越权，产品/公共面决定全列）
1. **c-1 A 案**（委派 posture 整删＝子 turn 直取 profile 冻结件）：INC1c 已按 B 案（语义保留）实施；A 案是否为目标终局→产品裁定（本提案交付 2「原生转换」行受影响）。
2. **Profile-scoped 租约撤销面**：是否要求「Profile 变更即刻失效已发凭据租约」→若是＝新契约面＋新释放触发者（P §4.2）。
3. **H→P 释放路径**：C-RUNTIME 显式声明动词 vs 新 typed 撤销面（P §5.2，二选一）。
4. **对象平面留存政策（形状已定版 (b)＝容量账，单一问法送 I）**：永不物理删＋逻辑退役重绑下，存储单调增长的**容量/留存政策**随 IFR-01（D4/D5）同判（〔02:03Z 据 P msg.34 修正：不再把 a/b 混合问题送 I；(a) 物理删仅存为远期扩展档，须重设计重放保证＋另批〕）。存量规模实测（E I3）暂不派，条件化于 I 裁定。
5. **幽灵契约 `agent-box.opencode-profile@1`**：删除 vs 登记（H 域 `opencode/provider.py`，本轮只报未动）。
6. **插件侧三缺陷**（P1 disable 清 payload / P2 create upsert / P3 空校验）修复归属与批次：接缝步（P3）可先行，P1/P2 随镜像步或另立。
7. **posture_translation/posture_config 两模块**（S 文件内、harness 语义）是否随 H：迁移须另批（S §6 登记）。
8. **Profile 能力模块化形态**：契约边界（本提案默认）vs 独立包/进程——卡片不预设，交 I。

—— C 汇总完毕。四组原件为证据源，本稿引用以原件为准；组内 U-1..5（S）、H7-evidence 详证、P r33 §0 blob 锚、E F1-F5/I1-I3 均未复述。
