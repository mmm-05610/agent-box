# Server 职责蓝图 v1

状态：APPROVED_ARCHITECTURE，2026-09-14。用户批准后的目标，不是当前实现报告。
本文件覆盖旧 blueprint 中与此冲突的职责安排；37/38 的历史证据原样保留。

## 目标树

```text
src/agent_box/
├── server/
│   ├── bootstrap/          ◀ 唯一认识具体实现的装配根；不处理原生协议
│   ├── transport/http/     ◀ 请求解析、调用用例、结果编码；不做业务决策
│   ├── workspaces/         ◀ 工作区身份、独享逻辑连接、归档和执行条件
│   ├── profiles/           ◀ 角色配置版本、默认模型关联、记忆使用意图
│   ├── model_configs/      ◀ 分 Harness 的 Provider/Model 配置与引用完整性
│   ├── sessions/           ◀ 会话身份、历史、工作区/同 Harness 角色切换
│   ├── execution/          ◀ 接受、排队、取消、恢复的产品调度；调用 Core
│   ├── approvals/          ◀ 审批状态、权限范围、冲突决定的裁决
│   └── events/             ◀ 持久事件、快照游标和回放
├── storage/                ◀ 数据库/UoW/迁移/对象存储/秘密保护等通用设施
├── work_core/              保留通用执行引擎；不认识产品 Session/Profile
└── extensions/             能力契约与发现；不反向依赖具体实现
plugins/
├── agent-box-harnesses/     ◀ Harness 扩展插口的实现宿主，复用现成接入体系
│   ├── third_party/        ◀ 固定上游闭包、许可证、补丁和依赖锁
│   └── …                   ◀ 窄封装及具体注册；原生差异不出此边界
├── agent-box-runtime-wsl/   保留连接/Worker 通道基础，按交互需求升级
└── agent-box-sandbox-bwrap/ 保留隔离投影基础，验证完整生命周期
workers/agent-box-worker/    ◀ 目标机器上的受限执行端，不是第二个产品 Server
```

目录表示职责，不要求每项独立发行、微服务或本轮填满空模块。业务 repository 靠近对应业务；
跨 repository 的事务由用例通过统一 UoW 管，禁止各仓储自行 commit 破坏原子操作。
Server 不是插件转发壳，也不能复制 Core 执行引擎。业务通过中立能力接口调用扩展，
只有 bootstrap 选择具体实现。Codex app-server、ACP、OpenCode SSE 均留在 Harness 扩展内。

## 数据及产品边界

以 Desktop 已批准的 [核心语义](../../../agent-box-desktop-next/docs/desktop-product-delivery/contracts/core-semantics-v1.md)
为跨端设计来源（该相对链接跨仓路径以同级工作树布局为准，见工单中的绝对路径）。
Windows 本机 Server 持有 Profile/Session/记忆/续接权威；远端集中在 `.agent-box/`
管理 Worker、工具和有生命周期的运行投影。允许临时 native home，不允许远端成为第二份权威。
Session 不永久绑定角色；角色静态配置不被会话覆盖反写。Harness 差异通过能力描述保留，
不要求所有 Harness 假装支持完全相同的模型、审批、记忆或续接功能。

独立本地 Git/文件操作可留 Electron；影响某次执行的分支/目录选择必须交给 Server。
远端文件/Git 由目标能力提供；Electron 只管理基础 Server 生命周期，不接管 Harness 子进程。

## 已知迁移起点与债务

采用现有 b415eb2 的代码与研究检查点继续，Core 来源仍为 80d2017，不整体回滚。
前一轮定向审计指出：server/application/service.py 混入 Codex 判断和重复 accept 风险，
server/composition/codex.py 承担原生语义并在终止后解析输出；repository 混业务；
Worker 当前 stdin 写完即关闭、stdout/stderr 终止后取回，不能冒充交互式 app-server 通道。
以上是已记录的审计输入；实施者只复核相关接缝，不重新扫描全部仓库。

迁移顺序：中立业务边界与事务 → 固定第三方接入底座 → 逐家 Harness → 独立后端验收 → 双端联调。
数据库注入隔离、实时通道、角色投影回收分别验证；换目录名称不等于解决这些问题。
本轮决策已闭合，无需再议 Server/Core/插件所有权；具体能力缺失不得靠上移原生逻辑补齐。
