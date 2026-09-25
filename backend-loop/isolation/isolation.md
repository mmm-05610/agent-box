# BE-LOOP-001 物理隔离实现与实测缺口

实现者：中央 C。核对者：I。约束 1/3 落实。**不假设 worktree 即安全边界；先实测本机能力再选实现。**

## 选型：逐组独立 bwrap + 独立进程（不是原生子代理）
约束 1 明确：原生子代理"独立上下文 ≠ 独立文件权限"，未证明可逐组沙箱化前**不得**以它替代四组进程。
故四组各由 `isolation/run-group.sh` 在**各自**的 bubblewrap 里运行**独立 OS 进程**（真实启动时为独立 `qodercli` 进程，本轮为 `tests/fake-executor.sh`）。

本机能力实测：`/usr/bin/bwrap` 存在；`bwrap --unshare-all … true` 退出 0 → **非特权用户命名空间可用**（docker/podman/firejail 缺，故不依赖容器守护进程，也不暴露任何 Docker socket）。

## 挂载模型：最小 tmpfs 根（默认什么都不存在）
`isolation/sandbox-lib.sh` 每沙箱：
- `--unshare-all`（net+pid+ipc+uts+cgroup+user）、`--die-with-parent`、`--new-session`、`--clearenv`；私有 `HOME=/home/agent`、`TMPDIR=/tmp`、最小 `PATH`。
- 根为 `--tmpfs /`（空可写），仅再放入运行所需：`--ro-bind /usr /usr`、`--ro-bind /etc /etc` 与 merged-usr 符号链接、`--proc /proc`、`--dev /dev`；把 `/etc/shadow|gshadow|sudoers` 覆为 `/dev/null`。
- 显式工作集见 `permissions/allowlist.md`：只读 `/source`、`/control-loop`、`/inbox`；可写 `/outbox /reports /tests /work /home/agent /tmp`。
- 宿主 `/home`、`/run`、`/mnt`、其他组目录、集成树、用户数据根、QA/reviewer 临时目录**默认不存在**（tmpfs 根里根本没绑）。

## 读隔离 / 写隔离（实测，`selftest/checks.md`）
- 写隔离：`/source`、`/inbox`、`/control-loop`、预算文件、`/etc`、`/root`、`/run` 写 → `denied`（EROFS）；本组 outbox/reports/tests/work → `writable`。
- 读隔离：`/source/src` 可读（完整只读视图）；`/home/maoqh`、`~/.qoder`、`~/.codex`、`/run/docker.sock`、其他三组目录、集成树绝对路径、`/tmp/qa-line`、`/tmp/audit-fe-2` → `absent`。
- 绕行探测：symlink 指向只读 `/source` 后经它写 → `denied`；沙箱内再 `bwrap` 重启 → `cannot-spawn-usable-bwrap`；`codex` 不在沙箱 PATH/`/usr/bin` → 执行者**无法直连 Sol**。
- 实施阶段写开放：仅 `APPROVED` 逐条路径 over-mount 为可写，兄弟目录仍只读。

## 网络隔离（实测 + 缺口）
- 实测：`--unshare-net` 下沙箱内 `127.0.0.1:18790`（S-1 试验服务）与 `:9222`（CDP）`unreachable`；因全新 netns 不含宿主回环监听，**宿主/其他组服务被结构性隐藏**。
- **缺口 G1（不绕过，交 I）**：真实 `qodercli` 需出站访问 Qoder 模型端点，而 `--unshare-net` 无任何出口。本机进一步实测：**pasta/passt/slirp4netns 均缺**、`socat` 有、宿主已有**现成用户代理 `127.0.0.1:7897`**（qodercli 认 `HTTPS_PROXY`），但 `--share-net` 会连带暴露全部宿主回环服务=不可接受。
  最小可行与残留风险的完整方案见 `g1-g2-access-proposal.md`；简言之：零特权+现成机制下本机暂无"能出模型网、又屏蔽宿主服务"的干净路径 → 要么 I 批准一次性装 pasta/slirp4netns，要么 G1 **BLOCKED**，不 `--share-net` 绕过。

## 认证暴露（缺口）
- 现状：执行者沙箱内无 `~/.qoder`、无 `~/.codex`（假执行者不涉密）。
- **缺口 G2（不绕过，交 I）**：qodercli **无 env/token 认证标志**，凭据是 config-dir 内文件。**把认证文件 `--ro-bind` 进沙箱，执行者 shell 仍能读取它——只读只挡写、不挡读；不得宣称"只读挂载即秘密不可读"。**
  最小方案：专用私有 `--config-dir` + 受限/短 TTL/可吊销 key（不含主凭据、不含 Sol）；真"可用而不可读"需 egress 侧代持 auth（后续）。详见 `g1-g2-access-proposal.md`。本轮不手工复制秘密、不开全权限。

## 预算入口与绕过（约束 6）
- Sol 唯一入口是 `be-loop.sh sol-review`（中央、沙箱外），先 `budget.py consume` 原子扣账再调 reviewer；沙箱内无 codex，执行者无法绕开入口自费额度（实测 `ISO-nosol-entry`、`CTL-no-tick-spin`、`CTL-sol-only-via-entry`）。
- 账本损坏/缺失 → 拒绝调用（`BUD-corrupt-refuse`）；重复 request-id 不二次扣（`BUD-dedup`）；12 并发不超 10（`BUD-concurrent-cap`）且不侵 E 预留（`BUD-concurrent-E`/`BUD-9th-flex-denied`）。

## 已知限制
- 未做"真 `qodercli` 进程在沙箱内启动"的端到端（那属正式运行，本轮禁止）。已证的是**同一沙箱画像**下进程/文件/网络边界成立、可承载之。
- bwrap 提供命名空间隔离，非对抗同 uid 恶意宿主进程的强安全边界；本轮威胁模型是"防止执行者越界写/读/自费额度/触宿主服务"，上述实测覆盖之。
