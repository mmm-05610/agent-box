# P2-3B 后端包提案（S 侧最小语义草案，非批文）

- owner_generation: HD002-1; author: S; date: 2026-09-23
- 树/SHA: BE `60d868ef258e4044a03c8650312431e5b57a48ab`（本树亲读源码）；FE baseline1 `d44a5f8e2c`
- 输入: FC-0005 三问、BC-0006 §最小合同建议、TASKS §4/§7、roles/S.md
- 性质: 设计提案，加速 C/BC 裁定；**S 本轮零源码改动、零 wire 变更**，批文到达前不动码

## 1. 会话创建面：现码三形（全部已验证在树内）

| 形 | 入口 | 语义 | 关键校验 |
|---|---|---|---|
| 建+首 turn 一体 | wire `sessions.createAndSend`（`handlers.py:127-129` 必填 requestId/workspaceId/profileId/overrides/message）→ `accept_intent(session_id=None)`（`repository.py:154-167`） | 单事务建 ready 会话（version=1）并派发首轮 | workspace 存在；profile 存在、非 archived、非 recovery_pending（`:191-203`） |
| 既有会话续发 | wire `sessions.send` → `accept_intent(session_id=…)` | 版本 CAS、归档拒、异 profile 拒（须走 switchProfile，`:168-189`） | 同上 |
| 纯建（无消息） | REST `POST /api/v1/sessions`（`app.py:309-313`）→ `repository.create_session`（`repository.py:102-127`） | 幂等 scope `POST:/sessions`，201/replay，status ready | **仅存在性检查**（workspace/profile 记录存在即建） |

### 对 FC-0005 问 1 的 S 侧答复

"新会话先出现、首条后发"只有两条合法路径：

- **甲案（零 BE 改动）**：FE 消费既有 REST 兼容纯创建 + wire `sessions.send` 续发。缺点：鉴权/idempotency-key 面与 wire 不同源（BC-0006 已警示"勿称 wire 空创建"），FE 需同时持有两套传输——与 FC-0005 "两种 transport 不可暗中互换"纪律叠加复杂度。
- **乙案（S 单写窄批）**：wire additive `sessions.create`，方法表 `{requestId, workspaceId, profileId}`（无 expectedVersion——新记录无版本可 CAS），委托 `repository.create_session` **同一单实现**（REST 亦改为共享该入口语义，不复制第二台机器，合 E2b 单实现纪律），wire 惯例外壳：scope `sessions.create` 幂等 + requestDigest 回放，返回既有 `_session_view` 形。不新增存储、不改 shared wire 之外任何面。
- S 推荐**乙案**：FE 单一 transport 消费、接缝测试只面对 wire；甲案留作 FE 兼容层已就绪时的过渡。

### 需 C/BC 随批文一并裁的一处不对称

`create_session`（REST 纯建现码）**不核** archived/recovery_pending，而 `accept_intent` 派发时核。若采乙案，S 建议 wire `sessions.create` **前置同样拒绝**（创建即失败可见，避免"建出必红会话"），但这会使 wire 与 REST 现行为不对称——要么同步收紧 REST（改现码行为，需批文点名），要么文档化差异。二选一由 C 裁，S 不单方面定。

## 2. 独立会话专用目录（BC-0006 §独立会话建议）——BE 最小面草图

- 候选用例 `workspaces.allocate {requestId, displayName?}`：Server 在自己管理的 data-root 专用子树（如 `<data-root>/workspaces/<opaque_id>`，路径不出 Server）内 mkdir，随后**复用既有** `WorkspaceService.open_environment`（`src/agent_box/server/workspaces/service.py:151-178`，本树亲验：按环境+规范路径 upsert、不创建目录）+ local 校验（`src/agent_box/server/workspaces/local_environment.py:75-120`，亲验：绝对/规范/非穿越/禁根/存在/可读/目录、realpath 归一）登记同一规范路径，返回 `{created, workspace}`——分配与登记单一路径验证链，不建第二身份。
- 失败回收：mkdir 成功、登记失败时必须先回收空目录再返回 typed failure；登记成功后的清理**不**入本批——archive 维持仅元数据（`workspaces/repository.py:109-130`），实际删除与保留策略另案。
- 该包触目录生命周期新语义，超出普通包内机械调整：需 BC 细化行为目标/验收、C 划 S/BC 单写批文后开工；FE 不创建/清理服务器路径（BC-0006 立场，S 支持）。
- native connector 固定 `ORDESSA_AGENT_CWD` 的消费侧缺口在 F1/FC 域；S 供给面止于 Server 验证的 `workspaceId` 与其启动事实，两包接缝测试归联调批。

## 3. 边界申明

本件不请求 grant、不申请重门槽、不触凭据/真实调用；乙案与 allocate 均为 additive wire 语义草案，批准前 wire/1 现码不变。Profile/Provider/Model 零关联（Profile 仅按 BC-0006 §1.2 以既有普通 Profile 为创建前提）。
