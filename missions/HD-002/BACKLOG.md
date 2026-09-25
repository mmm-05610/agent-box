# 增量池 — C 维护

|ID|owner|状态|范围|
|---|---|---|---|
|CP-SESSION-001|C/FC/BC|REQUIRED_NOT_YET_READY|唯一当前主线：固定可运行 FE/BE 配对，Session 真实闭环及用户验收资料；不推 main|
|MAIN-FE-INTEGRATE|FC|F1_CONNECTOR_SOURCE_INTEGRATED_NOT_ENABLED|FC-0061 收 F1-0011 至 clean afe7f41e97，typecheck、ordessa 40、renderer 150 绿；F3 视图/M6 在途，connector 尚未产品启用或真实配对|
|MAIN-FE-CONNECTOR|FC/F1|SOURCE_INTEGRATED_AS_FC_0061|F1-0011 完整包含 typed 项目失效 D1 修；FC clean afe7f41e97 暂收。产品 enabled、root workspace/lock、双命令同实例和真实 Server 配对留 C-0020 候选窗|
|MAIN-SESSIONS|FC/F2|FACADE_INTEGRATED_F3_VIEW_PENDING|FC-0059 收 F2-0010 的 optional endedBy 与首发路由反例，E1→New 首发不会误投 E1；合并树 renderer 110 绿。F3 仍须修草稿视图优先及未发文本隔离|
|MAIN-UI|FC/F3+F0|DRAFT_PANE_FIX_IN_PROGRESS|F3-0015 探针证明仅改单一视图条件会覆盖旧会话未发送文本；FC-0060 批原子修，F3-0016 更正历史口径并在独树施工。FC 等 clean HANDOFF 后收编|
|MAIN-BE-SESSION|BC/S/H|FAKE_PEER_GREEN_REAL_PI_COMPATIBILITY_OPEN|BC clean 1d3a957 的原生 Server CLI 假 ACP A/B、首/续聊、权限和停止门通过；BC-0042 旧 ACP 当前用户 agent dir 无 prompt session/new 失败、空目录通过；BC-0044 现装 Pi CLI get_state 成功。BC 正比较相容 ACP 接线；旧 BC secrets.py 草稿停写保留|
|LINUX-SECRET-STORE-CP|BC/C|SUPERSEDED_OFF_CP|C-0023 显式 Secret Service 包被 I-NATIVE-AGENT-001 覆盖，不再为本阶段前置；已有未提交草稿留原树停写，不删除/回滚/并入候选；原生配置若真受阻须报具体代码/协议证据|
|FE-HOST-AUTH-001|FC/F0|F0_RESTART_GATE_PENDING_RECEIPT|FC-0037 收 F0-0007 零改桥 10 负例；F0-0009 新片 bridge 13、storage 重启夹具绿待 FC 收；C-0019 两命令真实同实例启动与 F1 private token 安全门待做，renderer 不获 token|
|CP-CANDIDATE-CLOSURE|FC|RULED_NOT_STARTED|C-0020/FC-0042：最终装配窗从干净 SHA 开独立候选分支，按依赖图隔离未接线直连原型/空插件；build-all 仅交付 enabled 及承重依赖的干净 dist/lock，保留原树历史；未完成不得称 CP ready|
|MAIN-BE-R2|BC/H/S|UNBOUNDED_USAGE_AUTHORIZED_NATIVE_PATH_PENDING|I-DEC-0001 用户明确取消次数上限/计数要求，C-0025 在唯一旧账本保留 99/10 历史并登记当前无次数上限；不再造请求硬 cap/数字预留。真实测试仍待原生链与具体 endpoint/model/项目/权限核实，由 C 协调单真实测试流|
|B-INDEPENDENT-WORKSPACE-001|BC/S|PARKED_OFF_CP|C-0008/C-0010 的旧方案与既有成果保留；用户撤销其主线必要性，本阶段不继续扩实现|
|REST-BLANK-SESSION-001|FC/BC|SUPERSEDED|C-0011 的纯建空会话首发路径撤销；历史事实保留，改用用户裁决的首次发送创建|
|PROFILE-PLUGIN-001|BC/PROFILE|INDEPENDENT_OFF_CP|用户原会话与既有独立树成果保留；不新增 CP 集成批，不默认加载|
|PROVIDER-MODEL-001|I/用户|PAUSED_DESIGN|本阶段不派新任务|
|EXECUTION-FOLLOWUP|BC/E|ONLY_IF_REQUIRED|仅 CP 真闭环暴露必要执行缺口再给明确包|
