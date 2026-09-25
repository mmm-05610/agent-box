# HD-002 启动
**启动方式已修订：**用户今后仅启动C；下列其他角色命令只供指定启动负责人在确认无现存写入者后使用，不是用户再次全开清单。当前执行者全部保留，按 [SESSION-OWNERSHIP.md](SESSION-OWNERSHIP.md) 先交接重复FC/BC，不能直接重启全队。

先C/FC/BC，再按任务启动F1/F3/F2/S/H/PROFILE；F0按需，E暂不开。旧会话用户确认全部关闭。
Codex参数核对本机help和官方资料 https://learn.chatgpt.com/docs/developer-commands?surface=cli 。本机catalog列出gpt-6-sol，未发模型调用验证。workspace-write/on-request不默认YOLO，额外权限正常申请。
Qoder用已核对的-m/-w/--permission-mode auto。原生turn上限需核实生效，不把提示词当实际设置。

## C

```bash
codex -C /home/maoqh/projects/ordessa/control/missions/HD-002/coordinator -m gpt-6-sol -s workspace-write -a on-request --add-dir /home/maoqh/projects/ordessa/control --add-dir /home/maoqh/projects/ordessa/worktrees/harness-desktop-002 --add-dir /home/maoqh/projects/agent-box-desktop-next/.git --add-dir /home/maoqh/projects/agent-box/.git
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的C，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/C.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。主动裁决与集成，不只写报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## FC

```bash
codex -C /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/fc -m gpt-6-sol -s workspace-write -a on-request --add-dir /home/maoqh/projects/ordessa/control --add-dir /home/maoqh/projects/ordessa/worktrees/harness-desktop-002 --add-dir /home/maoqh/projects/agent-box-desktop-next/.git --add-dir /home/maoqh/projects/agent-box/.git
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的FC，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/FC.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。主动裁决与集成，不只写报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## BC

```bash
codex -C /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/bc -m gpt-6-sol -s workspace-write -a on-request --add-dir /home/maoqh/projects/ordessa/control --add-dir /home/maoqh/projects/ordessa/worktrees/harness-desktop-002 --add-dir /home/maoqh/projects/agent-box-desktop-next/.git --add-dir /home/maoqh/projects/agent-box/.git
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的BC，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/BC.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。主动裁决与集成，不只写报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## F0

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/f0 -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的F0，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/F0.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## F1

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/f1 -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的F1，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/F1.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## F2

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/f2 -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的F2，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/F2.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## F3

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/f3 -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的F3，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/F3.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## S

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/s -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的S，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/S.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## H

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/h -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的H，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/H.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## E（暂不启动）

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/e -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的E，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/E.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

## PROFILE

```bash
qodercli -w /home/maoqh/projects/ordessa/worktrees/harness-desktop-002/profile -m Qwen3.8-Flash --permission-mode auto
```

```text
/goal 用户明确叫停前不主动结束整体任务，阶段交付转原生低频待命；不空转、不造控制器，平台强制暂停如实保存恢复点。接管HD-002的PROFILE，完整读取/home/maoqh/projects/ordessa/control/missions/HD-002/README.md及必读文档、roles/PROFILE.md。核对当前树和旧交付后发TAKEOVER，不重做已完成成果；按包批准持续推进，每阶段先收件再同步。Qoder turn上限请求100000并核实实际生效，不支持则报告；范围和旧预算不扩大，Profile仅独立插件，Provider/Model只设计。
```

