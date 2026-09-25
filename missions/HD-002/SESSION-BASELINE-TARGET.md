# 第一阶段稳固基线：收口，不扩张
**原生执行覆盖：**I-NATIVE-AGENT-001 规定本阶段在用户所选项目目录运行已有配置的本机原生 Agent，经 Server/Execution/Harness 插件；下文旧 bwrap/sidecar/SecretStore 依赖讨论不再作为 CP 前置，也不删旧隔离路径历史。
**最新交互：**I-PROJECT-REQUIRED-001覆盖默认工作区设计。workspaces仅负责实际项目接入；必须选择项目，恢复本连接上次有效选择，首次/失效必须选。不要实现无项目默认工作区分支。

2026-09-23 用户确认的目标。与 SESSION-CHECKPOINT.md、I-SESSION-FIRST-SEND-001 联合生效。
用户暂不继续设计新功能；全队主线优先收尾 CP-SESSION-001，不再发起新架构/新插件设计批。
这是目标职责树，不是当前源码已达标声明，不要求按文件名机械重写。main应为完整可用基线，不能成为待定方案堆放区。

## 前端目标

```text
desktop/
  apps/desktop/
    electron/                 桌面生命周期、安全桥
    renderer/                 扩展宿主启动，不放业务
  products/agent-desktop/      本阶段唯一产品装配清单
  platform/
    extension-api/            注册/服务/释放契约
    extension-loader/         发现加载
    extension-host/           激活依赖与生命周期
    native-bridge/            受限原生通信
  contracts/
    foundation/ commands/ workbench/ connections/ agent/ agent-ui/
  plugins/
    commands/
    workbench/                区域布局、伸缩显隐
    connections/              全局连接/状态入口与连接级Harness选择
    connectors/ordessa/       本项目后端协议适配，统一上层UI
    agent/
      sessions/               项目/会话列表、选择、新对话草稿
      conversation/           输入、流式、思考、工具与产出
      interactions/           对话内审批/输入响应
  tooling/                    构建与依赖边界验证
  tests/                      包与整机验收；可沿用现有就近测试路径
```

一个后端connector，不为每种Harness另做上层UI。直连Codex/Pi原型成果保留原分支，不能作为本阶段后端闭环的暗中兜底。无可用内容的设置入口、实验插件不装入候选基线。

## 后端目标

```text
backend/
  src/agent_box/
    work_core/                最小执行语义与状态规则
    storage/ migrations/      持久化与已用数据结构迁移
    execution/                执行组合/派发，不认识品牌
    extensions/               本阶段实际使用的插件接口
    service/sessions/         首次创建发送、续聊、恢复、停止
    server/
      bootstrap/ transport/ wire/
      sessions/ workspaces/ events/ approvals/ assets/
  plugins/agent-box-harness/
    src/agent_box_harness/
      plugin.py               能力注册（示意，复用现有入口）
      acp/                    公共协议接入/映射
      harnesses/
        codex/                必要启动与接入差异
        pi/                   必要启动与接入差异
    runtime/                  必要协议桥工件，非运行环境管理系统
    tests/
  scripts/                    可复现启动与验收
  tests/
```

品牌实现属于Harness插件内部，不以“已验收品牌”为由新增顶层品牌包。内部不得藏通用文件/终端管理、Profile或整套Runtime系统。
独立runtime-local、bwrap、其他资源插件不是本阶段目标能力，不能由旧仓库中存在推导为产品必需。若当前执行链仍硬依赖它们，BC列最短真实依赖链及解除/收口方案；不得直接删文件、搬整套实现进Harness，或隐藏依赖后宣称干净。
仅本机进程启动/关闭与协议通信的必要实现不等同独立环境管理插件。已有数据迁移/内部兼容记录若承重，需说明必要性和验证，不冒充新增Profile产品能力。

## main准入与保留历史

- 仅收敛、用途明确、可安装启动并有验证的内容进入候选产品树；待定、实验、未接线的新插件保留各自分支，不是合入main后默认禁用。
- 不删除旧树/历史/未提交成果。通过隔离候选与明确依赖收口，不搞全仓清理或全面搬包。
- Profile既有独立成果保留，不纳入本检查点，不给其新增集成批，不占主线关键资源。Provider/Model和其他后续设计暂停派新任务。已有独立任务不因本指令被强杀或丢弃。
- C固定前后端SHA、依赖/启用包清单、构建产物、启动命令、验收步骤，形成CP-SESSION-001，交I通知用户。
- 用户验收通过后再按明确发布授权晋升基线main；本指令不是立即merge/push现有publishing main的授权。
- C/FC/BC只报告剩余代码包、依赖、实际门结果及阻塞；不再把已明确的交互包装成架构选题。时间估算须分离实现、集成、真实联调，不凭测试数量推断完成比例。
