# BE-LOOP-001 逐路径写入权限清单（精确 allowlist）

生成者：中央 C　核对者：I。规则源：`control/product/backend-coordinated-loop.md` §写入边界。
**未在本清单列出的路径一律只读。** 本文件是"路径清单生成规则"的落实，不代表已赋予任何整目录写权限；
执行者默认（研究阶段）对**全部产品源码只读**，只有 I 批准启动方案并进入某组的实施阶段后，
C 才按本清单为该组、该任务开放对应实现路径（见 `research-vs-implementation.md`）。

共同基线（所有 allowlist 相对此 SHA）：
`b067c5718556c8efa93b054e6573ad3d186b3cf6`（`worktrees/integration-linux/backend`，分支 `integration/linux-native-0`）。

组代号 ↔ 目录：S=server · E=execution · H=harness · P=platform。

## 每组沙箱恒有（与阶段无关）
- 只读：`/source` = 上述 dev-0 全量源码（完整只读视图）。
- 只读：`/control-loop` = `control/backend-loop`（控制器/任务卡/本清单/`APPROVED` 文件——执行者不可改）。
- 只读：`/inbox` = C→组 的已批准契约与消息投递交付。
- 可写（组私有）：`/outbox`（本组唯一对外交付）、`/reports`、`/tests`（本组新增测试）、`/work`（暂存）、私有 `$HOME=/home/agent`、私有 `/tmp`。
- 恒不存在（不得挂载）：宿主 `/home/maoqh`、`~/.qoder`（含 `.auth`）、`~/.codex`（Sol 凭据）、其他组目录、集成树之外的历史树、`/run`（服务/Docker socket）、`/mnt/c`（Windows 腿）、`.agentbox-*` 用户数据根、QA/reviewer 临时目录。

## 实施阶段方可开放的产品内部实现路径（逐组，公开契约除外）
| 组 | 候选可写（实施阶段，经该任务 `APPROVED` 后逐项 bind） | 明确排除（公开/内核，C 管） |
| --- | --- | --- |
| S | `src/agent_box/server/` 下指定产品模块：`sessions/ profiles/ model_configs/ accounts/ approvals/ usage/ workspaces/ transport/ services.py records.py persistence.py errors.py` | `server/execution/`（属 E）、`server/bootstrap/`、`server/wire/`（公共协议）、`server/credential*` 秘密面 |
| E | `src/agent_box/extensions/runtime_composition/` 内部实现、`src/agent_box/server/execution/` 内部实现 | `server/execution/protocols.py`（公开契约，单列）、`extensions/api.py`、`extensions/bootstrap.py`、`work_core/` |
| H | `plugins/agent-box-harnesses/src` 内部实现 | 插件公共出口 / 对外契约文件（单列，须生产者+消费者确认后由 C 发布） |
| P | 六个已列举插件内部实现：`plugins/agent-box-runtime-local` `agent-box-sandbox-bwrap` `agent-box-skills` `agent-box-git` `agent-box-artifacts` `agent-box-terminal-session` | 各插件公共出口 / capability 定义（单列） |

## 公共区（C 专管，任何执行者沙箱内只读，永不开写）
`src/agent_box/work_core/`（冻结）· `src/agent_box/resource_contracts/` · `extensions/api.py` 与 `extensions/capability/` · 组合协议 · `server/execution/protocols.py` · `server/bootstrap/` 与 `extensions/bootstrap.py` · `server/wire/` · `src/agent_box/storage/` · `src/agent_box/migrations/` · 根依赖与 `lockfiles/` · 共享测试配置 · 门禁与检查点 · 指令文件 `AGENTS.md`/`CONVENTIONS*.md`。
公共接口/契约变更须生产者与消费者双方确认，由 C 固定版本号发布；Core 语义、公开协议、产品扩权一律交 I。

## Git 与检查点
- 执行者沙箱内**无**产品仓库可写 `.git`（worktree 的 `.git` 指向宿主主仓 gitdir，未绑定 → 不存在）。
- 检查点提交**仅由 C 在沙箱外**核验"改动只落在本任务 allowlist 路径"后代生成；执行者不得 `git commit`、更不得 `git add -A`/`git push`。

## 新增测试与报告
各组新增测试写入自己的 `/tests`，报告写 `/reports`；现有测试文件逐文件分配，公共测试断言不得弱化。
