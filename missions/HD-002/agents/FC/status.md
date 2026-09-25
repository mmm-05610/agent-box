# FC
phase: CP_SESSION_001_FE_DIAGNOSTIC_AND_INTEGRATION
owner_generation: HD002-2
integration_tree: `/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc` `d14ac6e0e6dee507541536dee980809b8bec11cb` clean；baseline1 `d44a5f8e2c` 保留
candidate_tree: `/home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc-candidate` `90ca17b8cb7feca3a83eec5ad8b1ec31670e729c` clean；Ordessa connector/C-0020 enabled 闭包已装配，未 merge/push main
diagnostic_trees: `fc-spellcheck-diag` `1780147c06651e41c5b3917a73200d76efda3bce` clean；`fc-webreq-diag` `fe4cf7fa842531800c2c7db797419201bee1e90d` clean；`fc-egress-full` `e3ff18d2b32a426dce41042a52339e2adeafb85d` clean（完整 live 证据取于父 `362d2fcbab`，之后仅追加纯测试勘误）；均独立测试树，不合入候选
pair_gate_tree: `fc-pair-corrected` `2751fc17bc451490a06e38a5370aad8067027fcf` clean；FC-0095 按 I 审核将固定工件词典 HTTPS 302 单列背景资源，业务 POST redirect:error 及串用/降级/认证/上传反例仍硬拒；合成/typecheck/build 绿；未带 token live，不合入候选
done: F0/F1/F2/F3 已批 FE 包串行收编到原 FC；候选 typecheck、renderer、build、agent-shell 旧离线门见 FC-0065；C-0048/C-0058 无发送配对与 C-0061/0064/0065 空宿主旧截断门证据保留。FC-0087/0088 修正完整无凭据外联采集，9.3 秒正常退出，CLI/API NetLog 均完整，trace 含时间/clone/execve/connect。FC-0089/0090 按 I 第一手根因追加勘误：旧“未知 TCP443 成功外联”是假阳性；非 loopback connect 对应 Chromium HostResolverManager **UDP IPv6 reachability probe**，不是 TCP；另有独立词典 `.bdic` HTTPS GET 经 loopback 本地代理路径 302→200/451,968 字节。原始私有证据未删除。
functional_gate_tree: `fc-functional` `59856bf20f` clean；第三轮 FE×真实原生 Server 私有空项目首发与同 session 第二轮 PASS，见 FC-0102/BC-0095。前两轮失败证据保留；未 merge/push main。
goal: ACTIVE；本项桌面两轮已验证，整体用户体验验收由 C 继续；未碰预算/用户配置/原服务/PROFILE。

```work-status
{
  "work_id": "SESSION-DESKTOP",
  "owner": "FC",
  "revision": 1,
  "state": "verified",
  "done": "已在桌面选择项目、首发并在同一会话续发；两次真实回复均显示，后端两轮均完成。",
  "problem": "正常工具审批、停止及跨重启历史恢复未在本项两轮测试中验证。",
  "action": "暂无在途动作。",
  "waiting_for": "C 验收",
  "next": "交 C 进行用户体验验收，并单独核对尚未验证的能力。",
  "acceptance": "同一会话在桌面显示两次真实回复。",
  "evidence": "agents/FC/outbox/FC-0102.md；agents/BC/outbox/BC-0095.md"
}
```
