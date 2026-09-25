# BE-LOOP-001 共同基线核对报告（工作一 · 只读实测）

日期：2026-09-22　执行者：中央 C　核对者：I。命令均只读 `git`；未修改任何树、未吸收、未悄改基线。

## 结论：四组共同起点 = 固定 dev-0，不并入 Pi 修复
| 目标 | HEAD | 分支 | dirty | 归属 |
| --- | --- | --- | --- | --- |
| `worktrees/integration-linux/backend`（**dev-0**） | `b067c5718556c8efa93b054e6573ad3d186b3cf6` | `integration/linux-native-0` | 0（clean） | = `development-baseline.json` 后端 SHA ✓ |
| `worktrees/pi-loop/backend`（Pi 线） | `e2ec0ef2029b7b4905332eb97106b104ccb47ee5` | `work/pi-loop-0` | 0（clean） | dev-0 + 1 提交 |

- **默认共同起点**：按 I 指定，取 `development-baseline.json` 后端精确 SHA `b067c571…`。四组沙箱 `/source` 均指向它。
- `git merge-base --is-ancestor` 实测：**dev-0 是 pi-loop 的祖先**（pi-loop = dev-0 再前进一步）。

## Pi 修复：单列，不自动吸收
`git diff --stat b067c571..e2ec0ef2` 实测差量：
```
plugins/agent-box-sandbox-bwrap/src/agent_box_sandbox_bwrap/provider.py | 19 +++++++++++-----
1 file changed, 16 insertions(+), 3 deletions(-)
```
- 即 Pi 线相对共同基线**只多一个已提交改动**，且落在 **P 组（sandbox-bwrap）** 一个文件。
- 处理：**单列为已知差量交 P 组审查**，不并入四组共同起点，不因此更新 `development-baseline.json`。
- 本轮**不顺手修复**任何发现的问题；不修改产品代码。

## 已知基线局限（继承 `development-baseline.json`，未变）
带已知缺陷的源码起点：Linux 持久 SecretStore、tool/artifact 准备、两处既有后端失败、远程 PNG、
真实 harness 终态、live 取消等——非本轮修复范围；派生开发树不因此受阻，但验收版本须显式列出。
后端套件既往：executor 报 1259 passed / 21 failed / 33 skipped（独立审阅 pending）；本轮不重跑、不判定。

## 未做（避免越界）
- 未创建四组的 git worktree（执行者不应持共享 `.git` 写权；见 `permissions/allowlist.md`）。
- 未改 dev-0 SHA、未 push、未动 publishing main、未停止现有服务、未读取任何秘密内容。
