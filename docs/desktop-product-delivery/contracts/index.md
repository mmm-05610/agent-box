# 前后端能力合同增量入口

当前：CORE_SEMANTICS_APPROVED_WIRE_PENDING。
2026-09-14用户批准的核心行为已登记；不再以“所有产品合同未定”为由等待。
没有任何HTTP路径、认证方案因语义批准而自动获批。
既有后端实现和冻结Tauri合同可做事实输入，不自动视为Electron合同。

| 版本 | 状态 | 覆盖 | 编制/实现入口 |
| --- | --- | --- | --- |
| [core-semantics/1](core-semantics-v1.md) | APPROVED_SEMANTICS | 生命周期、Worker/数据、Workspace、Profile/模型、消息/队列、审批/恢复 | 前端P07编制同一份wire候选；后端接单核对锁定；现有后端不宣称已实现 |

APPROVED_SEMANTICS允许通用类型/用例/测试实现；PROPOSED_WIRE允许隔离测试服务与客户端适配验证，
不能宣称已获真实服务支持。双方核对单一可执行schema及安全引导后登记WIRE_LOCKED_FOR_IMPLEMENTATION，
附schema摘要、版本和两端接受检查点；不改变已批准语义的机械编码无须逐字段询问用户。
涉及权限、权威、持久化保证、产品行为变化仍须裁决，不能在编码时暗改。
锁定后前端可完成生产客户端；仍由联调门确认真实服务可用，不以版本标签替代验收。

## 双端反馈通道（执行期间，不等实现READY）

- 前端候选权威在执行工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1/`
  的 `docs/desktop-product-delivery/contracts/wire-v1/`，不是发布源中尚未更新的占位状态。
- 后端从39阶段即核对候选，答复在
  `/home/maoqh/projects/agent-box-server-round1/docs/server-round1/wire-review.md`。
  包含候选HEAD、schema摘要、ACCEPTED或CHANGES_REQUESTED、精确更正和测试证据。
- 前端每阶段及候选提交后检查此答复，自行在前端工作树落实机械更正，记录接受摘要；
  后端读取该记录并确认相同摘要。双方接受记录即可锁定，不需要第三次口头批准或服务完成。
- 没有答复文件不是拒绝；先继续其他独立工作。只剩wire待答复时每5分钟通过产品等待机制复查，
  单次阻塞不超过60秒，不重跑构建、不因正常等待提前结束前端goal。
- P07是默认候选编制方；后端可给补丁建议，不能因暂未看到文件自行另造权威schema。
  只有前端明确移交编制后才切换候选来源，双方登记同一份，不维护竞争协议。
- 机械字段/路由编码由双方协调；涉及已批准语义、安全权限或数据权威变更仍需用户裁决。
  等待合同反馈不等于等待前后端联调，不能用42的READY双门禁止前期只读合同交换。

设计者后续在本目录追加合同并在此登记：
版本/状态(APPROVED或PROPOSED)/覆盖能力/替代版本/后端实现与验收入口/兼容迁移。
执行者每阶段读取发布源本目录，有APPROVED增量就消费，不必等待新goal或口头通知。
缺某项合同只冻结相应生产接线，继续其他独立工作。

待覆盖：
- 服务发现/生命周期/认证及错误信封；
- Workspace创建/打开/恢复、环境身份、远端依赖准备；
- Profiles/Provider-Model/凭据/原生记忆能力描述与版本；
- 首次发送幂等、Session历史、事件补齐、取消、审批、角色切换；
- 能力库、安装更新、备份恢复及状态。
前端可整理所需意图与字段为PROPOSED，但不能自行批准或替后端实现。
