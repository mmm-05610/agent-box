# 人手 UI 验收运行记录（2026-09-16）

执行者：用户本人（点界面）；助手负责环境、逐步指路与后端核对。方案见
[ui-manual-test-plan.md](ui-manual-test-plan.md)。

## S0 启动与连通 — 通过（含一次我方的环境缺陷）

- 第一次启动失败：`SIDECAR_DEPLOYMENT_INVALID`。**原因是我生成的部署文档把 `pluginRoot`
  写成 Linux 路径**（`/home/maoqh/...`），Windows 上被解析成 `C:\home\...`，Server 读不到
  投影文件。我的预检当时从 UNC 工作目录跑，恰好掩盖了它。
- 修法：`pluginRoot` 改为 Windows 可见的 UNC 路径（`\\wsl.localhost\Ubuntu\...`），并在启动
  脚本里 `Set-Location` 固定工作目录，避免"驱动器相对路径"这类语义随调用位置漂移。
- 修复后在用户的原始工作目录（`C:\WINDOWS\system32`）复跑 Server：`SERVER_LIVE`、退出无残留。
- 应用侧：`hermes-home/logs/desktop.log` 记录 `[agentbox-wire] lifecycle connection installed`，
  即生命周期连接已装上（`AGENTBOX_SERVER_ROOT`/`PORT` + Server 自写的 `secrets/http-token`）。

## S1 凭据录入 — 录入成功；方案里的一处期望是我写错

- **后端事实（第一手）**：Server 数据根里出现
  `credential_15afe78b037445aea72f0d21010938f7`，`kind=api-key`，
  `secret_locator=…dpapi`（密钥落在 Server 自己的 DPAPI 密钥库；Desktop 的记录文件
  `credentials.json` 只有 `{credentialId, kind, label}`，**没有内容**）。
  即：renderer → IPC → main → 临时 0600 文件 → `POST /api/v1/credentials` → 密钥库，
  这条**人手录入路径首次被真实走通**。
- **方案错误（已改）**：这个界面**没有"凭据列表"**。凭据只作为 `新增 / Add`（新建 provider
  model）表单里 `凭据` 下拉的选项出现。S1 的正确判据是"保存成功且无报错"，"看得见"属于 S2。

## 观察到但尚未定性的界面提示（记账，不改产品）

### O1 没有工作区时，提示只写"不可用"

`agentbox-chat-view.tsx` 的 `unavailableReason` 三个分支里，第二个分支在
`catalogReady && !workspace` 且 `workspaceOpen.status === 'idle'`（压根没有可登记的行）时
落到兜底串 `profiles.agentBoxUnavailable`，即界面上只有孤零零一个"不可用"。
同一状态下，如果存在工作区行，提示会是 `发送前请选择角色`（明确、可行动）。

- 事实基础：用户截图里侧栏为空态（暂无会话 + 打开文件夹 / 打开远程文件夹），主区顶部一条
  `不可用`，输入框置灰。
- 判据：这不是服务故障——`catalogReady` 为真（该分支的前置条件）说明
  `service.phase === 'ready'` 且 sessions/workspaces 目录都已加载。
- 定性：**提示可读性问题（候选 P2）**，需要与"发送前请选择角色"这类明确提示一致；
  是否改产品留给用户裁决。

## 尚未执行

S2 模型与角色、S3 工作区、S4–S10。本记录随执行推进增补。
