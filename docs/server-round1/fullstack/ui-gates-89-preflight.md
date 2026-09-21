# 089 预检（两家真实 UI 门）：能核的谓词都成立，卡的是三条"人的腿"——逐条署名

Tree `agent-box-env-provider`，2026-09-19 13:5x UTC（本地 21:5x）。**本文件一条真实模型调用都没有**（`R-0017`：
机械验证优先假端点；今晚连"该花"的条件都还没到）。本单 §Scope 明写"只跑不改"，所以这里只有观测与归属。

## 1 依赖谓词（逐条自己核，不等人点名）

| 前置 | 判据 | 一手核对 |
| --- | --- | --- |
| `082`（同树） | 该树 status 有收口行 | ✅ status.md 45 行：`NATIVE_HOME_STORAGE_DONE（082 收口…）` |
| `090`（runtime 树） | 该树 status 记 DONE | ✅ `agent-box-runtime-round1/docs/implementation/status.md:63` CHECKPOINT c1 段落把 090 列入 DONE |
| `091`（runtime 树，`R-0056` 口径） | "CP1 c1 里写着 091 的传输无关引擎＋进程内 G1–G4 已绿" | ✅ 同文件 `:78`：`091 终态 PARTIAL（引擎+G1–G4 绿；精确剩余＝跨机持久传输…、无版本 kind 增量需 schema 18→19、**Windows↔WSL 真机部署本环境不可用**）` |

⇒ **字面判据成立**，本树按章程 §3 可以开火；但 091 自己那条"剩余"已经点名了今晚真正的墙（见 §3）。

## 2 现场实测：跑着的试用实例是 **WSL 侧**，而修订 v2 要的是 **Windows 侧**

`/proc/4355/cmdline`（只读）：`trial-serve-linux.py --data-root ~/.agentbox-trial-chat --port 18790
--deployment /mnt/c/agentbox-uigate46/deployment.json --plugin-root <本树>/plugins/agent-box-harnesses
--credential-source ~/.agentbox-acceptance-secret.*/deepseek-api-key
--credential-id credential_7dec0e4b… --label deepseek-official
--mount pi-runtime=~/.agentbox-all-harnesses/artifacts/pi --mount codex-runtime=…/artifacts/codex …`

18790 在 LISTEN、`server.hello` 200 / **64 方法**、`profiles.list` **21 行**、`providerModels.list` **10 行**。
**没有读任何凭据内容**（`R-0011`：locator 只作 locator；那条 `--credential-source` 路径本身就是本机别的会话种的，我没碰）。
这台实例由**验收线（A）守**（`gate-log` P-2/P-5），所以本树**不起停、不重启、不动它的数据根**——只做只读探活。

修订 v2 写的是"改在 Windows 侧 Server 上验收（真实数据根 + 真实凭据）"，现场却是 WSL 侧实例 ⇒
**这一段是 089 自己的前提冲突**，不是我可以替他抹平的：要么按现场（WSL Server + 真 Electron）跑并如实记偏离，
要么先把 Windows 侧 Server 部署出来（091 的剩余腿、且 48 的门槛 B 从未通过）。**交回调度者/I 定一条**。

## 3 三条"人的腿"（逐条写清谁能做，我不假绿）

| # | 缺什么 | 一手证据 | 谁能做 |
| --- | --- | --- | --- |
| 1 | **发之前看不出来哪家能发**——正是本单的前置 `T6-1` 的形状 | 18790 的 `profiles.list` 每行仍是**12 键**（`accountId/archivedAt/capabilities/createdAt/displayName/harness/id/originProfileId/permissionPreset/permissionRules/updatedAt/version`），**没有** `recoveryPending` 也没有 `sendability`，也没有模型绑定 ⇒ 从线上任何一条读都判不出"这条发得出去吗" | 我已在本树把它做出来了（`117 PROFILE_ADMITTABLE_PROJECTION_DONE`，12 键 → 14 键）⇒ 缺的是**让那台实例跑到含 117 的构建**（重启/换构建 = 人的腿，与 115 的"用户那台未验"同批） |
| 2 | **真 Electron 在 Windows 侧被打开** | `/mnt/c/agentbox-w48-trial/{trial-app.ps1,trial-serve.ps1}` 在盘上（15:12 还有 `app-renderer.log` 写入），`powershell.exe` 可用；但那是**用户的交互会话**，G1 的"真 Electron"不能由我从 WSL 里代打 | **用户**（一条命令即可，见下面"请用户做的那一步"） |
| 3 | **一条真能出答案的 profile 映射**（`gate-log` P-1 (a)：10 条 provider 记录只有 1 条指向内存里种的凭据） | 该凭据 id 是 `credential_7dec0e4b…`（`deepseek-official`）；红线照旧：**不把真 key 种到 `credential_e08793…`**（8 条 `maomaokingdom` 用户自有网关记录引用它 ⇒ 种下去＝把用户的 key 发往第三方端点） | 映射策略是裁决（I/用户）；我不会顺手种 |

## 4 我已经先做掉的那一条：门的工具是真的

`scripts/server-round1/ui_gates_89_leak_check.py --self-test` ⇒ **5 必须红 ＋ 8 必须绿 ＋ 全仓 `docs/` 461 个文件零误报**。
G3（零泄漏）因此从"一行永远说零命中的 grep"变成了会自检的门；089 真跑那天它才咬得住。

## 5 请用户做的那一步（089 唯一的阻塞点，一条就够）

在 Windows 侧起一次应用，指向**已活着**的 18790（连接只认环境变量，`try-checkpoints.md` 记的）：

```powershell
$env:ORDESSA_SERVER_ROOT = "\\wsl$\Ubuntu\home\maoqh\.agentbox-trial-chat"   # = Server 的 --data-root
$env:ORDESSA_SERVER_PORT = "18790"
cd apps/desktop; npm run dev        # 或跑 C:\agentbox-w48-trial\trial-app.ps1
```

开了之后我立刻按两家（pi、codex）各跑一轮真门并逐笔记账（`R-0017`：真实调用只花在门本身）。
在那之前本单**不声明 `DONE`、不用假端点结果冒充**（§Requirements 反例条）。

## 6 终态

089 未收口 ⇒ 不写终态码，登记为 **blocked（三条人的腿，逐条见 §3）**；
可自证的部分已自证：谓词核对 ✅、门工具 ✅、现场只读实测 ✅。
