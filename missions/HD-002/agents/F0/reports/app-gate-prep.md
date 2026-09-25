# F0 应用门切片预研（FC-0006 F0 片，只读于 baseline0）

生成：2026-09-23 10:08 +0800，树 16398e7cec。仅为 baseline2+F3 暂收后的快速执行做准备；未写任何源码。

## 烟测链事实

- `test-agent-shell.mjs`：临时目录只写 `extensions.json`（复制产品名单）→ `launchSmoke(home, {ORDESSA_EMPTY_HOST:'0', MODULAR_AGENT_SHELL_SMOKE:'1'})`；断言 4 项结构 + `pages` 含 Conversation/Sessions/Requests + `agentShell` 全等对象（:17-20）。
- `main.ts` 基础块（:38-59）采集 `pages`=所有 `[data-region]` header group 按钮文本；agent-shell 块（:100-112）点 nav "Agents" 后探 navigation/codex/pi/emptyConversation/`requestsView`（:109 右区按钮=='Requests'）。
- `discover(ORDESSA_EXTENSION_HOME ?? userData, bundledDist)`（main.ts:16-17）：产品 dist 始终作为 bundled 根被发现；测试注入扩展的合法入口是 extension home + 其 `extensions.json` 名单（现脚本正用 userData 路数）。

## 改动设计（待 F3 DOM 定稿后落码）

1. `main.ts:109` 探针替换：不再生硬"对话内审批卡"选择器，改由 F3 暂收提交里的实际标记驱动（预期：会话区审批入口容器，如 `.agent-interactions-*` 类名；F3 禁 data-testid，用 class/role/文案）。断言两路：a) 无 `[data-region="right"]` 常驻 Requests 注册（右区不展开）；b) 已选会话且存在 pending 夹具时，对话区出现 pending 卡与 respond 入口。
2. pending 夹具两选一（FC-0006 允许"最小测试夹具"，若嫌重可先只做结构断言）：
   - 甲（倾向）：`ORDESSA_EXTENSION_HOME` 指向 `apps/desktop/**` 内 test-only 夹具目录，注册一个实现 AgentClient 的内存连接器，产出受控 pending interaction；`respond` 走 F3 真实 service 路径。构建输入需确认夹具是否在 build-all 发现树内（contracts/plugins 之外可能不被打包→需 products 配置变更则先报 FC）。
   - 乙：无夹具时退化为结构断言：右区撤除 + 对话区审批宿主元素存在（未选中时的提示位）。交互全链由 F3 renderer vitest 覆盖，应用门不冒充。
3. `test-agent-shell.mjs`：撤 :19 的 Requests 断言；:20 deepEqual 改为新 agentShell 键集（如 `requestsRemoved`/`approvalInConversation`）；保持全等口径不放松成 includes。
4. `test:electron`/`test:agent-ui` 其余消费方（launchSmoke 共用者）改前 grep 键名依赖，防连带红。

## 验收命令序（届时）

`npm run typecheck` → `node apps/desktop/scripts/test-agent-shell.mjs`（预期改前红/改后绿）→ `npm run test:electron` → `npm run test:agent-ui`；lock 差量按方案甲不入库。

## 预研追加（10:11，读完 launch-smoke.mjs 与 interactions/view.tsx）

- `launchSmoke` 已把 home 同设为 `ORDESSA_EXTENSION_HOME`（launch-smoke.mjs:8），全部夹具改动可留在 `apps/desktop/scripts/**`。
- 夹具甲案布局已证：`discover()`（platform/extension-host/src/main/extensions.ts:17-42）从 `dataRoot/extensions/*` 与 bundled 同名根扫目录，按 home 的 `extensions.json.enabled`（唯一 id 正则校验）启用，fail-closed ⇒ 脚本把夹具目录写进 `<home>/extensions/<id>/` 并追加 id 即可，产品树零污染；余下细节=夹具清单格式（参照仓库静态扩展清单），落码时定。
- 卡片词汇表现状（F3 改造前）：容器 `.agent-interactions`（面板）/`.agent-interaction`+`[data-interaction=id]`（卡）；pending 可点元素按 kind 分支：字段组→"Send response"/"Cancel"；无字段 choices→choice 标签按钮；confirm→"Confirm"/"Decline"；input/editor→文本框+"Send response"/"Cancel"；错误 `role="alert"`。respond 走 `service.respond(item.id, answer)` 真实路径（view.tsx:21）。
- 探针选择器建议基线：断主区内存在 `.agent-interaction`（pending 态）且其一含可聚焦动作按钮；同时断 `[data-region="right"]` 不再常驻 Requests。若 F3 改名则以 F3 暂收提交为准，仅同步选择器。

## 悬而未决（到 F3 暂收坐标后自解或 QUESTION）

- F3 审批卡的稳定选择器与"无选中会话时提示位"的确切文案/类名。
- 全局轻量待回应数字若落在 connections statusbar（F1 文件）——FC-0006 已规定由 F3 提 QUESTION，不属 F0。
