# 初始方案：研究汇合后细化，非强制最终UI
## Phase 0 已开放：共同调研
FC与各组分别查证参考源码。优先核实用户所称最新开源 zcode Desktop 的准确仓库、版本与许可证，不把同名工程或截图当源码事实；找不到就如实记，其他候选继续。
每组至少2个相关候选（可含当前已采用库），至少1个读源码，记录版本/路径/链接；中央共享候选池，避免重复劳动。每个新增/重做可见组件必须登记复用结论。
复用账用 REUSE-TEMPLATE.md，各组写 agents/<ROLE>/reports/reuse.md，FC汇总引用；后端组同样查现有实现避免自造。
FC亲读关键材料，不只拼报告。统一风格/状态/交互，给出未连接、选Harness、独立会话、项目会话、运行、审批、断连的状态方案。
从零实现须中央批准：候选不可用原因与最小自写量；百分比代码复用不作指标。依赖许可证/兼容性不清则不用。每实施检查点复查复用账，允许新证据改变方案。
BC查现有公开接口/会话/项目/运行目录与H/E链路。F1+S 形成接缝事实表，不预设对外是ACP、不强造新协议。
研究交付短而可执行：证据、候选、推荐、跨包请求、验证方式。不能无限整轮重研。可以在其他独立问题继续调研时批准已一致的局部。

## Phase 1 C审批：前端目录准备批
F0仅负责机械迁移和独立包构建契约，FC集成；其他前端组研究与反馈。
目标：
apps/desktop/{electron,renderer}
platform/{extension-api,extension-host,extension-loader,native-bridge}
contracts/{workbench,commands,settings,connections,agent}
plugins/foundations/{commands,workbench,settings}
plugins/connections/{service,status}
plugins/agent/{sessions,conversation,interactions}
plugins/connectors/{codex,pi}（ordessa实现批准后才新增）
products/agent-desktop/{extensions.json,extensions.lock.json}
tooling/
contracts为共享Token/类型，不放业务实现；确保跨插件同一运行时身份/版本。独立插件各自manifest/package/build/tests；宿主不枚举业务包，仓库总构建脚本可发现包但不是宿主依赖。
不改变复用底座Lumino/现有生命周期，不拆掉已验证语义。旧测试按所有者迁回包，保留应用级集成门。

## Phase 2 C审批：包实施
F1连接服务接走sessions中client持有/当前选择/重连。状态UI通过workbench statusbar注册；连接器向连接服务注册，不能把品牌塞核心。连接实例与连接器身份区分；能力缺失不伪造。
F2拥有会话服务与列表，项目选择轻量使用后端权威，无完整项目管理平台。
F3拥有对话与交互，请求优先研究在对话区的合理呈现；右下区域不定死，今晚无业务不展示。隐藏model/provider/思考强度入口。
后端只改闭环必要面，Work Core默认冻结；Profile/provider管理零新增零迁移。既有底层发现阻塞先按真实所有者裁定最小修复，不成立P常驻组。

## Phase 3 联调检查点
CP1: 连接+Harness上下文；
CP2: 独立/项目会话创建与打开；
CP3: 同一会话2轮真实对话+工具结果+实际有提供的思考与产出；
CP4: 真实审批/输入、停止确认/unknown、会话切换、断连恢复及旧事件隔离。
先在一个可用Harness跑通完整链，再用另一Harness验证同UI；未验证品牌不宣称支持。
每点发布成套SHA、运行参数、契约版本、证据等级。夹具通过不能代替M级真实调用。真实测试权限在BUDGET.md闸门满足后才开放。

