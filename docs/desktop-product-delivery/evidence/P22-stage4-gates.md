# P22 阶段 4 证据：四项检查真跑 + 反例 + 真实服务写路径（2026-09-18）

工作树 `/home/maoqh/projects/agent-box-desktop-next-wsl-round1`，batch Q2，baseline `8fc1a807`。
工具链：Node v22.23.2 / npm 10.9.8 / vitest 4.1.10 / Electron 40.10.2（`node_modules` 见 §0）。

## 0 环境插曲（如实记，两次都无仓库文件受损）

| 事件 | 现象 | 处置 |
| --- | --- | --- |
| 会话早期那个后台 `npm install` 被系统回收 | 本仓 `node_modules` 被带走，`vitest` 一度 `Cannot find module 'vitest'` | 重装（`npm install`） |
| 该重装本身遇到 TLS 错误并中途失败 | `node_modules` 再次被清空（`ls` 不存在） | 改用 `npm ci`（按 lockfile 确定化）一次成功；随后按需重新解出 `electron` 二进制到 `node_modules/electron/dist`（zip 一直在 `/tmp`） |

两次都只影响 `node_modules`（不入库）；仓库文件、提交、tag 均未受影响。

## 1 四项检查（最终态真跑）

| 项 | 命令 | 退出码 | 计数 |
| --- | --- | --- | --- |
| tsc（renderer + electron + e2e） | `npm run --workspace apps/desktop typecheck` | **0** | 三个项目全过 |
| eslint（全树） | `npm run --workspace apps/desktop lint` | **1** | **11 errors / 186 warnings**，errors 全在 P22 **未触碰**的 7 个文件（与改动面交集=∅，清单见 §2） |
| eslint（本单改动文件） | `npx eslint --fix <P22 改动集>` | 0 | **0 errors**；warnings 全是测试里的 `document` |
| build | `npm run --workspace apps/desktop build` | **0** | dist 产出 + electron bundle + native deps staged |
| vitest（全量两项目） | `npm run --workspace apps/desktop test` | **1** | **990 文件：986 passed / 2 failed / 2 skipped；10252 用例：10242 passed / 4 failed / 6 skipped**；失败全在 `\|electron\|` 项目且为宿主基线（回环监听 3 + live 重试 1），`\|ui\|` 全绿 |

**eslint 基线变化（如实记）**：P21 时全树 16 errors；本单在 `src/features/settings` 跑 `--fix` 时
顺带清掉了该目录里 5 个**既有** error（纯导入顺序，7 增 5 删，文件列表：
`account-list.test.tsx`、`agentbox-model-settings.tsx`、`index.tsx`、`provider-presets.test.ts`、
`provider-switch-hot.test.ts`）⇒ 现为 11。这不是放宽：剩下 11 个仍在 P22 未触碰的文件里，已作为待拍项保留。

## 2 仍红的 7 个文件（与 P22 改动无交集）

```
src/dev/contracts/product-copy-guard.test.ts (4)   src/features/chat/agentbox-process-view.test.tsx (1)
src/features/chat/composer/chat-bar.tsx (1)        src/features/chat/sidebar/agentbox-sessions/agentbox-actions-row.tsx (1)
src/features/chat/sidebar/agentbox-sessions/agentbox-global-sessions.tsx (1)   ...agentbox-session-list.tsx (1)
src/store/agentbox-session-unread.test.ts (2)
```

## 3 G2 反例演练（"不画假开关"）

| 面 | 反例操作 | 观测 |
| --- | --- | --- |
| 资产 hub | `assets.list` 答 `UNAVAILABLE: the asset stores are not composed` | 显示服务原话；**逐个点**全部按钮后 `bind/unbind/publishSkill/publishMcp/publishPlugin` 调用数仍为 **0**（`agentbox-contract-faces.test.tsx`） |
| 订阅账号 | `accounts.list` 答 `UNAVAILABLE: … need a platform secret store` | 显示原话 + `[data-accounts-failure]`；逐个点击后 `create/importAsset/bind` 调用数为 **0** |
| hook 单行 | 某 hook `commands: []`（服务侧即 `HOOK_NOT_EXECUTABLE`） | 启停按钮 `disabled`，行内写明"没有命令处理器" |
| 角色页克隆 | 服务离线（`maintenance` 缺省） | 克隆按钮 `disabled` 且 `title` 写原因；对话框不可开 |
| 权限保存 | `disabled` 传入 | 点保存后 `onSave` 未调用（`profile-permission-editor.test.tsx`） |
| 真实服务 | `hooks.create` 真被拒（`HOOK_FAMILY_UNSUPPORTED`）、`accounts.list` 真答 `UNAVAILABLE` | §4 转录里如实显示代码，界面按 §1 表灰显 |

## 4 真实服务写路径（`e2e/p22-write-faces-driver.mjs`，**13/13 PASS**）

服务：`agent_box.server`（Linux，PYTHONPATH 运行时 + `AGENT_BOX_SANDBOX_MODULE=agent_box_sandbox_bwrap.port`）；
应用：**构建产物**（`dist/electron-main.mjs`）+ CDP 附着；全部调用经渲染层的 `window.agentBoxDesktop.wire.request`。

| 步骤 | 服务真实回答（节选） |
| --- | --- |
| `workspaces.open` + `profiles.create` | 工作区与角色建立 |
| `assets.publishSkill` | `{assetId:"p22-fixture-skill", latestRevision:1, digest:"sha256:f3023e70…", source:"local:fixture-skill"}` |
| `assets.publishPlugin` | `{kind:"plugin", revision:1, digest:"sha256:04fb4bba…"}` + 预览 |
| `assets.bind` | `{binding:{…, revision:1, enabled:true}}` |
| `assets.bindings` | 列出该绑定 |
| `assets.unbind` | `{unbound:true}` |
| `profiles.clone` | 克隆体 `originProfileId` 已置；报告 **2 migrated / 3 refused**（`native-sessions` 恒不迁移） |
| `profiles.setPermissions` | `{permissionPreset:"plan", permissionRules:[{key:"edit",…}], version:2}` |
| `hooks.list` | `{hooks:[]}` |
| `hooks.create` | 类型化拒绝：`UNAVAILABLE: the 'opencode' family declares no hook model [HOOK_FAMILY_UNSUPPORTED]` |
| `accounts.list` | 类型化拒绝：`UNAVAILABLE: managed subscription accounts need a platform secret store` |

完整转录（含每条 params 与 answer，含 `details.internalCode`）：`p22-write-faces-results.json`（本目录）。

## 5 未跑 / 未验（如实登记）

- **没有**在真实服务上走一遍**界面点击**（本驱动经 renderer 的 wire 桥调用合同方法，界面层的
  交互由 §3 的组件测试覆盖）。把两者合起来的那次点击级验收，属于 Q2 计划里的**真实模型 UI 门**（R-0011）。
- **没有**真实模型调用（0 次）：写路径与模型无关，fixture 是假 ACP peer。
- `hooks.create` 在真实服务上被拒是**家族未声明**（opencode 在本部署的 registry 里没有 hook 模型），
  不是驱动缺陷；换一个声明了 hook 的家族才能走通创建——那需要一份声明 hook 的部署，未在本轮构造。
