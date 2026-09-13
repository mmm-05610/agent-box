# 简洁 AgentBox Desktop — 持续交付总方针

状态：AUTHORIZED_FOR_NEW_SESSION。用户已批准本产品目标及新会话持续施工。
本文件授权Desktop实施，不授权修改AgentBox后端或自动作出产品/服务合同裁决。

## 1. 工作区与交接

- 文档发布源：/home/maoqh/projects/agent-box-desktop-next/docs/desktop-product-delivery/。
- 产品基线：/home/maoqh/projects/agent-box-desktop-next-wsl-round1，
  feature/desktop-wsl-round1@39291df26b908806fd2c4ee22540d54886515978。
- 新会话在上述干净工作树创建 feature/agentbox-desktop-product 分支并继续使用该工作树。
  保留旧36R分支检查点，不merge/push main。不另装一套巨大依赖，不复制用户home。
- 只有新会话可接管本队列。旧Desktop会话已交付停止；启动时核对无其他执行者继续写该工作树。
  若发现写入冲突，暂停产品写入并报告，但可继续只读核对、设计和合同缺口整理。
- 后端会话与其工作树保持独立；38研究推荐不等于已批准生产接入。
- 起步先检查自己已在目标分支/是否有既有检查点；恢复执行不得重新开分支或重做已完成阶段。
- 将本次文档发布提交cherry-pick到产品分支，只含本文档及调度覆盖；冲突保留事实，不覆盖用户修改。

## 2. 产品权威与文档消费

[产品决定](../night-work-planning/product-decisions.md)、[模型复用调查](../night-work-planning/model-configuration-reuse.md)
为输入。旧草案“不派工”描述是历史状态；本总方针仅激活下列工单范围，其他后续想法不自动实施。
本文件不以“全部去Hermes”为由恢复原产品所有能力。

每阶段开始、每个检查点完成、一个子项受阻时，重新检查发布源的master-plan、
contracts/index.md与新增work-orders。记录消费的文件摘要/合同版本到工作分支status。
发布源后续新增内容只读消费，经明确路径复制/补丁同步到工作分支；不合入main整条产品历史。
禁止覆盖发布源的状态以免与设计者冲突；执行status与evidence写在产品分支。
合同只认index中明确APPROVED的记录；PROPOSED不是生产接口授权。

## 3. 上到下的目标树（职责，非强制新造目录）

```
apps/desktop/
├── src/
│   ├── app/                    组合、路由、shell、窗口入口；薄
│   ├── features/               Workspace/Session/Profile/Settings产品界面
│   ├── application/            用户意图协调、状态转移、迟到结果保护
│   ├── store/                  视图/草稿/后端投影；无服务编排与第二业务数据库
│   ├── api/                    中立客户端；不向上import，不认识原生Harness协议
│   ├── types/ lib/             中立合同形状与纯函数
│   └── components/ i18n/       通用呈现与文案，复用既有设计
├── electron/
│   ├── app/ windows/           应用/窗口生命周期
│   ├── ipc/ preload.ts         窄宿主能力入口
│   ├── host-capabilities/      本机文件/git/系统凭据保护等
│   ├── process/ workcore/      通用进程/AgentBox服务基础设施生命周期
│   └── legacy-hermes/          逐路径替代后退役，不作为新产品前置
└── e2e/                        真实Electron用户路径
```

顺序：先36R返修→上层页面和流程→用例/状态/API→Electron接线及遗留清理→正式后端接入→整体验收。
允许为上层施工提前定义窄内部接口；不必等所有上层文件完成才修改被它消费的下层。
沿用现有目录规范，等价命名可自行选择，不强造上图不存在的“框架”。

## 4. 完成定义与范围

整体目标是已批准的简洁AgentBox Desktop，不是原Hermes全部功能。
核心：无Harness仍能启动；统一项目及WSL打开；角色选择；首次发送建Session；
流式对话、停止、恢复、草稿；同Harness角色切换由真实后端确认；模型与角色配置可操作。
已批准的设置/Skills/MCP/备份按工单逐项完成前端；后端缺能力时登记缺口，不伪造服务。
全功能GREEN必须有对应真实能力；不可用占位只算UI/结构阶段完成。

退役：Bots群聊与原Agents管理入口、全局Artifacts、旧Capabilities大入口、
Hermes启动门/网关选择作为通用产品前提，以及只服务这些退役功能的独占代码。
保留：会话产出、Profile、pin/search、现有通用文件/git能力。
Cron已有能力去品牌化；HUD/Pet/Quick Entry保留客户端窗口骨架，未就绪的后端续接能力不伪造。
不新增群聊/子代理授权/云同步/跨Harness会话转换/新调度器/新模型代理。
目录或名字含Hermes并非自动删除理由：接入方返回的名称/能力、历史迁移键、版权与来源可以保留。
终态通用UI与业务协调代码不能依赖Hermes专有控制流。

## 5. 执行者自主权与不停工规则

- 可自行拆小任务、调整同层文件位置、选等价内部API、补正常迁移、修范围内缺陷。
- 可在互不碰撞范围分派最多2个子任务；判断/审查最高sol，机械工作luna或terra；
  主代理负责集成、证据与资源协调。共享文件串行，禁止两个构建同时抢Windows。
- 每阶段有可验证成果后提交并继续；不以“请确认下一阶段”结束。
- 缺合同：标该项WAITING_CONTRACT，继续页面、交互、纯逻辑、宿主能力及其他已明确项。
- 缺外部依赖：先查已有结果/现成实现；限定实验，不反复广搜、全量安装；失败则隔离该项继续。
- 本地测试失败先定位首因，补行为反例后定向修。禁止靠删测试、降低阈值、扩大ignore换绿。
- 整个goal只在以下情况需要用户：真实工作树/权限冲突、破坏性迁移或秘密授权、产品权威矛盾、
  合同要求跨仓改动，且所有安全独立工作已耗尽；或者目标全部真实完成。
- 全部独立工作耗尽仍缺合同时，如实汇报PARTIAL与最小阻断；不能忙等、反复重跑或假报完成。
  若产品支持用户要求的等待机制，可等待新派单；不占用编译进程“等待”。
- 无论是否goal模式，持久性不扩大授权：不改后端、不读真实凭据、不跑付费模型请求；
  需要这些才能完成实测时登记授权缺口，优先完成无模型部分。

## 6. 合同接入纪律

内部UI测试端口可以先设计，只表达已批准意图，标注INTERNAL_NOT_WIRE；不能擅定HTTP路径/
鉴权/分页/事件序列/续接规则。生产默认没有合同就返回明确Unavailable，不回落Hermes。
收到正式合同后直接接真实客户端并补反例；不要再造一层相同DTO“为了抽象”。
Server管业务与Harness执行，Electron只管服务基础设施和宿主能力，Renderer不实现ACP。
Profile/Session/角色记忆权威在本机；远端仅受管依赖及执行投影。
同Harness切Profile：后端确认生效与当前角色，不换Session身份、不改历史；运行中行为按合同。
后端未实现的高级能力不以本地队列/复制历史/写文件冒充。

## 7. 验证、资源及证据

沿用基线：36R整体PARTIAL；上一验收3文件21/21通过；工人侧栏166项通过为报告证据，
Windows23 PASS/2 SKIP/1 PENDING不是26项全通过。IN_FLIGHT缺未跟踪POC为已知基线。
每阶段：受影响行为测试+相关typecheck/lint+diff-check；迁移改调用方/mock/import和文案。
按阶段提交，不每改一个文件跑全量；全量Desktop测试在集成/最终门各按必要性运行，失败首因先修再重试。
不读源码文本写形状断言；结构守卫与功能行为测试分开。必要的层序检查不得放宽账本。
Windows用本地磁盘既有隔离构建树；单构建槽，先看空间/已有进程；不在UNC大构建，不cargo clean。
新UI必须在原Electron应用截图，禁止另写预览HTML当产品成果。
每单记录带职责目录树、改动/删除清单、检查点、测试与skip/pending原因、用户点击路径、后端缺口。
证据进程/文件只清本轮可证归属者，禁止按通用名字pkill或删整个用户目录。

## 8. 保护区

不得读/改/复制/stage未跟踪POC：apps/desktop/src/agentbox/、src/plugins/agentbox-lab/；
不得动未跟踪acp-desktop-phase1-design.md、desktop-src-tree.md；不以复制POC凑过守卫。
不动用户实际home/项目/会话/凭据，不自动清理他人缓存与工作树。
已有全局AGENTS中Hermes-only描述是历史基线；本单明确授权退役该产品耦合，但禁止恢复仓内Runtime。
只在职责实际迁移完成后更新相应AGENTS；保留许可/归属。禁止git add -A、stash、reset、push、自动合main。

## 9. 队列与终态

按[manifest](manifest.json)、[status](status.md)、[合同入口](contracts/index.md)调度。
P00→P01→P02→P03→P04；P05可以在P02后随正式合同增量推进；P06最终收口。
任一项等待不阻塞其他独立项。新指令导致碰撞由主代理协调并记录，不重新开goal。
manifest中的depends_on表示消费所需结构检查点，不要求整单所有外部能力先GREEN。
例如P02上层接口与行为已验证、真实服务仍等待，P03可消费该检查点继续；
P06可先做独立集成验收，但P05未完成时禁止最终GREEN。status逐项记录实际满足的前置。
所有订单属于同一exclusive_group，跨单共享文件串行；子任务仅在主代理划定不重叠写集后并行。
整体：AGENTBOX_DESKTOP_PRODUCT_GREEN / AGENTBOX_DESKTOP_PRODUCT_PARTIAL。
分别报告UI_READY、CONTRACT_CONNECTED、REAL_FLOW_VERIFIED，不互相替代。

## 10. 通用检查命令与实施记录

在产品工作树执行；定向测试路径由实际修改的模块决定，不把整仓测试当每单起步条件。

```bash
npm run --workspace apps/desktop typecheck
npm run --workspace apps/desktop test -- --run <受影响测试路径>
git diff --check
git diff --cached --check
```

先核对现有package脚本的参数转发再调用；lint仅本轮改动文件，最终检查另报告整仓基线。
apps/shared或tests-js实际受影响时运行它们现有的typecheck/测试。
每单evidence必须含before/after职责树、源→目的地、调用方和动态import/mock/fixture更新、
行为不变量、命令与退出码、合同等待项；未测不能画成已通过。
