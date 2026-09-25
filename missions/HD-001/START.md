# HD-001 启动

先暂停旧的前后端实施会话（让其报告停写，不kill/reset）；新任务不接管旧dirty树。不需要删除/清理旧worktree。
先C/FC/BC，再启动F0/F1/F2/F3/S/H/E做研究。10个会话不等于10个重任务并行，C按实际内存限制调度。在已打开的ZCode桌面端选择对应工作目录、新建会话，在UI选模型粘贴下列提示。/usr/bin/zcode是桌面程序入口，本环境--help受Electron sandbox阻止，未验证命令行开目录能力；不为此改系统sandbox或传--no-sandbox。
第一轮C确认全部ACK与两轮消息验证结果后，才安排无人值守续接。尚未实测原生唤醒，不能承诺已能一夜无人干预。

## C（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/control/missions/HD-001/coordinator
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 C 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/C.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## FC（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/fc
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 FC 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/FC.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## BC（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/bc
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 BC 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/BC.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## F0（Flash）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/f0
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 F0 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/F0.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## F1（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/f1
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 F1 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/F1.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## F2（Flash）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/f2
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 F2 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/F2.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## F3（Flash）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/f3
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 F3 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/F3.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## S（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/s
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 S 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/S.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## H（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/h
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 H 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/H.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```

## E（GLM-5.3）

```bash
cd /home/maoqh/projects/ordessa/worktrees/harness-desktop-001/e
# 在已打开的 ZCode 中选择此目录并新建会话
```

```text
/goal 接管 HD-001 的 E 角色。完整读取 /home/maoqh/projects/ordessa/control/missions/HD-001/README.md 及其列出的协同、范围、预算、方案和 roles/E.md，核对本目录后先发 TAKEOVER。先调研与接缝核对，批准后在本组包范围实施；每阶段先收消息再同步状态。持续通过原生 goal 收取中央新任务，阶段交付不自行结束；不造控制器，不扩配置能力，真实调用只经 C 预算批准。
```
