# 工单 62 收口报告 —— 工作区 Git 状态面（只读、有界、类型化）

执行：2026-09-18，env-provider 工作树。终态：**WORKSPACE_GIT_STATUS_DONE**（本机侧完整；WSL 侧接线完成待真机轮）。

## 1. 方法形状与字段语义

- **wire**：`workspaces.gitStatus {requestId, workspaceId} → {git}`；
  `git` 恰为六字段 + `reason`：`branch` / `changedFiles` / `additions` / `deletions` /
  `ahead` / `behind` / `reason`；**每个字段可为 null**（null=拿不到，不是 0）。
- **来源**（只认机器可读格式）：`git --no-optional-locks status --porcelain=v2 --branch`
  （branch/changedFiles/ahead/behind；无上游时 `branch.ab` 缺席 ⇒ ahead/behind 保持 null）
  ＋ `git --no-optional-locks diff --numstat HEAD`（增删行）。
- **null 与 reason 的规则**：非仓库/无 git=全 null + `GIT_NOT_A_REPOSITORY`；
  无提交（HEAD 不存在）=增删行 null；**任何二进制差异在场 ⇒ 增删行 null +
  `GIT_BINARY_DIFF`**（数字只对能数行的文件成立，混入二进制时给"看起来完整"的合计数就是假数字）。

## 2. 执行侧选择

- `local` → 本机 `subprocess`（argv 固定在模块内，调用方永不提供命令）；
- `wsl` → 连接器新增的**窄执行口** `WslConnector.read_only_git_status()`：
  `wsl.exe --distribution D [--user U] --exec /usr/bin/git -C PATH --no-optional-locks
  status --porcelain=v2 --branch`，argv 固定在连接器内；**不改 Rust/Worker 协议**；
- `ssh` → 按工单不碰，返回 `GIT_UNAVAILABLE`（六字段 null）。

## 3. 类型化码表

`GIT_UNAVAILABLE`（无 git/执行失败）、`GIT_NOT_A_REPOSITORY`、`GIT_TIMEOUT`、
`GIT_OUTPUT_LIMIT`（**流式**上限：边读边限，超限即杀，绝不先读完再判断）、
`GIT_PARSE_FAILED`、`GIT_NO_COMMITS`、`GIT_BINARY_DIFF`、`GIT_WORKSPACE_MISSING`。

## 4. 验证（第一手）

- **字段**：临时真仓库（init/commit/改动/stage）→ `branch=main`、`changedFiles=2`、
  `additions/deletions` 与 numstat 逐数一致、无上游 ⇒ ahead/behind=null；wire 端到端同断言，
  且**答案中无宿主路径**。
- **反例**：非仓库 → 类型化原因 + 六字段全 null；路径不存在 → `GIT_WORKSPACE_MISSING`；
  超时（git shim 睡 5s，0.3s 超时）→ `GIT_TIMEOUT`；洪泛输出（yes 循环）→ **`GIT_OUTPUT_LIMIT`
  在 4 KiB 处即刻返回**（实现改为 selectors 流式读 + 超限杀进程组）；畸形 porcelain/numstat
  → `GIT_PARSE_FAILED`；二进制差异 → 增删行 null + `GIT_BINARY_DIFF`。
- **只读性**：查询前后 `status --porcelain=v2` 输出**逐字节一致**，且 `.git/index` 的
  mtime **未变**（`--no-optional-locks` 生效，无索引刷新写入）。
- **回归**：全量 **854 passed / 0 failed**（62 新增 6 条）。

## 5. 未做项

- **WSL 真机轮**：连接器接线完成但未在 c11 上真跑（需要一次 `wsl.exe` 环境；本机无该侧）；
- `ssh` 侧由 44 的 provider 收口，本单不做（按工单）；
- **P20 前端同步与两仓重锁**：新增 1 个只读方法（方法面进入下一次重锁）。
