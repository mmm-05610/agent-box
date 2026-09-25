# Profile 图纸插件 v0.2 — 独立包批准，不入基线

2026-09-23 用户批准讨论方案，并明确“暂时不并入基线”。本文件是独立插件增量要求，不是启动接线或发布许可。

## 模型与边界

Profile 是可命名、可修订的能力选择图纸，不是 Agent 实例、执行或原生会话。核心保存身份/名称/说明、格式版本与记录revision、逻辑适用目标、按命名空间和格式版本归属能力插件的声明。适用目标只描述Harness兼容约束，不含机器、home、工作目录。此前讨论JSON为示意；沿用已有selections等字段与兼容机制，不为改名重写已验证成果，具体落点在包内设计中说明。

图纸不保存凭据正文、memory本体、原生home、会话历史和进程状态；不分配项目目录，不启动进程，不写原生配置。无Profile仍可使用原生Agent。能力扩展只管理自己的声明，不让核心认识provider/memory等具体字段。

未来启动由执行组合方结合项目和环境调用相应解释器；每次固定Profile修订及实际解析结果，不能把它说成冻结外部资源内容。修改/删除Profile不得追溯改变运行实例。本批不接入上述生产启动流程，不改Work Core或Harness。

## 本批功能

- 审计复用已有P0/P1，补齐创建、读取、CAS编辑、复制、删除、导入导出及校验预览；持久化只限新插件自己的存储，不迁移/覆盖旧Profile。
- 命名空间+版本的能力解释器接口：校验、目标适用性、解析逻辑引用。预览不能产生运行副作用。缺解释器/引用不可用须显式诊断，不能静默忽略或改用默认值。
- 未声明表示不干预；未知命名空间/版本及字段无损往返。重复注册显式冲突，卸载后可用性失效。导出只导图纸，不承诺级联资源迁移。
- 前端列表/编辑/预览，以注册表加载编辑器和摘要，缺编辑器时只读保留。数据来自注入的插件服务端口；根视图用无props组件闭包绑定。明确采“插件自带数据接入层”而非修改宿主root.mount为Profile专门传records。
- 只提供可选选择接口及独立演示，不在当前启动UI插入Profile选择器，不支持运行中切换Profile。真实connector/Server API未接线时使用明确标注的测试端口，不宣称已连后端。
- 测试用能力贡献证明新注册不需改Profile核心或宿主源码；不实现真实Provider、Memory、Skill管理。

## 写域与交付

沿用原PROFILE唯一写者、原独立树：
- worktrees/harness-desktop-002/profile/backend/plugins/agent-box-profile-preset/**
- worktrees/harness-desktop-002/profile/frontend/plugins/profile/**
- control/missions/HD-002/agents/PROFILE/**

包内src/tests/docs/manifest可改；禁止根manifest/lock、共享contracts、Server/wire/Execution、宿主、CP候选、用户配置与凭据。不cherry-pick进FC/BC候选，不merge/push main，不把Profile列为CP-SESSION-001前置。需要越域先报；本批优先轻量包内测试，不抢真实测试流/重构建槽。

先核现场HEAD/dirty及P0/P1已交能力，写短差量方案和复用记录，能独立满足上述要求就实施，不重复开发已完成面。验收含CAS冲突、未知字段往返、重复注册/卸载、缺能力诊断、预览零副作用、无props根视图与注入端口可独立渲染、新测试贡献不改核心。包内验证/宿主接缝/产品装配/用户验收分账。本批仅前者及独立示例，不把mock端口称生产接缝通过。

BC为原启动/收件负责人，FC仅提供只读接口事实，C登记独立旁线。执行者若已停或到平台上限，回报I，禁止重复启动同域写者。先由我们审视雏形符合度，未决跨包设计不得埋进实现。
