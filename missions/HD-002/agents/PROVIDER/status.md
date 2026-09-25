# PROVIDER
owner_generation: HD002-PROVIDER-1 · 目录：worktrees/harness-desktop-002/provider（研究区，写域仅 reports/** 与 agents/PROVIDER/**）

**用户视角现象**：Provider/Model 最简方案已研究完成并交审——结论是“不造新框架”：产品后端其实已有 Provider/Model 存储、引用式凭据（只存定位符，不存密钥）、四种协议词典和按各家格式写原生配置的转换器；方案只补一个小枚举（委托原生登录）+ 一段真实启动链接线 + 前后端各一个注册式插件。不做代理，默认完全沿用各 Harness 自己的配置，没有 Profile 也能直接用。现在等用户在方案上取舍；批准前零产品改动。

```work-status
{
  "work_id": "PROVIDER-DESIGN",
  "owner": "PROVIDER",
  "state": "review",
  "done": "DESIGN_READY 全套：4 报告（事实矩阵/复用图/最简方案/17 验收场景）；CC Switch+Vibe Kanban 承重源码已读、Zed/ACP 官方核、Codex/Pi/Claude 原生机制一手交叉；三轮自我红队补 probe 网络归因、跨 harness 凭据不串用、生效时机寿命条件化；BC-0082/0083 给“无卡原生可用”直连+产品链两级真实对应物；turn 上限收口=本环境实测不支持 100000（F1/F3/PROFILE 旁证一致）。",
  "problem": "实现审批未获；S1 前置核（attempt 进程寿命×投影时机）留待实施期定案，方案已按证据边界表述，不冒充已证。",
  "action": "待审期零产品写入、零凭据触碰；随外部新证据回补 research §10b/acceptance 注记。",
  "waiting_for": "用户对方案 A 的设计取舍（经 C 入决策队列或 I 直裁）；BC 研究收件 ACK 属流程确认非审批门。",
  "next": "批准→中央建隔离产品 worktree+包白名单→S1→S4 施工；修订→出 reports 增量 r2。",
  "acceptance": "用户批准最小方案=本项验收；不宣称产品已支持 Provider/Model 管理。",
  "evidence": "provider/reports/{research,reuse-map,proposal,acceptance}.md（09:00Z 版）；agents/PROVIDER/outbox/PROVIDER-0001..0007.md；WORK-ITEMS.json:PROVIDER-DESIGN；I-WORK-STATUS-BOOTSTRAP-001 r0 已由本 r1 按证据纠正",
  "revision": 1
}
```

## RESUME-PLAYBOOK（续跑者用）
1. 每轮：`ls agents/PROVIDER/inbox` + 扫 BC/I/C outbox/decision-queue 是否含 PROVIDER-DESIGN 裁定或 "PROVIDER-000/研究收件"。
2. 收到修订/批准/新证据 → 按 I-WORK-STATUS-001 协议在本文件 work-status 块沿 work_id 递增 revision（普通 ACK 不更新），并更新上“用户视角现象”段。
3. 批准实施 → 先完整读四报告；实施边界=proposal 切片 S1-S4 + AGENTS.md 写域收紧（届时中央建产品 worktree）。
4. 平台上限/暂停：本文件+reports/**即完整恢复点；不造 watcher、不重复启动同身份、不扩写域。
