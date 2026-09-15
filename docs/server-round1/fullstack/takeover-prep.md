# 双门接管与无模型全栈联调——接管前清单（本文件只读准备，未执行接管）

日期：2026-09-15。状态：**WAITING_FOR_AUTHORIZATION**。
本文件把 `zcode-continuous-goal.md` §9/§10 的接管动作压缩成可机械执行的清单，
使授权到达后无需再推导。**它本身不构成接管证据**：清单未执行，前端一个字节未写。

## 0. 为什么停在这里

`BACKEND_IMPLEMENTATION_READY` 的登记条件是"实际证据 + 固定 Reviewer 的 `ACCEPT` 同时成立"
（§8）。固定 Reviewer session 当前被额度硬阻断：

```text
codex exec resume -m gpt-5.6-sol …（read-only、flock、无 bypass）
→ exit 1，ERROR: You've hit your usage limit. … try again at Sep 20th, 2026 12:11 PM.
```

两次投递（18:2x 与 20:0x，阶段包 `a7b8917..64067e2`）均在审阅/启动阶段被同一额度错误截断，
因此**本阶段没有 verdict**；`REVIEWER_AUTOMATION_READY` 与 `BACKEND_IMPLEMENTATION_READY`
**均未登记**，双门未判定，前端未接管。解除方式二选一：额度恢复后重投，或用户明确授权以本轮
自审代替 closure。

## 1. 接管时先跑的只读复核（任一不成立即不得接管）

```bash
cd /home/maoqh/projects/agent-box-desktop-next-wsl-round1
git rev-parse HEAD                 # 期望 8e7c138c96337fc20ed61d3c21100e6449c8ec95
git status --porcelain | wc -l     # 期望 0
git rev-parse --abbrev-ref HEAD    # 期望 feature/agentbox-desktop-product
sha256sum apps/desktop/src/types/wire/wire-v1.ts
  # 期望 11e3b3e70d332585d31900c09ba063d95aa6b72b1904921c665fb72f81c10035
sha256sum docs/desktop-product-delivery/contracts/wire-v1/generated/wire-v1.schema.json
  # 期望 5d4fa3bfeec6c3273c6073b37794e4ab2aca6e07e48184bc3a2b878c1fe5e4ed
python3 -c "import json;d=json.load(open('evidence/P06-assets-r3/results.json'));print(d['counts'],d['allOk'],d['executed'])"
  # 期望 {'PASS':28,'FAIL':0,'SKIP':0,'PENDING':0} True 28
rg -n 'writer_lease=RELEASED|DESKTOP_IMPLEMENTATION_READY|REAL_FLOW_VERIFIED' docs/desktop-product-delivery/status.md
ps -eo pid,args | grep -E 'electron|node .*agentbox|tsc' | grep -v grep   # 期望空
```

后端侧同时要求：`git status --porcelain` 为空、HEAD 即被审 HEAD、`tests` 无 failed。

## 2. 双门成立后在两端写什么

- 后端 `docs/implementation/status.md`：`FULLSTACK_INTEGRATION_OWNER` = 后端执行者；
  记录前端 HEAD/摘要/接管时间；`backend_implementation` 置为四家真实模型门通过 + Reviewer closure 成立。
- 前端 `docs/desktop-product-delivery/status.md`：记录同一接管事实（**首次写前端即在此步**），
  以及后端 HEAD 与 wire 摘要。
- 之后才取得 42 限定的前端**执行**工作树写权；发布源 main 仍只读。

## 3. 无模型全栈联调（§10）逐项清单

在真实 Windows Electron 中安装 handoff 指定的 lifecycle connection `{endpoint, sessionToken}`
（token 只在 Electron main，renderer 不可见），随后逐项验证：

| 组 | 项 |
| --- | --- |
| 握手 | `server.hello` |
| Workspace | open / list / browse / archive |
| Profile | list / create / update / archive / updateConfig |
| Provider/Model | list / create / update / archive |
| 配置 | config.describe / config.resolve |
| Session | list / update / archive / switchProfile / createAndSend / send |
| 结果与队列 | sendOutcome.query / queue.get / queue.withdraw |
| 执行控制 | runs.stop / approvals.decide / history.snapshot |
| 事件流 | subscribe、gap resync、重订阅、cleanup |

行为面：中立角色维护、Provider/Model 动态配置与默认/覆盖、草稿恢复、发送拒绝、幂等 requestId、
历史、队列终态/续派/暂停、审批失效、附件授权/投递/回收、取消/断连、Server/Worker 重启、
正常 Desktop/Server 退出、DataRoot/workspace 清理、无服务诚实状态、零 legacy REST 回落。

后端侧已有等价平台证据（`accept-e.ps1` r4：28 方法 + 事件流 + 队列 + 审批 + 附件 + 取消 +
`tree_terminate` 重启 + 独立 `-PostCheck`），**但桌面 UI 在环的证据只能由前端工作树产生**，
两者分别记账、不得互相替代。

## 4. 每类跨端 bug 的固定流程

复现 → 定向回归 → 真机步骤 → 检查点；按权威层修复（不往 UI 塞 Harness 特例、不让 Server 解释
原生协议）。完成后两仓分别提交，交同一 Reviewer 只读审查两仓实际 HEAD。

## 5. 最终交付（§11）需同时成立

- 四家真实 UI 模型门（≤¥10 累计，含至少一家 Server/Worker 重启恢复门）；
- 前后端受影响全套测试、typecheck、lint、架构守卫；
- Windows build 与原应用用户路径；
- secret 泄漏扫描与费用最终结算；
- 正常退出/进程/端口/view/secret/临时根/DataRoot 清理；
- 两仓分别提交，status/合同摘要/检查点一致；
- 启动入口、隔离数据路径、恢复/退出说明；
- 最终 Reviewer 对两仓 HEAD 的 ACCEPT；
- `FULLSTACK_CORE_GREEN` 或诚实的 `FULLSTACK_CORE_PARTIAL`。
