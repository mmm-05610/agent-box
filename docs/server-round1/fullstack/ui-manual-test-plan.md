# 人手 UI 验收方案（Work Order 42 §D 剩余项）

状态：**方案就绪，待人手执行**。执行者：用户本人（点界面），助手负责准备环境、逐步指路、
每步后在 WSL 侧核对后端事实并记账。

## §0 这份方案要证实什么（以及不替代什么）

- **已经用脚本证实的**：产品传输路径（renderer bridge → IPC → main → Server）、四家真实模型门、
  22 步无模型联调、跨重启续接门。这些证据都在 `docs/server-round1/fullstack/`。
- **尚未证实的**：真人用界面把同一件事做成一遍。上一轮已如实记录为
  "`evidence/p42-ui-controls/`：控件清单在，人手路径**未验证**"。
- 两者**不可互替**：脚本证据不因为本轮通过而升级，本轮通过也不改写脚本证据的口径。

## §1 环境（已备好）

| 项 | 位置 | 说明 |
| --- | --- | --- |
| 启动（一条命令） | `powershell -ExecutionPolicy Bypass -File C:\Users\maoqh\run-ui-manual.ps1` | 起 Server（真实 Pi 部署 + WSL release Worker）+ 带新凭据界面的桌面应用；关窗口即全停 |
| 全新一轮 | 同上加 `-Fresh` | 清掉 Server 数据根重来（凭据记录保留） |
| 强制停止 | `... stop-ui-manual.ps1` | 窗口被强杀时用 |
| Server 日志 | `C:\Users\maoqh\agentbox-ui-manual\logs\server.log` | 出错先看这里 |
| 数据根 | `C:\Users\maoqh\agentbox-ui-manual\server-data` | 会话/turn/凭据记录都在这里，跨启动保留 |
| 桌面应用的凭据记录 | `C:\Users\maoqh\agentbox-ui-manual\credentials.json` | Desktop 拥有的记录：只有 `{credentialId, label, kind}`，**不含密钥内容**（密钥由界面交给 main 后写成临时 0600 文件，Server 从该路径导入进自己的密钥库，临时文件随即删除） |
| 测试工作区 | `\\wsl.localhost\Ubuntu\home\maoqh\.agentbox-ui-manual\workspace` | 一个小项目，`test_stats.py` 故意失败 |
| 我侧核对 | `python3 /home/maoqh/.agentbox-ui-manual/inspect.py` | 只读快照，打印会话/turn/事件/凭据（**id 与 kind，绝不含内容**） |

事实来源（不使用则不要改）：

- Harness 工件：`/home/maoqh/.agentbox-ui-manual/artifacts/pi-runtime`（tree digest
  `sha256:afe238d3…`，与真实模型门记录的一致；从 /tmp 的同一份只读复制过来）。
- 部署文档：`/home/maoqh/.agentbox-ui-manual/pi-ui-deployment.json`，pluginRoot 指向
  `/home/maoqh/.agentbox-ui-manual/plugin-root`（对插件目录的硬链接副本，只覆盖一个文件）。
- **与生产模板的唯一差异**：`deploy/pi/models.json` 的 `maxTokens` 由 64 提到 **1024**。
  64 是付费门用的验收上限，会把任何真实回答截断，人手测试无法据此判断产品可用性。
  这是**人工运行的配置**，不构成任何生产声明；生产模板仍是 64。

## §2 纪律（每一步都适用）

1. **凭据只从你的键盘进界面**：不要粘贴到聊天、截图、文档或命令行。我不需要、也不会看它的内容。
2. **一步一停**：某一步不对就停在那里，把界面上的原文（或截图）给我，不要自己往下试。
3. 每步做完告诉我"这一步做完了"，我在 WSL 侧用 `inspect.py` 核对后端事实，再给你下一步。
4. 截图统一放 `C:\Users\maoqh\agentbox-ui-manual\shots\`（我自己建），命名 `s<阶段>-<序号>.png`。
5. 计费：每个 turn 一次请求，全流程预计 10–15 次请求、输出 ≤1024 tokens，**估计 < ¥0.2**（上限 ¥10）。

## §3 阶段

### S0 启动与连通
- **操作**：运行启动命令（首轮建议 `-Fresh`）。
- **期望**：终端打印 `Server is live` 后应用窗口出现；窗口顶部/侧栏不出现红色错误。
- **我核对**：`/live` 200、server.log 里部署了 `pi`、没有凭据进入 env/argv。
- **失败就记**：终端最后 10 行 + server.log 尾部。

### S1 凭据录入（本轮核心：人手路径）
- **操作**：`Settings`（设置）→ 左侧 `Models` → 找到"新增凭据 / Add credential"区：
  `名称 / Name` 填 `deepseek-manual`，`API 密钥 / API key` 粘贴你的 DeepSeek key → `保存 / Save`。
- **期望**：保存后表单收起、输入框清空（**这一步的界面上没有"凭据列表"**——凭据只在
  "新增 / Add"（新建 provider model）表单的 `凭据` 下拉里以名称出现，见 S2）。
  所以 S1 的通过判据是"保存成功且无报错"，而"看得见"由 S2 的下拉完成。
- **我核对**：`server_credentials` 多一行（kind=api-key、locator 指向 Desktop 记录文件），
  `credentials.json` 里有对应记录；全程日志无密钥。
- **判据**：这是"界面能录入凭据"，上一轮只有 preload API 级证据。

### S2 模型与角色
- **操作**：同页"新增 / Add"区建一个 provider model：`显示名`=`pi-deepseek`、
  `harness`=`pi`、`provider`=`deepseek`、模型 id=`deepseek-flash`，凭据选 S1 那条 → 保存。
  然后打开顶层 `Profiles`，新建一个角色：名字 `验收角色`、harness=`pi`、绑定刚才的 provider model。
- **期望**：模型与角色都出现在列表里，角色能保存成功。
- **我核对**：`server_provider_models` / `server_profiles` 各一行，角色 run_state 正常。
- **失败就记**：界面报错原文；这类失败多半是 wire 层，我会看 server.log 里的方法名与错误码。

### S3 工作区（WSL 向导）
- **操作**：侧栏 `Open remote folder / 打开远程文件夹` → 向导第一步"配置 WSL"选发行版
  （`Ubuntu`，默认应已选中）→ 连接 → 第二步"选择目录"浏览到
  `/home/maoqh/.agentbox-ui-manual/workspace` → `选择此目录`。
- **期望**：工作区出现在侧栏并可进入。
- **我核对**：`server_workspaces` 一行，`normalized_path` 为该 WSL 路径。
- **注意**：桌面本地的"打开文件夹"在远程模式下**会被正确拒绝**（产品自己的路径边界），
  这是预期行为，不要用它。

### S4 第一轮真实对话
- **操作**：在输入框上方的角色选择器选 `验收角色`；消息框输入：
  "这个仓库里有哪些文件？test_stats.py 现在会失败吗，为什么？" → 发送。
- **期望**：回答**流式**出现（逐块增长），最后稳定下来；内容提到 `average()` 用了
  `len(values) - 1`；输入框在生成中不可再发。
- **我核对**：turn 终态 `completed`、`error_code` 为空、delta 事件先于 completed、
  provider 收到 1 次请求且 model＝`deepseek-flash`。
- **失败就记**：屏幕原文 + 这一步停住。

### S5 第二轮上下文
- **操作**：同一会话再发："把上面的结论压缩成一句话，并说明你有没有真的运行测试。"
- **期望**：回答体现它记得第一轮（不是从零开始）；同一个会话、不新建。
- **我核对**：第二个 turn completed、native session id 与第一轮相同、请求体携带首轮上下文。

### S6 让模型干活（工具 + 文件改动）
- **操作**：发："修复 stats.py 里的 average，然后运行 pytest 确认通过。"
- **期望**：模型调用工具（读/写文件、跑命令），回答给出测试通过的结果；工具进度在界面上可见。
- **我核对**：`/home/maoqh/.agentbox-ui-manual/workspace/stats.py` 内容确实被改对、
  `python3 -m pytest` 在 WSL 里通过、turn completed。
- **注意**：这一步会真的改测试工作区里的文件——这是预期的。

### S7 停止（取消）
- **操作**：发一个较长的任务（例如："逐行解释 stats.py 和 test_stats.py 的每一处，尽量长"），
  在回答流式中点停止/取消键。
- **期望**：状态转入"停止中/stopping"再到终态；之后不再有新内容增长；界面不卡死。
- **我核对**：`stop_requested_at` 有值、turn 终态是取消类终态、其后的 delta 数为 0。

### S8 重启后的续接
- **操作**：正常关闭窗口（Server 随之停止）→ 再运行一次启动命令（**不要加 `-Fresh`**）→
  打开 S4 那个会话 → 发第三条："我们之前在这个仓库里做了什么？"
- **期望**：会话仍在侧栏，历史完整；回答体现记得前两轮。
- **我核对**：重启前后 session/turn 记录一致、native id 未变、checkpoint resumable、
  第三个 turn completed。

### S9 失败路径（负例）
- **操作**：在 Models 页新增一个模型 id 为 `deepseek-unknown` 的 provider model（同 harness/provider），
  用它建一个角色，发一句话。
- **期望**：**明确的失败提示**（不是静默、不是假成功），界面给出可读错误；消息不丢。
- **我核对**：该 turn `failed` 且 `error_code` 是定型码；provider 收到 0 次请求（发包前就拒绝）。
- **完成后**：把该角色与模型归档，别留在界面上干扰后续。

### S10 收尾
- **操作**：关闭窗口；回我一句"收尾完成"。
- **我核对**：Server 进程退出、端口无监听、WSL 侧 Worker 投影与临时目录无残留、
  后端全量测试仍绿。之后我把本轮证据写进
  `docs/server-round1/fullstack/ui-manual-run.md`（谁点的、看到什么、后端事实、费用、未过项）。

### S11（可选，之后再说）第二家 harness
要在界面上看新接入的四家（dsh / qwen / kilo / claude-code），需要先构建那一家的运行时工件
（离线，几分钟），再生成对应的部署文档。**默认不在本轮**，等你决定。

## §4 记录与产物

- 我写：`docs/server-round1/fullstack/ui-manual-run.md`（逐阶段结果 + 未过项 + 费用）。
- 你提供：每一步的界面原文/截图，以及"某处与描述不符"的直说——**不符就是本轮要找的东西**。
- 任何一步失败都按"卡在哪一步 / 命令 / 退出码 / 脱敏现象 / 已排除的可能 / 下一步"记账，
  与前面各轮的阻塞账同一格式。
