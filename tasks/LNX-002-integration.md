# LNX-002 — 两仓 Linux 源码基线集成

**第二次交付裁决：**当前下一步执行 `control/LNX-002-runtime-ruling.md` 的
错误阶段映射与 ACP 结果透传两项有限修复，记录 ACK；此前返修记录保留追溯。

**I 初审返修：**读取 `control/LNX-002-review.md`，按其中七项完成有限返修，
记录 ACK 与新结果。当前 SOURCE_SNAPSHOT_VERIFIED / CHANGES_REQUESTED。

**执行补充（2026-09-21）：**继续测试/协议阶段前读取
`control/LNX-003-review.md`，在自己的 status.md 记录 ACK。它更新媒体、
stop reason、配置链和历史 main 的判断；不要求重做已完成合并。

签发 I，2026-09-21。执行者：用户启动的一个 DeepSeek 会话（mcode 或 dsh）。
状态 ISSUED，待接收。你是本轮两仓候选代码的唯一写者。
先读根 README/AGENTS、control/README、decisions Part 6、LNX-001-review.md，
再读涉及产品仓库的适用 AGENTS 和 LNX-001 调查报告。不使用旧调度 skill/循环。

## 授权与范围

可以创建以下两个 worktree，在各自仓库新建同名分支 integration/linux-native-0：
- worktrees/integration-linux/backend：起点 runtime a7b7b6ff15ab127a168ec3715bb5eb4414aa8aaa。
- worktrees/integration-linux/desktop：起点 chat 08b4eac7fe10aacc3220cca94c52659aaf043cc5。
先核验路径/分支是否已存在；若存在先辨认所有者与状态，不强制覆盖或复用。
允许候选分支内合并、修复集成问题、安装候选环境所需项目依赖、运行有限测试，
并作本地提交。使用隔离 venv/候选 node_modules；不改系统 Python、不全局装包。
需要系统权限时报告具体缺项，由正常权限机制处理。
禁止 push、改 main、修改旧树、删除历史、读取秘密、迁移旧数据、触碰已有服务。
本任务不调用真实模型。允许测试在新临时数据根创建自身服务，退出时仅清理自己
启动且身份确认的进程，不按端口/进程名批量杀进程。

## 执行

1. 把四条源 HEAD、两仓 main、工作区状态登记到 reports/LNX-002/input.md，
   与任务起点比对。若漂移，说明变化后再决策，不默默换成最新提交。
2. 后端整合 service 003b52b2b18a86547d2819ea8875095442d2011b。
   保留 schema 20 迁移、runtime 执行链、service wire 行为和新增可见事件。
   三个公共存储文件逐项记录冲突取舍，测试 config digest/freeze 的一致性。
   使用新库与合成旧 schema fixture 测试，禁止打开用户旧库。
3. 桌面整合 settings 01083212aaade2ead3a1be9323943ea3eae3284e。
   逐项保留转录/工具卡、发送状态、模型配置及 i18n 增量。
   媒体方案按 I 审阅文档处理，必要时结合 LNX-003 的证据；未有证据不得
   以删测试/skip 或全文件 ours/theirs 代替语义整合。
4. 跨仓协议以生成源为准统一，核对 handler 接受/返回值，生成并验证摘要。
   旧 stale 工件不得继续被默认选中。记录生成命令、消费点和最终完整摘要。
5. 按改动运行有针对性的单元、迁移、wire、桌面类型/组件测试。
   集成新增失败必须解决；既有失败附来源、复现和影响，不能仅沿用历史“预红”。
   明确区分通过、失败、未运行和跳过；检查零测试收集/整组 skip。
6. 本轮不新增持久 SecretStore、桌面服务管理器等大功能，不把试用凭据脚本
   作为产品方案。运行时工件记录可重建性缺口，不依赖旧树未跟踪工件冒充
   自包含构建。涉及这些缺口的检查明确标注阻塞，完成能做的源码/离线验证。
7. 为候选提交保留两条源历史（优先正常 merge），完成后验证源祖先关系；
   若必须选择性迁移，先记录原因与逐项成果映射，不能默默丢弃源线。
   只 stage 明确路径，提交前检查无秘密、构建产物或本地 agent 配置。

## 交付与停止条件

只写两棵新候选树及 control/reports/LNX-002/；不修改 I 的决策/总账或其他助手报告。
写 status.md（RUNNING / PARTIAL / READY_FOR_REVIEW）、冲突取舍、测试命令和结果、
两仓完整提交 SHA、协议摘要、已知缺口及下一步建议。
产出 source-checkpoint.md，注明 SOURCE_ONLY；未验证桌面全链不得称可运行或用户验收通过。
本地提交后候选产品工作区应干净。执行终点是可审阅的源码集成结果，或明确
有证据的阻塞与已完成部分；不自动开启业务开发，不轮询等待用户。
