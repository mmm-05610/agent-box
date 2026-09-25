# Profile vNext — 逻辑启动预设（设计草案 v0.1）

状态：DESIGN_ONLY。用户授权并行设计，未授权将其加入 HD-001 实施。不得给当前前后端执行者增加 Profile、Provider、Memory 管理任务，不迁移旧数据、不读凭据、不改产品代码。

## 1. 产品不变式

Profile 是可复用的逻辑启动意图，保存“用什么”，不保存“在哪里、怎么放置、怎么启动”。
- 不含 native home、环境实例、机器 ID、绝对路径、认证文件路径或秘密值。
- 不拥有 session/history/memory/provider 内容，不实现这些能力的管理。
- 原生状态留在原生环境。Profile 本身可跨不同 home 使用；是否跨 Harness 兼容由选择项能力要求决定，不能默认通用。
- 先有能独立管理且能注入运行的能力，后有该能力可保存的 preset 项；不能凭 Profile 的字段倒逼实现。
- 不安装 Profile 插件，原生默认启动/会话仍可工作。运行内核不依赖 Profile CRUD 或记录格式。
- 编辑 Profile 不影响已经启动的执行，也不暗中改已有原生会话配置。

## 2. 最小数据面（建议，不冻结序列化与数据库）

ProfileRecord = {schemaVersion, id, name, revision, selections}
selections: 每项 {kind, version, value}；kind 为归属明确的命名空间，例如 memory.selection，不按注册顺序覆盖。
value 仅允许声明过的逻辑标量和逻辑资源引用。资源引用至少表达能力域与可解析逻辑身份；可选内容版本约束，不要求内含存储位置。
metadata 可后续添加，但不得成为秘密、路径或任意行为的后门。
同kind初版只允许一项，需要集合由该kind schema定义，避免先引入覆盖继承语言。
默认不提供Profile继承、模板脚本、任意shell片段或可执行表达式。
可有目标Harness限制，但不是必需home绑定；优先由选择项形成兼容性要求。是否提供顶层逻辑target字段留后续确定。
内部数据库profile ID、native session ID和跨环境资源逻辑身份不同，不互换。

示意（未来能力已实现时）：
{name: "审阅", selections: [
  {kind: "provider.launch", version: 1, value: {providerRef: "team-review", model: "logical-model"}},
  {kind: "memory.selection", version: 1, value: {refs: ["team-coding-rules"]}}
]}
这些字符串是示例逻辑标识，当前不宣称可解析。认证绑定、provider endpoint及model别名的真实解释归对应能力模块。

## 3. 后端包与注册边界

- profile-contracts：Profile记录/选择项描述/诊断/解析请求结果契约；不依赖Profile实现。
- profile插件：预设CRUD、revision/CAS、内容摘要、选择项扩展注册表、校验汇总；不负责native home或资源内容。
- 各能力的可选profile集成模块：向Profile注册自己拥有的kind/schemaVersion及validate/resolve/describeRequirements。能力本体不得硬依赖Profile，按当前插件机制选择可选贡献模块或单独集成插件，不另造插件加载器。
- service启动用例：收到profileId+revision时调用Profile入口得到逻辑启动意图；没有profile则使用普通启动路径。
- 各能力解析与Harness适配：将意图绑定当前环境并转换为实际支持的启动输入；不得默默改共享home。E消费普通已解析执行输入，不感知Profile存储结构。
- connector：暴露后端实际的Profile能力；GUI不直接操作native配置。

最小扩展接口草图：
registerSelection(scope, {kind, version, schema, validate(value), requirements(value), resolve(value, context)})
scope随插件卸载回收，kind/version重复注册报冲突，禁止最后注册者赢。schema表达类型，不成为任意代码执行配置。
context由调用者传入运行目标和可用能力解析服务；不得序列化回Profile。避免给扩展一个无约束的全局service locator，具体上下文权限在实现阶段按复用API收窄。
resolve优先返回能力自己的类型化意图/引用；启动组合由既有各能力消费者完成。不要引入全能CLI/env/files补丁语言或第二套执行编排器。
Profile插件不认识memory/provider专用字段，只识别描述符、版本及通用诊断；安全输入验证不能只靠字段名正则拒绝token。

## 4. 前端包与注册边界

- 前端profile插件向Workbench注册管理视图，向启动入口贡献可选preset选择器；不修改对话核心，不要求所有会话使用Profile。
- profile插件提供ProfileEditor贡献接口，能力UI按kind/version注册编辑器与摘要；不得允许不受信任服务直接发送任意JS执行。
- 简单字段复用当前统一表单/控件；复杂资源选择复用所属能力的选择器。具体库选择前要做源码/许可证/依赖兼容核验，本稿不冒充外部调研结论。
- 前端schema提示用于编辑体验，后端校验权威；前端缺自定义编辑器不等于后端能力不存在。
- 没有编辑器但有支持的简单schema可用通用编辑器；否则只读显示保留记录。没有后端selection resolver则标不可用于启动，不能通过前端表单存在假装可用。
- 切换连接后重新查询Profile可用性与资源解析结果，先前环境的ready缓存不能复用。
- 切换Profile只设置下一次新启动的意图；恢复旧会话默认保留原生会话语义，不把preset自动应用到已存在session，另行显式支持才开放。

## 5. 生命周期与错误语义

保存草稿不必要求所有引用当前可用；返回“已保存，但此环境不可启动”与逐项诊断。缺插件/未知版本的原值原样保留，不能打开再保存就丢字段。
启动必须指定确定revision或先解析latest并固定revision；引用资源在能力支持时固定其版本/摘要。若只能动态解析，记录实际结果及可重现性限制。
先做无副作用校验/解析预览，再在启动时重验证授权与引用有效性。预览不是永久可用凭证。
解析部分失败不能留下home改动；若资源解析确需创建资源，由其所有者提供可释放租约/失败清理，不假称跨能力ACID事务。
不同选择项写同一个有效启动槽位时必须由该槽位所有者裁定兼容/冲突；初版冲突失败，不引入隐式注册优先级。
执行记录Profile revision/digest、选择项版本、实际采用的非秘密资源引用；不得记录解析出的凭据。共享原生状态意味着不承诺完整可复现。
最小诊断：UnsupportedSelection、UnsupportedVersion、ReferenceUnavailable、IncompatibleTarget、ConflictingSelections、PermissionRequired、StaleRevision。最终命名复用既有错误通道，非新增协议定案。

## 6. 迁移和级联导出不归Profile核心

仅导出Profile可移植记录；完整迁移由可选迁移编排能力询问各资源所有者的依赖清单、导出/重新连接/不可迁移结果。
资源管理不等于资源托管，不强求每种资源都能打包。默认不导出凭据；远程共享资源可以保留引用，目标环境重新授权。
逻辑引用重绑定表在导入/目标环境侧，不将home/机器路径写回Profile以求“能跑”。循环依赖、共享资源去重、版本冲突由迁移编排处理，不塞入Profile解析器。
不实现全局资源目录来服务一个Profile字段；优先复用能力模块既有标识与resolve接口。

## 7. 当前代码事实（只读，bc @60d868ef）

- src/agent_box/resource_contracts/agent_box_profile_v1.py：AgentBoxProfileV1已有name/agent_type/digest/revision/provider，且是执行资源契约。可以借鉴版本/摘要，不意味着可直接改变此兼容契约。
- plugins/agent-box-harness/src/agent_box_harness/generic/profile_store.py：已有revision、digest、expected_revision冲突、资源ref/resolve；同时存native_payload、credential_source_ref、session_overlay_policy等，不是本稿纯逻辑预设。
- src/agent_box/server/profiles/service.py 与 repository.py：已有产品Profile用例/存储，服务层与Harness原生Profile存储不是天然同一个身份，迁移前须完整画清调用与权威。
- ProfileEnvelope有独立实现，需后续完整调查再定复用范围。
本轮只抽查上述源码，不是完整现状审计；未读Profile数据目录或凭据。外部组件研究尚未做，不锁新依赖。

## 8. 分阶段落地建议（尚未派工）

P0：现码与权威盘点，逐项归属表；选一个真实存在且可安全独立注入的能力作为扩展样本，不为样本新造memory/provider系统。
P1：独立Profile插件、最小记录、扩展注册与校验；测试卸载插件后普通启动不受影响。旧数据与旧profile协议保持不变。
P2：启动入口集成＋前端可选编辑器；证明同一记录在两个不同home可用，实际参数来自各自运行上下文，产品无home字段。
P3：显式旧数据转换工具先dry-run与人工确认，只迁逻辑选择；不复制/删除原生home、不自动改旧profile/session身份。
P4：需要时独立设计资源依赖迁移，不作为Profile首版前置。

## 9. 必须通过的反例

1. 无Profile插件仍能默认启动；能力插件无Profile仍能提供本职能力。
2. 同preset在两个home解析，记录字节不变化；无本机路径泄漏。
3. 未知kind/version保存后无损，启动明确拒绝；卸载扩展不能静默忽略。
4. 重名注册/不同项冲突报错，无最后注册者赢。
5. 改preset不影响在途执行；读取旧revision可追溯。
6. 一项解析失败不改共享home；跨环境切换不沿用旧可用性缓存。
7. 逻辑引用目标不存在/无权限不静默替换，凭据不进入响应与导出。
8. 前端无编辑器可只读保留，后端不支持则不能启动；两者不混淆。
9. 恢复已有会话不自动重套新preset；显式新启动才消费预设。
10. 两个preset并发在同home启动，不靠轮流覆盖配置文件实现隔离。

## 10. 待讨论

- 目标Harness限制是顶层可选target还是由selection requirements推导？建议先由requirements表达，确有产品选择再加。
- 稳定逻辑引用在各能力模块中的现有支持程度，哪些仍只有本地ID？未解决前不能宣称跨机器透明迁移。
- 首个扩展样本选什么？必须来自已独立可用能力；当前HD-001禁区不因本稿放开。
- Profile逻辑记录存放于哪个用户/团队作用域及权限模型？与home无关，存储载体延后确认。
