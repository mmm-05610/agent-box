# LNX-001 · 宿主环境与运行时工件实测（只读，未启动任何服务）

采样 2026-09-21 15:5x +08:00。主机：Ubuntu 26.04.1 LTS / 内核 7.0.0-31-generic（与
`control/linux-native-baseline-plan.md` §1 同一环境）。

## 1 工具链与沙箱前置

| 项 | 实测 | 对 Linux 主线的意义 |
| --- | --- | --- |
| `bwrap` | `/usr/bin/bubblewrap 0.11.1` | runtime 线"非 Windows 默认选 sandbox-bwrap"有宿主支撑 |
| user namespaces | `/proc/sys/user/max_user_namespaces` = 60432；`unprivileged_userns_clone` = 1 | bwrap 必需项已开（**未实跑 bwrap，故只证配置不证行为**） |
| Python | 3.14.4 | 后端 `pyproject.toml` 声明 `requires-python = ">=3.9"`（下界）；**3.14 未在仓库任何 CI/门配置里被验证过** —— 依赖兼容属未验证项 |
| Node / npm | v22.22.1 / 9.2.0 | 桌面与 worker-entry(mjs) 的宿主 |
| `cargo` | **缺失** | Worker 是 Rust 工程（`workers/agent-box-worker/{Cargo.toml,Cargo.lock,src}`），**本机现在不能重建** |

注：仓库名 `pyproject.toml` 的 `name = "pacthold"`、`version = "2.0.0a1"` —— 打包身份与产品名不同名，
整合时不要按目录名推断发行名。

## 2 Worker 工件的真实来源：git-ignore 的预编译 ELF（本调查最重要的运行时发现之一）

`/home/maoqh/projects/agent-box-env-provider/workers/agent-box-worker/`（= service 线工作树）：

| 工件 | 平台 | 大小 | manifest 身份 |
| --- | --- | --- | --- |
| `.acceptance-bundle-c11/agent-box-worker` | **ELF 64-bit x86-64 pie** | 2 260 784 B | `schemaVersion 1, wireVersion 1, workerVersion 0.1.0`, sha256 `c1e353c8…` |
| `.acceptance-bundle-musl/agent-box-worker` | **ELF 64-bit x86-64 pie** | 2 286 192 B | 同版本，sha256 `ce7fdeb2…` |
| `target/release/agent-box-worker`、`target/debug/agent-box-worker`、`target/x86_64-unknown-linux-musl/` | 本机历史构建残留 | — | — |

另有 `.acceptance-bundle-{c4,c8,c9,c10,c12}` 同目录并存；`agent-box-harness-expansion` 树下另有 `-c4/-c8`。

结论（事实层）：

1. **Linux 原生 Worker 可执行文件已经存在**，且 `target/x86_64-unknown-linux-musl/` 证明本机做过 musl 目标构建
   —— 说明这条链在 Linux 上被组装过，不再只是 Windows/WSL 形态。
2. 但这些工件**全部在 git-ignore 目录里，不在任何分支、任何提交中**。三条线 checkout 出来都拿不到它们。
   `cargo` 缺失 ⇒ 新主线**不能靠源码重建**，只能靠"原目录继续存在"或"另存受控工件"。
3. 在跑的 Windows 侧腿 S-3 命令行里点名用 `.acceptance-bundle-c11`（`control/environments.md` §1）。
   用户已裁定 `.acceptance-bundle-c4/-c8` **不得当缓存处理**（`control/workspaces.md`）。
4. **承重但不可重建**这一对属性同时成立，因此整合时必须把它们写进版本清单的"运行时工件身份"，
   并且**不要**在候选分支上执行任何 `clean`/忽略文件删除。

## 3 harness 运行时工件（两服务只读挂载，未触碰）

`/home/maoqh/.agentbox-all-harnesses/artifacts/{codex,claude-code,pi,hermes,dsh,qwen,kilo}` 存在（登记，未进入内容），
`/home/maoqh/.npm-global/.../opencode` 为挂载的 opencode 二进制。**这些是外部目录、非仓库产物**：
新主线若换数据根或换机器，harness 工件的可得性是独立前置条件。
